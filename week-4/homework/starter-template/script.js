const CANVAS_WIDTH = 800;
const CANVAS_HEIGHT = 600;

// P5.js sketch
function setup() {
  let canvas = createCanvas(CANVAS_WIDTH, CANVAS_HEIGHT);
  canvas.parent('canvas-container');

  background(0);
}

function draw() {
  background(0, 50);

  fill(100, 150, 255);
  noStroke();
  ellipse(mouseX, mouseY, 50, 50);
}
