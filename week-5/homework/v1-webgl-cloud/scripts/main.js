import * as THREE from 'three';

const WIDTH = 800;
const HEIGHT = 600;

const vertexShader = `
varying vec2 vUv;

void main() {
  vUv = uv;

  vec4 modelPosition = modelMatrix * vec4(position, 1.0);
  vec4 viewPosition = viewMatrix * modelPosition;
  vec4 projectedPosition = projectionMatrix * viewPosition;

  gl_Position = projectedPosition;
}

`;

const fragmentShader = `
uniform float uTime;
uniform vec2 uResolution;

#define MAX_STEPS 100


// noise
// Volume raycasting by XT95
// https://www.shadertoy.com/view/lss3zr
mat3 m = mat3( 0.00,  0.80,  0.60,
              -0.80,  0.36, -0.48,
              -0.60, -0.48,  0.64 );

float hash( float n )
{
    return fract(sin(n)*43758.5453);
}

float noise( in vec3 x )
{
    vec3 p = floor(x);
    vec3 f = fract(x);

    f = f*f*(3.0-2.0*f);

    float n = p.x + p.y*57.0 + 113.0*p.z;

    float res = mix(mix(mix( hash(n+  0.0), hash(n+  1.0),f.x),
                        mix( hash(n+ 57.0), hash(n+ 58.0),f.x),f.y),
                    mix(mix( hash(n+113.0), hash(n+114.0),f.x),
                        mix( hash(n+170.0), hash(n+171.0),f.x),f.y),f.z);
    return res;
}


float fbm( vec3 p )
{
    float f;
    f  = 0.5000*noise( p ); p = m*p*2.02;
    f += 0.2500*noise( p ); p = m*p*2.03;
    f += 0.12500*noise( p ); p = m*p*2.01;
    f += 0.06250*noise( p );
    return f;
}

float sdSphere(vec3 p, vec3 center, float radius) {
    return length(p - center) - radius;
}

float scene(vec3 p, float time) {
  float distance1= sdSphere(p, vec3(0.0, 0.0, 0.0), 0.4);
  float distance2 = sdSphere(p, vec3(1.0,1.0,0.0), 1.2);

  float distance  = (distance1);
  float t = time * 0.1;
  float noise = fbm(p * 0.5 + vec3(4.0*sin(t), 4.0*cos(t), 0.0));
  return -distance + noise * 2.0;
}

const float MARCH_SIZE = 0.08;
const vec3 SUN_POSITION = vec3(1.0, 0.0, 5.0);

vec4 raymarch(vec3 rayOrigin, vec3 rayDirection) {
  float depth = 0.0;
  vec3 p = rayOrigin + depth * rayDirection;
  
  vec4 res = vec4(0.0);
  vec3 sunDirection = normalize(SUN_POSITION - rayOrigin);

  for (int i = 0; i < MAX_STEPS; i++) {
    float density = scene(p, uTime);

    // We only draw the density if it's greater than 0
    if (density > 0.0) {
      float diffuse = clamp((scene(p, uTime) - scene(p + 0.3 * sunDirection, uTime)) / 0.3, 0.0, 1.0 );
      vec3 lin = vec3(0.60,0.60,0.75) * 1.1 + 0.8 * vec3(1.0,0.6,0.3) * diffuse;
      vec4 color = vec4(mix(vec3(1.0,1.0,1.0), vec3(0.0, 0.0, 0.0), density), density );
      color.rgb *= lin;
      color.rgb *= color.a;
      res += color*(1.0-res.a);
    }

    if(density >= 0.0){
      depth += MARCH_SIZE;

    }else{
      // depth = depth - density * 0.6;
      depth += MARCH_SIZE * 1.0;

    }
    
    p = rayOrigin + depth * rayDirection;
  }

  return res;
}

void main() {
  vec2 uv = gl_FragCoord.xy/uResolution.xy;
  uv -= 0.5;
  uv.x *= uResolution.x / uResolution.y;

  // Ray Origin - camera
  vec3 ro = vec3(0.0, 0.0, 5.0);
  // Ray Direction
  vec3 rd = normalize(vec3(uv, -1.0));
  
  vec3 color = vec3(0.0);


  // Sun and Sky
  vec3 sunDirection = normalize(SUN_POSITION);
  float sun = clamp(dot(sunDirection, rd), 0.0, 1.0 );
  // Base sky color
  color = vec3(0.7,0.7,0.90);
  // Add vertical gradient
  color -= 0.8 * vec3(0.90,0.75,0.90) * rd.y;
  // Add sun color to sky
  color += 0.5 * vec3(1.0,0.5,0.3) * pow(sun, 10.0);


  vec4 res = raymarch(ro, rd);
  color = color * (1.0 - res.a) + res.rgb;

  gl_FragColor = vec4(color, 1.0);
}


`;
async function init() {
  // Scene
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x000000);

  // Camera
  const camera = new THREE.PerspectiveCamera(75, WIDTH / HEIGHT, 0.1, 1000);
  camera.position.z = 3;

  // Renderer
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(WIDTH, HEIGHT);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 0.5));
  document.getElementById('canvas-container').appendChild(renderer.domElement);

  // ============================================
  // Shader Material
  // ============================================
  const shaderUniforms = {
    uTime: { value: 0.0 },
    uResolution: { value: new THREE.Vector2(WIDTH, HEIGHT) },
  };

  const shaderMaterial = new THREE.ShaderMaterial({
    vertexShader: vertexShader,
    fragmentShader: fragmentShader,
    uniforms: shaderUniforms,
    side: THREE.DoubleSide,
  });

  const geometry = new THREE.PlaneGeometry(10, 10, 32, 32);

  const mesh = new THREE.Mesh(geometry, shaderMaterial);
  scene.add(mesh);

  // ============================================
  // GUI Controls
  // ============================================
  const gui = new dat.GUI();

  // ============================================
  // Animation Loop
  // ============================================
  const clock = new THREE.Clock();

  function animate() {
    requestAnimationFrame(animate);

    const elapsedTime = clock.getElapsedTime();

    // Update shader uniforms
    shaderUniforms.uTime.value = elapsedTime;
    shaderUniforms.uResolution.value.set(
      renderer.domElement.width,
      renderer.domElement.height
    );

    // Render
    renderer.render(scene, camera);
  }

  animate();
}

init();
