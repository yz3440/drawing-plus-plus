const WIDTH = 400;
const HEIGHT = 300;
let drawables = [];
let graphics3D; // 3D graphics buffer

// Orbit control variables
let orbitX = 0;
let orbitY = 0;
let orbitRadius = 200;

let video;
const VIDEO_WIDTH = 640;
const VIDEO_HEIGHT = 480;
let handPose;
let leftHand = null;
let rightHand = null;
const HAND_SIZE_THRESHOLD = 30; // WRIST TO MIDDLE FINGER MCP DISTANCE
const PINCH_THRESHOLD = 40; // Distance threshold for pinch detection
const HAND_CONFIDENCE_THRESHOLD = 0.5;

let isRightPinching = false;
let isLeftPinching = false;
let leftPinchStartX = 0;
let leftPinchStartY = 0;
let leftPinchStartOrbitX = 0;
let leftPinchStartOrbitY = 0;

let isBothFisting = false;
let bothFistStartDistance = 0;
let bothFistStartOrbitRadius = 0;

const FOV = 120;
const aspectRatio = WIDTH / HEIGHT;
const nearPlane = 0.05;
const farPlane = 1000;

const MAX_LIFE = 1000;
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
  leftHand = null;
  rightHand = null;

  for (let result of results) {
    const handSize = getHandSize(result);
    if (
      result.handedness === 'Left' && // selfie camera is flipped, so we need to check for left hand
      result.confidence > HAND_CONFIDENCE_THRESHOLD &&
      result.keypoints.length > 0 &&
      result.thumb_tip &&
      result.index_finger_tip &&
      result.middle_finger_mcp &&
      handSize > HAND_SIZE_THRESHOLD
    ) {
      result.isSpread = isHandSpreadUp(result);
      result.isFist = isHandFist(result);
      result.boundingBox = getHandBoundingBox(result);
      result.handSize = handSize;
      if (!rightHand) {
        rightHand = result;
      } else {
        if (handSize > getHandSize(rightHand)) {
          rightHand = result;
        }
      }
    }
    if (
      result.handedness === 'Right' && // selfie camera is flipped, so we need to check for right hand
      result.confidence > HAND_CONFIDENCE_THRESHOLD &&
      result.keypoints.length > 0 &&
      result.thumb_tip &&
      result.index_finger_tip &&
      result.middle_finger_mcp &&
      handSize > HAND_SIZE_THRESHOLD
    ) {
      result.isSpread = isHandSpreadUp(result);
      result.isFist = isHandFist(result);
      result.boundingBox = getHandBoundingBox(result);
      result.handSize = handSize;
      if (!leftHand) {
        leftHand = result;
      } else {
        if (handSize > getHandSize(leftHand)) {
          leftHand = result;
        }
      }
    }
  }
}

function setup() {
  // Create main 2D canvas
  let canvas = createCanvas(WIDTH * 2, HEIGHT * 2);
  canvas.parent('canvas-container');
  canvas.style('cursor', 'crosshair');

  // Create 3D graphics buffer
  graphics3D = createGraphics(WIDTH, HEIGHT, WEBGL);

  // Setup video capture for hand tracking
  video = createCapture(VIDEO);
  video.size(VIDEO_WIDTH, VIDEO_HEIGHT);
  video.hide();
  handPose.detectStart(video, gotHands);
}

function draw() {
  scale(2);

  // Check for pinch gestures - right hand for orbit, left hand for drawing
  checkOrbitRadius();
  checkLeftHandOrbit();
  checkRightHandDraw();

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

  graphics3D.perspective(FOV, aspectRatio, nearPlane, farPlane);

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
  if (leftHand && !leftHand.isFist) {
    push();
    let thumbX = map(leftHand.thumb_tip.x, 0, video.width, WIDTH, 0);
    let thumbY = map(leftHand.thumb_tip.y, 0, video.height, 0, HEIGHT);
    let indexX = map(leftHand.index_finger_tip.x, 0, video.width, WIDTH, 0);
    let indexY = map(leftHand.index_finger_tip.y, 0, video.height, 0, HEIGHT);

    let distance = dist(thumbX, thumbY, indexX, indexY);
    let alpha = map(distance, PINCH_THRESHOLD, 200, 255, 0);

    fill(255, 255, 255, alpha);
    ellipse(thumbX, thumbY, 5, 5);
    ellipse(indexX, indexY, 5, 5);
    stroke(255, 255, 255, alpha);
    strokeWeight(2);
    line(thumbX, thumbY, indexX, indexY);

    if (isLeftPinching) {
      let midX = (thumbX + indexX) / 2;
      let midY = (thumbY + indexY) / 2;
      let dirX = indexX - thumbX;
      let dirY = indexY - thumbY;
      // Normalize direction vector
      let len = sqrt(dirX * dirX + dirY * dirY);
      if (len > 0.01) {
        let perpX = -dirY / len;
        let perpY = dirX / len;
        let crosshairLength = 20; // pixels
        let crossX1 = midX + (perpX * crosshairLength) / 2;
        let crossY1 = midY + (perpY * crosshairLength) / 2;
        let crossX2 = midX - (perpX * crosshairLength) / 2;
        let crossY2 = midY - (perpY * crosshairLength) / 2;
        stroke(255, 255, 255, alpha);
        strokeWeight(2);
        line(crossX1, crossY1, crossX2, crossY2);
      }
    }
    pop();
  }
  if (rightHand && !rightHand.isFist) {
    let thumbX = map(rightHand.thumb_tip.x, 0, video.width, WIDTH, 0);
    let thumbY = map(rightHand.thumb_tip.y, 0, video.height, 0, HEIGHT);
    let indexX = map(rightHand.index_finger_tip.x, 0, video.width, WIDTH, 0);
    let indexY = map(rightHand.index_finger_tip.y, 0, video.height, 0, HEIGHT);

    push();
    let distance = dist(thumbX, thumbY, indexX, indexY);
    let alpha = map(distance, PINCH_THRESHOLD, 200, 255, 0);
    fill(255, 255, 255, alpha);
    ellipse(thumbX, thumbY, 5, 5);
    ellipse(indexX, indexY, 5, 5);
    stroke(255, 255, 255, alpha);
    strokeWeight(2);
    line(thumbX, thumbY, indexX, indexY);

    if (isRightPinching) {
      let midX = (thumbX + indexX) / 2;
      let midY = (thumbY + indexY) / 2;
      let dirX = indexX - thumbX;
      let dirY = indexY - thumbY;
      let len = sqrt(dirX * dirX + dirY * dirY);
      if (len > 0.01) {
        let perpX = -dirY / len;
        let perpY = dirX / len;
        let crosshairLength = 20; // pixels
        let crossX1 = midX + (perpX * crosshairLength) / 2;
        let crossY1 = midY + (perpY * crosshairLength) / 2;
        let crossX2 = midX - (perpX * crosshairLength) / 2;
        let crossY2 = midY - (perpY * crosshairLength) / 2;
        stroke(255, 255, 255, alpha);
        strokeWeight(2);
        line(crossX1, crossY1, crossX2, crossY2);
      }
    }
    pop();
  }

  if (leftHand && rightHand && leftHand.isFist && rightHand.isFist) {
    // Draw left hand fist circle
    let leftHandFistCircleX = map(
      leftHand.boundingBox.centerX,
      0,
      video.width,
      WIDTH,
      0
    );
    let leftHandFistCircleY = map(
      leftHand.boundingBox.centerY,
      0,
      video.height,
      0,
      HEIGHT
    );
    let leftHandFistCircleRadius = map(
      leftHand.boundingBox.radius,
      0,
      video.width,
      0,
      WIDTH
    );
    noFill();
    stroke(255, 255, 255, 100);
    strokeWeight(3);
    ellipse(
      leftHandFistCircleX,
      leftHandFistCircleY,
      leftHandFistCircleRadius * 2,
      leftHandFistCircleRadius * 2
    );
    // Draw right hand fist circle
    let rightHandFistCircleX = map(
      rightHand.boundingBox.centerX,
      0,
      video.width,
      WIDTH,
      0
    );
    let rightHandFistCircleY = map(
      rightHand.boundingBox.centerY,
      0,
      video.height,
      0,
      HEIGHT
    );
    let rightHandFistCircleRadius = map(
      rightHand.boundingBox.radius,
      0,
      video.width,
      0,
      WIDTH
    );
    noFill();
    stroke(255, 255, 255, 100);
    strokeWeight(3);
    ellipse(
      rightHandFistCircleX,
      rightHandFistCircleY,
      rightHandFistCircleRadius * 2,
      rightHandFistCircleRadius * 2
    );

    // Draw line between left and right hand fist circles
    stroke(255, 255, 255, 100);
    strokeWeight(3);
    line(
      leftHandFistCircleX,
      leftHandFistCircleY,
      rightHandFistCircleX,
      rightHandFistCircleY
    );
  }

  push();
  tint(255, 40);
  translate(WIDTH, 0);
  scale(-1, 1);
  image(video, 0, 0, WIDTH, HEIGHT);
  pop();
}

function createDrawableAtPosition(screenX, screenY) {
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
    screenX,
    screenY,
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

function checkLeftHandOrbit() {
  // Look for right hand for orbit control
  if (leftHand) {
    // Calculate distance between thumb tip and index finger tip
    let thumbX = map(leftHand.thumb_tip.x, 0, video.width, WIDTH, 0); // FLIPPED
    let thumbY = map(leftHand.thumb_tip.y, 0, video.height, 0, HEIGHT);
    let thumbZ = leftHand.thumb_tip.z3D;
    let indexX = map(leftHand.index_finger_tip.x, 0, video.width, WIDTH, 0); // FLIPPED
    let indexY = map(leftHand.index_finger_tip.y, 0, video.height, 0, HEIGHT);
    let indexZ = leftHand.index_finger_tip.z3D;

    let distance = dist(thumbX, thumbY, indexX, indexY);
    let centerX = (indexX + thumbX) / 2;
    let centerY = (indexY + thumbY) / 2;
    let centerZ = (indexZ + thumbZ) / 2;

    if (distance < PINCH_THRESHOLD && !leftHand.isFist) {
      if (!isLeftPinching) {
        isLeftPinching = true;
        leftPinchStartX = centerX;
        leftPinchStartY = centerY;
        leftPinchStartZ = centerZ;
        leftPinchStartOrbitX = orbitX;
        leftPinchStartOrbitY = orbitY;
        leftPinchStartOrbitRadius = orbitRadius;
      } else {
        let deltaX = centerX - leftPinchStartX;
        let deltaY = centerY - leftPinchStartY;

        orbitX = lerp(orbitX, leftPinchStartOrbitX - deltaX * 0.01, 0.1);
        orbitY = lerp(orbitY, leftPinchStartOrbitY - deltaY * 0.01, 0.1);

        // Constrain orbitY to prevent camera flipping
        orbitY = constrain(orbitY, -PI / 2 + 0.1, PI / 2 - 0.1);
      }
      return; // Found a pinching left hand
    }
  }

  // No pinching detected - reset state
  isLeftPinching = false;
}

function checkRightHandDraw() {
  if (rightHand) {
    let thumbX = map(rightHand.thumb_tip.x, 0, video.width, WIDTH, 0); // FLIPPED
    let thumbY = map(rightHand.thumb_tip.y, 0, video.height, 0, HEIGHT);
    let indexX = map(rightHand.index_finger_tip.x, 0, video.width, WIDTH, 0); // FLIPPED
    let indexY = map(rightHand.index_finger_tip.y, 0, video.height, 0, HEIGHT);

    let distance = dist(thumbX, thumbY, indexX, indexY);
    let centerX = (indexX + thumbX) / 2;
    let centerY = (indexY + thumbY) / 2;

    if (distance < PINCH_THRESHOLD && !rightHand.isFist) {
      isRightPinching = true;
      createDrawableAtPosition(centerX, centerY);
      return;
    }
  }
  isRightPinching = false;
}

function checkOrbitRadius() {
  if (leftHand && rightHand && leftHand.isFist && rightHand.isFist) {
    let bothFistDistance = dist(
      leftHand.boundingBox.centerX,
      leftHand.boundingBox.centerY,
      rightHand.boundingBox.centerX,
      rightHand.boundingBox.centerY
    );
    if (!isBothFisting) {
      isBothFisting = true;
      bothFistStartDistance = bothFistDistance;
      bothFistStartOrbitRadius = orbitRadius;
    } else {
      let deltaDistance = bothFistDistance - bothFistStartDistance;
      let deltaRadiusSpeed = deltaDistance * 1;
      orbitRadius = lerp(orbitRadius, orbitRadius - deltaRadiusSpeed, 0.01);
      orbitRadius = constrain(orbitRadius, 50, 500);
    }
  }
}
