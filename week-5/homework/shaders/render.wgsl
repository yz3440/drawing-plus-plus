struct Boid {
  pos: vec2f,
  vel: vec2f,
}

struct VertexOutput {
  @builtin(position) position: vec4f,
  @location(0) color: vec4f,
}

@vertex
fn vertexMain(
  @location(0) boidPos: vec2f,
  @location(1) boidVel: vec2f,
  @builtin(vertex_index) vertexIndex: u32
) -> VertexOutput {
  var output: VertexOutput;
  
  // Check if this is the mouse boid (zero velocity)
  let speed = length(boidVel);
  let isMouse = speed < 0.001;
  
  // Create triangle pointing in direction of velocity
  // For mouse boid, point upward
  var angle = atan2(boidVel.y, boidVel.x);
  if (isMouse) {
    angle = 1.5708; // 90 degrees (pointing up)
  }
  
  // Make mouse boid 3x bigger
  var size = 0.01;
  if (isMouse) {
    size = 0.03;
  }
  
  var vertices = array<vec2f, 3>(
    vec2f(size * 2.0, 0.0),
    vec2f(-size, size),
    vec2f(-size, -size)
  );
  
  let vertex = vertices[vertexIndex];
  let cosA = cos(angle);
  let sinA = sin(angle);
  
  let rotated = vec2f(
    vertex.x * cosA - vertex.y * sinA,
    vertex.x * sinA + vertex.y * cosA
  );
  
  output.position = vec4f(boidPos + rotated, 0.0, 1.0);
  
  // Color based on velocity - mouse boid gets a distinct color
  if (isMouse) {
    output.color = vec4f(1.0, 0.3, 0.3, 1.0); // Red for mouse
  } else {
    output.color = vec4f(0.3 + speed * 2.0, 0.5, 1.0 - speed, 1.0);
  }
  
  return output;
}

@fragment
fn fragmentMain(input: VertexOutput) -> @location(0) vec4f {
  return input.color;
}

