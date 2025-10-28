function rotateAround(mat, angle, axisX, axisY, axisZ) {
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

/*
 * Helper function to multiply 4x4 matrix with vector
 */
function multiplyMatrixVector(mat, x, y, z, w) {
  return {
    x: mat[0] * x + mat[4] * y + mat[8] * z + mat[12] * w,
    y: mat[1] * x + mat[5] * y + mat[9] * z + mat[13] * w,
    z: mat[2] * x + mat[6] * y + mat[10] * z + mat[14] * w,
    w: mat[3] * x + mat[7] * y + mat[11] * z + mat[15] * w,
  };
}

/*
 * Helper function to invert a 4x4 matrix
 */
function invertMatrix(m) {
  let inv = new Array(16);

  inv[0] =
    m[5] * m[10] * m[15] -
    m[5] * m[11] * m[14] -
    m[9] * m[6] * m[15] +
    m[9] * m[7] * m[14] +
    m[13] * m[6] * m[11] -
    m[13] * m[7] * m[10];
  inv[4] =
    -m[4] * m[10] * m[15] +
    m[4] * m[11] * m[14] +
    m[8] * m[6] * m[15] -
    m[8] * m[7] * m[14] -
    m[12] * m[6] * m[11] +
    m[12] * m[7] * m[10];
  inv[8] =
    m[4] * m[9] * m[15] -
    m[4] * m[11] * m[13] -
    m[8] * m[5] * m[15] +
    m[8] * m[7] * m[13] +
    m[12] * m[5] * m[11] -
    m[12] * m[7] * m[9];
  inv[12] =
    -m[4] * m[9] * m[14] +
    m[4] * m[10] * m[13] +
    m[8] * m[5] * m[14] -
    m[8] * m[6] * m[13] -
    m[12] * m[5] * m[10] +
    m[12] * m[6] * m[9];
  inv[1] =
    -m[1] * m[10] * m[15] +
    m[1] * m[11] * m[14] +
    m[9] * m[2] * m[15] -
    m[9] * m[3] * m[14] -
    m[13] * m[2] * m[11] +
    m[13] * m[3] * m[10];
  inv[5] =
    m[0] * m[10] * m[15] -
    m[0] * m[11] * m[14] -
    m[8] * m[2] * m[15] +
    m[8] * m[3] * m[14] +
    m[12] * m[2] * m[11] -
    m[12] * m[3] * m[10];
  inv[9] =
    -m[0] * m[9] * m[15] +
    m[0] * m[11] * m[13] +
    m[8] * m[1] * m[15] -
    m[8] * m[3] * m[13] -
    m[12] * m[1] * m[11] +
    m[12] * m[3] * m[9];
  inv[13] =
    m[0] * m[9] * m[14] -
    m[0] * m[10] * m[13] -
    m[8] * m[1] * m[14] +
    m[8] * m[2] * m[13] +
    m[12] * m[1] * m[10] -
    m[12] * m[2] * m[9];
  inv[2] =
    m[1] * m[6] * m[15] -
    m[1] * m[7] * m[14] -
    m[5] * m[2] * m[15] +
    m[5] * m[3] * m[14] +
    m[13] * m[2] * m[7] -
    m[13] * m[3] * m[6];
  inv[6] =
    -m[0] * m[6] * m[15] +
    m[0] * m[7] * m[14] +
    m[4] * m[2] * m[15] -
    m[4] * m[3] * m[14] -
    m[12] * m[2] * m[7] +
    m[12] * m[3] * m[6];
  inv[10] =
    m[0] * m[5] * m[15] -
    m[0] * m[7] * m[13] -
    m[4] * m[1] * m[15] +
    m[4] * m[3] * m[13] +
    m[12] * m[1] * m[7] -
    m[12] * m[3] * m[5];
  inv[14] =
    -m[0] * m[5] * m[14] +
    m[0] * m[6] * m[13] +
    m[4] * m[1] * m[14] -
    m[4] * m[2] * m[13] -
    m[12] * m[1] * m[6] +
    m[12] * m[2] * m[5];
  inv[3] =
    -m[1] * m[6] * m[11] +
    m[1] * m[7] * m[10] +
    m[5] * m[2] * m[11] -
    m[5] * m[3] * m[10] -
    m[9] * m[2] * m[7] +
    m[9] * m[3] * m[6];
  inv[7] =
    m[0] * m[6] * m[11] -
    m[0] * m[7] * m[10] -
    m[4] * m[2] * m[11] +
    m[4] * m[3] * m[10] +
    m[8] * m[2] * m[7] -
    m[8] * m[3] * m[6];
  inv[11] =
    -m[0] * m[5] * m[11] +
    m[0] * m[7] * m[9] +
    m[4] * m[1] * m[11] -
    m[4] * m[3] * m[9] -
    m[8] * m[1] * m[7] +
    m[8] * m[3] * m[5];
  inv[15] =
    m[0] * m[5] * m[10] -
    m[0] * m[6] * m[9] -
    m[4] * m[1] * m[10] +
    m[4] * m[2] * m[9] +
    m[8] * m[1] * m[6] -
    m[8] * m[2] * m[5];

  let det = m[0] * inv[0] + m[1] * inv[4] + m[2] * inv[8] + m[3] * inv[12];

  if (det === 0) return null;

  det = 1.0 / det;
  for (let i = 0; i < 16; i++) {
    inv[i] = inv[i] * det;
  }

  return inv;
}

/*
 * Raycast from camera through mouse position to a plane
 * Returns the intersection point or null if no intersection
 */
function raycastToPlane(
  mouseX,
  mouseY,
  width,
  height,
  camera,
  eyePosition,
  eyeDir,
  planeCenter
) {
  // Convert mouse position to normalized device coordinates (NDC)
  let ndcX = (mouseX / width) * 2 - 1;
  let ndcY = -((mouseY / height) * 2 - 1); // Flip Y axis

  // Get the projection and view matrices
  let projMatrix = camera.projMatrix.mat4;
  let viewMatrix = camera.cameraMatrix.mat4;

  // Invert the matrices to unproject
  let invProj = invertMatrix(projMatrix);
  let invView = invertMatrix(viewMatrix);

  if (!invProj || !invView) {
    console.error('Could not invert matrices');
    return null;
  }

  // Unproject the near and far points
  // Near point (z = -1 in NDC)
  let nearNDC = multiplyMatrixVector(invProj, ndcX, ndcY, -1, 1);
  nearNDC.x /= nearNDC.w;
  nearNDC.y /= nearNDC.w;
  nearNDC.z /= nearNDC.w;

  let nearWorld = multiplyMatrixVector(
    invView,
    nearNDC.x,
    nearNDC.y,
    nearNDC.z,
    1
  );

  // Far point (z = 1 in NDC)
  let farNDC = multiplyMatrixVector(invProj, ndcX, ndcY, 1, 1);
  farNDC.x /= farNDC.w;
  farNDC.y /= farNDC.w;
  farNDC.z /= farNDC.w;

  let farWorld = multiplyMatrixVector(invView, farNDC.x, farNDC.y, farNDC.z, 1);

  // Create ray from camera through mouse position
  let rayOrigin = eyePosition;
  let rayDir = {
    x: farWorld.x - nearWorld.x,
    y: farWorld.y - nearWorld.y,
    z: farWorld.z - nearWorld.z,
  };

  // Normalize ray direction
  let rayLen = sqrt(
    rayDir.x * rayDir.x + rayDir.y * rayDir.y + rayDir.z * rayDir.z
  );
  rayDir.x /= rayLen;
  rayDir.y /= rayLen;
  rayDir.z /= rayLen;

  // Intersect ray with plane
  // Plane equation: dot(point - planeCenter, eyeDir) = 0
  // Ray equation: point = rayOrigin + t * rayDir
  // Solve for t: dot(rayOrigin + t * rayDir - planeCenter, eyeDir) = 0

  let denom = rayDir.x * eyeDir.x + rayDir.y * eyeDir.y + rayDir.z * eyeDir.z;

  if (abs(denom) < 0.0001) {
    console.log('Ray is parallel to plane');
    return null;
  }

  let diff = {
    x: planeCenter.x - rayOrigin.x,
    y: planeCenter.y - rayOrigin.y,
    z: planeCenter.z - rayOrigin.z,
  };

  let t = (diff.x * eyeDir.x + diff.y * eyeDir.y + diff.z * eyeDir.z) / denom;

  if (t < 0) {
    console.log('Plane is behind camera');
    return null;
  }

  // Calculate intersection point
  return {
    x: rayOrigin.x + t * rayDir.x,
    y: rayOrigin.y + t * rayDir.y,
    z: rayOrigin.z + t * rayDir.z,
  };
}
