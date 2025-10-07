export async function loadShader(path) {
  const response = await fetch(path);
  if (!response.ok) {
    throw new Error(`Failed to load shader: ${path}`);
  }
  return await response.text();
}
