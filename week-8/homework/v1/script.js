const WIDTH = 800;
const HEIGHT = 600;
let drawables = [];
let graphics3D; // 3D graphics buffer

// Orbit control variables
let orbitX = 0;
let orbitY = 0;
let orbitRadius = 200;
let isMousePressed = false;
let lastMouseX = 0;
let lastMouseY = 0;

let video;
let handPose;
let hands = [];
const PINCH_THRESHOLD = 10;

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
  rotateAround3D(angle, axisX, axisY, axisZ, g3d) {
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

    g3d.applyMatrix(...m);
  }
  // Rotate to align circle normal with eye line axis
  alignWithAxis(g3d) {
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
        this.rotateAround3D(PI, 1, 0, 0, g3d);
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
    this.rotateAround3D(angle, rotAxis.x, rotAxis.y, rotAxis.z, g3d);
  }

  draw(currentFrameCount, g3d) {
    g3d.push();
    let rotation = (currentFrameCount - this.frame) * 0.01;

    // Rotate the object around the eye line (axis from origin to eye position)
    // First translate to origin (rotation center)
    g3d.translate(0, 0, 0);

    // Apply rotation around the stored axis
    this.rotateAround3D(rotation, this.axisX, this.axisY, this.axisZ, g3d);

    // Translate to object position
    g3d.translate(this.x, this.y, this.z);

    g3d.fill(255, 255, 255, this.life * LIFE_TO_ALPHA);
    g3d.stroke(255, 255, 255, this.life * LIFE_TO_ALPHA);
    // Calculate the normalized eye vector (axis), and scale to abs(this.z)
    let mag = sqrt(
      this.eyeX * this.eyeX + this.eyeY * this.eyeY + this.eyeZ * this.eyeZ
    );
    let scale = -mag * 0.1;
    let centerX = (this.eyeX / mag) * scale;
    let centerY = (this.eyeY / mag) * scale;
    let centerZ = (this.eyeZ / mag) * scale;
    let lineCenter = { x: centerX, y: centerY, z: centerZ };
    g3d.line(0, 0, 0, lineCenter.x, lineCenter.y, lineCenter.z);
    this.life -= 1;
    if (this.life < 0) {
      drawables.splice(drawables.indexOf(this), 1);
    }
    g3d.pop();
  }
}

function preload() {
  handPose = ml5.handPose();
}

function gotHands(results) {
  hands = results;
  console.log(hands);
}

function setup() {
  // Create main 2D canvas
  let canvas = createCanvas(WIDTH, HEIGHT);
  canvas.parent('canvas-container');
  canvas.style('cursor', 'crosshair');

  // Create 3D graphics buffer
  graphics3D = createGraphics(WIDTH, HEIGHT, WEBGL);

  // We don't need to create a separate camera - we'll use graphics3D.camera() directly

  // Setup video capture for hand tracking
  video = createCapture(VIDEO);
  video.size(640, 480);
  video.hide();
  handPose.detectStart(video, gotHands);
}

function draw() {
  if (mouseIsPressed && mouseButton === LEFT) {
    createDrawableAtMouse();
  }

  // Clear main canvas
  background(0);

  // Draw 3D content to graphics buffer
  graphics3D.clear();
  graphics3D.background(0);

  // Update camera position based on orbit angles
  const eyePosition = {
    x: orbitRadius * cos(orbitY) * sin(orbitX),
    y: orbitRadius * sin(orbitY),
    z: orbitRadius * cos(orbitY) * cos(orbitX),
  };

  // Set camera for the 3D graphics buffer
  graphics3D.camera(
    eyePosition.x,
    eyePosition.y,
    eyePosition.z, // eye position
    0,
    0,
    0, // center/look at
    0,
    1,
    0 // up vector
  );

  // Draw all drawable objects in 3D graphics
  for (let drawable of drawables) {
    drawable.draw(frameCount, graphics3D);
  }

  // Draw center sphere in 3D graphics
  graphics3D.push();
  graphics3D.noFill();
  graphics3D.stroke(255, 255, 255);
  graphics3D.strokeWeight(0.1);
  graphics3D.sphere(10, 24, 4);
  graphics3D.pop();

  // Draw the 3D graphics to the main 2D canvas
  image(graphics3D, 0, 0);

  // Now draw 2D hand tracking on top
  for (let i = 0; i < hands.length; i++) {
    let hand = hands[i];

    // The hand object has a 'keypoints' array with all 21 landmarks
    if (hand.keypoints) {
      for (let j = 0; j < hand.keypoints.length; j++) {
        let landmark = hand.keypoints[j];
        // Scale the landmark coordinates to match canvas size
        let x = map(landmark.x, 0, video.width, 0, WIDTH);
        let y = map(landmark.y, 0, video.height, 0, HEIGHT);

        push();
        fill(255, 0, 0);
        noStroke();
        ellipse(x, y, 10, 10);
        pop();
      }
    }

    // Optionally, draw connections between keypoints to show the hand skeleton
    // You can also access individual landmarks like hand.wrist, hand.thumb_tip, etc.
  }
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
  // Get the current camera from graphics3D
  let intersection = raycastToPlane(
    mouseX,
    mouseY,
    graphics3D.width,
    graphics3D.height,
    graphics3D._renderer._curCamera,
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
  orbitRadius = constrain(orbitRadius, 50, 500);
  return false; // Prevent default scrolling
}
