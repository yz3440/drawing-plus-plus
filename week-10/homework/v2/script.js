// Canvas sizes
const MODEL_SIZE = 256; // Internal processing size (model I/O)
const DISPLAY_SIZE = 640; // Display canvas size
const SCALE_FACTOR = DISPLAY_SIZE / MODEL_SIZE; // Scale factor for display

// Graphics buffers
let drawingGraphics;
let horizonGraphicsA; // First horizon buffer
let horizonGraphicsB; // Second horizon buffer
let activeHorizonBuffer = 'A'; // Which buffer is currently active
let modelInputCanvas;

// Model and generation state
let generator;
let isModelLoaded = false;
let isGenerating = false;
let generateTimeout;

// Drawing state
let isDrawing = false;
let brushSize = 1;
let lastDrawTime = 0;
let drawingOpacity = 255;
let targetDrawingOpacity = 255;

// Opacity for overlays
let horizonOpacityA = 0;
let horizonOpacityB = 0;
let targetOpacityA = 0;
let targetOpacityB = 0;

// Debug mode
let debugMode = false;
let lastGeneratedCanvas = null;

// Timing constants
const INACTIVITY_FADE_DELAY = 3000; // Start fading after 3 seconds of inactivity
const FADE_DURATION = 1000; // Fade out over 1 second

// Model class
class HorizonGenerator {
  constructor() {
    this.model = null;
  }

  async loadModel(modelPath) {
    try {
      this.model = await tf.loadGraphModel(modelPath + '/model.json');
      console.log('✅ Model loaded successfully');
      return true;
    } catch (error) {
      console.error('❌ Failed to load model:', error);
      return false;
    }
  }

  async generate(inputCanvas) {
    if (!this.model) {
      throw new Error('Model not loaded');
    }

    // Prepare input tensor
    const input = tf.browser
      .fromPixels(inputCanvas)
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
  // Set pixel density to 1 to avoid retina display issues
  pixelDensity(1);

  // Create display canvas at display size
  let canvas = createCanvas(DISPLAY_SIZE, DISPLAY_SIZE);
  canvas.parent('canvas-container');

  // Create graphics buffers at model size (256x256) for internal processing
  drawingGraphics = createGraphics(MODEL_SIZE, MODEL_SIZE);
  horizonGraphicsA = createGraphics(MODEL_SIZE, MODEL_SIZE);
  horizonGraphicsB = createGraphics(MODEL_SIZE, MODEL_SIZE);

  // IMPORTANT: Set pixel density for graphics buffers too
  drawingGraphics.pixelDensity(1);
  horizonGraphicsA.pixelDensity(1);
  horizonGraphicsB.pixelDensity(1);

  // Initialize drawing canvas with white background
  drawingGraphics.background(255);

  // Create canvas for model input
  modelInputCanvas = document.createElement('canvas');
  modelInputCanvas.width = MODEL_SIZE;
  modelInputCanvas.height = MODEL_SIZE;

  // Print instructions
  printInstructions();

  // Initialize and load the model
  initModel();
}

function draw() {
  // Clear main canvas
  background(255);

  // Calculate drawing opacity based on inactivity
  let timeSinceLastDraw = millis() - lastDrawTime;
  if (timeSinceLastDraw > INACTIVITY_FADE_DELAY) {
    // Start fading out after inactivity delay
    targetDrawingOpacity = 0;
  } else {
    // Keep drawing visible
    targetDrawingOpacity = 255;
  }

  // Smooth drawing opacity transition
  if (drawingOpacity < targetDrawingOpacity - 5) {
    drawingOpacity += 10;
  } else if (drawingOpacity > targetDrawingOpacity + 5) {
    drawingOpacity -= 10;
  } else {
    drawingOpacity = targetDrawingOpacity;
  }

  // Draw the drawing layer with opacity (scaled up to display size)
  if (drawingOpacity > 0) {
    push();
    tint(255, drawingOpacity);
    image(drawingGraphics, 0, 0, DISPLAY_SIZE, DISPLAY_SIZE);
    pop();
  }

  // Draw horizon buffer A with its opacity (scaled up to display size)
  if (horizonOpacityA > 0) {
    push();
    if (debugMode) {
      tint(255, Math.min(100, horizonOpacityA));
    } else {
      tint(255, horizonOpacityA);
    }
    image(horizonGraphicsA, 0, 0, DISPLAY_SIZE, DISPLAY_SIZE);
    pop();
  }

  // Draw horizon buffer B with its opacity (scaled up to display size)
  if (horizonOpacityB > 0) {
    push();
    if (debugMode) {
      tint(255, Math.min(100, horizonOpacityB));
    } else {
      tint(255, horizonOpacityB);
    }
    image(horizonGraphicsB, 0, 0, DISPLAY_SIZE, DISPLAY_SIZE);
    pop();
  }

  // Debug mode overlay - show red border
  if (debugMode) {
    push();
    stroke(255, 0, 0, 150);
    strokeWeight(2);
    noFill();
    rect(0, 0, width - 1, height - 1);
    pop();
  }

  // Smooth horizon opacity transitions for both buffers
  // Buffer A
  if (horizonOpacityA < targetOpacityA - 1) {
    horizonOpacityA += 8;
  } else if (horizonOpacityA > targetOpacityA + 1) {
    horizonOpacityA -= 8;
  } else {
    horizonOpacityA = targetOpacityA;
  }

  // Buffer B
  if (horizonOpacityB < targetOpacityB - 1) {
    horizonOpacityB += 8;
  } else if (horizonOpacityB > targetOpacityB + 1) {
    horizonOpacityB -= 8;
  } else {
    horizonOpacityB = targetOpacityB;
  }

  // Draw current stroke if drawing (scale down coordinates)
  if (isDrawing) {
    drawingGraphics.stroke(0);
    drawingGraphics.strokeWeight(brushSize);
    // Scale down mouse coordinates to model size
    drawingGraphics.line(
      pmouseX / SCALE_FACTOR,
      pmouseY / SCALE_FACTOR,
      mouseX / SCALE_FACTOR,
      mouseY / SCALE_FACTOR
    );
  }

  // Show status text
  push();
  fill(100);
  noStroke();
  textAlign(CENTER, CENTER);
  textSize(12);

  pop();

  // Draw border for clarity
  push();
  noFill();
  stroke(200);
  strokeWeight(1);
  rect(0, 0, width - 1, height - 1);
  pop();
}

function mousePressed() {
  if (mouseX >= 0 && mouseX <= width && mouseY >= 0 && mouseY <= height) {
    isDrawing = true;
    lastDrawTime = millis(); // Update last draw time
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
    // Scale down mouse coordinates to model size
    drawingGraphics.line(
      pmouseX / SCALE_FACTOR,
      pmouseY / SCALE_FACTOR,
      mouseX / SCALE_FACTOR,
      mouseY / SCALE_FACTOR
    );
    lastDrawTime = millis(); // Update last draw time
  }
}

function mouseReleased() {
  if (isDrawing) {
    isDrawing = false;

    // Schedule generation after 700ms of no drawing
    if (isModelLoaded && !isGenerating) {
      if (generateTimeout) {
        clearTimeout(generateTimeout);
      }
      generateTimeout = setTimeout(() => {
        generateHorizon();
      }, 700);
    }
  }
}

function keyPressed() {
  // Clear canvas
  if (key === 'c' || key === 'C') {
    drawingGraphics.background(255);
    horizonGraphicsA.clear();
    horizonGraphicsB.clear();
    horizonOpacityA = 0;
    horizonOpacityB = 0;
    targetOpacityA = 0;
    targetOpacityB = 0;
    lastDrawTime = millis(); // Reset draw time to show cleared canvas
    console.log('🧹 Canvas cleared');
  }

  // Change brush size
  if (key >= '1' && key <= '5') {
    brushSize = parseInt(key);
    console.log(`🖌️ Brush size: ${brushSize}px`);
  }

  // Random edges for testing
  if (key === 'r' || key === 'R') {
    drawRandomEdges();
    lastDrawTime = millis(); // Reset draw time to show new drawing
    console.log('🎲 Random edges drawn');
    // Generate after drawing
    if (isModelLoaded && !isGenerating) {
      setTimeout(() => {
        generateHorizon();
      }, 500);
    }
  }

  // Save combined image
  if (key === 's' || key === 'S') {
    saveCanvas('horizon_combined_' + Date.now(), 'png');
    console.log('💾 Saved combined canvas');
  }

  // Save input drawing only (at model size)
  if (key === 'i' || key === 'I') {
    let tempCanvas = createGraphics(MODEL_SIZE, MODEL_SIZE);
    tempCanvas.image(drawingGraphics, 0, 0);
    save(tempCanvas, 'input_drawing_' + Date.now() + '.png');
    tempCanvas.remove();
    console.log('💾 Saved input drawing (256x256)');
  }

  // Save output only (at model size)
  if (key === 'o' || key === 'O') {
    if (lastGeneratedCanvas) {
      let tempCanvas = createGraphics(MODEL_SIZE, MODEL_SIZE);
      tempCanvas.drawingContext.drawImage(lastGeneratedCanvas, 0, 0);
      save(tempCanvas, 'output_generated_' + Date.now() + '.png');
      tempCanvas.remove();
      console.log('💾 Saved generated output (256x256)');
    } else {
      console.log('⚠️ No generated output to save yet');
    }
  }

  // Toggle debug mode
  if (key === 'd' || key === 'D') {
    debugMode = !debugMode;
    console.log(debugMode ? '🔍 Debug mode ON' : '🔍 Debug mode OFF');
  }

  // Save side-by-side comparison (at model size)
  if (key === 'b' || key === 'B') {
    if (lastGeneratedCanvas) {
      let comparisonCanvas = createGraphics(MODEL_SIZE * 2 + 10, MODEL_SIZE);
      comparisonCanvas.background(255);

      // Draw input on the left
      comparisonCanvas.image(drawingGraphics, 0, 0);

      // Draw separator line
      comparisonCanvas.stroke(200);
      comparisonCanvas.strokeWeight(1);
      comparisonCanvas.line(MODEL_SIZE + 5, 0, MODEL_SIZE + 5, MODEL_SIZE);

      // Draw output on the right
      comparisonCanvas.drawingContext.drawImage(
        lastGeneratedCanvas,
        MODEL_SIZE + 10,
        0
      );

      // Save the comparison
      save(comparisonCanvas, 'comparison_' + Date.now() + '.png');
      comparisonCanvas.remove();
      console.log('💾 Saved side-by-side comparison (256x256 each)');
    } else {
      console.log('⚠️ No generated output for comparison');
    }
  }

  // Save model input (for debugging)
  if (key === 'm' || key === 'M') {
    let tempCanvas = createGraphics(MODEL_SIZE, MODEL_SIZE);
    tempCanvas.drawingContext.drawImage(modelInputCanvas, 0, 0);
    save(tempCanvas, 'model_input_' + Date.now() + '.png');
    tempCanvas.remove();
    console.log('💾 Saved model input (256x256)');
  }

  // Help
  if (key === 'h' || key === 'H') {
    printInstructions();
  }
}

function printInstructions() {
  console.log('%cDrawing Controls:', 'font-weight: bold; color: #2196F3');
  console.log('  • Click and drag to draw edges');
  console.log('  • 1-5: Change brush size (1-5 pixels)');
  console.log('  • C: Clear canvas');
  console.log('  • R: Generate random edges');
  console.log('');
  console.log('%cSave Options:', 'font-weight: bold; color: #2196F3');
  console.log('  • S: Save combined canvas');
  console.log('  • I: Save input drawing only');
  console.log('  • O: Save generated output only');
  console.log('  • B: Save side-by-side comparison');
  console.log('  • M: Save model input (debugging)');
  console.log('');
  console.log('%cOther:', 'font-weight: bold; color: #2196F3');
  console.log('  • D: Toggle debug overlay mode');
  console.log('  • H: Show this help message');
}

async function initModel() {
  generator = new HorizonGenerator();

  try {
    // Load model from the tfjs_horizon_model_uint8 directory
    const success = await generator.loadModel('../tfjs_horizon_model_uint8');

    if (success) {
      isModelLoaded = true;
      console.log('🚀 Ready to generate horizons!');

      // Draw initial random edges
      drawRandomEdges();
      lastDrawTime = millis(); // Initialize draw time so initial edges are visible

      // Generate initial horizon
      setTimeout(() => {
        generateHorizon();
      }, 1000);
    }
  } catch (error) {
    console.error('❌ Failed to initialize model:', error);
  }
}

async function generateHorizon() {
  if (!isModelLoaded || isGenerating) return;

  try {
    isGenerating = true;

    // Get the context for the model input canvas
    const ctx = modelInputCanvas.getContext('2d');

    // Clear and prepare the canvas
    ctx.clearRect(0, 0, MODEL_SIZE, MODEL_SIZE);
    ctx.fillStyle = 'white';
    ctx.fillRect(0, 0, MODEL_SIZE, MODEL_SIZE);

    // Copy the drawing - handle different p5.js canvas access methods
    const sourceCanvas =
      drawingGraphics.canvas ||
      drawingGraphics._renderer?.canvas ||
      drawingGraphics.elt;

    if (sourceCanvas) {
      ctx.drawImage(
        sourceCanvas,
        0,
        0,
        MODEL_SIZE,
        MODEL_SIZE,
        0,
        0,
        MODEL_SIZE,
        MODEL_SIZE
      );
    } else {
      console.error('Could not access drawing canvas');
      return;
    }

    // Generate horizon using the input
    const resultCanvas = await generator.generate(modelInputCanvas);

    // Store the generated canvas for saving
    lastGeneratedCanvas = resultCanvas;

    // Create a p5 image from the result canvas
    const img = createImage(MODEL_SIZE, MODEL_SIZE);
    img.drawingContext.drawImage(resultCanvas, 0, 0);
    img.loadPixels();
    img.updatePixels();

    // Check if this is the first generation (both buffers empty)
    const isFirstGeneration =
      horizonOpacityA === 0 &&
      horizonOpacityB === 0 &&
      targetOpacityA === 0 &&
      targetOpacityB === 0;

    // Determine which buffer to use for the new image
    let targetBuffer, currentBuffer;
    if (activeHorizonBuffer === 'A' && !isFirstGeneration) {
      // Currently showing A, so put new image in B
      targetBuffer = horizonGraphicsB;
      currentBuffer = 'B';

      // Clear and draw to buffer B
      targetBuffer.clear();
      targetBuffer.push();
      targetBuffer.imageMode(CORNER);
      targetBuffer.image(img, 0, 0, MODEL_SIZE, MODEL_SIZE);
      targetBuffer.pop();

      // Crossfade: fade out A, fade in B
      targetOpacityA = 0;
      targetOpacityB = 200;
    } else {
      // Currently showing B (or first generation), so put new image in A
      targetBuffer = horizonGraphicsA;
      currentBuffer = 'A';

      // Clear and draw to buffer A
      targetBuffer.clear();
      targetBuffer.push();
      targetBuffer.imageMode(CORNER);
      targetBuffer.image(img, 0, 0, MODEL_SIZE, MODEL_SIZE);
      targetBuffer.pop();

      // For first generation or when B is active
      if (isFirstGeneration) {
        // First generation: just fade in A
        targetOpacityA = 200;
        targetOpacityB = 0;
      } else {
        // Crossfade: fade out B, fade in A
        targetOpacityB = 0;
        targetOpacityA = 200;
      }
    }

    // Switch active buffer
    activeHorizonBuffer = currentBuffer;

    isGenerating = false;
  } catch (error) {
    console.error('❌ Generation error:', error);
    isGenerating = false;
  }
}

function drawRandomEdges() {
  drawingGraphics.background(255);
  drawingGraphics.stroke(0);
  drawingGraphics.strokeWeight(2);
  drawingGraphics.noFill();

  // Draw horizon line
  drawingGraphics.line(0, MODEL_SIZE * 0.5, MODEL_SIZE, MODEL_SIZE * 0.5);

  // Draw short, dense lines below 0.5 (below horizon) - mostly horizontal
  drawingGraphics.strokeWeight(1.5);
  for (let i = 0; i < 400; i++) {
    let x1 = random(MODEL_SIZE);
    let y1 = random(
      MODEL_SIZE * 0.5, // From horizon line
      MODEL_SIZE // To bottom
    );
    // Mostly horizontal angle with small vertical variation
    let angle = random(-PI / 8, PI / 8); // -22.5 to 22.5 degrees for mostly horizontal
    let length = random(5, 10); // Short lines
    let x2 = x1 + cos(angle) * length;
    let y2 = y1 + sin(angle) * length;
    drawingGraphics.line(x1, y1, x2, y2);
  }

  // Draw tiny elliptical spirals with jitter above 0.7 (well above horizon)
  drawingGraphics.strokeWeight(1);
  for (let i = 0; i < 8; i++) {
    let centerX = random(MODEL_SIZE);
    let centerY = random(
      0, // From top
      MODEL_SIZE * 0.3 // To 0.3 (well above horizon at 0.5)
    );

    // Draw a tiny elliptical spiral with jitter
    drawingGraphics.push();
    drawingGraphics.translate(centerX, centerY);
    drawingGraphics.beginShape();
    drawingGraphics.noFill();

    let radius = 2;
    let angleStep = 0.3;
    let ellipseRatioX = random(0.8, 1.5); // Make it elliptical horizontally
    let ellipseRatioY = random(0.3, 0.6); // Make it elliptical vertically
    let initialAngle = random(0, TWO_PI);
    let revolutions = random(1, 5);
    let radiusStep = random(0.1, 0.2);

    for (
      let angle = initialAngle;
      angle < TWO_PI * revolutions + initialAngle;
      angle += angleStep
    ) {
      // Add jitter to the position
      let jitterX = random(-0.5, 0.5);
      let jitterY = random(-0.5, 0.5);

      let x = cos(angle) * radius * ellipseRatioX + jitterX;
      let y = sin(angle) * radius * ellipseRatioY + jitterY;
      drawingGraphics.vertex(x, y);
      radius += radiusStep; // Gradually increase radius for spiral effect
    }
    drawingGraphics.endShape();
    drawingGraphics.pop();
  }
}

// Touch support for mobile devices
function touchStarted() {
  if (touches.length > 0) {
    let touch = touches[0];
    if (touch.x >= 0 && touch.x <= width && touch.y >= 0 && touch.y <= height) {
      isDrawing = true;
      lastDrawTime = millis(); // Update last draw time
      if (generateTimeout) {
        clearTimeout(generateTimeout);
      }
      return false; // Prevent default
    }
  }
}

function touchMoved() {
  if (isDrawing && touches.length > 0) {
    drawingGraphics.stroke(0);
    drawingGraphics.strokeWeight(brushSize);
    // Scale down touch coordinates to model size
    const prevX = ptouches[0].x / SCALE_FACTOR;
    const prevY = ptouches[0].y / SCALE_FACTOR;
    const currX = touches[0].x / SCALE_FACTOR;
    const currY = touches[0].y / SCALE_FACTOR;
    drawingGraphics.line(prevX, prevY, currX, currY);
    lastDrawTime = millis(); // Update last draw time
    return false; // Prevent default
  }
}

function touchEnded() {
  if (isDrawing) {
    isDrawing = false;
    if (isModelLoaded && !isGenerating) {
      if (generateTimeout) {
        clearTimeout(generateTimeout);
      }
      generateTimeout = setTimeout(() => {
        generateHorizon();
      }, 700);
    }
  }
}
