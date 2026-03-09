# SyncPad
Low-latency two-device note-taking for live writing on Mac.

## Goal
Match Samsung Notes' handwriting smoothness while giving you a big-screen,
Mac-based live view for thinking, teaching, and presenting.
All communication stays on your LAN — no external servers or cloud services.

## The three components

**Android app** — the primary input surface. S Pen draws on a dark-themed
canvas. The app captures ink, smooths it, and streams it to the server in
real time. Compose for UI chrome, SurfaceView for the drawing canvas.

**Node.js server (Mac)** — the hub. Receives stroke events from Android over
WebSocket, relays them to the browser viewer, persists canvas state to a JSON
file on disk, serves the browser viewer HTML, and handles PDF export via
Puppeteer.

**Browser viewer (Mac)** — primarily passive display. Renders strokes live as
they arrive. Shows a viewport highlight box (the phone's current view region)
and a ghost cursor ring (exact S Pen hover position). Useful for pointing,
teaching, and presenting from the Mac screen.

## Key design decisions

**Coordinate space** — A4 @ 300dpi: 2480 × 3508 units. Device-independent,
print-ready, consistent across devices and exports. Both Android and browser
transform to screen pixels at render time.

**Page model** — discrete A4 pages, like Samsung Notes. Keeps navigation
simple (page up/down) and makes PDF export straightforward. Each stroke
belongs to a pageId. Page switches are events, not continuous scrolling.

**Stroke streaming** — points stream in real time as the pen moves.
Three message phases:
- start (color, brushSize, first point)
- move (position, pressure only)
- end (finalize path)

Protocol is deliberately minimal so brush rendering logic can change
on either end without breaking the wire format.

**Rendering** — SurfaceView with a dedicated render thread. Two layers:
a committed Bitmap for finished strokes, an active path for the stroke
in progress. On END, active path composites onto the committed bitmap.

**Persistence** — append-only JSON log on the Mac filesystem, one file
per page. On reconnect, the server replays the log to reconstruct the
canvas deterministically.

**PDF export** — Puppeteer on the Node server. Themeable at export time
(dark canvas or white/print-ready). Triggered from the Mac browser viewer.

**Hover ghost cursor** — throttled to ~60 events/sec on Android, rendered
on a dedicated overlay canvas in the browser. Target: sub-100ms end-to-end.
Makes the Mac view useful for pointing and teaching, not just passive display.

**Viewport highlight** — the phone's current pan/zoom maps to a faded
highlight box on the Mac's full-page view. Lets the Mac act as a full-page
overview while the phone is your zoomed-in working area.

**Latency target** — under 80ms end-to-end stroke latency on local WiFi.

## Tech stack

| Component | Stack |
|---|---|
| Android | Kotlin, Jetpack Compose (UI chrome), SurfaceView (canvas), OkHttp (WebSocket) |
| Server | Node.js, ws, Puppeteer (PDF, later) |
| Browser viewer | Vanilla HTML/JS, Canvas2D, two canvas layers |

## Wire format

### stroke / start
```json
{
  "type": "stroke", "phase": "start",
  "strokeId": "uuid", "pageId": "page-1",
  "x": 1240, "y": 880, "pressure": 0.6,
  "timestamp": 1709478501234,
  "color": "#E8D5B7", "brushSize": 8
}
```

### stroke / move
```json
{
  "type": "stroke", "phase": "move",
  "strokeId": "uuid",
  "x": 1242, "y": 883, "pressure": 0.62,
  "timestamp": 1709478501238
}
```

### stroke / end
```json
{
  "type": "stroke", "phase": "end",
  "strokeId": "uuid",
  "timestamp": 1709478501280
}
```

## What's built
- Node server — WebSocket + static file server
- Browser viewer — connects, logs received messages
- Android app — connects to server, sends test message on launch
- Full pipeline confirmed: phone → server → browser
- StrokePoint, Stroke data classes
- StrokeSerializer — stroke events to JSON wire format
- protocol.md — this file

## Roadmap

### Phase 1 — MVP live ink
1. DrawingSurfaceView — SurfaceView + MotionEvent + render thread
2. Wire drawing surface to WebSocket client
3. Browser renders received strokes
4. Hover ring — ghost cursor on overlay canvas
5. Persistence — append strokes to JSON, replay on reconnect
6. Basic page switching

### Phase 2 — Polish
7. Viewport highlight — "you are here" box on Mac viewer
8. UI polish — color picker, background textures, undo, eraser, FABs
9. PDF export — Puppeteer, theme picker, page range selection