import p5 from 'p5';
import './style.css';
import { Drawing } from './classes/Drawing';
import { Metronome } from './classes/Metronome';
import {
  settings,
  updateCanvasDimensions,
  TIP_SELECTION_METHODS,
} from './constants';
import * as dat from 'dat.gui';

// @ts-ignore
window.p5 = p5;

const sketch = (p: p5) => {
  let currentDrawing: Drawing | null = null;
  let polygonDrawings: Drawing[] = []; // Completed valid polygon drawings
  let drawings: Drawing[] = []; // Non-valid drawings (falling)
  let hoveredDrawing: Drawing | null = null;

  /*
   * MARK: P5.js sketch
   */
  p.setup = () => {
    const canvas = p.createCanvas(p.windowWidth, p.windowHeight);
    updateCanvasDimensions(p.windowWidth, p.windowHeight);
    p.frameRate(60);
    canvas.parent('canvas-container');

    p.background(0);

    // Initialize dat.gui
    const gui = new dat.GUI();
    gui.add(settings, 'BPM', 60, 240).step(1).name('BPM');
    
    // Replaced TRIANGULARITY_THRESHOLD with AREA_RATIO_THRESHOLD
    gui
      .add(settings, 'AREA_RATIO_THRESHOLD', 0, 1.0)
      .step(0.01)
      .name('Area Ratio');
      
    gui
      .add(settings, 'TIP_SELECTION_METHOD', TIP_SELECTION_METHODS)
      .name('Tip Selection');
    gui.add(settings, 'AUTO_CLOSE_PATH').name('Auto Close Path');
  };

  p.windowResized = () => {
    p.resizeCanvas(p.windowWidth, p.windowHeight);
    updateCanvasDimensions(p.windowWidth, p.windowHeight);
  };

  p.draw = () => {
    // Update global metronome (handles BPM changes)
    Metronome.update(p.millis());

    p.background(0);

    // Draw active polygon drawings
    for (const drawing of polygonDrawings) {
      drawing.draw();
    }

    p.background(0, 0, 0, 100);

    // Draw non-valid drawings
    const allFallingDrawings: Drawing[] = [...drawings];
    if (currentDrawing) {
      allFallingDrawings.push(currentDrawing);
    }

    for (const drawing of allFallingDrawings) {
      drawing.draw();
    }

    // Remove drawings that are off screen
    allFallingDrawings
      .filter((drawing) => drawing.isOffScreen())
      .forEach((drawing) => {
        const idx = drawings.indexOf(drawing);
        if (idx !== -1) {
          drawings.splice(idx, 1);
        }
      });

    // Update cursor based on hover state
    updateCursor();
  };

  /**
   * Updates the cursor and highlight state based on hover.
   */
  function updateCursor(): void {
    // Clear previous highlight
    if (hoveredDrawing) {
      hoveredDrawing.highlighted = false;
    }

    if (currentDrawing) {
      // Currently drawing - show crosshair
      p.cursor(p.CROSS);
      hoveredDrawing = null;
      return;
    }

    // Check if mouse is over any drawing
    hoveredDrawing = findDrawingUnderMouse(p.mouseX, p.mouseY);

    if (hoveredDrawing) {
      // Highlight the hovered drawing
      hoveredDrawing.highlighted = true;

      // Show pointer cursor
      const canvas = document.querySelector('#canvas-container canvas');
      if (canvas) {
        (canvas as HTMLElement).style.cursor = 'pointer';
      }
    } else {
      p.cursor(p.CROSS);
    }
  }

  /**
   * Finds the drawing under the mouse position.
   * If multiple drawings contain the point, returns the one closest to its centroid.
   */
  function findDrawingUnderMouse(x: number, y: number): Drawing | null {
    const candidates: Drawing[] = [];

    // Check all polygon drawings
    for (const drawing of polygonDrawings) {
      if (drawing.containsPoint(x, y)) {
        candidates.push(drawing);
      }
    }

    if (candidates.length === 0) return null;
    if (candidates.length === 1) return candidates[0];

    // Multiple candidates - find the closest by centroid distance
    let closest: Drawing | null = null;
    let minDist = Infinity;

    for (const drawing of candidates) {
      const dist = drawing.distanceToCentroid(x, y);
      if (dist < minDist) {
        minDist = dist;
        closest = drawing;
      }
    }

    return closest;
  }

  /*
   * MARK: Drawing & Interaction
   */

  p.mousePressed = () => {
    // Check if we're clicking on an existing drawing to delete it
    if (!currentDrawing) {
      const drawingToDelete = findDrawingUnderMouse(p.mouseX, p.mouseY);
      if (drawingToDelete) {
        removeDrawing(drawingToDelete);
        return; // Don't start a new drawing
      }
    }

    if (currentDrawing) {
      continueDrawing(p.mouseX, p.mouseY);
    } else {
      startDrawing(p.mouseX, p.mouseY);
    }
  };

  p.mouseDragged = () => {
    if (currentDrawing) {
      continueDrawing(p.mouseX, p.mouseY);
    }
  };

  p.mouseReleased = () => {
    stopDrawing();
  };

  function removeDrawing(drawing: Drawing): void {
    const idx = polygonDrawings.indexOf(drawing);
    if (idx !== -1) {
      drawing.dispose();
      polygonDrawings.splice(idx, 1);
    }
  }

  function startDrawing(x: number, y: number): void {
    currentDrawing = new Drawing(p);
    currentDrawing.addPoint(x, y);
  }

  function continueDrawing(x: number, y: number): void {
    if (currentDrawing) {
      currentDrawing.addPoint(x, y);
    }
  }

  function stopDrawing(): void {
    if (!currentDrawing) return;

    currentDrawing.finishDrawing();
    if (currentDrawing.isValidShape) {
      polygonDrawings.push(currentDrawing);
    } else {
      drawings.push(currentDrawing);
    }
    currentDrawing = null;
  }
};

// Dynamically import p5.sound to ensure p5 is available globally
import('p5/lib/addons/p5.sound').then(() => {
  new p5(sketch);
});
