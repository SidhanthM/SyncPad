# Phase 2: Desktop Complete — Acceptance Criteria

All tasks produce testable results. Phase is complete when every box is checked.

## Desktop Input & Tools

- [ ] **Mouse/Trackpad Drawing**: `main.js` implements `mousedown`, `mousemove`, `mouseup` handlers → drawing with mouse creates strokes in `renderer.js` and updates `stroke-model.js`.
- [ ] **Pressure Simulation**: Mouse drawing simulates variable pressure (e.g., velocity-based or fixed 0.5) → strokes have visible width variation or consistent width as expected.
- [ ] **Eraser Tool**: Toolbar toggle for Eraser (`tool: 0x02`) → drawing over existing strokes marks them as erased in `stroke-model.js` and triggers a static VBO rebuild in `renderer.js`.
- [ ] **Color/Size Selection**: Toolbar UI for selecting stroke color (at least 4 presets) and size (slider or presets) → new strokes use the selected attributes.

## Viewport Box (Desktop)

- [ ] **Viewport Rendering**: `renderer.js` or a separate overlay layer renders the "Viewport Box" (representing the phone's view) → a semi-transparent or outlined rectangle visible on the A4 page.
- [ ] **Viewport Interaction**: Mouse dragging the viewport box moves it → `viewport.js` updates `panX`/`panY`, and `renderer.js` re-renders the overlay.
- [ ] **Viewport Resizing**: Dragging corners of the viewport box resizes it → `viewport.js` updates the visible width/height in mm, and `renderer.js` re-renders.
- [ ] Viewport box is clamped to A4 bounds when dragged or resized → cannot be dragged outside 0-210mm x 0-297mm 

Note: The viewport box is an overlay rectangle drawn on top 
of the full A4 canvas. It represents the phone's current 
view window in mm-space. Dragging/resizing it changes 
Viewport.phoneViewX/Y/Width/Height — NOT the desktop's 
pan or zoom. The desktop always shows the full A4 page. 
The viewport box overlay is drawn separately from stroke 
geometry — not in the stroke VBOs.

## UI & Navigation

- [ ] **Toolbar UI**: Minimal overlay toolbar using HTML/CSS (SyncPad style) → contains: Pen/Eraser toggle, Color picks, Size slider, Undo/Redo buttons, Page counter/nav.
- [ ] **Undo/Redo**: Clicking Undo/Redo buttons calls `Notebook.undo()`/`redo()` → strokes disappear/reappear on canvas, and the static VBO is correctly rebuilt.
- [ ] **Page Navigation**: Clicking Next/Prev Page or "Add Page" → `Notebook` switches pages, canvas clears and redraws strokes for the new page.

## Standalone Functionality

- [ ] **State Persistence (In-Memory)**: Switching pages and returning preserves strokes → switching from Page 1 to Page 2 and back to Page 1 shows Page 1's strokes correctly.
- [ ] **Resilience**: Window resizing during drawing or with many strokes → layout remains stable, strokes remain DPR-sharp, and the viewport box stays within page bounds.

## Verification Gate

- [ ] **Desktop Standalone Test**: 
    1. Launch app.
    2. Draw a red circle with the mouse.
    3. Undo it → circle disappears.
    4. Redo it → circle reappears.
    5. Switch to Page 2 → canvas is blank.
    6. Draw a green square.
    7. Switch back to Page 1 → red circle is visible, green square is gone.
    8. Drag the viewport box around → it moves smoothly.
