# Phase 1: Foundation — Acceptance Criteria

All tasks produce testable results. Phase is complete when every box is checked.

## Scaffold

- [x] Tauri v2 project compiles and opens a window → `npm run tauri dev` launches, window title reads "SyncPad", 1440×900 default size
- [x] `src-tauri/Cargo.toml` declares all Rust deps (tokio, tokio-tungstenite, axum, mdns-sd, byteorder, rmp-serde, sha2, hmac, rand, base64, uuid, parking_lot, hostname, env_logger) → `cargo check` in `src-tauri/` passes with zero errors
- [x] Directory structure exists: `src/lib/` (renderer.js, stroke-model.js, viewport.js, protocol.js), `src-tauri/src/` (lib.rs, protocol.rs, ws_server.rs, http_server.rs, state.rs, mdns.rs) → all files present and non-empty

## Rust Backend

- [x] `protocol.rs` encodes/decodes all 13 message types → `cargo test` in `src-tauri/` passes, covering at minimum: StrokeBegin, StrokePoint, StrokeEnd, ViewportUpdate, Undo/Redo, Ping/Pong round-trips
- [x] `state.rs` stores strokes in memory, tracks active strokes, applies undo/redo → unit tests: add 3 strokes, undo once → 2 visible, redo → 3 visible; erase stroke 2, undo → stroke 2 reappears
- [x] `ws_server.rs` listens on port 8081 → connect with `websocat ws://localhost:8081`, send a binary StrokeBegin frame, server logs "New WebSocket connection" and does not crash
- [x] `http_server.rs` listens on port 8080 → `curl http://localhost:8080/health` returns 200
- [x] `mdns.rs` registers `_syncpad._tcp.local.` → `dns-sd -B _syncpad._tcp.` (or equivalent) on the same machine shows SyncPad service
- [x] `lib.rs` exposes IPC commands (`send_message`, `next_stroke_id`, `get_full_sync`, `is_phone_connected`, `get_page_info`, `add_page`) → calling `window.__TAURI__.invoke('next_stroke_id')` from the webview devtools console returns an incrementing integer

## Desktop Frontend

- [x] `src/lib/protocol.js` encodes/decodes StrokeBegin, StrokePoint, StrokeEnd, ViewportUpdate → manual test: encode a StrokePoint with known values, decode it, verify all fields match (log to console)
- [x] `src/lib/stroke-model.js` exposes `Notebook`, `Page`, `Stroke` classes with `addPoint()`, `finalize()`, `erase()`, `undo()`, `redo()` methods → console test: create notebook, add stroke, undo, verify stroke marked erased
- [x] `src/lib/viewport.js` exposes `Viewport` class with mm↔screen coordinate transforms → console test: with a 1440×900 canvas at DPR 2, `Viewport.mmToScreen(105, 148.5)` returns the center of the canvas (±1px)
- [x] `src/lib/renderer.js` initializes WebGL 2 context, renders hardcoded test strokes (3 strokes with different colors/widths) → visual: launch app, see colored strokes on a dark background with correct pressure-varying width
- [x] `src/index.html` + `src/main.js` + `src/style.css` set up a fullscreen dark canvas → visual: app launches with black/near-black background, no default Tauri boilerplate visible, canvas fills the window, resizing the window resizes the canvas (DPR-correct)

## Verification Gate

- [x] Full round-trip: encode StrokePoint in JS using protocol.js → send via Tauri IPC as raw binary (`tauri::ipc::Response`, NOT base64) → Rust decodes via protocol.rs → state updated → Rust emits Tauri event with re-encoded binary → JS decodes → all field values match original → console logs "ROUND-TRIP OK"
