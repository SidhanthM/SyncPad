import { Viewport } from './src/lib/viewport.js';

function testViewport() {
    const vp = new Viewport();
    // Simulate a 1440x900 physical pixels canvas (e.g. 720x450 at DPR 2)
    vp.resize(1440, 900);
    
    // Page is 210x297mm
    // Center is (105, 148.5)
    
    // With 1440x900 and fit-to-page (zoom=1.0):
    // scaleX = 1440 / 210 = 6.857
    // scaleY = 900 / 297 = 3.03
    // baseScale = 3.03 * 0.9 = 2.727
    
    // mmToScreen(105, 148.5) should be center of canvas (720, 450)
    const screenCenter = vp.mmToScreen(105, 148.5);
    console.log(`Center (105, 148.5) -> Screen (${screenCenter.x}, ${screenCenter.y})`);
    
    const expectedX = 1440 / 2;
    const expectedY = 900 / 2;
    
    if (Math.abs(screenCenter.x - expectedX) < 1 && Math.abs(screenCenter.y - expectedY) < 1) {
        console.log("Viewport Center Test: PASSED");
    } else {
        console.log(`Viewport Center Test: FAILED (Expected: ${expectedX}, ${expectedY})`);
    }

    // Test matrix
    const matrix = vp.getViewMatrix();
    console.log("View Matrix:", matrix);
}

testViewport();
