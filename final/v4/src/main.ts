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
  let contextMenuTarget: Drawing | null = null; // Drawing that the context menu was opened for

  /**
   * Check if the current event target is within the dat.GUI panel or context menu
   */
  function isEventOnGui(): boolean {
    // Access the current event from the window
    const event = window.event as MouseEvent | undefined;
    if (!event || !event.target) return false;

    const target = event.target as HTMLElement;
    // Check if target is inside dat.GUI or context menu
    return (
      target.closest('.dg') !== null ||
      target.closest('#shape-context-menu') !== null
    );
  }

  /*
   * MARK: Context Menu
   */

  const contextMenu = document.getElementById('shape-context-menu');
  const menuRecord = document.getElementById('menu-record');
  const menuClearRecording = document.getElementById('menu-clear-recording');
  const menuDelete = document.getElementById('menu-delete');
  const menuGain = document.getElementById('menu-gain') as HTMLInputElement | null;
  const menuWobble = document.getElementById('menu-wobble') as HTMLInputElement | null;

  /**
   * Shows the context menu at the given position for the given drawing.
   */
  function showContextMenu(x: number, y: number, drawing: Drawing): void {
    if (!contextMenu) return;

    contextMenuTarget = drawing;

    // Update menu item visibility based on drawing state
    if (menuClearRecording) {
      menuClearRecording.style.display = drawing.hasRecordedPath()
        ? 'block'
        : 'none';
    }

    // Update gain slider to current value
    if (menuGain) {
      menuGain.value = String(drawing.getGain());
    }

    // Update wobble slider to current value
    if (menuWobble) {
      menuWobble.value = String(drawing.getWaveAmplitudeScale());
    }

    // Position the menu
    contextMenu.style.left = `${x}px`;
    contextMenu.style.top = `${y}px`;
    contextMenu.classList.remove('hidden');

    // Adjust position if menu goes off screen
    const rect = contextMenu.getBoundingClientRect();
    if (rect.right > window.innerWidth) {
      contextMenu.style.left = `${x - rect.width}px`;
    }
    if (rect.bottom > window.innerHeight) {
      contextMenu.style.top = `${y - rect.height}px`;
    }
  }

  /**
   * Hides the context menu.
   */
  function hideContextMenu(): void {
    if (!contextMenu) return;
    contextMenu.classList.add('hidden');
    contextMenuTarget = null;
  }

  // Set up context menu event listeners
  if (menuRecord) {
    menuRecord.addEventListener('click', (e) => {
      e.stopPropagation();
      if (contextMenuTarget) {
        contextMenuTarget.enableRecordingMode();
        console.log('Recording mode enabled - drag shape to record movement');
      }
      hideContextMenu();
    });
  }

  if (menuClearRecording) {
    menuClearRecording.addEventListener('click', (e) => {
      e.stopPropagation();
      if (contextMenuTarget) {
        contextMenuTarget.clearRecordedPath();
        console.log('Recording cleared');
      }
      hideContextMenu();
    });
  }

  if (menuDelete) {
    menuDelete.addEventListener('click', (e) => {
      e.stopPropagation();
      if (contextMenuTarget) {
        removeDrawing(contextMenuTarget);
      }
      hideContextMenu();
    });
  }

  // Gain slider - update in real-time as user drags
  if (menuGain) {
    menuGain.addEventListener('input', (e) => {
      e.stopPropagation();
      if (contextMenuTarget) {
        const value = parseFloat((e.target as HTMLInputElement).value);
        contextMenuTarget.setGain(value);
      }
    });
    // Prevent mousedown from closing menu or starting canvas actions
    menuGain.addEventListener('mousedown', (e) => {
      e.stopPropagation();
    });
  }

  // Wobble slider - update wave amplitude in real-time
  if (menuWobble) {
    menuWobble.addEventListener('input', (e) => {
      e.stopPropagation();
      if (contextMenuTarget) {
        const value = parseFloat((e.target as HTMLInputElement).value);
        contextMenuTarget.setWaveAmplitudeScale(value);
      }
    });
    // Prevent mousedown from closing menu or starting canvas actions
    menuWobble.addEventListener('mousedown', (e) => {
      e.stopPropagation();
    });
  }

  // Prevent clicks inside context menu from propagating to canvas
  if (contextMenu) {
    contextMenu.addEventListener('mousedown', (e) => {
      e.stopPropagation();
    });
    contextMenu.addEventListener('mouseup', (e) => {
      e.stopPropagation();
    });
  }

  // Close context menu when clicking elsewhere
  document.addEventListener('click', (e) => {
    if (contextMenu && !contextMenu.contains(e.target as Node)) {
      hideContextMenu();
    }
  });

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
    synthFolder
      .add(settings, 'FM_NUM_LINES', 3, 12)
      .step(1)
      .name('FM Lines')
      .onChange(() => {
        // Update all shapes' FM frequencies when line count changes
        for (const drawing of polygonDrawings) {
          drawing.updateFMAudio();
        }
      });
    synthFolder
      .add(settings, 'BPM', 60, 240)
      .step(1)
      .name('BPM')
      .onChange(() => {
        // Update all shapes' audio params when BPM changes
        for (const drawing of polygonDrawings) {
          drawing.updateAudioParams();
        }
      });
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

    // Close the GUI panel by default
    gui.close();
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

      // Draw the frequency label (note name and frequency)
      p.noStroke();
      p.fill(100, 100, 140);
      p.text(`${line.name} (${Math.round(line.freq)} Hz)`, 10, line.y);
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

    // Dragging - show grabbing cursor (different for recording)
    if (draggingDrawing) {
      const canvas = document.querySelector('#canvas-container canvas');
      if (canvas) {
        if (draggingDrawing.isPendingRecording()) {
          (canvas as HTMLElement).style.cursor = 'crosshair'; // Recording cursor
        } else {
          (canvas as HTMLElement).style.cursor = 'grabbing';
        }
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

      // Show appropriate cursor based on mode and recording state
      const canvas = document.querySelector('#canvas-container canvas');
      if (canvas) {
        if (settings.SYNTHESIS_MODE === 'fm') {
          if (hoveredDrawing.isPendingRecording()) {
            (canvas as HTMLElement).style.cursor = 'crosshair'; // Ready to record
          } else {
            (canvas as HTMLElement).style.cursor = 'grab';
          }
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

    // Hide context menu on any click outside of it
    hideContextMenu();

    const isRightClick = p.mouseButton === p.RIGHT;
    const isLeftClick = p.mouseButton === p.LEFT;

    // Right-click: show context menu for shape
    if (isRightClick) {
      const clickedDrawing = findDrawingUnderMouse(p.mouseX, p.mouseY);
      if (clickedDrawing) {
        showContextMenu(p.mouseX, p.mouseY, clickedDrawing);
      }
      return;
    }

    // Left-click handling
    if (isLeftClick) {
      // Check if we're clicking on an existing drawing
      const clickedDrawing = findDrawingUnderMouse(p.mouseX, p.mouseY);

      if (clickedDrawing) {
        if (settings.SYNTHESIS_MODE === 'fm') {
          // FM mode: start dragging (recording only if in recording mode)
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

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (p as any).mouseWheel = (event: WheelEvent) => {
    if (isEventOnGui()) return;

    // Check if hovering over a drawing
    const targetDrawing = findDrawingUnderMouse(p.mouseX, p.mouseY);
    if (!targetDrawing) return;

    // Calculate scale change based on scroll direction
    // Scroll up (negative deltaY) = scale up, scroll down = scale down
    const scaleFactor = event.deltaY > 0 ? 0.9 : 1.1;
    const currentScale = targetDrawing.getScale();
    const newScale = currentScale * scaleFactor;

    // Scale around the cursor position so the point under cursor stays fixed
    targetDrawing.updateScale(newScale, p.mouseX, p.mouseY);

    // Prevent page scroll when scaling a shape
    return false;
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
