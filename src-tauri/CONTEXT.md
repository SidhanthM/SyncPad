# Rust Backend — Coding Constraints

## Architecture Rules
- The Rust backend is the single source of truth for all state:
  stroke storage, undo stacks, viewport, page index, connected devices.
- The frontend never holds authoritative state — it holds a render copy only.
- All mutations go through the Rust backend, then broadcast to all clients.

## Async Runtime
- tokio with full features. All I/O is async.
- Never block the tokio runtime with synchronous I/O or heavy computation.
- File writes go to a dedicated blocking thread via `tokio::task::spawn_blocking`.

## Protocol Rules
- Byte layout is locked — see `src/CONTEXT.md` § Protocol Byte Layout.
- Use `byteorder` crate for all multi-byte reads/writes. Never manual bit shifting.
- Validate all incoming frames: check type byte, check length matches expected,
  reject and log malformed frames without panicking.

## WebSocket Server
- One shared broadcast channel (tokio::sync::broadcast) for desktop ↔ phone sync.
- Each connected client (phone or desktop frontend) gets its own task.
- Phone messages → validate → update state → broadcast to all other clients.
- Desktop IPC messages → same pipeline.

## Error Handling
- Never use `.unwrap()` or `.expect()` in server code paths.
- Use `anyhow` for error propagation. Log errors with `eprintln!` or tracing.
- A malformed message or dropped connection must never crash the server.

## Patterns to Avoid
1. Never share mutable state without a Mutex or RwLock.
2. Never allocate per-frame in hot paths (stroke point processing).
3. Never use std::sync::Mutex in async code — use tokio::sync::Mutex.
4. Never write the full .syncpad file on every stroke — append only.