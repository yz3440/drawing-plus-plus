export async function loadShader(path) {
  const response = await fetch(path);
  if (!response.ok) {
    throw new Error(`Failed to load shader: ${path}`);
  }
  return await response.text();
}

// MARK: WebGPU
export function setupCanvas() {
  const canvas = document.createElement('canvas');
  canvas.width = 800;
  canvas.height = 600;
  document.getElementById('canvas-container').appendChild(canvas);
  return canvas;
}

export async function initWebGPU(canvas) {
  if (!navigator.gpu) {
    throw new Error('WebGPU not supported on this browser.');
  }

  const adapter = await navigator.gpu.requestAdapter();
  if (!adapter) {
    throw new Error('No appropriate GPUAdapter found.');
  }

  const device = await adapter.requestDevice();
  const context = canvas.getContext('webgpu');
  const format = navigator.gpu.getPreferredCanvasFormat();

  context.configure({
    device: device,
    format: format,
    alphaMode: 'premultiplied',
  });

  return { device, context, format };
}
