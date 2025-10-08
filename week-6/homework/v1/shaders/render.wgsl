// Volumetric Cloud Rendering Shader
// Uses boid positions to influence the signed distance function

struct MousePath {
  pos: vec4f,
}

struct CloudParams{
  time: f32,
  resolution: vec2f,
  smoothMinParam: f32,
  maxSteps: f32,
  initialMarch: f32,
  marchSize: f32,
  sunPosition: vec3f,
  sunColor: vec3f,
  skyColor: vec3f,
  mousePathCount: f32,
}

@group(0) @binding(0) var<storage, read> mousePath: array<MousePath>;
@group(0) @binding(1) var<uniform> cloudParams: CloudParams;

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

fn sdCapsule( p: vec3f, a: vec3f, b: vec3f, r: f32 ) -> f32
{
  let pa = p - a;
  let ba = b - a;
  let h = clamp( dot(pa,ba)/dot(ba,ba), 0.0, 1.0 );
  return length( pa - ba*h ) - r;
}

// cubic polynomial
fn smin( a: f32, b: f32, k: f32 ) -> f32
{
    let k1 = k * 6.0;
    let h = max( k1 - abs(a - b), 0.0 ) / k1;
    return min(a, b) - h * h * h * k1 * (1.0 / 6.0);
}


fn mousePos (p: vec3f, time: f32) -> vec3f 
{
  return vec3f(p.x *4.0 * 0.7, p.y *3.0 * 0.7, (p.z - time) * 1.0);
}

// Scene SDF using boid positions
fn scene(p: vec3f, time: f32) -> f32 {
  // Base sphere
  var dist = 10000000.0;
  
  // Add influence from mouse path
  for (var i = 1; i < 200; i+=1) {
    var mouse = mousePath[i];
    let prevMouse = mousePos(mousePath[i - 1].pos.xyz, time);
    let currMouse = mousePos(mouse.pos.xyz, time);
    if(abs(currMouse.z - prevMouse.z) > 0.1){
      continue;
    }
    // let mouseDist = sdSphere(p, mouse.pos.xyz, 0.1);
    let mouseDist = sdCapsule(p, prevMouse, currMouse, 0.1);
    
    if(cloudParams.smoothMinParam > 0.0){
      dist = smin(dist, mouseDist, cloudParams.smoothMinParam);
    }
    else{
      dist = min(dist, mouseDist);
    }
  }

  // Add noise
  let noiseVal = fbm(p * 1.0);
  
  return -dist + noiseVal * 0.4;
}


// Volumetric ray marching
fn raymarch(rayOrigin: vec3f, rayDirection: vec3f, time: f32) -> vec4f {
  var depth = cloudParams.initialMarch;
  var p = rayOrigin + depth * rayDirection;
  
  var res = vec4f(0.0);
  let sunDirection = normalize(cloudParams.sunPosition - rayOrigin);
    
  for (var i = 0; i < i32(cloudParams.maxSteps); i++) {
    let density = scene(p, time);
    
    // Only draw density if it's greater than 0
    if (density > 0.0) {
      let diffuse = clamp(
        (scene(p, time) - scene(p + 0.3 * sunDirection, time)) / 0.3,
        0.0,
        1.0
      );
      
      let lin = vec3f(0.60, 0.60, 0.75) * 1.1 + 0.8 * cloudParams.sunColor * diffuse;
      var color = vec4f(mix(vec3f(1.0), vec3f(0.0), density), density);
      color = vec4f(color.rgb * lin, color.a);
      color = vec4f(color.rgb * color.a, color.a);
      res += color * (1.0 - res.a);
    }
    
    depth += cloudParams.marchSize;
    
    p = rayOrigin + depth * rayDirection;
  }
  
  return res;
}

// Fragment shader
@fragment
fn fragmentMain(@location(0) uv: vec2f, @builtin(position) fragCoord: vec4f) -> @location(0) vec4f {
  var uv2 = uv;
  uv2 -= 0.5;
  uv2.x *= cloudParams.resolution.x / cloudParams.resolution.y;

  // Ray origin - camera
  let ro = vec3f(0.0, 0.0, 5.0);
  // Ray direction
  let rd = normalize(vec3f(uv2, -1.0));
  
  var color = vec3f(0.0);
  
  // Sun and sky
  let sunDirection = normalize(cloudParams.sunPosition);
  let sun = clamp(dot(sunDirection, rd), 0.0, 1.0);
  
  // Base sky color
  color = cloudParams.skyColor;
  
  color -= 0.8 * vec3f(0.90, 0.75, 0.90) * rd.y;

  // Add sun color to sky
  color += 0.5 * cloudParams.sunColor * pow(sun, 10.0);
  
  // Raymarch the volumetric cloud
  let marchResult = raymarch(ro, rd, cloudParams.time);
  color = color * (1.0 - marchResult.a) + marchResult.rgb;

  return vec4f(color, 1.0);
}

