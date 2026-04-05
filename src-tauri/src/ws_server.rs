use std::net::SocketAddr;
use std::sync::Arc;
use tokio::net::{TcpListener, TcpStream};
use tokio::sync::broadcast;
use tokio_tungstenite::accept_async;
use futures_util::{StreamExt, SinkExt};
use crate::protocol::Message;
use crate::state::AppState;

pub async fn start_ws_server(state: Arc<AppState>, tx: broadcast::Sender<Vec<u8>>) -> anyhow::Result<()> {
    let addr = "0.0.0.0:8081";
    let listener = TcpListener::bind(addr).await?;
    println!("WebSocket server listening on: {}", addr);

    while let Ok((stream, addr)) = listener.accept().await {
        let state = state.clone();
        let tx = tx.clone();
        tokio::spawn(handle_connection(stream, addr, state, tx));
    }
    Ok(())
}

async fn handle_connection(stream: TcpStream, addr: SocketAddr, state: Arc<AppState>, tx: broadcast::Sender<Vec<u8>>) {
    println!("New WebSocket connection: {}", addr);
    
    let ws_stream = match accept_async(stream).await {
        Ok(ws) => ws,
        Err(e) => {
            eprintln!("Error during WebSocket handshake: {}", e);
            return;
        }
    };

    let (mut ws_tx, mut ws_rx) = ws_stream.split();
    let mut rx = tx.subscribe();

    // Task to send broadcast messages to this client
    let mut send_task = tokio::spawn(async move {
        while let Ok(msg) = rx.recv().await {
            if let Err(e) = ws_tx.send(tokio_tungstenite::tungstenite::Message::Binary(msg)).await {
                eprintln!("Error sending message to {}: {}", addr, e);
                break;
            }
        }
    });

    // Task to receive messages from this client and broadcast them
    let tx_clone = tx.clone();
    let mut recv_task = tokio::spawn(async move {
        while let Some(result) = ws_rx.next().await {
            match result {
                Ok(msg) => {
                    if let tokio_tungstenite::tungstenite::Message::Binary(bin) = msg {
                        if let Ok(decoded) = Message::decode(&bin) {
                            // Update state
                            handle_protocol_message(&state, decoded);
                            // Broadcast to others
                            let _ = tx_clone.send(bin);
                        }
                    }
                }
                Err(e) => {
                    eprintln!("WebSocket error from {}: {}", addr, e);
                    break;
                }
            }
        }
    });

    tokio::select! {
        _ = (&mut send_task) => recv_task.abort(),
        _ = (&mut recv_task) => send_task.abort(),
    };

    println!("WebSocket connection closed: {}", addr);
}

fn handle_protocol_message(state: &AppState, msg: Message) {
    let mut pages = state.pages.write();
    let current_index = *state.current_page_index.read();
    if let Some(page) = pages.get_mut(&current_index) {
        match msg {
            Message::StrokeBegin(s) => {
                page.add_stroke(crate::state::Stroke::new(s));
            }
            Message::StrokePoint(s) => {
                page.add_stroke_point(s);
            }
            Message::StrokeEnd(s) => {
                page.finalize_stroke(s.stroke_id);
            }
            Message::StrokeErase(s) => {
                page.erase_stroke(s.stroke_id);
            }
            Message::Undo => {
                page.undo();
            }
            Message::Redo => {
                page.redo();
            }
            _ => {} // Handle other messages as needed
        }
    }
}
