import p5 from 'p5';
import './style.css';
import { Drawing } from './classes/Drawing';
import { Metronome } from './classes/Metronome';
import { getFrequencyLinePositions } from './classes/ShapeAudio';
import {
  settings,
  updateCanvasDimensions,
  TIP_SELECTION_METHODS,
  SYNTHESIS_MODES,
} from './constants';
import * as dat from 'dat.gui';

// @ts-ignore
window.p5 = p5;

const sketch = (p: p5) => {
  let currentDrawing: Drawing | null = null;
  let polygonDrawings: Drawing[] = []; // Completed valid polygon drawings
  let drawings: Drawing[] = []; // Non-valid drawings (falling)
  let hoveredDrawing: Drawing | null = null;
  let draggingDrawing: Drawing | null = null;
  let lastSynthMode = settings.SYNTHESIS_MODE;

  /**
   * Check if the current event target is within the dat.GUI panel
   */
  function isEventOnGui(): boolean {
    // Access the current event from the window
    const event = window.event as MouseEvent | undefined;
    if (!event || !event.target) return false;

    const target = event.target as HTMLElement;
    // Check if target is inside dat.GUI (has .dg ancestor or is .dg itself)
    return target.closest('.dg') !== null;
  }

  /*
   * MARK: P5.js sketch
   */
  p.setup = () => {
    const canvas = p.createCanvas(p.windowWidth, p.windowHeight);
    updateCanvasDimensions(p.windowWidth, p.windowHeight);
    p.frameRate(60);
    canvas.parent('canvas-container');

    // Prevent context menu on right-click
    const canvasEl = document.querySelector('#canvas-container canvas');
    if (canvasEl) {
      canvasEl.addEventListener('contextmenu', (e) => e.preventDefault());
    }

    p.background(0);

    // Initialize dat.gui
    const gui = new dat.GUI();

    // Synthesis mode folder
    const synthFolder = gui.addFolder('Synthesis');
    synthFolder.add(settings, 'SYNTHESIS_MODE', SYNTHESIS_MODES).name('Mode');
    synthFolder.add(settings, 'FM_NUM_LINES', 3, 12).step(1).name('FM Lines');
    synthFolder.add(settings, 'BPM', 60, 240).step(1).name('BPM');
    synthFolder.open();

    // Shape detection folder
    const shapeFolder = gui.addFolder('Shape Detection');
    shapeFolder
      .add(settings, 'AREA_RATIO_THRESHOLD', 0, 1.0)
      .step(0.01)
      .name('Area Ratio');
    shapeFolder
      .add(settings, 'TIP_SELECTION_METHOD', TIP_SELECTION_METHODS)
      .name('Tip Selection');
    shapeFolder.add(settings, 'AUTO_CLOSE_PATH').name('Auto Close Path');
  };

  p.windowResized = () => {
    p.resizeCanvas(p.windowWidth, p.windowHeight);
    updateCanvasDimensions(p.windowWidth, p.windowHeight);
  };

  p.draw = () => {
    // Update global metronome (handles BPM changes)
    Metronome.update(p.millis());

    // Check if synthesis mode changed
    if (settings.SYNTHESIS_MODE !== lastSynthMode) {
      lastSynthMode = settings.SYNTHESIS_MODE;
      // Update all drawings' FM audio when mode changes
      for (const drawing of polygonDrawings) {
        drawing.updateFMAudio();
      }
    }

    p.background(0);

    // Draw frequency guide lines in FM mode
    if (settings.SYNTHESIS_MODE === 'fm') {
      drawFrequencyLines();
    }

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
   * Draws the horizontal frequency guide lines for FM mode.
   */
  function drawFrequencyLines(): void {
    const lines = getFrequencyLinePositions();

    p.push();
    p.strokeWeight(1);
    p.textSize(11);
    p.textAlign(p.LEFT, p.CENTER);

    for (const line of lines) {
      // Draw the line
      p.stroke(60, 60, 80);
      p.line(0, line.y, p.width, line.y);

      // Draw the note label
      p.noStroke();
      p.fill(100, 100, 140);
      p.text(line.name, 10, line.y);
    }

    p.pop();
  }

  /**
   * Updates the cursor and highlight state based on hover.
   */
  function updateCursor(): void {
    // Clear previous highlight
    if (hoveredDrawing) {
      hoveredDrawing.highlighted = false;
    }

    // Dragging - show grabbing cursor
    if (draggingDrawing) {
      const canvas = document.querySelector('#canvas-container canvas');
      if (canvas) {
        (canvas as HTMLElement).style.cursor = 'grabbing';
      }
      return;
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

      // Show appropriate cursor based on mode
      const canvas = document.querySelector('#canvas-container canvas');
      if (canvas) {
        if (settings.SYNTHESIS_MODE === 'fm') {
          (canvas as HTMLElement).style.cursor = 'grab';
        } else {
          (canvas as HTMLElement).style.cursor = 'pointer';
        }
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
    if (isEventOnGui()) return;

    const isRightClick = p.mouseButton === p.RIGHT;
    const isLeftClick = p.mouseButton === p.LEFT;

    // Right-click: delete shape (in FM mode, or any mode)
    if (isRightClick) {
      const drawingToDelete = findDrawingUnderMouse(p.mouseX, p.mouseY);
      if (drawingToDelete) {
        removeDrawing(drawingToDelete);
      }
      return;
    }

    // Left-click handling
    if (isLeftClick) {
      // Check if we're clicking on an existing drawing
      const clickedDrawing = findDrawingUnderMouse(p.mouseX, p.mouseY);

      if (clickedDrawing) {
        if (settings.SYNTHESIS_MODE === 'fm') {
          // FM mode: start dragging
          draggingDrawing = clickedDrawing;
          draggingDrawing.startDrag(p.mouseX, p.mouseY);
          return;
        } else {
          // Waveform mode: delete on click
          removeDrawing(clickedDrawing);
          return;
        }
      }

      // Not clicking on a drawing - start a new drawing
      if (currentDrawing) {
        continueDrawing(p.mouseX, p.mouseY);
      } else {
        startDrawing(p.mouseX, p.mouseY);
      }
    }
  };

  p.mouseDragged = () => {
    if (isEventOnGui()) return;

    // Handle shape dragging
    if (draggingDrawing) {
      draggingDrawing.updateDrag(p.mouseX, p.mouseY);
      return;
    }

    if (currentDrawing) {
      continueDrawing(p.mouseX, p.mouseY);
    }
  };

  p.mouseReleased = () => {
    if (isEventOnGui()) return;

    // End dragging
    if (draggingDrawing) {
      draggingDrawing.endDrag();
      draggingDrawing = null;
      return;
    }

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

// Create p5 sketch
new p5(sketch);

// Dynamically import p5.sound for audio functionality
import('p5/lib/addons/p5.sound').catch((err) => {
  console.error('Failed to load p5.sound:', err);
});
