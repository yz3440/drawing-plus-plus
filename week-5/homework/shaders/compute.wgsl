struct Boid {
  pos: vec2f,
  vel: vec2f,
}

struct Params {
  separationDistance: f32,
  alignmentDistance: f32,
  cohesionDistance: f32,
  separationScale: f32,
  alignmentScale: f32,
  cohesionScale: f32,
  maxSpeed: f32,
  deltaTime: f32,
  numBoids: f32,
  visualRange: f32,
  mouseX: f32,
  mouseY: f32
}

@group(0) @binding(0) var<storage, read> boidsIn: array<Boid>;
@group(0) @binding(1) var<storage, read_write> boidsOut: array<Boid>;
@group(0) @binding(2) var<uniform> params: Params;

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) GlobalInvocationID: vec3u) {
  let index = GlobalInvocationID.x;
  let numBoids = u32(params.numBoids);
  
  if (index >= numBoids) {
    return;
  }
  
  var boid = boidsIn[index];
  
  var separation = vec2f(0.0, 0.0);
  var alignment = vec2f(0.0, 0.0);
  var cohesion = vec2f(0.0, 0.0);
  
  var separationCount = 0.0;
  var alignmentCount = 0.0;
  var cohesionCount = 0.0;
  
  // Calculate flocking forces
  for (var i = 0u; i < numBoids; i = i + 1u) {
    var other = boidsIn[i];
    var separationFactor = 1.0;
    if (i == index) {
      continue;
    }

    if(i == numBoids) {
      // it's mouse
      other.pos = vec2f(params.mouseX, params.mouseY);
      other.vel = vec2f(0.0, 0.0);
      separationFactor = 5.0;
    }
    
    let diff = boid.pos - other.pos;
    let dist = length(diff);
    
    // Separation: avoid crowding neighbors
    if (dist < params.separationDistance && dist > 0.0) {
      separation += normalize(diff) / dist * separationFactor;
      separationCount += 1.0;
    }
    
    // Only consider boids within visual range for alignment and cohesion
    if (dist < params.visualRange) {
      // Alignment: steer towards average heading of neighbors
      alignment += other.vel;
      alignmentCount += 1.0;
      
      // Cohesion: steer towards average position of neighbors
      cohesion += other.pos;
      cohesionCount += 1.0;
    }
  }
  
  var acceleration = vec2f(0.0, 0.0);
  
  if (separationCount > 0.0) {
    separation = separation / separationCount;
    acceleration += separation * params.separationScale;
  }
  
  if (alignmentCount > 0.0) {
    alignment = alignment / alignmentCount;
    alignment = normalize(alignment) * params.maxSpeed;
    let steer = alignment - boid.vel;
    acceleration += steer * params.alignmentScale;
  }
  
  if (cohesionCount > 0.0) {
    cohesion = cohesion / cohesionCount;
    let desired = cohesion - boid.pos;
    if (length(desired) > 0.0) {
      let steer = normalize(desired) * params.maxSpeed - boid.vel;
      acceleration += steer * params.cohesionScale;
    }
  }
  
  // Update velocity and position
  boid.vel += acceleration * params.deltaTime;
  
  // Limit speed
  let speed = length(boid.vel);
  if (speed > params.maxSpeed) {
    boid.vel = normalize(boid.vel) * params.maxSpeed;
  }
  
  boid.pos += boid.vel * params.deltaTime;
  
  // Wrap around edges
  if (boid.pos.x < -1.0) { boid.pos.x = 1.0; }
  if (boid.pos.x > 1.0) { boid.pos.x = -1.0; }
  if (boid.pos.y < -1.0) { boid.pos.y = 1.0; }
  if (boid.pos.y > 1.0) { boid.pos.y = -1.0; }
  
  boidsOut[index] = boid;
}

