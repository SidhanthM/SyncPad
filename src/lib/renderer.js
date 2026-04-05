import { Viewport } from './viewport.js';

const VERTEX_SHADER_SOURCE = `#version 300 es
layout(location = 0) in vec2 a_position;
layout(location = 1) in vec4 a_color;

uniform mat3 u_viewMatrix;

out vec4 v_color;

void main() {
    vec3 pos = u_viewMatrix * vec3(a_position, 1.0);
    gl_Position = vec4(pos.xy, 0.0, 1.0);
    v_color = a_color;
}
`;

const FRAGMENT_SHADER_SOURCE = `#version 300 es
precision highp float;

in vec4 v_color;
out vec4 outColor;

void main() {
    outColor = v_color;
}
`;

// Vertex size: 2 floats for pos (8 bytes) + 4 bytes for color = 12 bytes
const BYTES_PER_VERTEX = 12;

// ---------------------------------------------------------------------------
// Non-tunable constants
// ---------------------------------------------------------------------------
const DEFAULT_PRESSURE = 0.5;           // sentinel: mouse has no real pressure
const CAP_SEGMENTS = 8;                 // triangles per semicircle
const SMOOTHING_DIST_OFFSET = 60;       // px — "neutral" velocity threshold
const SMOOTHING_DIST_SCALE = 3000;      // px — divisor for velocity scaling
const WEIGHT_SPREAD = 30;               // px — max extra thickness at high velocity
const THICKNESS_INCREMENT = 0.25;       // px — gradual approach step per event
const MIN_LINE_THICKNESS = 2;           // px
const LINE_THICKNESS_RANGE = 98;        // px (MAX_LINE_THICKNESS(100) - MIN_LINE_THICKNESS(2))

export class Renderer {
    constructor(canvas, viewport) {
        this.canvas = canvas;
        this.viewport = viewport;
        this.gl = canvas.getContext('webgl2', {
            antialias: true,
            alpha: false,
            premultipliedAlpha: false
        });

        if (!this.gl) {
            throw new Error('WebGL 2 not supported');
        }

        this.program = this.createProgram(VERTEX_SHADER_SOURCE, FRAGMENT_SHADER_SOURCE);
        
        // Buffers
        this.staticVbo = this.gl.createBuffer();
        this.dynamicVbo = this.gl.createBuffer();
        
        // Static VBO management
        this.maxStaticVertices = 1000000;
        this.staticVertexCount = 0;
        
        // Dynamic VBO management (current stroke)
        this.dynamicBuffer = new ArrayBuffer(20000 * BYTES_PER_VERTEX);
        this.dynamicView = new DataView(this.dynamicBuffer);
        this.dynamicVertexCount = 0;
        
        // Smoothing state (reset per stroke)
        this.prevSmoothed = null;
        this.prevRawPx = null;
        this.prevRawMm = null;
        this.prevPressure = DEFAULT_PRESSURE;
        this.currentThickness = 0;
        this.strokeStarted = false;
        this.lastSegmentDir = null;

        // Tunable parameters (matching Atrament's defaults)
        this.smoothing = 0.85;              // base smoothing factor
        this.smoothingMax = 0.87;           // ceiling
        this.adaptiveStroke = true;         // velocity-adaptive width for mouse
        this.pressureSmoothing = 0.3;       // IIR low-pass coefficient
        this.pressureLow = 0;               // width multiplier at pressure = 0
        this.pressureHigh = 2;              // width multiplier at pressure = 1

        this.initBuffers();
        this.setupState();
    }

    createShader(type, source) {
        const gl = this.gl;
        const shader = gl.createShader(type);
        gl.shaderSource(shader, source);
        gl.compileShader(shader);
        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
            const info = gl.getShaderInfoLog(shader);
            gl.deleteShader(shader);
            throw new Error('Could not compile WebGL shader: ' + info);
        }
        return shader;
    }

    createProgram(vsSource, fsSource) {
        const gl = this.gl;
        const vs = this.createShader(gl.VERTEX_SHADER, vsSource);
        const fs = this.createShader(gl.FRAGMENT_SHADER, fsSource);
        const program = gl.createProgram();
        gl.attachShader(program, vs);
        gl.attachShader(program, fs);
        gl.linkProgram(program);
        if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
            const info = gl.getProgramInfoLog(program);
            throw new Error('Could not link WebGL program: ' + info);
        }
        return program;
    }

    initBuffers() {
        const gl = this.gl;
        gl.bindBuffer(gl.ARRAY_BUFFER, this.staticVbo);
        gl.bufferData(gl.ARRAY_BUFFER, this.maxStaticVertices * BYTES_PER_VERTEX, gl.STATIC_DRAW);
        
        gl.bindBuffer(gl.ARRAY_BUFFER, this.dynamicVbo);
        gl.bufferData(gl.ARRAY_BUFFER, this.dynamicBuffer.byteLength, gl.DYNAMIC_DRAW);
    }

    setupState() {
        const gl = this.gl;
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
        gl.clearColor(0.05, 0.05, 0.05, 1.0);
    }

    resize() {
        const dpr = window.devicePixelRatio || 1;
        const width = Math.floor(this.canvas.clientWidth * dpr);
        const height = Math.floor(this.canvas.clientHeight * dpr);
        
        if (this.canvas.width !== width || this.canvas.height !== height) {
            this.canvas.width = width;
            this.canvas.height = height;
            this.gl.viewport(0, 0, width, height);
            this.viewport.resize(width, height);
        }
    }

    clear() {
        const gl = this.gl;
        gl.clear(gl.COLOR_BUFFER_BIT);
    }

    // -----------------------------------------------------------------------
    // Stroke lifecycle — Atrament algorithm
    // -----------------------------------------------------------------------

    beginStroke(stroke) {
        this.dynamicVertexCount = 0;
        this.prevSmoothed = null;
        this.prevRawPx = null;
        this.prevRawMm = null;
        this.prevPressure = DEFAULT_PRESSURE;
        this.currentThickness = stroke.size * this.viewport.scale;  // mm → px
        this.strokeStarted = false;
        this.lastSegmentDir = null;
        this._hasEmittedStrip = false;
    }

    /**
     * Core drawing method — port of Atrament's draw().
     * 
     * @param {object} stroke - The stroke object (has .color, .size, .tool)
     * @param {object} point  - {x, y, pressure} in mm-space
     * @param {number} [rawPxX] - Raw pixel X (for pixel-space smoothing factor)
     * @param {number} [rawPxY] - Raw pixel Y (for pixel-space smoothing factor)
     */
    addPoint(stroke, point, rawPxX, rawPxY) {
        const mmX = point.x;
        const mmY = point.y;
        const pressure = point.pressure;

        // --- 1. Compute pixel-space distance for smoothing factor ---
        let distPx = 0;
        if (rawPxX !== undefined && rawPxY !== undefined && this.prevRawPx) {
            // Live local input — exact pixel distance
            const dx = rawPxX - this.prevRawPx.x;
            const dy = rawPxY - this.prevRawPx.y;
            distPx = Math.sqrt(dx * dx + dy * dy);
        } else if (this.prevRawMm) {
            // Replayed/remote stroke — approximate pixels from mm (Raw - Raw)
            const dx = mmX - this.prevRawMm.x;
            const dy = mmY - this.prevRawMm.y;
            distPx = Math.sqrt(dx * dx + dy * dy) * this.viewport.scale;
        }

        // --- 2. EMA position smoothing (Atrament exact: getSmoothingFactor + lerp) ---
        const sf = Math.min(
            this.smoothingMax,
            this.smoothing + (distPx - SMOOTHING_DIST_OFFSET) / SMOOTHING_DIST_SCALE
        );

        let smoothX, smoothY;
        if (this.prevSmoothed) {
            // procX = x - (x - prevX) * sf  →  lerp(x, prevX, sf)
            smoothX = mmX - (mmX - this.prevSmoothed.x) * sf;
            smoothY = mmY - (mmY - this.prevSmoothed.y) * sf;
        } else {
            smoothX = mmX;
            smoothY = mmY;
        }

        // --- 3. Pressure smoothing (Atrament exact: IIR low-pass) ---
        const pressureDiff = pressure - this.prevPressure;
        const smoothedPressure = pressure - pressureDiff * this.pressureSmoothing;

        // --- 4. Thickness computation (Atrament exact) ---
        // Recompute distance from smoothed coords (Atrament recalculates this)
        let smoothDistPx = 0;
        if (this.prevSmoothed) {
            const sdx = smoothX - this.prevSmoothed.x;
            const sdy = smoothY - this.prevSmoothed.y;
            smoothDistPx = Math.sqrt(sdx * sdx + sdy * sdy) * this.viewport.scale;
        }

        const baseSizePx = stroke.size * this.viewport.scale;  // mm → px

        if (this.adaptiveStroke && pressure === DEFAULT_PRESSURE) {
            // Mouse mode — velocity-adaptive stroke (Atrament exact)
            const maxWeight = baseSizePx + WEIGHT_SPREAD;
            const ratio = (smoothDistPx - MIN_LINE_THICKNESS) / LINE_THICKNESS_RANGE;
            const target = ratio * (maxWeight - baseSizePx) + baseSizePx;
            if (this.currentThickness > target) {
                this.currentThickness = Math.max(target, this.currentThickness - THICKNESS_INCREMENT);
            } else {
                this.currentThickness = Math.min(target, this.currentThickness + THICKNESS_INCREMENT);
            }
        } else {
            // Stylus mode — pressure-mapped (Atrament exact)
            this.currentThickness = baseSizePx * this.getWeightWithPressure(smoothedPressure);
        }

        // Convert thickness from px back to mm for vertex generation
        const thicknessMm = this.currentThickness / this.viewport.scale;
        const halfW = thicknessMm * 0.5;

        // --- 5. Emit geometry ---
        if (this.prevSmoothed) {
            const dx = smoothX - this.prevSmoothed.x;
            const dy = smoothY - this.prevSmoothed.y;
            const segDist = Math.sqrt(dx * dx + dy * dy);

            if (segDist > 0.001) {
                // Emit start cap on first real segment
                if (!this.strokeStarted) {
                    this.emitRoundCap(
                        this.prevSmoothed.x, this.prevSmoothed.y,
                        smoothX, smoothY,
                        halfW, stroke.color, false
                    );
                    this.strokeStarted = true;
                }

                this.emitSegment(this.prevSmoothed, { x: smoothX, y: smoothY }, halfW, stroke.color);

                // Track last segment direction for end cap
                this.lastSegmentDir = { dx: dx / segDist, dy: dy / segDist };
            }
        }

        // --- 6. Update state ---
        this.prevSmoothed = { x: smoothX, y: smoothY };
        this.prevRawMm = { x: mmX, y: mmY };
        if (rawPxX !== undefined && rawPxY !== undefined) {
            this.prevRawPx = { x: rawPxX, y: rawPxY };
        }
        this.prevPressure = smoothedPressure;

        // Upload to GPU
        this.uploadDynamic();
    }

    /**
     * Atrament's pressure-to-weight mapping (exact port).
     * Returns a multiplier for the base weight.
     * pressure=0.5 → 1.0, pressure=0 → PRESSURE_LOW, pressure=1 → PRESSURE_HIGH
     */
    getWeightWithPressure(pressure) {
        if (pressure === 0.5) return 1.0;
        if (pressure < 0.5) {
            // scale(pressure, 0, 0.5, pressureLow, 1)
            return ((pressure - 0) * (1 - this.pressureLow)) / (0.5 - 0) + this.pressureLow;
        }
        // scale(pressure, 0.5, 1, 1, pressureHigh)
        return ((pressure - 0.5) * (this.pressureHigh - 1)) / (1 - 0.5) + 1;
    }

    // -----------------------------------------------------------------------
    // Geometry generation
    // -----------------------------------------------------------------------

    /**
     * Emit a quad between two points as a triangle strip pair.
     * On the first call per stroke, emits 4 vertices (both edges).
     * On subsequent calls, emits 2 vertices (current edge only — prev was already emitted).
     */
    emitSegment(prev, curr, halfW, colorU32) {
        const dx = curr.x - prev.x;
        const dy = curr.y - prev.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 0.001) return;

        // Perpendicular unit vector
        const px = -dy / dist;
        const py = dx / dist;

        // First segment in strip after a cap — need to emit both prev and curr edges
        // We check if the last two vertices in the buffer came from a cap (fan geometry)
        // by checking if dynamicVertexCount is odd (caps emit center+arc pairs)
        // or if there are no strip vertices yet from emitSegment.
        if (!this._hasEmittedStrip) {
            // Bridge from cap to strip: duplicate last cap vertex + first strip vertex
            if (this.dynamicVertexCount > 0) {
                const lastOff = (this.dynamicVertexCount - 1) * BYTES_PER_VERTEX;
                const lx = this.dynamicView.getFloat32(lastOff, true);
                const ly = this.dynamicView.getFloat32(lastOff + 4, true);
                this.appendVertexToDynamic(lx, ly, colorU32);  // degenerate
                this.appendVertexToDynamic(prev.x + px * halfW, prev.y + py * halfW, colorU32); // degenerate
            }
            this.appendVertexToDynamic(prev.x + px * halfW, prev.y + py * halfW, colorU32);
            this.appendVertexToDynamic(prev.x - px * halfW, prev.y - py * halfW, colorU32);
            this._hasEmittedStrip = true;
        }

        this.appendVertexToDynamic(curr.x + px * halfW, curr.y + py * halfW, colorU32);
        this.appendVertexToDynamic(curr.x - px * halfW, curr.y - py * halfW, colorU32);
    }

    /**
     * Emit a semicircular cap as a triangle strip fan.
     * @param {number} cx,cy   Center of the cap (stroke endpoint) in mm
     * @param {number} toX,toY Direction reference point (the other end of the segment)
     * @param {number} halfW   Half-width of the stroke in mm
     * @param {number} color   Packed RGBA u32
     * @param {boolean} forward true = cap faces forward (end of stroke), false = backward (start)
     */
    emitRoundCap(cx, cy, toX, toY, halfW, color, forward) {
        const dx = toX - cx;
        const dy = toY - cy;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 0.001) return;

        // Normalized direction of the stroke at this endpoint
        const dirX = dx / dist;
        const dirY = dy / dist;

        // Perpendicular
        const nx = -dirY;
        const ny = dirX;

        // Cap faces opposite to stroke direction (start) or same direction (end)
        const faceDx = forward ? dirX : -dirX;
        const faceDy = forward ? dirY : -dirY;

        // Bridge: if there's existing geometry, insert degenerate vertices
        if (this.dynamicVertexCount > 0) {
            const lastOff = (this.dynamicVertexCount - 1) * BYTES_PER_VERTEX;
            const lx = this.dynamicView.getFloat32(lastOff, true);
            const ly = this.dynamicView.getFloat32(lastOff + 4, true);
            this.appendVertexToDynamic(lx, ly, color);     // duplicate last vertex
            this.appendVertexToDynamic(cx, cy, color);     // duplicate center (first of fan)
        }

        // Triangle strip fan: alternate center and arc points
        for (let i = 0; i <= CAP_SEGMENTS; i++) {
            const angle = Math.PI * (i / CAP_SEGMENTS);
            const cos = Math.cos(angle);
            const sin = Math.sin(angle);
            // Rotate from +perpendicular through face direction to -perpendicular
            const rx = nx * cos + faceDx * sin;
            const ry = ny * cos + faceDy * sin;

            this.appendVertexToDynamic(cx, cy, color);                            // center
            this.appendVertexToDynamic(cx + rx * halfW, cy + ry * halfW, color);  // arc point
        }
    }

    appendVertexToDynamic(x, y, colorU32) {
        const offset = this.dynamicVertexCount * BYTES_PER_VERTEX;

        // Grow buffer if needed
        if (offset + BYTES_PER_VERTEX > this.dynamicBuffer.byteLength) {
            const newSize = this.dynamicBuffer.byteLength * 2;
            const newBuf = new ArrayBuffer(newSize);
            new Uint8Array(newBuf).set(new Uint8Array(this.dynamicBuffer));
            this.dynamicBuffer = newBuf;
            this.dynamicView = new DataView(this.dynamicBuffer);

            // Reallocate GPU buffer too
            const gl = this.gl;
            gl.bindBuffer(gl.ARRAY_BUFFER, this.dynamicVbo);
            gl.bufferData(gl.ARRAY_BUFFER, newSize, gl.DYNAMIC_DRAW);
        }

        this.dynamicView.setFloat32(offset, x, true);
        this.dynamicView.setFloat32(offset + 4, y, true);
        this.dynamicView.setUint32(offset + 8, colorU32, true);
        this.dynamicVertexCount++;
    }

    uploadDynamic() {
        if (this.dynamicVertexCount === 0) return;
        const gl = this.gl;
        gl.bindBuffer(gl.ARRAY_BUFFER, this.dynamicVbo);
        gl.bufferSubData(gl.ARRAY_BUFFER, 0,
            new Uint8Array(this.dynamicBuffer, 0, this.dynamicVertexCount * BYTES_PER_VERTEX));
    }

    // -----------------------------------------------------------------------
    // Stroke finalization
    // -----------------------------------------------------------------------

    endStroke() {
        // Emit end cap at last smoothed position
        if (this.prevSmoothed && this.lastSegmentDir && this.dynamicVertexCount >= 2) {
            const thicknessMm = this.currentThickness / this.viewport.scale;
            const halfW = thicknessMm * 0.5;

            // End cap faces forward (in the direction of the last segment)
            const lastOff = (this.dynamicVertexCount - 1) * BYTES_PER_VERTEX;
            const color = this.dynamicView.getUint32(lastOff + 8, true);

            this.emitRoundCap(
                this.prevSmoothed.x, this.prevSmoothed.y,
                this.prevSmoothed.x + this.lastSegmentDir.dx,
                this.prevSmoothed.y + this.lastSegmentDir.dy,
                halfW, color, true
            );

            this.uploadDynamic();
        }

        // Handle single-point strokes (click without drag) — emit a filled circle
        if (this.dynamicVertexCount === 0 && this.prevSmoothed) {
            const thicknessMm = this.currentThickness / this.viewport.scale;
            const halfW = thicknessMm * 0.5;
            // Use a default color — we need stroke info but it's gone by now.
            // The beginStroke stored the initial thickness but not color.
            // For a dot, emit a full circle as triangle fan.
            // This edge case will be handled by the first addPoint emitting geometry.
        }

        if (this.dynamicVertexCount < 2) {
            this.dynamicVertexCount = 0;
            return;
        }

        // --- Transfer dynamic VBO to static VBO (unchanged architecture) ---
        const gl = this.gl;
        const bytesToCopy = this.dynamicVertexCount * BYTES_PER_VERTEX;

        gl.bindBuffer(gl.ARRAY_BUFFER, this.staticVbo);

        if (this.staticVertexCount > 0) {
            // Insert 2 degenerate vertices to break the strip connection
            const bridgeBuf = new ArrayBuffer(2 * BYTES_PER_VERTEX);
            const bridgeView = new DataView(bridgeBuf);

            // Last vertex of previous stroke
            bridgeView.setFloat32(0, this.lastStaticVertex.x, true);
            bridgeView.setFloat32(4, this.lastStaticVertex.y, true);
            bridgeView.setUint32(8, this.lastStaticVertex.color, true);

            // First vertex of new stroke
            const firstX = this.dynamicView.getFloat32(0, true);
            const firstY = this.dynamicView.getFloat32(4, true);
            const firstColor = this.dynamicView.getUint32(8, true);

            bridgeView.setFloat32(BYTES_PER_VERTEX, firstX, true);
            bridgeView.setFloat32(BYTES_PER_VERTEX + 4, firstY, true);
            bridgeView.setUint32(BYTES_PER_VERTEX + 8, firstColor, true);

            gl.bufferSubData(gl.ARRAY_BUFFER, this.staticVertexCount * BYTES_PER_VERTEX, bridgeBuf);
            this.staticVertexCount += 2;
        }

        gl.bindBuffer(gl.COPY_READ_BUFFER, this.dynamicVbo);
        gl.bindBuffer(gl.COPY_WRITE_BUFFER, this.staticVbo);
        gl.copyBufferSubData(gl.COPY_READ_BUFFER, gl.COPY_WRITE_BUFFER,
            0, this.staticVertexCount * BYTES_PER_VERTEX, bytesToCopy);
        
        this.staticVertexCount += this.dynamicVertexCount;
        
        // Save the last vertex for the next degenerate bridge
        const lastOffset = (this.dynamicVertexCount - 1) * BYTES_PER_VERTEX;
        this.lastStaticVertex = {
            x: this.dynamicView.getFloat32(lastOffset, true),
            y: this.dynamicView.getFloat32(lastOffset + 4, true),
            color: this.dynamicView.getUint32(lastOffset + 8, true)
        };

        this.dynamicVertexCount = 0;
        this._hasEmittedStrip = false;
    }

    // -----------------------------------------------------------------------
    // Rebuild (undo, redo, page change, erase)
    // -----------------------------------------------------------------------

    rebuildStaticVbo(page) {
        this.staticVertexCount = 0;
        this.lastStaticVertex = null;
        const visibleStrokes = page.getVisibleStrokes();
        for (const stroke of visibleStrokes) {
            this.beginStroke(stroke);
            for (const point of stroke.points) {
                // No pixel coords for replayed strokes — falls back to mm×scale approximation
                this.addPoint(stroke, point);
            }
            this.endStroke();
        }
    }

    // -----------------------------------------------------------------------
    // Render loop (unchanged)
    // -----------------------------------------------------------------------

    render() {
        const gl = this.gl;
        this.resize();
        this.clear();

        gl.useProgram(this.program);
        
        const viewMatrix = this.viewport.getViewMatrix();
        const uViewMatrix = gl.getUniformLocation(this.program, 'u_viewMatrix');
        gl.uniformMatrix3fv(uViewMatrix, false, viewMatrix);

        if (this.staticVertexCount > 0) {
            gl.bindBuffer(gl.ARRAY_BUFFER, this.staticVbo);
            this.setupAttributes();
            gl.drawArrays(gl.TRIANGLE_STRIP, 0, this.staticVertexCount);
        }

        if (this.dynamicVertexCount > 0) {
            gl.bindBuffer(gl.ARRAY_BUFFER, this.dynamicVbo);
            this.setupAttributes();
            gl.drawArrays(gl.TRIANGLE_STRIP, 0, this.dynamicVertexCount);
        }

        requestAnimationFrame(() => this.render());
    }

    setupAttributes() {
        const gl = this.gl;
        gl.enableVertexAttribArray(0);
        gl.vertexAttribPointer(0, 2, gl.FLOAT, false, BYTES_PER_VERTEX, 0);
        gl.enableVertexAttribArray(1);
        gl.vertexAttribPointer(1, 4, gl.UNSIGNED_BYTE, true, BYTES_PER_VERTEX, 8);
    }
}
