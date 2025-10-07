// Volumetric Cloud Rendering Shader
// Uses boid positions to influence the signed distance function

struct Boid {
  pos: vec2f,
  vel: vec2f,
}

struct CloudUniforms {
  time: f32,
  _padding1: f32,
  resolution: vec2f,
  _padding2: vec2f,
}

@group(0) @binding(0) var<storage, read> boids: array<Boid>;
@group(0) @binding(1) var<uniform> cloudParams: CloudUniforms;
@group(0) @binding(2) var<uniform> numBoids: u32;

struct VertexOutput {
  @builtin(position) position: vec4f,
  @location(0) uv: vec2f,
}

// Vertex shader for fullscreen quad
@vertex
fn vertexMain(@builtin(vertex_index) vertexIndex: u32) -> VertexOutput {
  var output: VertexOutput;
  
  // Generate fullscreen quad coordinates
  let x = f32((vertexIndex & 1u) << 1u) - 1.0;
  let y = f32((vertexIndex & 2u)) - 1.0;
  
  output.position = vec4f(x, y, 0.0, 1.0);
  output.uv = vec2f(x * 0.5 + 0.5, y * 0.5 + 0.5);
  
  return output;
}

// Fast hash function using polynomial (much faster than sin)
fn hash(n: f32) -> f32 {
  return fract(n * 0.1031);
}

// Fast hash for vec3 (single operation instead of 8 calls)
fn hash3(p: vec3f) -> f32 {
  let p3 = fract(vec3f(p.x, p.y, p.z) * 0.1031);
  let dot_p3 = dot(p3, vec3f(p3.y + 33.33, p3.z + 33.33, p3.x + 33.33));
  return fract((p3.x + p3.y) * dot_p3);
}

// Optimized 3D noise using hash3
fn noise(x: vec3f) -> f32 {
  let p = floor(x);
  let f = fract(x);
  
  // Smoother interpolation (same cost but cached)
  let u = f * f * (3.0 - 2.0 * f);
  
  // Use hash3 instead of computing hash 8 times
  return mix(
    mix(
      mix(hash3(p + vec3f(0.0, 0.0, 0.0)), hash3(p + vec3f(1.0, 0.0, 0.0)), u.x),
      mix(hash3(p + vec3f(0.0, 1.0, 0.0)), hash3(p + vec3f(1.0, 1.0, 0.0)), u.x),
      u.y
    ),
    mix(
      mix(hash3(p + vec3f(0.0, 0.0, 1.0)), hash3(p + vec3f(1.0, 0.0, 1.0)), u.x),
      mix(hash3(p + vec3f(0.0, 1.0, 1.0)), hash3(p + vec3f(1.0, 1.0, 1.0)), u.x),
      u.y
    ),
    u.z
  );
}

// Optimized Fractal Brownian Motion (simpler rotation, 3 octaves instead of 4)
fn fbm(p_in: vec3f) -> f32 {
  var p = p_in;
  var f = 0.0;
  var amp = 0.5;
  
  // Unrolled loop with simpler domain warping
  f += amp * noise(p);
  p = p * 2.02 + vec3f(p.y, p.z, p.x); // Simple swizzle rotation
  amp *= 0.5;
  
  f += amp * noise(p);
  p = p * 2.03 + vec3f(p.y, p.z, p.x);
  amp *= 0.5;
  
  f += amp * noise(p);
  
  return f;
}

// Signed distance function for sphere
fn sdSphere(p: vec3f, center: vec3f, radius: f32) -> f32 {
  return length(p - center) - radius;
}

// cubic polynomial
fn smin( a: f32, b: f32, k: f32 ) -> f32
{
    let k1 = k * 6.0;
    let h = max( k1 - abs(a - b), 0.0 ) / k1;
    return min(a, b) - h * h * h * k1 * (1.0 / 6.0);
}


// Scene SDF using boid positions
fn scene(p: vec3f, time: f32) -> f32 {
  // Base sphere
  var dist = 10000000.0;
  
  // Add influence from boids
  // Map boid positions from 2D screen space to 3D cloud space
  for (var i = 0u; i < numBoids; i++) {
    let boid = boids[i];
    // Map boid position from [-1, 1] to cloud space
    let boidPos3D = vec3f(boid.pos.x * 4.0, -boid.pos.y * 3.0, 0.0);
    
    // Add small spheres at boid positions
    let boidDist = sdSphere(p, boidPos3D, 0.02);
    dist = smin(dist, boidDist, 0.06);
  }
  
  // Add noise
  let t = time * 0.1;
  let noiseVal = fbm(p * 0.5 + vec3f(4.0 * sin(t), 4.0 * cos(t), 0.0));
  
  return -dist + noiseVal * 1.0;
}

const MARCH_SIZE = 0.1;
const MAX_STEPS = 60;
const SUN_POSITION = vec3f(1.0, 0.0, 5.0);

// Volumetric ray marching
fn raymarch(rayOrigin: vec3f, rayDirection: vec3f, time: f32) -> vec4f {
  var depth = 0.0;
  var p = rayOrigin + depth * rayDirection;
  
  var res = vec4f(0.0);
  let sunDirection = normalize(SUN_POSITION - rayOrigin);
  
  for (var i = 0; i < MAX_STEPS; i++) {
    let density = scene(p, time);
    
    // Only draw density if it's greater than 0
    if (density > 0.0) {
      let diffuse = clamp(
        (scene(p, time) - scene(p + 0.3 * sunDirection, time)) / 0.3,
        0.0,
        1.0
      );
      
      let lin = vec3f(0.60, 0.60, 0.75) * 1.1 + 0.8 * vec3f(1.0, 0.6, 0.3) * diffuse;
      var color = vec4f(mix(vec3f(1.0), vec3f(0.0), density), density);
      color = vec4f(color.rgb * lin, color.a);
      color = vec4f(color.rgb * color.a, color.a);
      res += color * (1.0 - res.a);
    }
    
    if (density >= 0.0) {
      depth += MARCH_SIZE;
    } else {
      if (i == 0) {
        depth += MARCH_SIZE * 10.0;
      } else {
      depth += MARCH_SIZE * 1.5;
      }
    }
    
    p = rayOrigin + depth * rayDirection;
  }
  
  return res;
}

// Fragment shader
@fragment
fn fragmentMain(@location(0) uv: vec2f, @builtin(position) fragCoord: vec4f) -> @location(0) vec4f {
  var uv2 = fragCoord.xy / cloudParams.resolution.xy;
  uv2 -= 0.5;
  uv2.x *= cloudParams.resolution.x / cloudParams.resolution.y;
  
  // Ray origin - camera
  let ro = vec3f(0.0, 0.0, 5.0);
  // Ray direction
  let rd = normalize(vec3f(uv2, -1.0));
  
  var color = vec3f(0.0);
  
  // Sun and sky
  let sunDirection = normalize(SUN_POSITION);
  let sun = clamp(dot(sunDirection, rd), 0.0, 1.0);
  
  // Base sky color
  color = vec3f(0.7, 0.7, 0.90);
  // Add vertical gradient
  color -= 0.8 * vec3f(0.90, 0.75, 0.90) * rd.y;
  // Add sun color to sky
  color += 0.5 * vec3f(1.0, 0.5, 0.3) * pow(sun, 10.0);
  
  // Raymarch the volumetric cloud
  let marchResult = raymarch(ro, rd, cloudParams.time);
  color = color * (1.0 - marchResult.a) + marchResult.rgb;
  
  return vec4f(color, 1.0);
}

