import { loadShader } from './utils.js';
import * as Tweakpane from 'https://cdn.jsdelivr.net/npm/tweakpane@4.0.3/dist/tweakpane.min.js';

const DEFAULT_CLOUD_PARAMS = {
  time: 0,
  resolution: {
    x: 400,
    y: 400,
  },
  smoothMinParam: 0.06,
  maxSteps: 50,
  initialMarch: 3,
  marchSize: 0.14,
  sunPosition: {
    x: 1,
    y: 0,
    z: 5,
  },
  sunColor: {
    r: 1.0,
    g: 0.6,
    b: 0.3,
  },
  skyColor: {
    r: 0.7,
    g: 0.7,
    b: 0.9,
  },
  mousePathCount: 100,
};
class CloudPaint {
  constructor() {
    this.startTime = Date.now();

    this.canvas = document.createElement('canvas');
    this.canvas.width = 400;
    this.canvas.height = 400;
    document.querySelector('#canvas-container').appendChild(this.canvas);

    if (!navigator.gpu) {
      throw new Error('WebGPU not supported on this browser.');
    }

    this.mousePathCount = 100;
    this.prevMouse = {
      x: 0,
      y: 0,
      t: this.startTime,
    };

    this.cloudParams = DEFAULT_CLOUD_PARAMS;

    try {
      const storedData = localStorage.getItem('cloudParamsData');
      if (storedData) {
        this.cloudParams = JSON.parse(storedData);
      }
    } catch (e) {}
  }

  async initWebGPU() {
    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter) {
      throw new Error('No appropriate GPUAdapter found.');
    }
    this.device = await adapter.requestDevice();
    this.context = this.canvas.getContext('webgpu');
    this.format = navigator.gpu.getPreferredCanvasFormat();
    this.context.configure({
      device: this.device,
      format: this.format,
      alphaMode: 'premultiplied',
    });
  }

  initBuffers() {
    this.mousePathData = new Float32Array(this.mousePathCount * 4);
    for (let i = 0; i < this.mousePathCount; i++) {
      this.mousePathData[i * 4 + 0] = 0;
      this.mousePathData[i * 4 + 1] = -5;
      this.mousePathData[i * 4 + 2] = 0;
      this.mousePathData[i * 4 + 3] = 0;
    }
    this.mousePathBuffer = this.device.createBuffer({
      size: this.mousePathData.byteLength,
      usage:
        GPUBufferUsage.VERTEX |
        GPUBufferUsage.STORAGE |
        GPUBufferUsage.COPY_DST,
      mappedAtCreation: true,
    });
    new Float32Array(this.mousePathBuffer.getMappedRange()).set(
      this.mousePathData
    );
    this.mousePathBuffer.unmap();

    const cloudParamsData = new Float32Array([
      this.cloudParams.time, // offset 0
      0, // padding for vec2f alignment
      this.cloudParams.resolution.x, // offset 8
      this.cloudParams.resolution.y,
      this.cloudParams.smoothMinParam, // offset 16
      this.cloudParams.maxSteps,
      this.cloudParams.initialMarch,
      this.cloudParams.marchSize,
      this.cloudParams.sunPosition.x, // offset 32 (vec3f aligned to 16 bytes)
      this.cloudParams.sunPosition.y,
      this.cloudParams.sunPosition.z,
      0, // padding for vec3f
      this.cloudParams.sunColor.r, // offset 48
      this.cloudParams.sunColor.g,
      this.cloudParams.sunColor.b,
      0, // padding for vec3f
      this.cloudParams.skyColor.r, // offset 64
      this.cloudParams.skyColor.g,
      this.cloudParams.skyColor.b,
      0, // padding for vec3f
      this.cloudParams.mousePathCount,
    ]);

    this.cloudParamsBuffer = this.device.createBuffer({
      size: cloudParamsData.byteLength,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      mappedAtCreation: true,
    });
    new Float32Array(this.cloudParamsBuffer.getMappedRange()).set(
      cloudParamsData
    );
    this.cloudParamsBuffer.unmap();
  }

  async initRenderPipeline() {
    const renderShaderCode = await loadShader('shaders/render.wgsl');
    const renderModule = this.device.createShaderModule({
      code: renderShaderCode,
    });

    const bindGroupLayout = this.device.createBindGroupLayout({
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
      ],
    });

    this.renderPipeline = this.device.createRenderPipeline({
      layout: this.device.createPipelineLayout({
        bindGroupLayouts: [bindGroupLayout],
      }),
      vertex: {
        module: renderModule,
        entryPoint: 'vertexMain',
      },
      fragment: {
        module: renderModule,
        entryPoint: 'fragmentMain',
        targets: [{ format: this.format }],
      },
      primitive: {
        topology: 'triangle-strip',
      },
    });

    this.renderBindGroup = this.device.createBindGroup({
      layout: bindGroupLayout,
      entries: [
        { binding: 0, resource: { buffer: this.mousePathBuffer } },
        { binding: 1, resource: { buffer: this.cloudParamsBuffer } },
      ],
    });
  }

  initGUI() {
    this.pane = new Tweakpane.Pane();

    this.pane
      .addBinding(this.cloudParams, 'smoothMinParam', {
        min: 0,
        max: 1,
      })
      .on('change', () => this.updateCloudParams());

    this.pane
      .addBinding(this.cloudParams, 'maxSteps', {
        min: 0,
        max: 200,
        step: 1,
      })
      .on('change', () => this.updateCloudParams());

    this.pane
      .addBinding(this.cloudParams, 'initialMarch', {
        min: 0,
        max: 10,
      })
      .on('change', () => this.updateCloudParams());

    this.pane
      .addBinding(this.cloudParams, 'marchSize', {
        min: 0.001,
        max: 1,
      })
      .on('change', () => this.updateCloudParams());

    const sunPositionObj = {
      coord: {
        x: this.cloudParams.sunPosition.x,
        y: this.cloudParams.sunPosition.y,
        z: this.cloudParams.sunPosition.z,
      },
    };

    this.pane
      .addBinding(sunPositionObj, 'coord', {
        label: 'Sun Position',
        x: { min: -10, max: 10 },
        y: { min: -10, max: 10 },
        z: { min: -10, max: 10 },
      })
      .on('change', (ev) => {
        this.cloudParams.sunPosition.x = ev.value.x;
        this.cloudParams.sunPosition.y = ev.value.y;
        this.cloudParams.sunPosition.z = ev.value.z;
        this.updateCloudParams();
      });

    // Create a color object compatible with Tweakpane
    const skyColorObj = {
      color: {
        r: Math.round(this.cloudParams.skyColor.r * 255),
        g: Math.round(this.cloudParams.skyColor.g * 255),
        b: Math.round(this.cloudParams.skyColor.b * 255),
      },
    };

    this.pane
      .addBinding(skyColorObj, 'color', {
        label: 'Sky Color',
      })
      .on('change', (ev) => {
        this.cloudParams.skyColor.r = ev.value.r / 255;
        this.cloudParams.skyColor.g = ev.value.g / 255;
        this.cloudParams.skyColor.b = ev.value.b / 255;
        this.updateCloudParams();
      });

    const sunColorObj = {
      color: {
        r: Math.round(this.cloudParams.sunColor.r * 255),
        g: Math.round(this.cloudParams.sunColor.g * 255),
        b: Math.round(this.cloudParams.sunColor.b * 255),
      },
    };
    this.pane
      .addBinding(sunColorObj, 'color', {
        label: 'Sun Color',
      })
      .on('change', (ev) => {
        this.cloudParams.sunColor.r = ev.value.r / 255;
        this.cloudParams.sunColor.g = ev.value.g / 255;
        this.cloudParams.sunColor.b = ev.value.b / 255;
        this.updateCloudParams();
      });

    // Add a button to reset parameters to default
    this.pane.addButton({ title: 'Reset Params' }).on('click', () => {
      // Reset cloudParams to default values
      this.cloudParams = JSON.parse(JSON.stringify(DEFAULT_CLOUD_PARAMS));

      // Update GUI color pickers to reflect reset values
      skyColorObj.color.r = Math.round(this.cloudParams.skyColor.r * 255);
      skyColorObj.color.g = Math.round(this.cloudParams.skyColor.g * 255);
      skyColorObj.color.b = Math.round(this.cloudParams.skyColor.b * 255);

      sunColorObj.color.r = Math.round(this.cloudParams.sunColor.r * 255);
      sunColorObj.color.g = Math.round(this.cloudParams.sunColor.g * 255);
      sunColorObj.color.b = Math.round(this.cloudParams.sunColor.b * 255);

      // Force GUI to update color pickers
      this.pane.refresh();

      // Update GPU buffer and localStorage
      this.updateCloudParams();
    });
  }

  updateCloudParams() {
    // Save cloudParamsData to localStorage as a JSON string for persistence/debugging
    try {
      localStorage.setItem('cloudParamsData', JSON.stringify(this.cloudParams));
    } catch (e) {}

    const cloudParamsData = new Float32Array([
      this.cloudParams.time, // offset 0
      0, // padding for vec2f alignment
      this.cloudParams.resolution.x, // offset 8
      this.cloudParams.resolution.y,
      this.cloudParams.smoothMinParam, // offset 16
      this.cloudParams.maxSteps,
      this.cloudParams.initialMarch,
      this.cloudParams.marchSize,
      this.cloudParams.sunPosition.x, // offset 32 (vec3f aligned to 16 bytes)
      this.cloudParams.sunPosition.y,
      this.cloudParams.sunPosition.z,
      0, // padding for vec3f
      this.cloudParams.sunColor.r, // offset 48
      this.cloudParams.sunColor.g,
      this.cloudParams.sunColor.b,
      0, // padding for vec3f
      this.cloudParams.skyColor.r, // offset 64
      this.cloudParams.skyColor.g,
      this.cloudParams.skyColor.b,
      0, // padding for vec3f
      this.cloudParams.mousePathCount, // offset 80
    ]);

    this.device.queue.writeBuffer(this.cloudParamsBuffer, 0, cloudParamsData);
  }

  async init() {
    await this.initWebGPU();
    this.initBuffers();
    await this.initRenderPipeline();
    this.initGUI();

    this.canvas.addEventListener('mousemove', (event) => {
      if (event.buttons !== 1) {
        return;
      }
      const rect = this.canvas.getBoundingClientRect();
      const newX = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      const newY = -(((event.clientY - rect.top) / rect.height) * 2 - 1);
      const newT = (Date.now() - this.startTime) / 1000.0;
      const distanceSq =
        (newX - this.prevMouse.x) * (newX - this.prevMouse.x) +
        (newY - this.prevMouse.y) * (newY - this.prevMouse.y);

      if (distanceSq < 0.01) {
        return;
      }
      this.prevMouse = {
        x: newX,
        y: newY,
        t: newT,
      };
      // shift the mouse path data to the right by 3
      for (let i = this.mousePathCount - 1; i > 0; i--) {
        this.mousePathData[i * 4 + 0] = this.mousePathData[(i - 1) * 4 + 0];
        this.mousePathData[i * 4 + 1] = this.mousePathData[(i - 1) * 4 + 1];
        this.mousePathData[i * 4 + 2] = this.mousePathData[(i - 1) * 4 + 2];
        this.mousePathData[i * 4 + 3] = this.mousePathData[(i - 1) * 4 + 3];
      }
      this.mousePathData[0] = newX;
      this.mousePathData[1] = newY;
      this.mousePathData[2] = newT;
      this.mousePathData[3] = 0;

      this.device.queue.writeBuffer(
        this.mousePathBuffer,
        0,
        this.mousePathData
      );
    });
  }

  render() {
    const commandEncoder = this.device.createCommandEncoder();
    const renderPass = commandEncoder.beginRenderPass({
      colorAttachments: [
        {
          view: this.context.getCurrentTexture().createView(),
          clearValue: { r: 1.0, g: 1.0, b: 1.0, a: 1.0 },
          loadOp: 'clear',
          storeOp: 'store',
        },
      ],
    });
    const currentTime = (Date.now() - this.startTime) / 1000.0;
    this.cloudParams.time = currentTime;
    this.updateCloudParams();
    renderPass.setPipeline(this.renderPipeline);
    renderPass.setBindGroup(0, this.renderBindGroup);
    renderPass.draw(4, 1);
    renderPass.end();
    this.device.queue.submit([commandEncoder.finish()]);

    requestAnimationFrame(this.render.bind(this));
  }
}

const cloudPaint = new CloudPaint();
await cloudPaint.init();
cloudPaint.render();
