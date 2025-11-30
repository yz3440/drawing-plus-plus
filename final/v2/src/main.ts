import p5 from 'p5';
import './style.css';
import { Drawing } from './classes/Drawing';
import { Pie } from './classes/Pie';
import { CANVAS_WIDTH, CANVAS_HEIGHT, settings } from './constants';
import * as dat from 'dat.gui';

// @ts-ignore
window.p5 = p5;

const sketch = (p: p5) => {
  let currentDrawing: Drawing | null = null;
  let drawings: Drawing[] = [];

  let currentPie = new Pie(p, CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2);
  let pies: Pie[] = [];
  let pieShelfX = 100;
  let pieShelfY = 100;

  /*
   * MARK: P5.js sketch
   */
  p.setup = () => {
    let canvas = p.createCanvas(CANVAS_WIDTH, CANVAS_HEIGHT);
    p.frameRate(60);
    canvas.parent('canvas-container');

    p.background(0);

    // Initialize dat.gui
    const gui = new dat.GUI();
    gui.add(settings, 'BPM', 60, 240).step(1).name('BPM');
    gui
      .add(settings, 'TRIANGULARITY_THRESHOLD', 0, 0.8)
      .step(0.01)
      .name('Tri. Threshold');
  };

  p.draw = () => {
    p.background(0);
    p.cursor(p.CROSS);

    const allPies = [...pies, currentPie].filter(
      (pie): pie is Pie => pie !== null
    );
    for (let pie of allPies) {
      pie.draw();
    }

    p.background(0, 0, 0, 100);

    const allDrawings: Drawing[] = [...drawings];
    if (currentDrawing) {
      allDrawings.push(currentDrawing);
    }

    for (let drawing of allDrawings) {
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
  };

  /*
   * MARK: Drawing
   */

  p.mousePressed = () => {
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

  function startDrawing(x: number, y: number) {
    currentDrawing = new Drawing(p);
    currentDrawing.addPoint(x, y);
  }

  function continueDrawing(x: number, y: number) {
    if (currentDrawing) {
      currentDrawing.addPoint(x, y);
    }
  }

  function stopDrawing() {
    if (!currentDrawing) return;

    currentDrawing.finishDrawing();
    if (currentDrawing.isTriangle) {
      if (currentPie.canAddDrawing(currentDrawing)) {
        console.log('Pie can still add drawing');
        currentPie.addDrawing(currentDrawing);
      } else {
        currentPie.scale = 0.3;
        const newPie = new Pie(p, currentPie.x, currentPie.y);
        currentPie.x = pieShelfX;
        currentPie.y = pieShelfY;
        pieShelfX += 200;
        pies.push(currentPie);
        currentPie = newPie;
        currentPie.addDrawing(currentDrawing);
      }
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
