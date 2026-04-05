use std::sync::Arc;
use tokio::sync::broadcast;
use crate::state::AppState;

pub mod protocol;
pub mod state;
pub mod ws_server;
pub mod http_server;
pub mod mdns;

pub struct GlobalState {
    pub state: Arc<AppState>,
    pub tx: broadcast::Sender<Vec<u8>>,
    pub mdns: mdns_sd::ServiceDaemon,
}

#[tauri::command]
fn next_stroke_id(state: tauri::State<GlobalState>) -> u32 {
    state.state.get_next_stroke_id()
}

#[tauri::command]
fn is_phone_connected() -> bool {
    // TODO: Track connections in AppState
    false
}

#[tauri::command]
fn get_page_info(state: tauri::State<GlobalState>) -> String {
    format!("Page {}", state.state.current_page_index.read())
}

#[tauri::command]
fn add_page(state: tauri::State<GlobalState>) -> u32 {
    state.state.add_page()
}

#[tauri::command]
fn send_message(state: tauri::State<GlobalState>, app: tauri::AppHandle, message: Vec<u8>) {
    // 1. Broadcast to WebSocket clients
    let _ = state.tx.send(message.clone());
    
    // 2. Decode to update internal state (optional but good for consistency)
    if let Ok(decoded) = crate::protocol::Message::decode(&message) {
        let mut pages = state.state.pages.write();
        let current_index = *state.state.current_page_index.read();
        if let Some(page) = pages.get_mut(&current_index) {
            match decoded {
                crate::protocol::Message::StrokeBegin(s) => page.add_stroke(crate::state::Stroke::new(s)),
                crate::protocol::Message::StrokePoint(s) => page.add_stroke_point(s),
                crate::protocol::Message::StrokeEnd(s) => page.finalize_stroke(s.stroke_id),
                crate::protocol::Message::StrokeErase(s) => page.erase_stroke(s.stroke_id),
                crate::protocol::Message::Undo => { page.undo(); },
                crate::protocol::Message::Redo => { page.redo(); },
                _ => {}
            }
        }
    }

    // 3. Emit event back to frontend for the round-trip test
    use tauri::Emitter;
    let _ = app.emit("syncpad-update", message);
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app_state = Arc::new(AppState::new());
    let (tx, _rx) = broadcast::channel(1024);
    let mdns = crate::mdns::register_service().expect("Failed to register mDNS service");
    let global_state = GlobalState {
        state: app_state.clone(),
        tx: tx.clone(),
        mdns,
    };

    // Start WebSocket and HTTP servers in background tasks
    let state_clone = app_state.clone();
    let tx_clone = tx.clone();
    tauri::async_runtime::spawn(async move {
        if let Err(e) = crate::ws_server::start_ws_server(state_clone, tx_clone).await {
            eprintln!("WebSocket server error: {}", e);
        }
    });

    let state_clone_http = app_state.clone();
    tauri::async_runtime::spawn(async move {
        if let Err(e) = crate::http_server::start_http_server(state_clone_http).await {
            eprintln!("HTTP server error: {}", e);
        }
    });

    // Register mDNS
    
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(global_state)
        .invoke_handler(tauri::generate_handler![
            next_stroke_id,
            is_phone_connected,
            get_page_info,
            add_page,
            send_message
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
