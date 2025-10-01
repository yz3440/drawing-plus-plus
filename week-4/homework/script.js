// Canvas dimensions
const CANVAS_WIDTH = 800;
const CANVAS_HEIGHT = 600;

// Preferred camera name
const PREFERRED_CAMERA_NAME = 'USB Camera';
const PIXEL_SKIP = 2;
const CIRCLE_DIAMETER = 4;
const DIM_MULTIPLIER = 1.5;

let V_WIDTH = 256,
  V_HEIGHT = 384,
  V_HEIGHT_HALF = V_HEIGHT / 2;

let BRIGHTNESS_THRESHOLD = 230;

// Camera manager instance
let cameraManager;
let video;

let BRIGHT_GRAPHICS;
let recordingGraphics = false;

// UI elements
let recordButton = {
  x: 0,
  y: 0,
  radius: 30,
  isHovered: false,
};

let clearButton = {
  x: 0,
  y: 0,
  radius: 20,
  isHovered: false,
};

function setup() {
  let canvas = createCanvas(CANVAS_WIDTH, CANVAS_HEIGHT);
  canvas.parent('canvas-container');
  background(255, 255, 255, 25);
  BRIGHT_GRAPHICS = createGraphics(CANVAS_WIDTH, CANVAS_HEIGHT);

  // Set willReadFrequently for better pixel reading performance
  canvas.elt.getContext('2d', { willReadFrequently: true });

  // Position UI elements - bottom center, side by side
  recordButton.x = CANVAS_WIDTH / 2 - 50;
  recordButton.y = CANVAS_HEIGHT - 60;

  clearButton.x = CANVAS_WIDTH / 2 + 50;
  clearButton.y = CANVAS_HEIGHT - 60;

  // Initialize camera manager
  cameraManager = new CameraManager();

  // Initialize camera with preferred name
  cameraManager
    .initializeCameraByName(PREFERRED_CAMERA_NAME, V_WIDTH, V_HEIGHT)
    .then((videoObj) => {
      video = videoObj;
      console.log('Video initialized successfully');
      V_WIDTH = video.elt.videoWidth;
      V_HEIGHT = video.elt.videoHeight;
      V_HEIGHT_HALF = V_HEIGHT / 2;
    })
    .catch((err) => {
      console.error('Failed to initialize camera:', err);
    });
}

function clearGraphics() {
  BRIGHT_GRAPHICS.clear();
}

function draw() {
  // Check if mouse is hovering over record button
  let d = dist(mouseX, mouseY, recordButton.x, recordButton.y);
  recordButton.isHovered = d < recordButton.radius;
  recordingGraphics = recordButton.isHovered;

  // Check if mouse is hovering over clear button
  let dClear = dist(mouseX, mouseY, clearButton.x, clearButton.y);
  clearButton.isHovered = dClear < clearButton.radius;

  fill(0, 0, 0, 0.001);
  rect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

  if (!video || !V_WIDTH || !V_HEIGHT) {
    drawUI();
    return;
  }

  video.loadPixels();

  for (let px = 0; px < V_WIDTH; px += PIXEL_SKIP) {
    for (let py = 0; py < V_HEIGHT_HALF; py += PIXEL_SKIP) {
      let pi = (py * V_WIDTH + px) * 4;
      let r = video.pixels[pi];
      let g = video.pixels[pi + 1];
      let b = video.pixels[pi + 2];

      const canvas_x = map(px, 0, V_WIDTH, 0, CANVAS_WIDTH);
      const canvas_y = map(py, 0, V_HEIGHT_HALF, 0, CANVAS_HEIGHT);

      if (r < BRIGHTNESS_THRESHOLD) {
        r = -DIM_MULTIPLIER * (BRIGHTNESS_THRESHOLD - r) + BRIGHTNESS_THRESHOLD;
        g = -DIM_MULTIPLIER * (BRIGHTNESS_THRESHOLD - g) + BRIGHTNESS_THRESHOLD;
        b = -DIM_MULTIPLIER * (BRIGHTNESS_THRESHOLD - b) + BRIGHTNESS_THRESHOLD;
        fill(r, g, b, 5);
        noStroke();
        ellipse(
          canvas_x,
          canvas_y,
          CIRCLE_DIAMETER * PIXEL_SKIP,
          CIRCLE_DIAMETER * PIXEL_SKIP
        );
      }

      if (r > BRIGHTNESS_THRESHOLD) {
        fill(r, g, b, 40);
        noStroke();
        ellipse(
          canvas_x,
          canvas_y,
          CIRCLE_DIAMETER * PIXEL_SKIP,
          CIRCLE_DIAMETER * PIXEL_SKIP
        );
        if (recordingGraphics) {
          BRIGHT_GRAPHICS.fill(r, g, b, 40);
          BRIGHT_GRAPHICS.noStroke();
          BRIGHT_GRAPHICS.ellipse(
            canvas_x,
            canvas_y,
            CIRCLE_DIAMETER * PIXEL_SKIP,
            CIRCLE_DIAMETER * PIXEL_SKIP
          );
        }
      }
    }
  }
  image(BRIGHT_GRAPHICS, 0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

  // Draw UI on top
  drawUI();
}

function mousePressed() {
  // Check if clear button was clicked
  if (clearButton.isHovered) {
    console.log('Clearing graphics');
    clearGraphics();
  }
}

function drawUI() {
  // Draw record button
  push();
  if (recordButton.isHovered) {
    fill(255, 50, 50, 200); // Red when hovering (recording)
    stroke(255, 255, 255, 255);
  } else {
    fill(100, 100, 100, 150); // Gray when not hovering
    stroke(255, 255, 255, 150);
  }
  strokeWeight(2);
  ellipse(
    recordButton.x,
    recordButton.y,
    recordButton.radius * 2,
    recordButton.radius * 2
  );

  // Inner dot
  noStroke();
  if (recordButton.isHovered) {
    fill(255, 255, 255, 255);
  } else {
    fill(150, 150, 150, 150);
  }
  ellipse(
    recordButton.x,
    recordButton.y,
    recordButton.radius * 0.5,
    recordButton.radius * 0.5
  );
  pop();

  // Draw clear button
  push();
  if (clearButton.isHovered) {
    fill(255, 255, 255, 200);
    stroke(255, 255, 255, 255);
  } else {
    fill(100, 100, 100, 150);
    stroke(255, 255, 255, 150);
  }
  strokeWeight(2);
  ellipse(
    clearButton.x,
    clearButton.y,
    clearButton.radius * 2,
    clearButton.radius * 2
  );

  // Draw "X" symbol using rectangles
  fill(clearButton.isHovered ? 0 : 255);
  noStroke();
  let barWidth = 2;
  let barLength = clearButton.radius * 0.8;

  // First diagonal bar (top-left to bottom-right)
  push();
  translate(clearButton.x, clearButton.y);
  rotate(PI / 4);
  rectMode(CENTER);
  rect(0, 0, barLength, barWidth);
  pop();

  // Second diagonal bar (top-right to bottom-left)
  push();
  translate(clearButton.x, clearButton.y);
  rotate(-PI / 4);
  rectMode(CENTER);
  rect(0, 0, barLength, barWidth);
  pop();

  pop();
}
