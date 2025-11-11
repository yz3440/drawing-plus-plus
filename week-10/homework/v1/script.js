const CANVAS_WIDTH = 800;
const CANVAS_HEIGHT = 600;

// Graphics buffers
let drawingGraphics;
let horizonGraphics;
let tempCanvas;

// Model and generation state
let generator;
let isModelLoaded = false;
let isGenerating = false;
let lastDrawTime = 0;
let generateTimeout;

// Drawing state
let isDrawing = false;
let brushSize = 3;

// Opacity for overlay
let horizonOpacity = 0;
let targetOpacity = 150;

// Model class
class HorizonGenerator {
  constructor() {
    this.model = null;
  }

  async loadModel(modelPath) {
    try {
      this.model = await tf.loadGraphModel(modelPath + '/model.json');
      console.log('Model loaded successfully');
      return true;
    } catch (error) {
      console.error('Failed to load model:', error);
      return false;
    }
  }

  async generate(inputCanvas) {
    if (!this.model) {
      throw new Error('Model not loaded');
    }

    // Prepare input tensor - resize to 256x256 for the model
    const input = tf.browser
      .fromPixels(inputCanvas)
      .resizeNearestNeighbor([256, 256])
      .toFloat()
      .div(127.5)
      .sub(1)
      .expandDims(0);

    // Run inference
    const output = await this.model.predict(input);

    // Post-process output
    const generated = output
      .squeeze()
      .add(1)
      .mul(127.5)
      .clipByValue(0, 255)
      .cast('int32');

    // Create a temporary canvas for the result
    const resultCanvas = document.createElement('canvas');
    resultCanvas.width = 256;
    resultCanvas.height = 256;

    // Draw to canvas
    await tf.browser.toPixels(generated, resultCanvas);

    // Cleanup tensors
    input.dispose();
    output.dispose();
    generated.dispose();

    return resultCanvas;
  }
}

// P5.js functions
function setup() {
  let canvas = createCanvas(CANVAS_WIDTH, CANVAS_HEIGHT);
  canvas.parent('canvas-container');

  // Create graphics buffers
  drawingGraphics = createGraphics(CANVAS_WIDTH, CANVAS_HEIGHT);
  horizonGraphics = createGraphics(CANVAS_WIDTH, CANVAS_HEIGHT);

  // Initialize drawing canvas with white background
  drawingGraphics.background(255);

  // Create temp canvas for model input
  tempCanvas = document.createElement('canvas');
  tempCanvas.width = CANVAS_WIDTH;
  tempCanvas.height = CANVAS_HEIGHT;

  // Initialize and load the model
  initModel();
}

function draw() {
  // Clear main canvas
  background(255);

  // Draw the drawing layer
  image(drawingGraphics, 0, 0);

  // Draw the horizon layer with opacity
  if (horizonOpacity > 0) {
    push();
    tint(255, horizonOpacity);
    image(horizonGraphics, 0, 0);
    pop();
  }

  // Smooth opacity transition
  if (horizonOpacity < targetOpacity - 1) {
    horizonOpacity += 5;
  } else if (horizonOpacity > targetOpacity + 1) {
    horizonOpacity -= 5;
  }

  // Draw current stroke if drawing
  if (isDrawing) {
    drawingGraphics.stroke(0);
    drawingGraphics.strokeWeight(brushSize);
    drawingGraphics.line(pmouseX, pmouseY, mouseX, mouseY);
  }

  // Show loading/status text
  if (!isModelLoaded) {
    push();
    fill(100);
    noStroke();
    textAlign(CENTER, CENTER);
    textSize(16);
    text('Loading AI model...', width / 2, height - 30);
    pop();
  } else if (isGenerating) {
    push();
    fill(100);
    noStroke();
    textAlign(CENTER, CENTER);
    textSize(16);
    text('Generating horizon...', width / 2, height - 30);
    pop();
  }

  // Instructions
  push();
  fill(150);
  noStroke();
  textAlign(LEFT, TOP);
  textSize(12);
  text(
    'Draw edges to generate horizons | Press C to clear | Press 1-5 to change brush size',
    10,
    10
  );
  pop();
}

function mousePressed() {
  if (mouseX >= 0 && mouseX <= width && mouseY >= 0 && mouseY <= height) {
    isDrawing = true;
    // Cancel any pending generation
    if (generateTimeout) {
      clearTimeout(generateTimeout);
    }
  }
}

function mouseDragged() {
  if (isDrawing) {
    drawingGraphics.stroke(0);
    drawingGraphics.strokeWeight(brushSize);
    drawingGraphics.line(pmouseX, pmouseY, mouseX, mouseY);
    lastDrawTime = millis();
  }
}

function mouseReleased() {
  if (isDrawing) {
    isDrawing = false;

    // Schedule generation after 500ms
    if (isModelLoaded && !isGenerating) {
      if (generateTimeout) {
        clearTimeout(generateTimeout);
      }
      generateTimeout = setTimeout(() => {
        generateHorizon();
      }, 0);
    }
  }
}

function keyPressed() {
  // Clear canvas
  if (key === 'c' || key === 'C') {
    drawingGraphics.background(255);
    horizonGraphics.clear();
    horizonOpacity = 0;
    targetOpacity = 0;
  }

  // Change brush size
  if (key >= '1' && key <= '5') {
    brushSize = parseInt(key) * 2;
  }

  // Random edges for testing
  if (key === 'r' || key === 'R') {
    drawRandomEdges();
    // Generate after drawing
    if (isModelLoaded && !isGenerating) {
      setTimeout(() => {
        generateHorizon();
      }, 0);
    }
  }
}

async function initModel() {
  generator = new HorizonGenerator();

  try {
    // Load model from the tfjs_horizon_model_uint8 directory
    const success = await generator.loadModel('../tfjs_horizon_model_uint8');

    if (success) {
      isModelLoaded = true;
      console.log('Model loaded and ready!');

      // Draw initial random edges
      drawRandomEdges();

      // Generate initial horizon
      setTimeout(() => {
        generateHorizon();
      }, 100);
    }
  } catch (error) {
    console.error('Failed to initialize model:', error);
  }
}

async function generateHorizon() {
  if (!isModelLoaded || isGenerating) return;

  try {
    isGenerating = true;

    // Copy drawing to temp canvas
    const ctx = tempCanvas.getContext('2d');
    ctx.drawImage(drawingGraphics.canvas, 0, 0);

    // Generate horizon
    const resultCanvas = await generator.generate(tempCanvas);

    // Clear horizon graphics and draw the result
    horizonGraphics.clear();

    // Convert HTML canvas to p5 Image
    // First create a p5 image from the canvas
    const img = createImage(256, 256);
    img.drawingContext.drawImage(resultCanvas, 0, 0);
    img.loadPixels();
    img.updatePixels();

    // Scale the 256x256 result to fit our canvas
    horizonGraphics.push();
    horizonGraphics.imageMode(CORNER);
    horizonGraphics.image(img, 0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    horizonGraphics.pop();

    // Start fade in
    horizonOpacity = 0;
    targetOpacity = 150;

    isGenerating = false;
  } catch (error) {
    console.error('Generation error:', error);
    isGenerating = false;
  }
}

function drawRandomEdges() {
  drawingGraphics.background(255);
  drawingGraphics.stroke(0);
  drawingGraphics.strokeWeight(2);
  drawingGraphics.noFill();

  // Draw random curved lines
  for (let i = 0; i < 3; i++) {
    drawingGraphics.beginShape();
    let x = random(50, 150);
    let y = random(height * 0.3, height * 0.7);
    drawingGraphics.vertex(x, y);

    for (let j = 0; j < 5; j++) {
      x += random(100, 150);
      y += random(-50, 50);
      y = constrain(y, height * 0.2, height * 0.8);
      drawingGraphics.curveVertex(x, y);
    }
    drawingGraphics.endShape();
  }

  // Add some detail lines
  for (let i = 0; i < 5; i++) {
    let x1 = random(width);
    let y1 = random(height * 0.3, height * 0.7);
    let x2 = x1 + random(-50, 50);
    let y2 = y1 + random(-30, 30);
    drawingGraphics.line(x1, y1, x2, y2);
  }
}
