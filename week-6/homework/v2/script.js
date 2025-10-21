const WIDTH = 800;
const HEIGHT = 600;
let cam;
let font;
let drawables = [];

// Orbit control variables
let orbitX = 0;
let orbitY = 0;
let orbitRadius = 200;
let isMousePressed = false;
let lastMouseX = 0;
let lastMouseY = 0;

const MAX_LIFE = 3000;
const LIFE_TO_ALPHA = 255 / MAX_LIFE;

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
    this.life = MAX_LIFE;

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
  // Rotate to align circle normal with eye line axis
  alignWithAxis() {
    // Default circle normal is (0, 0, 1)
    // We want to rotate it to align with (axisX, axisY, axisZ)

    let defaultNormal = { x: 0, y: 0, z: 1 };
    let targetNormal = { x: this.axisX, y: this.axisY, z: this.axisZ };

    // Calculate rotation axis (cross product)
    let rotAxis = {
      x: defaultNormal.y * targetNormal.z - defaultNormal.z * targetNormal.y,
      y: defaultNormal.z * targetNormal.x - defaultNormal.x * targetNormal.z,
      z: defaultNormal.x * targetNormal.y - defaultNormal.y * targetNormal.x,
    };

    let rotAxisLen = sqrt(
      rotAxis.x * rotAxis.x + rotAxis.y * rotAxis.y + rotAxis.z * rotAxis.z
    );

    // If rotation axis is zero, vectors are parallel or anti-parallel
    if (rotAxisLen < 0.0001) {
      // Check if they're pointing in opposite directions
      let dot = defaultNormal.z * targetNormal.z;
      if (dot < 0) {
        // Rotate 180 degrees around any perpendicular axis (use X axis)
        this.rotateAround(PI, 1, 0, 0);
      }
      // If dot > 0, they're already aligned, no rotation needed
      return;
    }

    // Normalize rotation axis
    rotAxis.x /= rotAxisLen;
    rotAxis.y /= rotAxisLen;
    rotAxis.z /= rotAxisLen;

    // Calculate rotation angle
    let dot = defaultNormal.z * targetNormal.z; // Only z component is non-zero for default normal
    let angle = acos(constrain(dot, -1, 1));

    // Apply rotation
    this.rotateAround(angle, rotAxis.x, rotAxis.y, rotAxis.z);
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

    fill(255, 255, 255, this.life * LIFE_TO_ALPHA);
    stroke(255, 255, 255, this.life * LIFE_TO_ALPHA);
    // Calculate the normalized eye vector (axis), and scale to abs(this.z)
    let mag = sqrt(
      this.eyeX * this.eyeX + this.eyeY * this.eyeY + this.eyeZ * this.eyeZ
    );
    let scale = -mag * 0.1;
    let centerX = (this.eyeX / mag) * scale;
    let centerY = (this.eyeY / mag) * scale;
    let centerZ = (this.eyeZ / mag) * scale;
    let lineCenter = { x: centerX, y: centerY, z: centerZ };
    line(0, 0, 0, lineCenter.x, lineCenter.y, lineCenter.z);
    this.life -= 1;
    if (this.life < 0) {
      drawables.splice(drawables.indexOf(this), 1);
    }
    pop();
  }
}

function setup() {
  let canvas = createCanvas(WIDTH, HEIGHT, WEBGL);
  canvas.parent('canvas-container');
  canvas.style('cursor', 'crosshair');

  background(0);
  cam = createCamera();
  cam.setPosition(0, 0, 100);
  cam.lookAt(0, 0, 0);
}

function draw() {
  if (mouseIsPressed && mouseButton === LEFT) {
    createDrawableAtMouse();
  }

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

  noFill();
  stroke(255, 255, 255);
  strokeWeight(0.1);
  sphere(10, 24, 4);
  pop();
}

function mousePressed() {
  // Left click to create object

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
  let planeDistance = orbitRadius * 0.1;
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
  orbitRadius = constrain(orbitRadius, 200, 400);
  return false; // Prevent default scrolling
}
