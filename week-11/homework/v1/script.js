const CANVAS_WIDTH = 800;
const CANVAS_HEIGHT = 600;

const fps = 120;

let drawing = false;

let offsetX = 0;
let offsetY = 0;

let lastDrawX = 0;
let lastDrawY = 0;

let drawX = 0;
let drawY = 0;

// P5.js sketch
function setup() {
  let canvas = createCanvas(CANVAS_WIDTH, CANVAS_HEIGHT);
  canvas.parent('canvas-container');
  frameRate(fps);

  background(0);
  strokeWeight(2);
  stroke(255);
}

function draw() {
  offsetX = sin(frameCount / 4) * noise(frameCount / 4) * 40;
  offsetY = cos(frameCount / 4) * noise(frameCount / 4) * 40;

  drawX = mouseX + offsetX;
  drawY = mouseY + offsetY;

  // Only draw when mouse is pressed
  if (drawing) {
    line(lastDrawX, lastDrawY, drawX, drawY);
  }

  lastDrawX = drawX;
  lastDrawY = drawY;
}

function mousePressed() {
  drawing = true;
}

function mouseReleased() {
  drawing = false;
}

function keyPressed() {
  // Clear canvas when 'c' is pressed
  if (key === 'c' || key === 'C') {
    background(0);
  }
}
