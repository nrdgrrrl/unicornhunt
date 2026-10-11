export const MAX_RENDER_WIDTH = 1920;
export const MAX_RENDER_HEIGHT = 1080;
export const MAX_RENDER_DPR = 2;

export function backingSize(cssWidth, cssHeight, devicePixelRatio = 1) {
  if (![cssWidth, cssHeight].every(value => Number.isFinite(value) && value > 0)) {
    throw new RangeError('Display dimensions must be finite and positive');
  }
  const dpr = Number.isFinite(devicePixelRatio) && devicePixelRatio > 0
    ? Math.min(MAX_RENDER_DPR, devicePixelRatio) : 1;
  // Use one scale for both axes so resolution limits preserve aspect ratio.
  // Capping each axis independently would distort the rendered scene.
  const scale = Math.min(dpr, MAX_RENDER_WIDTH / cssWidth, MAX_RENDER_HEIGHT / cssHeight);
  return {
    width: Math.max(1, Math.round(cssWidth * scale)),
    height: Math.max(1, Math.round(cssHeight * scale)),
  };
}

export function resizeDisplayCanvas(canvas) {
  const bounds = canvas.getBoundingClientRect();
  if (!(bounds.width > 0 && bounds.height > 0)) return false;
  const dpr = canvas.ownerDocument.defaultView?.devicePixelRatio ?? 1;
  const size = backingSize(bounds.width, bounds.height, dpr);
  if (canvas.width === size.width && canvas.height === size.height) return false;
  // Assign only on actual size changes: assigning a dimension clears pixels
  // and resets context state even when the assigned number is unchanged.
  canvas.width = size.width;
  canvas.height = size.height;
  return true;
}
