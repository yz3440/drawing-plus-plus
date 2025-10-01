// Canvas dimensions
const CANVAS_WIDTH = 800;
const CANVAS_HEIGHT = 600;

// Preferred camera name
const PREFERRED_CAMERA_NAME = 'USB Camera';

let V_WIDTH = 256,
  V_HEIGHT = 384,
  V_HEIGHT_HALF = V_HEIGHT / 2;

let BRIGHTNESS_THRESHOLD = 100;

// Camera manager instance
let cameraManager;
let video;

function setup() {
  let canvas = createCanvas(CANVAS_WIDTH, CANVAS_HEIGHT);
  canvas.parent('canvas-container');
  background(255, 255, 255, 25);

  // Set willReadFrequently for better pixel reading performance
  canvas.elt.getContext('2d', { willReadFrequently: true });

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

function draw() {
  fill(0, 0, 0, 5);
  rect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

  if (!video || !V_WIDTH || !V_HEIGHT) {
    return;
  }

  video.loadPixels();
  for (let px = 0; px < V_WIDTH; px++) {
    for (let py = 0; py < V_HEIGHT_HALF; py++) {
      let pi = (py * V_WIDTH + px) * 4;
      let brightness = video.pixels[pi];

      if (brightness > BRIGHTNESS_THRESHOLD) {
        const canvas_x = map(px, 0, V_WIDTH, 0, CANVAS_WIDTH);
        const canvas_y = map(py, 0, V_HEIGHT_HALF, 0, CANVAS_HEIGHT);
        fill(brightness, brightness, brightness, 5);
        noStroke();
        ellipse(canvas_x, canvas_y, 5, 5);
      }
    }
  }
}
