const WIDTH = 800;
const HEIGHT = 600;
let cam;
let font;
let drawables = [];

// Orbit control variables
let orbitX = 0;
let orbitY = 0;
let orbitRadius = 100;
let isMousePressed = false;
let lastMouseX = 0;
let lastMouseY = 0;

class Drawable {
  constructor(x, y, z, eyeX, eyeY, eyeZ, frame) {
    this.x = x;
    this.y = y;
    this.z = z;
    this.eyeX = eyeX;
    this.eyeY = eyeY;
    this.eyeZ = eyeZ;
    this.frame = frame;
    this.angle = 0;

    // Store the eye direction as rotation axis
    let axisLen = sqrt(eyeX * eyeX + eyeY * eyeY + eyeZ * eyeZ);
    this.axisX = eyeX / axisLen;
    this.axisY = eyeY / axisLen;
    this.axisZ = eyeZ / axisLen;
  }

  // Rotate point around an arbitrary axis using Rodrigues' rotation formula
  rotateAround(angle, axisX, axisY, axisZ) {
    // Create rotation matrix for rotation around arbitrary axis
    let c = cos(angle);
    let s = sin(angle);
    let t = 1 - c;

    // Rodrigues' rotation matrix
    let m = [
      t * axisX * axisX + c,
      t * axisX * axisY - s * axisZ,
      t * axisX * axisZ + s * axisY,
      0,

      t * axisX * axisY + s * axisZ,
      t * axisY * axisY + c,
      t * axisY * axisZ - s * axisX,
      0,

      t * axisX * axisZ - s * axisY,
      t * axisY * axisZ + s * axisX,
      t * axisZ * axisZ + c,
      0,

      0,
      0,
      0,
      1,
    ];

    applyMatrix(...m);
  }

  draw(currentFrameCount) {
    push();
    let rotation = (currentFrameCount - this.frame) * 0.01;

    // Rotate the object around the eye line (axis from origin to eye position)
    // First translate to origin (rotation center)
    translate(0, 0, 0);

    // Apply rotation around the stored axis
    this.rotateAround(rotation, this.axisX, this.axisY, this.axisZ);

    // Translate to object position
    translate(this.x, this.y, this.z);

    // Draw the circle (always faces camera)
    fill(100, 200, 255);
    circle(0, 0, 10);
    pop();
  }
}

// P5.js sketch
function setup() {
  let canvas = createCanvas(WIDTH, HEIGHT, WEBGL);
  canvas.parent('canvas-container');

  //font = loadFont('./Staatliches-Regular.ttf');

  background(0);
  cam = createCamera();
  cam.setPosition(0, 0, 100);
  cam.lookAt(0, 0, 0);
}

function draw() {
  background(0, 50);

  // Update camera position based on orbit angles
  const eyePosition = {
    x: orbitRadius * cos(orbitY) * sin(orbitX),
    y: orbitRadius * sin(orbitY),
    z: orbitRadius * cos(orbitY) * cos(orbitX),
  };

  cam.setPosition(eyePosition.x, eyePosition.y, eyePosition.z);
  cam.lookAt(0, 0, 0);

  // Draw all drawable objects
  for (let drawable of drawables) {
    drawable.draw(frameCount);
  }

  // Draw center circle
  push();
  fill(255, 100, 100);
  circle(0, 0, 10);
  pop();
}

function mousePressed() {
  // Left click to create object
  if (mouseButton === LEFT) {
    createDrawableAtMouse();
  }

  // Right click for orbit control
  if (mouseButton === RIGHT) {
    isMousePressed = true;
    lastMouseX = mouseX;
    lastMouseY = mouseY;
    return false; // Prevent default right-click context menu
  }
}

function createDrawableAtMouse() {
  // Get current eye position
  const eyePosition = {
    x: orbitRadius * cos(orbitY) * sin(orbitX),
    y: orbitRadius * sin(orbitY),
    z: orbitRadius * cos(orbitY) * cos(orbitX),
  };

  // Normalize eye direction
  let eyeLen = sqrt(
    eyePosition.x * eyePosition.x +
      eyePosition.y * eyePosition.y +
      eyePosition.z * eyePosition.z
  );
  let eyeDir = {
    x: eyePosition.x / eyeLen,
    y: eyePosition.y / eyeLen,
    z: eyePosition.z / eyeLen,
  };

  // Define the plane at half orbit radius from origin
  let planeDistance = orbitRadius / 2;
  let planeCenter = {
    x: eyeDir.x * planeDistance,
    y: eyeDir.y * planeDistance,
    z: eyeDir.z * planeDistance,
  };

  // Use the abstracted raycast function
  let intersection = raycastToPlane(
    mouseX,
    mouseY,
    width,
    height,
    cam,
    eyePosition,
    eyeDir,
    planeCenter
  );

  if (!intersection) {
    return; // No intersection found
  }

  // Create new drawable at intersection point
  drawables.push(
    new Drawable(
      intersection.x,
      intersection.y,
      intersection.z,
      eyePosition.x,
      eyePosition.y,
      eyePosition.z,
      frameCount
    )
  );
}

function mouseReleased() {
  // Only stop orbiting if right mouse button was released
  if (mouseButton === RIGHT) {
    isMousePressed = false;
    return false; // Prevent default right-click context menu
  }
}

function mouseDragged() {
  if (isMousePressed) {
    let deltaX = mouseX - lastMouseX;
    let deltaY = mouseY - lastMouseY;

    // Update orbit angles based on mouse movement (flipped to match expected behavior)
    orbitX -= deltaX * 0.01;
    orbitY -= deltaY * 0.01;

    // Constrain orbitY to prevent camera flipping
    orbitY = constrain(orbitY, -PI / 2 + 0.1, PI / 2 - 0.1);

    lastMouseX = mouseX;
    lastMouseY = mouseY;
  }
}

// Mouse wheel for zooming
function mouseWheel(event) {
  orbitRadius += event.delta * 0.5;
  orbitRadius = constrain(orbitRadius, 50, 300);
  return false; // Prevent default scrolling
}
