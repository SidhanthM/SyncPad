# TraceLink

TraceLink is a two-device note-taking application that turns a Samsung Galaxy (with an S Pen) into a wireless drawing tablet for a Mac desktop. 

The desktop application displays a full A4 canvas with a draggable "viewport box". Your phone connects over your local network and displays exactly what is inside that cropped viewport, zoomed in. As you draw on the phone with the S Pen, the strokes synchronize in real-time to the desktop.

### Why did I build this?
Honestly, I was frustrated. I love taking notes with my S Pen, but Samsung Notes files are locked behind Samsung Cloud's Google sign-in wall on non-Samsung desktops. Getting my handwriting fluidly onto my Mac was a nightmare. I decided to build my own local-first alternative completely under my own control. 

## The Tech Stack (and why I chose it)

I made intentional (and sometimes difficult) choices for the tech stack to prioritize input fidelity and rendering performance over development speed. 

*   **Tauri v2 (Desktop)**: I chose Tauri over Electron purely for performance and binary size. It uses the operating system's native webview instead of shipping an entire instance of Chromium. 
*   **Rust (Backend)**: Required by Tauri, but absolutely the right call in hindsight. It handles the local mDNS discovery and the high-throughput WebSocket server easily without the garbage collection pauses you'd get in Node.js.
*   **WebGL 2 (Desktop Render)**: Why not the much simpler HTML Canvas 2D API? Because of the dual-viewport requirement. We need to accurately translate coordinates between a tiny phone screen and a massive A4 desktop projection. Canvas 2D gets blurry or slow when mathematically scaling or projecting continuous drawing states; WebGL lets me process pure mm-space vector geometry directly on the GPU.
*   **Native Android/Kotlin (Mobile Client)**: I initially wanted the phone app to just be a web browser client. But the browser's generic `PointerEvent` API loses the high-frequency sub-millimeter precision, pressure, and tilt data that the S Pen hardware uniquely provides. Native Kotlin gives me direct access to Android's `MotionEvent` API for uncompromising pen fidelity.
*   **Custom Binary Protocol**: I started with JSON over WebSockets, but sending thousands of high-frequency coordinates quickly saturated the network and caused micro-stutters. Packing the data into a custom binary ArrayBuffer protocol eliminated serialization overhead entirely.
*   **Millimeter-Space Coordinates**: All coordinates are tracked in physical millimeters, not pixels. This guarantees that a 50mm stroke drawn on a 6.8" OLED phone translates precisely to a mathematically identical 50mm stroke projected onto a 27" desktop monitor.

## Architecture

Data flows unidirectionally with very low latency:

`S Pen Touch → Android App (MotionEvent) → WebSocket (Binary Protocol) → Rust Backend → Tauri IPC → WebGL 2 Renderer → Mac Screen`

## Implementation Phases

- **Phase 1: Foundation (complete)** ✅ 
  - Rust networking, WebSocket routing, binary protocol structure, and WebGL architecture constraints.
- **Phase 2: Desktop complete (in progress)** 🔄 
  - Stroke tessellation, WebGL dynamic buffers, UI tools, infinite scrolling, eraser collision math.
- **Phase 3: Android App**
  - Native Kotlin implementation of the S Pen input interface and viewport projection renderer.
- **Phase 4: Pairing & Sync**
  - Seamless mDNS discovery and local WiFi/Bluetooth PAN pairing.
- **Phase 5: Persistence**
  - Local auto-saving and file format specification.

## Lessons Learned

Building this has been a massive learning experience. Here are a few things that were significantly harder than expected:

*   **Stroke Rendering Quality is Brutal**: Getting a digital line to look like a real pen is incredibly difficult. I had to scrap my entire first implementation (a Catmull-Rom spline tessellator) because it looked angular and cheap, and manually port a complex Exponential Moving Average (EMA) algorithm from a library called Atrament into my WebGL pipeline to get velocity-adaptive widths and proper pressure mapping.
*   **WebGL vs Canvas 2D Tradeoffs**: Going with WebGL gave me incredible performance, zero latency, and zooming capabilities, but at the cost of having to manually write trigonometry to generate triangle-strips for line segments and triangle-fans for rounded line caps.
*   **The Cost of Two Rendering Engines**: Because the S Pen draws on Android and the Mac projects it, I effectively have to write two separate rendering engines (Android Native Canvas and Desktop WebGL) that must mathematically match each other perfectly. It's double the work.
