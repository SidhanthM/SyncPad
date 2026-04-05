# SyncPad

Split-screen note-taking app: Samsung S23 Ultra (S Pen input) ↔ Mac desktop (full canvas viewer), real-time sync over LAN.

## Tech Stack

- **Desktop app**: Tauri v2 (Rust backend, system webview)
- **Desktop rendering**: WebGL 2, vanilla JS (no framework)
- **Phone app**: Native Android, Kotlin, min SDK 28
- **Phone rendering**: GLSurfaceView + OpenGL ES 3.0
- **Phone input**: MotionEvent API (S Pen axes)
- **Phone UI chrome**: Jetpack Compose (toolbar only)
- **Transport**: WebSocket (binary frames) over LAN
- **Wire format**: Custom packed binary (little-endian)
- **Coordinate system**: Millimeters. A4 page = 210.0 × 297.0 mm.
- **Persistence**: Custom binary `.syncpad` format
- **Stroke geometry**: Point array → outline polygon → triangle strip

## Workspace Routing

| Task | Work in | Read first |
|:--|:--|:--|
| Rust backend (WebSocket, protocol, state, persistence, mDNS, pairing) | `src-tauri/src/` | `src-tauri/CONTEXT.md` (when created) |
| Desktop frontend (WebGL renderer, UI, input, IPC) | `src/` | `src/CONTEXT.md` |
| Android app (renderer, input, networking, UI) | `android/` | `android/CONTEXT.md` (when created) |
| Binary protocol changes | Update ALL THREE: `src-tauri/src/protocol.rs`, `src/lib/protocol.js`, `android/.../net/Protocol.kt` | `src/CONTEXT.md` § Protocol |
| Architecture decisions | `CLAUDE.md` (this file) | — |

## Naming Conventions

### Files
- Rust: `snake_case.rs`
- JS: `kebab-case.js` in `src/`, `camelCase.js` in `src/lib/`
- Kotlin: `PascalCase.kt`
- CSS: `kebab-case.css`

### Code
- Rust: standard rustfmt (`snake_case` functions, `PascalCase` types)
- JS: `camelCase` functions/variables, `PascalCase` classes, `UPPER_SNAKE` constants
- Kotlin: standard ktlint (`camelCase` functions, `PascalCase` classes)
- Protocol message type constants: `MSG_STROKE_BEGIN = 0x01` (Rust), `MSG_STROKE_BEGIN` (JS/Kotlin)
- Stroke IDs: `u32`, globally unique within a session, allocated by the Rust backend via `next_stroke_id` IPC command

### Coordinates
- All stroke coordinates: millimeters (`f32`), origin at page top-left
- Viewport: `{x, y, width, height}` in mm
- Screen coordinates: only exist within each platform's renderer — never cross the wire or leave rendering code
