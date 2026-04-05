# TraceLink

TraceLink is a two-device note-taking application that turns a Samsung Galaxy (with an S Pen) into a wireless drawing tablet for a Mac desktop. 

The desktop application displays (hopefully) a full A4 canvas with a draggable "viewport box". Your phone connects over your local network and displays exactly what is inside that cropped viewport, zoomed in. As you draw on the phone with the S Pen(, the strokes synchronize in real-time to the desktop.

### Why did I build this?
Honestly, I was frustrated. I love taking notes with my S Pen, but Samsung Notes files are locked behind Samsung Cloud's Google sign-in wall on non-Samsung desktops. 
I believe hand-writing notes is essential for retention, so I decided to build my own local-first alternative completely under my own control. Plus get some projects under my portfolio, so why not share something I intend to use daily.

## The Tech Stack (and why I chose it)

I made intentional (and sometimes difficult) choices for the tech stack to prioritize input fidelity and rendering performance over development speed. 

*   **Tauri v2 (Desktop)**: I chose Tauri over Electron purely for performance and binary size. It uses the operating system's native webview instead of shipping an entire instance of Chromium. 
*   **Rust (Backend)**: Required by Tauri, but absolutely the right call in hindsight. Prior to this I didn't know the first thing about Rust, but it handles the local mDNS discovery and the high-throughput WebSocket server easily without the garbage collection pauses you'd get in Node.js.
*   **WebGL 2 (Desktop Render)**:
  I gave Canvas2D as an HTML web API a try, but there were limitations to a browser first approach...
We need to accurately translate coordinates between a tiny phone screen and a desktop projection, hence Canvas 2D gets blurry when mathematically scaling or projecting continuous drawing states; WebGL lets me process pure vector geometry directly on the GPU.

___
Next Phase... Kotlin Side for syncing the viewport box

## Architecture

Data flows unidirectionally with very low latency:

`S Pen Touch → Android App (MotionEvent) → WebSocket (Binary Protocol) → Rust Backend → Tauri IPC → WebGL 2 Renderer → Mac Screen`
*We can write directly from mouse input to the canvas though*
## Implementation Phases

- **Phase 1: Foundation (complete)** 
  - Rust networking, WebSocket routing, binary protocol structure, and WebGL architecture constraints.
- **Phase 2: Desktop complete (in progress)** 
  - Stroke tessellation, WebGL dynamic buffers, UI tools, infinite scrolling, eraser collision math.
- **Phase 3: Android App**
  - Native Kotlin implementation of the S Pen input interface and viewport projection renderer.
- **Phase 4: Pairing & Sync**
  - Seamless mDNS discovery and local WiFi/Bluetooth PAN pairing.
- **Phase 5: Persistence**
  - Local auto-saving and file format specification.

## Lessons Learned

Building this has been a massive learning experience. Here are a few things that were significantly harder than expected:
*   **Stroke Rendering Quality is Brutal**: Getting a digital line to look like a real pen is incredibly difficult. I had to scrap my entire first implementation (a Catmull-Rom spline tessellator) because it looked angular and cheap, and manually port a Exponential Moving Average (EMA) algorithm from Atrament(Shoutout to [Atrament](https://github.com/jakubfiala/atrament) your project is elegant, simple, and exactly what I needed) into my WebGL pipeline to get velocity-adaptive widths and proper pressure mapping.
*   **WebGL vs Canvas 2D Tradeoffs**: Going with WebGL gave me incredible performance, zero latency, and zooming capabilities, but at the cost of having to manually write trigonometry to generate triangle-strips for line segments and triangle-fans for rounded line caps.
*   **The Cost of Two Rendering Engines**: Because the S Pen draws on Android and the Mac projects it, I effectively have to write two separate rendering engines (Android Native Canvas and Desktop WebGL) that must mathematically match each other perfectly. It's double the work.
