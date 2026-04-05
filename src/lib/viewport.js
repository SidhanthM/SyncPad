export class Viewport {
    constructor() {
        // Page dimensions in mm
        this.pageWidthMm = 210.0;
        this.pageHeightMm = 297.0;

        // Canvas dimensions in physical pixels, set by resize()
        this.canvasWidth = 0;
        this.canvasHeight = 0;

        // View state
        this.panX = this.pageWidthMm / 2; // pan center x in mm
        this.panY = this.pageHeightMm / 2; // pan center y in mm
        this.zoom = 1.0; // zoom multiplier

        // Matrix components, recalculated on change
        this.sx = 1.0;
        this.sy = 1.0;
        this.tx = 0.0;
        this.ty = 0.0;

        this.phoneViewX = 10;
        this.phoneViewY = 10;
        this.phoneViewWidth = 100;
        this.phoneViewHeight = 150;

        this.updateMatrix();
    }

    /**
     * Updates canvas size from renderer.
     * @param {number} canvasWidth - Physical width in pixels.
     * @param {number} canvasHeight - Physical height in pixels.
     */
    resize(canvasWidth, canvasHeight) {
        if (this.canvasWidth !== canvasWidth || this.canvasHeight !== canvasHeight) {
            this.canvasWidth = canvasWidth;
            this.canvasHeight = canvasHeight;
            this.updateMatrix();
        }
    }

    setPan(x, y) {
        this.panX = x;
        this.panY = y;
        this.updateMatrix();
    }

    setZoom(zoom) {
        this.zoom = zoom;
        this.updateMatrix();
    }

    updateMatrix() {
        if (this.canvasWidth === 0 || this.canvasHeight === 0) return;

        // Determine the base scale to fit the page within the canvas
        const scaleX = this.canvasWidth / this.pageWidthMm;
        const scaleY = this.canvasHeight / this.pageHeightMm;
        const baseScale = Math.min(scaleX, scaleY) * 0.9; // 0.9 for margin

        this.scale = baseScale * this.zoom;

        // The width/height of the visible page area in mm
        const viewWidthMm = this.canvasWidth / this.scale;
        const viewHeightMm = this.canvasHeight / this.scale;

        // Top-left corner of the visible page area in mm
        const leftMm = this.panX - viewWidthMm / 2;
        const topMm = this.panY - viewHeightMm / 2;
        
        // Matrix to map the visible mm-space to clip-space [-1, 1]
        this.sx = 2.0 / viewWidthMm;
        this.sy = -2.0 / viewHeightMm; // Flip Y for clip space
        
        const rightMm = leftMm + viewWidthMm;
        const bottomMm = topMm + viewHeightMm;
        
        this.tx = -(rightMm + leftMm) / viewWidthMm;
        this.ty = -(bottomMm + topMm) / -viewHeightMm; // Y is flipped
    }

    getPanBounds() {
        const viewHeightMm = this.canvasHeight / this.scale;
        if (viewHeightMm >= this.pageHeightMm) {
            // Page smaller than screen, keep it centered
            return {
                minY: this.pageHeightMm / 2,
                maxY: this.pageHeightMm / 2
            };
        } else {
            return {
                minY: viewHeightMm / 2,
                maxY: this.pageHeightMm - viewHeightMm / 2
            };
        }
    }

    /**
     * Phone Viewport (Represented by the blue box on desktop)
     * All values in Page mm.
     */
    setPhoneView(x, y, width, height) {
        this.phoneViewX = Math.max(0, Math.min(this.pageWidthMm - width, x));
        this.phoneViewY = Math.max(0, Math.min(this.pageHeightMm - height, y));
        this.phoneViewWidth = Math.max(10, Math.min(this.pageWidthMm, width));
        this.phoneViewHeight = Math.max(10, Math.min(this.pageHeightMm, height));
    }

    getPhoneViewRect() {
        return {
            x: this.phoneViewX,
            y: this.phoneViewY,
            width: this.phoneViewWidth,
            height: this.phoneViewHeight
        };
    }

    /**
     * Converts page millimeters to physical screen pixels.
     */
    mmToScreen(x, y) {
        // Find top-left of visible area in mm
        const viewWidthMm = this.canvasWidth / (this.canvasWidth / this.pageWidthMm * Math.min(this.canvasWidth/this.pageWidthMm, this.canvasHeight/this.pageHeightMm) * 0.9 * this.zoom);
        // Wait, use the already computed matrix components for simplicity
        // Clip space x = (x * sx) + tx
        // Physical pixel x = (clipX + 1) / 2 * canvasWidth
        
        const clipX = (x * this.sx) + this.tx;
        const clipY = (y * this.sy) + this.ty;
        
        const screenX = (clipX + 1.0) / 2.0 * this.canvasWidth;
        const screenY = (1.0 - clipY) / 2.0 * this.canvasHeight; // Flip Y back for screen
        
        return { x: screenX, y: screenY };
    }

    /**
     * Converts physical screen pixels to page millimeters.
     */
    screenToMm(x, y) {
        // Physical pixel x to clip space x: clipX = (x / canvasWidth) * 2 - 1
        const clipX = (x / this.canvasWidth) * 2.0 - 1.0;
        const clipY = 1.0 - (y / this.canvasHeight) * 2.0; // Flip Y for clip space
        
        // From updateMatrix:
        // clipX = x_mm * sx + tx  => x_mm = (clipX - tx) / sx
        const mmX = (clipX - this.tx) / this.sx;
        const mmY = (clipY - this.ty) / this.sy;
        
        return { x: mmX, y: mmY };
    }

    /**
     * Scale a mm distance to physical screen pixels.
     */
    mmDistanceToScreen(mm) {
        // clipWidth = mm * sx
        // pixelWidth = clipWidth / 2 * canvasWidth
        return (mm * this.sx) / 2.0 * this.canvasWidth;
    }

    /**
     * Scale a screen pixel distance to page millimeters.
     */
    screenDistanceToMm(pixels) {
        // clipWidth = pixels / canvasWidth * 2
        // mm = clipWidth / sx
        return (pixels / this.canvasWidth * 2.0) / this.sx;
    }

    /**
     * Returns the view matrix (mm-space to clip-space).
     * Maps the visible part of the page to clip space.
     * Clip space is [-1, 1] with (0,0) at center.
     */
    getViewMatrix() {
        // 3x3 matrix (column-major for WebGL)
        // [ sx  0  tx ]
        // [ 0   sy ty ]
        // [ 0   0  1  ]
        return new Float32Array([
            this.sx, 0, 0,
            0, this.sy, 0,
            this.tx, this.ty, 1
        ]);
    }
}
