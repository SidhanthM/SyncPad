import { Renderer } from './lib/renderer.js';
import { Viewport } from './lib/viewport.js';
import { Notebook, Stroke } from './lib/stroke-model.js';
import * as protocol from './lib/protocol.js';

async function main() {
    const { invoke } = window.__TAURI__.core;
    const { listen } = window.__TAURI__.event;

    const canvas = document.getElementById('canvas');
    if (!canvas) {
        console.error('Canvas element not found');
        return;
    }

    const viewport = new Viewport();
    const renderer = new Renderer(canvas, viewport);
    const notebook = new Notebook();

    // UI Elements
    const toolPen = document.getElementById('tool-pen');
    const toolEraser = document.getElementById('tool-eraser');
    const colorSwatches = document.querySelectorAll('.color-swatch');
    const sizeSlider = document.getElementById('size-slider');
    const sizeValue = document.getElementById('size-value');
    const undoBtn = document.getElementById('undo-btn');
    const redoBtn = document.getElementById('redo-btn');
    const prevPageBtn = document.getElementById('prev-page');
    const nextPageBtn = document.getElementById('next-page');
    const addPageBtn = document.getElementById('add-page');
    const pageDisplay = document.getElementById('page-display');
    const viewportBox = document.getElementById('viewport-box');

    // App State
    let currentTool = 0x01; // Pen
    let currentColor = 0xFF000000; // Black
    let currentSize = 2.0;
    let isDrawing = false;
    let currentStroke = null;
    let lastStrokeId = 0;
    let strokeStartTime = 0;

    // Viewport Box Interaction State
    let isDraggingViewport = false;
    let isResizingViewport = false;
    let activeResizeHandle = null;
    let dragStartPos = { x: 0, y: 0 };
    let initialViewportRect = null;

    // Initialize Viewport Box
    function updateViewportBoxUI() {
        const rect = viewport.getPhoneViewRect();
        const topLeft = viewport.mmToScreen(rect.x, rect.y);
        const bottomRight = viewport.mmToScreen(rect.x + rect.width, rect.y + rect.height);
        
        viewportBox.style.left = `${topLeft.x}px`;
        viewportBox.style.top = `${topLeft.y}px`;
        viewportBox.style.width = `${bottomRight.x - topLeft.x}px`;
        viewportBox.style.height = `${bottomRight.y - topLeft.y}px`;
        viewportBox.style.display = 'block';
    }

    // --- IPC & Protocol ---
    async function sendMessage(encoded) {
        try {
            await invoke('send_message', { message: Array.from(new Uint8Array(encoded)) });
        } catch (e) {
            console.error("Failed to send message:", e);
        }
    }

    await listen('syncpad-update', (event) => {
        const decoded = protocol.decodeMessage(new Uint8Array(event.payload).buffer);
        handleRemoteMessage(decoded);
    });

    function handleRemoteMessage(msg) {
        const page = notebook.getCurrentPage();
        switch (msg.type) {
            case "StrokeBegin":
                // If it's from us, we already handled it
                if (page.strokes.has(msg.strokeId)) return;
                const newStroke = new Stroke(msg.strokeId, msg.color, msg.size, msg.tool);
                page.addStroke(newStroke);
                // We don't render remote strokes in real-time in this phase yet, 
                // but we could if we wanted. For now, just store them.
                break;
            case "StrokePoint":
                const ptStroke = page.strokes.get(msg.strokeId);
                if (ptStroke && !ptStroke.isLocal) {
                    page.addStrokePoint(msg);
                }
                break;
            case "StrokeEnd":
                const s = page.strokes.get(msg.strokeId);
                if (s && !s.isLocal) {
                    s.finalize();
                    renderer.rebuildStaticVbo(page);
                }
                break;
            case "StrokeErase":
                const es = page.strokes.get(msg.strokeId);
                if (es && !es.isLocal) {
                    es.erase();
                    renderer.rebuildStaticVbo(page);
                }
                break;
            case "Undo":
                notebook.getCurrentPage().undo();
                renderer.rebuildStaticVbo(notebook.getCurrentPage());
                break;
            case "Redo":
                notebook.getCurrentPage().redo();
                renderer.rebuildStaticVbo(notebook.getCurrentPage());
                break;
        }
    }

    // --- Input Handlers ---

    function distToSegmentSquared(px, py, x1, y1, x2, y2) {
        const l2 = (x2 - x1) * (x2 - x1) + (y2 - y1) * (y2 - y1);
        if (l2 === 0) return (px - x1) * (px - x1) + (py - y1) * (py - y1);
        let t = ((px - x1) * (x2 - x1) + (py - y1) * (y2 - y1)) / l2;
        t = Math.max(0, Math.min(1, t));
        const projX = x1 + t * (x2 - x1);
        const projY = y1 + t * (y2 - y1);
        return (px - projX) * (px - projX) + (py - projY) * (py - projY);
    }

    function tryErase(x, y) {
        const page = notebook.getCurrentPage();
        let changed = false;
        
        // Eraser radius + a little leeway for adaptive thickness spread
        const eraserRadius = currentSize / 2.0;

        for (const strokeId of page.strokeOrder) {
            const stroke = page.strokes.get(strokeId);
            if (stroke && !stroke.erased && stroke.points.length > 0) {
                const strokeRadius = stroke.size / 2.0;
                // Add 1.5mm leeway to account for speed-based adaptive swelling of the stroke
                const hitThreshold = eraserRadius + strokeRadius + 1.5;
                const thresholdSq = hitThreshold * hitThreshold;
                
                let hit = false;
                
                if (stroke.points.length === 1) {
                    const p = stroke.points[0];
                    const dx = p.x - x;
                    const dy = p.y - y;
                    if (dx*dx + dy*dy <= thresholdSq) hit = true;
                } else {
                    for (let i = 1; i < stroke.points.length; i++) {
                        const p1 = stroke.points[i - 1];
                        const p2 = stroke.points[i];
                        const distSq = distToSegmentSquared(x, y, p1.x, p1.y, p2.x, p2.y);
                        if (distSq <= thresholdSq) {
                            hit = true;
                            break;
                        }
                    }
                }

                if (hit) {
                    stroke.erase();
                    sendMessage(protocol.encodeStrokeErase(stroke.id));
                    changed = true;
                }
            }
        }
        if (changed) {
            renderer.rebuildStaticVbo(page);
        }
    }

    canvas.addEventListener('mousedown', (e) => {
        if (e.button !== 0) return; // Left click only
        
        const mm = viewport.screenToMm(e.clientX, e.clientY);
        
        // Check if we are over an existing stroke for erasing (simplified)
        if (currentTool === 0x02) { // Eraser
            isDrawing = true; // Use isDrawing flag to track eraser dragging too
            tryErase(mm.x, mm.y);
            return;
        }

        isDrawing = true;
        lastStrokeId++; // In a real app, this would be provided by the backend
        strokeStartTime = Date.now();
        
        console.log(`[Mouse Input] Mousedown - Default Stroke Size: ${currentSize}mm`);

        currentStroke = new Stroke(lastStrokeId, currentColor, currentSize, currentTool);
        currentStroke.isLocal = true;
        notebook.getCurrentPage().addStroke(currentStroke);
        
        renderer.beginStroke(currentStroke);
        
        sendMessage(protocol.encodeStrokeBegin(lastStrokeId, currentColor, currentSize, currentTool));
        
        addPoint(mm.x, mm.y, 0.5, e.clientX, e.clientY); // Default pressure for mouse
    });

    window.addEventListener('mousemove', (e) => {
        if (isDrawing) {
            const mm = viewport.screenToMm(e.clientX, e.clientY);
            if (currentTool === 0x02) {
                tryErase(mm.x, mm.y);
            } else {
                // Simulate pressure based on velocity (optional enhancement)
                addPoint(mm.x, mm.y, 0.5, e.clientX, e.clientY);
            }
        } else if (isDraggingViewport) {
            const dx = viewport.screenDistanceToMm(e.clientX - dragStartPos.x);
            const dy = viewport.screenDistanceToMm(e.clientY - dragStartPos.y);
            viewport.setPhoneView(
                initialViewportRect.x + dx,
                initialViewportRect.y + dy,
                initialViewportRect.width,
                initialViewportRect.height
            );
            updateViewportBoxUI();
            broadcastViewport();
        } else if (isResizingViewport) {
            const dx = viewport.screenDistanceToMm(e.clientX - dragStartPos.x);
            const dy = viewport.screenDistanceToMm(e.clientY - dragStartPos.y);
            
            let { x, y, width, height } = initialViewportRect;
            
            if (activeResizeHandle.includes('n')) { y += dy; height -= dy; }
            if (activeResizeHandle.includes('s')) { height += dy; }
            if (activeResizeHandle.includes('w')) { x += dx; width -= dx; }
            if (activeResizeHandle.includes('e')) { width += dx; }
            
            viewport.setPhoneView(x, y, width, height);
            updateViewportBoxUI();
            broadcastViewport();
        }
    });

    window.addEventListener('mouseup', () => {
        if (isDrawing) {
            isDrawing = false;
            if (currentStroke) {
                currentStroke.finalize();
                sendMessage(protocol.encodeStrokeEnd(currentStroke.id));
                renderer.endStroke();
            }
            currentStroke = null;
        }
        isDraggingViewport = false;
        isResizingViewport = false;
        activeResizeHandle = null;
    });

    let scrollAccumulator = 0;
    canvas.addEventListener('wheel', (e) => {
        // Only prevent default if we're not zooming (ctrlKey is commonly used for pinch-to-zoom)
        if (!e.ctrlKey) {
            e.preventDefault();
            
            const bounds = viewport.getPanBounds();
            // Convert pixel scroll distance to mm
            const dy = viewport.screenDistanceToMm(e.deltaY);
            let nextPanY = viewport.panY + dy;
            
            if (nextPanY > bounds.maxY) {
                scrollAccumulator += (nextPanY - bounds.maxY);
                viewport.setPan(viewport.panX, bounds.maxY);
                
                // If dragged past the bottom threshold (e.g. 50mm pull)
                if (scrollAccumulator > 50) {
                    scrollAccumulator = 0;
                    if (notebook.currentPageIndex === notebook.pages.length - 1) {
                        const newIndex = notebook.addPage();
                        notebook.setPage(newIndex);
                    } else {
                        notebook.setPage(notebook.currentPageIndex + 1);
                    }
                    // Reset pan to top of new page
                    const newBounds = viewport.getPanBounds();
                    viewport.setPan(viewport.panX, newBounds.minY);
                    updatePageUI();
                }
            } else if (nextPanY < bounds.minY) {
                scrollAccumulator += (nextPanY - bounds.minY); // negative
                viewport.setPan(viewport.panX, bounds.minY);
                
                if (scrollAccumulator < -50) {
                    scrollAccumulator = 0;
                    if (notebook.currentPageIndex > 0) {
                        notebook.setPage(notebook.currentPageIndex - 1);
                        // Reset pan to bottom of prev page
                        const newBounds = viewport.getPanBounds();
                        viewport.setPan(viewport.panX, newBounds.maxY);
                        updatePageUI();
                    }
                }
            } else {
                scrollAccumulator = 0;
                viewport.setPan(viewport.panX, nextPanY);
            }
        }
    }, { passive: false });

    function addPoint(x, y, pressure, rawPxX, rawPxY) {
        const timestamp = Date.now() - strokeStartTime;
        const point = { strokeId: lastStrokeId, x, y, pressure, tiltX: 0, tiltY: 0, timestamp };
        
        currentStroke.addPoint(point);
        renderer.addPoint(currentStroke, point, rawPxX, rawPxY);
        sendMessage(protocol.encodeStrokePoint(lastStrokeId, x, y, pressure, 0, 0, timestamp));
    }

    // --- Viewport Box Interaction ---

    viewportBox.addEventListener('mousedown', (e) => {
        if (e.target === viewportBox) {
            isDraggingViewport = true;
            dragStartPos = { x: e.clientX, y: e.clientY };
            initialViewportRect = viewport.getPhoneViewRect();
            e.stopPropagation();
        }
    });

    document.querySelectorAll('.resize-handle').forEach(handle => {
        handle.addEventListener('mousedown', (e) => {
            isResizingViewport = true;
            activeResizeHandle = handle.classList[1];
            dragStartPos = { x: e.clientX, y: e.clientY };
            initialViewportRect = viewport.getPhoneViewRect();
            e.stopPropagation();
        });
    });

    function broadcastViewport() {
        const rect = viewport.getPhoneViewRect();
        sendMessage(protocol.encodeViewportUpdate(rect.x, rect.y, rect.width, rect.height));
    }

    // --- UI Events ---

    toolPen.addEventListener('click', () => {
        currentTool = 0x01;
        toolPen.classList.add('active');
        toolEraser.classList.remove('active');
    });

    toolEraser.addEventListener('click', () => {
        currentTool = 0x02;
        toolEraser.classList.add('active');
        toolPen.classList.remove('active');
    });

    colorSwatches.forEach(swatch => {
        swatch.addEventListener('click', () => {
            colorSwatches.forEach(s => s.classList.remove('active'));
            swatch.classList.add('active');
            currentColor = parseInt(swatch.dataset.color);
        });
    });

    sizeSlider.addEventListener('input', (e) => {
        currentSize = parseFloat(e.target.value);
        sizeValue.textContent = `${currentSize.toFixed(1)}mm`;
    });

    // --- Atrament-style tuning controls ---
    const smoothingSlider = document.getElementById('smoothing-slider');
    const smoothingValue = document.getElementById('smoothing-value');
    const adaptiveCheckbox = document.getElementById('adaptive-stroke');
    const pressureLowSlider = document.getElementById('pressure-low');
    const pressureLowOutput = document.getElementById('pressure-low-output');
    const pressureHighSlider = document.getElementById('pressure-high');
    const pressureHighOutput = document.getElementById('pressure-high-output');
    const pressureSmoothingSlider = document.getElementById('pressure-smoothing');
    const pressureSmoothingOutput = document.getElementById('pressure-smoothing-output');

    smoothingSlider.addEventListener('input', (e) => {
        renderer.smoothing = parseFloat(e.target.value);
        smoothingValue.textContent = e.target.value;
    });

    adaptiveCheckbox.addEventListener('change', (e) => {
        renderer.adaptiveStroke = e.target.checked;
    });

    pressureLowSlider.addEventListener('input', (e) => {
        renderer.pressureLow = parseFloat(e.target.value);
        pressureLowOutput.textContent = e.target.value;
    });

    pressureHighSlider.addEventListener('input', (e) => {
        renderer.pressureHigh = parseFloat(e.target.value);
        pressureHighOutput.textContent = e.target.value;
    });

    pressureSmoothingSlider.addEventListener('input', (e) => {
        renderer.pressureSmoothing = parseFloat(e.target.value);
        pressureSmoothingOutput.textContent = e.target.value;
    });

    undoBtn.addEventListener('click', () => {
        const result = notebook.getCurrentPage().undo();
        if (result) {
            sendMessage(protocol.encodeUndo());
            renderer.rebuildStaticVbo(notebook.getCurrentPage());
        }
    });

    redoBtn.addEventListener('click', () => {
        const result = notebook.getCurrentPage().redo();
        if (result) {
            sendMessage(protocol.encodeRedo());
            renderer.rebuildStaticVbo(notebook.getCurrentPage());
        }
    });

    prevPageBtn.addEventListener('click', () => {
        if (notebook.currentPageIndex > 0) {
            notebook.setPage(notebook.currentPageIndex - 1);
            updatePageUI();
        }
    });

    nextPageBtn.addEventListener('click', () => {
        if (notebook.currentPageIndex < notebook.pages.length - 1) {
            notebook.setPage(notebook.currentPageIndex + 1);
            updatePageUI();
        }
    });

    addPageBtn.addEventListener('click', () => {
        const newIndex = notebook.addPage();
        notebook.setPage(newIndex);
        updatePageUI();
    });

    function updatePageUI() {
        pageDisplay.textContent = `Page ${notebook.currentPageIndex + 1}`;
        renderer.rebuildStaticVbo(notebook.getCurrentPage());
        sendMessage(protocol.encodePageChange(notebook.currentPageIndex));
    }

    // Handle Window Resize
    window.addEventListener('resize', () => {
        renderer.resize();
        updateViewportBoxUI();
    });

    // Initial setup
    renderer.resize();
    updateViewportBoxUI();
    console.log(`[Viewport Setup] Viewport Scale: ${viewport.scale} physical pixels per mm`);
    renderer.render();
}

document.addEventListener('DOMContentLoaded', main);
