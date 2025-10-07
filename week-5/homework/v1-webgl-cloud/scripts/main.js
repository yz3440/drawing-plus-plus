import * as THREE from 'three';

const WIDTH = 800;
const HEIGHT = 600;

async function loadShader(url) {
  const response = await fetch(url);
  return await response.text();
}

async function init() {
  // Load shaders
  const vertexShader = await loadShader('../shaders/vertex.glsl');
  const fragmentShader = await loadShader('../shaders/fragment.glsl');

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
