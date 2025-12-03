import p5 from 'p5';
import './style.css';
import { Drawing } from './classes/Drawing';
import { Pie } from './classes/Pie';
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
  let drawings: Drawing[] = []; // Non-triangle drawings (falling)
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

    // Initialize Pie singleton at center of screen
    Pie.init(p, p.windowWidth / 2, p.windowHeight / 2);

    // Initialize dat.gui
    const gui = new dat.GUI();
    gui.add(settings, 'BPM', 60, 240).step(1).name('BPM');
    gui
      .add(settings, 'TRIANGULARITY_THRESHOLD', 0, 0.8)
      .step(0.01)
      .name('Tri. Threshold');
    gui
      .add(settings, 'TIP_SELECTION_METHOD', TIP_SELECTION_METHODS)
      .name('Tip Selection');
  };

  p.windowResized = () => {
    p.resizeCanvas(p.windowWidth, p.windowHeight);
    updateCanvasDimensions(p.windowWidth, p.windowHeight);

    // Update Pie position to new center
    Pie.setPosition(p.windowWidth / 2, p.windowHeight / 2);
  };

  p.draw = () => {
    // Update global metronome (handles BPM changes)
    Metronome.update(p.millis());

    p.background(0);

    // Draw the Pie (all triangle drawings)
    Pie.draw();

    p.background(0, 0, 0, 100);

    // Draw non-triangle drawings
    const allDrawings: Drawing[] = [...drawings];
    if (currentDrawing) {
      allDrawings.push(currentDrawing);
    }

    for (const drawing of allDrawings) {
      drawing.draw();
    }

    // Remove drawings that are off screen
    allDrawings
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

    // Check if mouse is over any drawing in the Pie
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

    // Check all drawings in the Pie
    for (const drawing of Pie.drawings) {
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
        Pie.removeDrawing(drawingToDelete);
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
    if (currentDrawing.isTriangle) {
      Pie.addDrawing(currentDrawing);
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
