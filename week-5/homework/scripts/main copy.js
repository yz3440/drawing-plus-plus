// WebGPU Flocking Boids Simulation
// Imperative programming style with separate shader files
import { initWebGPU, setupCanvas, loadShader } from './utils.js';

const WORKGROUP_SIZE = 64;

// Global state
let canvas = null;
let context = null;
let device = null;
let format = null;

// Simulation parameters
const params = {
  numBoids: 48,
  separationDistance: 1,
  alignmentDistance: 0.1,
  cohesionDistance: 0.1,
  separationScale: 0.2,
  alignmentScale: 0.02,
  cohesionScale: 0.005,
  maxSpeed: 0.5,
  deltaTime: 0.016,
  visualRange: 0.15,
  boidSize: 4.0,
  mouseX: 0,
  mouseY: 0,
  renderMode: 'cloud', // 'boids' or 'cloud'
};

// Buffers
const buffers = {
  boids: [],
  params: null,
  cloudUniforms: null,
  numBoidsBuffer: null,
  mouseBoid: null,
};

// Pipelines and bind groups
let computePipeline = null;
let renderPipeline = null;
let cloudPipeline = null;
let bindGroups = [];
let cloudBindGroup = null;
let frame = 0;
let startTime = Date.now();

// Initialize buffers
function initBuffers() {
  const numBoids = params.numBoids;

  // Initialize boid positions and velocities
  const boidData = new Float32Array(numBoids * 4 * 2);

  for (let i = 0; i < numBoids; i++) {
    const offset = i * 4;
    // Position (normalized to -1 to 1)
    boidData[offset + 0] = Math.random() * 2 - 1;
    boidData[offset + 1] = Math.random() * 2 - 1;
    // Velocity
    boidData[offset + 2] = (Math.random() - 0.5) * 0.1;
    boidData[offset + 3] = (Math.random() - 0.5) * 0.1;
  }

  // Create two boid buffers for ping-pong
  buffers.boids[0] = device.createBuffer({
    size: boidData.byteLength,
    usage:
      GPUBufferUsage.VERTEX | GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    mappedAtCreation: true,
  });

  new Float32Array(buffers.boids[0].getMappedRange()).set(boidData);
  buffers.boids[0].unmap();

  buffers.boids[1] = device.createBuffer({
    size: boidData.byteLength,
    usage:
      GPUBufferUsage.VERTEX | GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
  });

  // Simulation parameters buffer
  const paramsData = new Float32Array([
    params.separationDistance,
    params.alignmentDistance,
    params.cohesionDistance,
    params.separationScale,
    params.alignmentScale,
    params.cohesionScale,
    params.maxSpeed,
    params.deltaTime,
    params.numBoids,
    params.visualRange,
    params.mouseX,
    params.mouseY,
    0, // padding
  ]);

  buffers.params = device.createBuffer({
    size: paramsData.byteLength,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    mappedAtCreation: true,
  });

  new Float32Array(buffers.params.getMappedRange()).set(paramsData);
  buffers.params.unmap();

  // Cloud uniforms buffer (time, resolution, padding)
  // WebGPU alignment: f32 (4 bytes) + padding (4 bytes) + vec2f (8 bytes) + padding (8 bytes) = 24 bytes
  const cloudUniformsData = new Float32Array([
    0.0, // time (offset 0)
    0.0, // padding (offset 4)
    canvas.width, // resolution.x (offset 8)
    canvas.height, // resolution.y (offset 12)
    0.0, // padding (offset 16)
    0.0, // padding (offset 20)
  ]);

  buffers.cloudUniforms = device.createBuffer({
    size: 24, // Properly aligned to 24 bytes
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    mappedAtCreation: true,
  });

  new Float32Array(buffers.cloudUniforms.getMappedRange()).set(
    cloudUniformsData
  );
  buffers.cloudUniforms.unmap();

  // NumBoids buffer for cloud shader (needs 16-byte alignment for uniform)
  const numBoidsData = new Uint32Array([params.numBoids, 0, 0, 0]);
  buffers.numBoidsBuffer = device.createBuffer({
    size: 16, // Aligned to 16 bytes
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    mappedAtCreation: true,
  });

  new Uint32Array(buffers.numBoidsBuffer.getMappedRange()).set(numBoidsData);
  buffers.numBoidsBuffer.unmap();

  // Mouse boid buffer (single boid with position and velocity)
  const mouseBoidData = new Float32Array([
    params.mouseX, // pos.x
    params.mouseY, // pos.y
    0.0, // vel.x
    0.0, // vel.y
  ]);

  buffers.mouseBoid = device.createBuffer({
    size: 16, // 4 floats * 4 bytes
    usage:
      GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST | GPUBufferUsage.STORAGE,
    mappedAtCreation: true,
  });

  new Float32Array(buffers.mouseBoid.getMappedRange()).set(mouseBoidData);
  buffers.mouseBoid.unmap();
}

// Initialize compute pipeline
async function initComputePipeline() {
  const computeShaderCode = await loadShader('shaders/compute.wgsl');

  const computeModule = device.createShaderModule({
    code: computeShaderCode,
  });

  const computeBindGroupLayout = device.createBindGroupLayout({
    entries: [
      {
        binding: 0,
        visibility: GPUShaderStage.COMPUTE,
        buffer: { type: 'read-only-storage' },
      },
      {
        binding: 1,
        visibility: GPUShaderStage.COMPUTE,
        buffer: { type: 'storage' },
      },
      {
        binding: 2,
        visibility: GPUShaderStage.COMPUTE,
        buffer: { type: 'uniform' },
      },
    ],
  });

  computePipeline = device.createComputePipeline({
    layout: device.createPipelineLayout({
      bindGroupLayouts: [computeBindGroupLayout],
    }),
    compute: {
      module: computeModule,
      entryPoint: 'main',
    },
  });

  // Create bind groups for ping-pong buffers
  bindGroups[0] = device.createBindGroup({
    layout: computeBindGroupLayout,
    entries: [
      { binding: 0, resource: { buffer: buffers.boids[0] } },
      { binding: 1, resource: { buffer: buffers.boids[1] } },
      { binding: 2, resource: { buffer: buffers.params } },
    ],
  });

  bindGroups[1] = device.createBindGroup({
    layout: computeBindGroupLayout,
    entries: [
      { binding: 0, resource: { buffer: buffers.boids[1] } },
      { binding: 1, resource: { buffer: buffers.boids[0] } },
      { binding: 2, resource: { buffer: buffers.params } },
    ],
  });
}

// Initialize render pipeline
async function initRenderPipeline() {
  const renderShaderCode = await loadShader('shaders/render.wgsl');

  const renderModule = device.createShaderModule({
    code: renderShaderCode,
  });

  renderPipeline = device.createRenderPipeline({
    layout: 'auto',
    vertex: {
      module: renderModule,
      entryPoint: 'vertexMain',
      buffers: [
        {
          arrayStride: 16,
          stepMode: 'instance',
          attributes: [
            { shaderLocation: 0, offset: 0, format: 'float32x2' },
            { shaderLocation: 1, offset: 8, format: 'float32x2' },
          ],
        },
      ],
    },
    fragment: {
      module: renderModule,
      entryPoint: 'fragmentMain',
      targets: [{ format: format }],
    },
    primitive: {
      topology: 'triangle-list',
    },
  });
}

// Initialize cloud rendering pipeline
async function initCloudPipeline() {
  const cloudShaderCode = await loadShader('shaders/cloud.wgsl');

  const cloudModule = device.createShaderModule({
    code: cloudShaderCode,
  });

  const cloudBindGroupLayout = device.createBindGroupLayout({
    entries: [
      {
        binding: 0,
        visibility: GPUShaderStage.FRAGMENT,
        buffer: { type: 'read-only-storage' },
      },
      {
        binding: 1,
        visibility: GPUShaderStage.FRAGMENT,
        buffer: { type: 'uniform' },
      },
      {
        binding: 2,
        visibility: GPUShaderStage.FRAGMENT,
        buffer: { type: 'uniform' },
      },
      {
        binding: 3,
        visibility: GPUShaderStage.FRAGMENT,
        buffer: { type: 'read-only-storage' },
      },
    ],
  });

  cloudPipeline = device.createRenderPipeline({
    layout: device.createPipelineLayout({
      bindGroupLayouts: [cloudBindGroupLayout],
    }),
    vertex: {
      module: cloudModule,
      entryPoint: 'vertexMain',
    },
    fragment: {
      module: cloudModule,
      entryPoint: 'fragmentMain',
      targets: [{ format: format }],
    },
    primitive: {
      topology: 'triangle-strip',
    },
  });

  // Create bind group for cloud rendering (will be updated each frame)
  cloudBindGroup = device.createBindGroup({
    layout: cloudBindGroupLayout,
    entries: [
      { binding: 0, resource: { buffer: buffers.boids[0] } },
      { binding: 1, resource: { buffer: buffers.cloudUniforms } },
      { binding: 2, resource: { buffer: buffers.numBoidsBuffer } },
      { binding: 3, resource: { buffer: buffers.mouseBoid } },
    ],
  });
}

// Update parameters buffer
function updateParams() {
  const paramsData = new Float32Array([
    params.separationDistance,
    params.alignmentDistance,
    params.cohesionDistance,
    params.separationScale,
    params.alignmentScale,
    params.cohesionScale,
    params.maxSpeed,
    params.deltaTime,
    params.numBoids,
    params.visualRange,
    params.mouseX,
    params.mouseY,
  ]);

  device.queue.writeBuffer(buffers.params, 0, paramsData);

  // Update mouse boid position
  const mouseBoidData = new Float32Array([
    params.mouseX,
    params.mouseY,
    0.0,
    0.0,
  ]);
  device.queue.writeBuffer(buffers.mouseBoid, 0, mouseBoidData);
}

// Render loop
function render() {
  const commandEncoder = device.createCommandEncoder();

  // Compute pass (always run to update boid positions)
  const computePass = commandEncoder.beginComputePass();
  computePass.setPipeline(computePipeline);
  computePass.setBindGroup(0, bindGroups[frame % 2]);

  const workgroupCount = Math.ceil(params.numBoids / WORKGROUP_SIZE);
  computePass.dispatchWorkgroups(workgroupCount);
  computePass.end();

  // Render pass
  const textureView = context.getCurrentTexture().createView();
  const renderPass = commandEncoder.beginRenderPass({
    colorAttachments: [
      {
        view: textureView,
        clearValue: { r: 1.0, g: 1.0, b: 1.0, a: 1.0 },
        loadOp: 'clear',
        storeOp: 'store',
      },
    ],
  });

  if (params.renderMode === 'cloud') {
    // Update cloud uniforms (must match struct layout with padding)
    const currentTime = (Date.now() - startTime) / 1000.0;
    const cloudUniformsData = new Float32Array([
      currentTime, // time (offset 0)
      0.0, // padding (offset 4)
      canvas.width, // resolution.x (offset 8)
      canvas.height, // resolution.y (offset 12)
      0.0, // padding (offset 16)
      0.0, // padding (offset 20)
    ]);
    device.queue.writeBuffer(buffers.cloudUniforms, 0, cloudUniformsData);

    // Update bind group to use current boid buffer
    const currentBoidBuffer = buffers.boids[(frame + 1) % 2];
    cloudBindGroup = device.createBindGroup({
      layout: cloudPipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: currentBoidBuffer } },
        { binding: 1, resource: { buffer: buffers.cloudUniforms } },
        { binding: 2, resource: { buffer: buffers.numBoidsBuffer } },
        { binding: 3, resource: { buffer: buffers.mouseBoid } },
      ],
    });

    // Render fullscreen quad with cloud shader
    renderPass.setPipeline(cloudPipeline);
    renderPass.setBindGroup(0, cloudBindGroup);
    renderPass.draw(4, 1); // 4 vertices for triangle-strip quad
  } else {
    // Render boids
    renderPass.setPipeline(renderPipeline);
    renderPass.setVertexBuffer(0, buffers.boids[(frame + 1) % 2]);
    renderPass.draw(3, params.numBoids);

    // Render mouse boid (bigger)
    renderPass.setVertexBuffer(0, buffers.mouseBoid);
    renderPass.draw(3, 1);
  }

  renderPass.end();

  device.queue.submit([commandEncoder.finish()]);

  frame++;
  requestAnimationFrame(render);
}

// Setup dat.GUI
function setupGUI() {
  const gui = new dat.GUI();

  // Render mode toggle with a more descriptive label and a dropdown
  gui
    .add(params, 'renderMode', { Boids: 'boids', 'Volumetric Cloud': 'cloud' })
    .name('Display Mode')
    .onChange(() => updateParams());

  // Boid parameters folder
  const boidFolder = gui.addFolder('Boid Parameters');
  boidFolder
    .add(params, 'separationDistance', 0.01, 0.2)
    .onChange(() => updateParams());
  boidFolder
    .add(params, 'alignmentDistance', 0.05, 0.3)
    .onChange(() => updateParams());
  boidFolder
    .add(params, 'cohesionDistance', 0.05, 0.3)
    .onChange(() => updateParams());
  boidFolder
    .add(params, 'separationScale', 0.01, 0.1)
    .onChange(() => updateParams());
  boidFolder
    .add(params, 'alignmentScale', 0.01, 0.1)
    .onChange(() => updateParams());
  boidFolder
    .add(params, 'cohesionScale', 0.001, 0.02)
    .onChange(() => updateParams());
  boidFolder.add(params, 'maxSpeed', 0.1, 1.0).onChange(() => updateParams());
  boidFolder
    .add(params, 'visualRange', 0.05, 0.3)
    .onChange(() => updateParams());
  boidFolder.open();
}

// Main initialization function
async function init() {
  try {
    canvas = setupCanvas();
    canvas.addEventListener('mousemove', (event) => {
      // Convert mouse position to normalized device coordinates (-1 to 1, y up)
      const rect = canvas.getBoundingClientRect();
      const newX = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      const newY = -(((event.clientY - rect.top) / rect.height) * 2 - 1);
      params.mouseX = params.mouseX * 0.9 + newX * 0.1;
      params.mouseY = params.mouseY * 0.9 + newY * 0.1;
      updateParams();
    });

    const webgpu = await initWebGPU(canvas);

    device = webgpu.device;
    context = webgpu.context;
    format = webgpu.format;

    initBuffers();
    await initComputePipeline();
    await initRenderPipeline();
    await initCloudPipeline();
    setupGUI();
    render();
  } catch (err) {
    console.error('Failed to initialize:', err);
    document.getElementById(
      'canvas-container'
    ).innerHTML = `<div class="p-8 text-red-400">
      <p class="text-xl font-bold mb-2">WebGPU Error</p>
      <p>${err.message}</p>
      <p class="mt-4 text-sm">Make sure you're using a browser that supports WebGPU (Chrome 113+, Edge 113+)</p>
    </div>`;
  }
}

// Start the application
init();
