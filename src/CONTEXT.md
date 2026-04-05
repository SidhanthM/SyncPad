# Desktop Frontend — Coding Constraints

## Coordinate System

- All stroke data is in **millimeters**. A4 page = 210.0 mm wide × 297.0 mm tall.
- Origin: top-left corner of the page = (0, 0).
- Coordinates increase rightward (x) and downward (y).
- **Never store or transmit screen/pixel coordinates.** Convert at the rendering boundary only.
- The renderer maps mm → device pixels using:
  ```
  devicePixels = mm * scale * window.devicePixelRatio
  ```
  where `scale` is a computed mm-to-CSS-pixel ratio based on the canvas element size and the page dimensions.
- **Never assume `devicePixelRatio === 1`.** Always read it, always multiply. Retina displays (DPR 2) and ultra-high-DPI monitors (DPR 2.5+) are expected.
- Canvas element: set `width`/`height` attributes to physical pixel dimensions (`clientWidth * devicePixelRatio`, `clientHeight * devicePixelRatio`). CSS `width`/`height` set the layout size. These are different. Getting this wrong causes blurry rendering.

## Protocol Byte Layout (Locked)

All frames: `[type:u8][length:u32le][payload]`

```
0x01 StrokeBegin   13 bytes: stroke_id:u32 color:u32 size:f32 tool:u8
0x02 StrokePoint   28 bytes: stroke_id:u32 x:f32 y:f32 pressure:f32 tilt_x:f32 tilt_y:f32 timestamp:u32
0x03 StrokeEnd      4 bytes: stroke_id:u32
0x04 StrokeErase    4 bytes: stroke_id:u32
0x10 ViewportUpdate 16 bytes: x:f32 y:f32 width:f32 height:f32
0x20 PageChange     4 bytes: page_index:u32
0x30 Undo           0 bytes
0x31 Redo           0 bytes
0x40 FullSync       variable: msgpack(FullSyncPayload)
0x50 PairRequest    variable: msgpack(PairRequest)
0x51 PairAccept     variable: msgpack(PairAccept)
0xF0 Ping           8 bytes: timestamp:u64
0xF1 Pong           8 bytes: timestamp:u64
```

- All multi-byte integers: **little-endian**.
- All floats: **IEEE 754 single-precision (f32)**, little-endian.
- `color`: packed RGBA as `u32` (R in lowest byte).
- `tool`: `0x01` = pen, `0x02` = eraser.
- `pressure`: 0.0 to 1.0.
- `tilt_x`, `tilt_y`: degrees.
- `timestamp`: milliseconds since stroke begin.

**This layout is locked. Any change must be mirrored in `src-tauri/src/protocol.rs` and `android/.../net/Protocol.kt`.**

## JS Protocol Implementation

Use `DataView` on `ArrayBuffer`. No libraries. Example encode pattern:

```js
function encodeStrokePoint(strokeId, x, y, pressure, tiltX, tiltY, timestamp) {
  const buf = new ArrayBuffer(5 + 28); // header + payload
  const view = new DataView(buf);
  view.setUint8(0, 0x02);                        // type
  view.setUint32(1, 28, true);                    // length (LE)
  view.setUint32(5, strokeId, true);              // stroke_id
  view.setFloat32(9, x, true);                    // x (mm)
  view.setFloat32(13, y, true);                   // y (mm)
  view.setFloat32(17, pressure, true);            // pressure
  view.setFloat32(21, tiltX, true);               // tilt_x
  view.setFloat32(25, tiltY, true);               // tilt_y
  view.setUint32(29, timestamp, true);            // timestamp
  return buf;
}
```

Decode: read `type` at offset 0, `length` at offset 1 (LE u32), payload starts at offset 5.

## Buffer Architecture (WebGL)

```
┌───────────────────────────────────────────────┐
│ STATIC VBO — Completed strokes                │
│ • Tessellated once when StrokeEnd received     │
│ • Vertices appended to a single large buffer   │
│ • gl.bufferSubData for appends                 │
│ • NEVER re-tessellated after finalization       │
│ • One gl.drawArrays/drawElements call for all  │
└───────────────────────────────────────────────┘
┌───────────────────────────────────────────────┐
│ DYNAMIC VBO — Active stroke (in-progress)      │
│ • Re-tessellated every frame                   │
│ • Only ONE active stroke at a time per client  │
│ • gl.bufferData with gl.DYNAMIC_DRAW           │
│ • Cleared when StrokeEnd received              │
└───────────────────────────────────────────────┘
```

- Total draw calls per frame: exactly **2** (static + dynamic). Not per-stroke.
- Erased strokes: mark as erased in the stroke model, rebuild static VBO (batch rebuild, not per-erase).
- Undo of add-stroke: same as erase — mark and rebuild.
- On page change: clear both VBOs, rebuild static from new page's stroke data.

## Stroke Tessellation Pipeline

Based on Atrament's algorithm (MIT licensed), adapted for WebGL triangle strips.

```
Raw point (mm + pressure + pixel coords)
  → EMA position smoothing (velocity-adaptive, pixel-space distance)
  → IIR pressure low-pass filter (coefficient 0.3)
  → Thickness computation:
      Mouse (pressure=0.5): velocity-adaptive width with gradual approach
      Stylus (pressure≠0.5): pressure-mapped width with piecewise linear scaling
  → Emit quad segment: perpendicular edge vertices → triangle strip
  → Round caps at stroke start/end (semicircle triangle fans)
```

- No spline interpolation. Smoothing comes from EMA filter making segments very short.
- No point buffering or look-ahead. Every input event emits geometry immediately.
- Smoothing factor computed in pixel-space (Atrament's exact constants).
- Adaptive stroke only applies when no real pressure data is present.
- For replayed/remote strokes without pixel coords, approximate via `distMm * viewport.scale`.

## View Transform

The vertex shader applies a 2D affine transform:

```glsl
uniform mat3 u_viewMatrix; // mm-space → clip-space
attribute vec2 a_position; // mm coordinates
void main() {
  vec3 pos = u_viewMatrix * vec3(a_position, 1.0);
  gl_Position = vec4(pos.xy, 0.0, 1.0);
}
```

- **Desktop full view**: maps (0,0)–(210,297) to fill the canvas with correct aspect ratio.
- **Desktop viewport box**: rendered as an overlay rectangle (not part of the stroke VBOs).

## Patterns to Avoid

1. **Never send pixel coordinates over the wire.** All coordinates are mm.
2. **Never re-tessellate completed strokes per frame.** Static VBO is append-only.
3. **Never create one VBO per stroke.** All completed strokes share one static VBO.
4. **Never use `JSON.stringify`/`JSON.parse` for protocol messages.** Binary only.
5. **Never use `setTimeout`/`setInterval` for rendering.** Use `requestAnimationFrame`.
6. **Never read `devicePixelRatio` once and cache it.** It can change (e.g., window moved between monitors). Read it when computing canvas dimensions.
7. **Never block the main thread with tessellation.** If a rebuild is needed (erase, undo, page change), schedule it and render what you have.
8. **Never assume the WebSocket is connected.** Always check state before sending. Queue messages during disconnection for replay on reconnect.
