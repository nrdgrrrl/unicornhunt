export const CAMERA_HEIGHT = 0.65;
export const HORIZONTAL_FOV = 70 * Math.PI / 180;
const NEAR = 0.08;

/** Snapshot a horizontal camera for one viewport, independent of player state. */
export function createCameraFrame(width, height, { x, y, angle }) {
  return {
    width, height,
    focal: width / (2 * Math.tan(HORIZONTAL_FOV / 2)),
    camera: { x, y, angle },
    cosine: Math.cos(angle),
    sine: Math.sin(angle),
  };
}

/** Unnormalized world direction through the center of a screen column. */
export function columnRay(frame, column) {
  const side = (column + 0.5 - frame.width / 2) / frame.focal;
  return {
    x: frame.cosine - frame.sine * side,
    y: frame.sine + frame.cosine * side,
  };
}

/** Convert a normalized column-ray hit distance to camera-forward wall depth.
 * Preserve the renderer's minimum wall depth to keep wall scaling bounded. */
export function perpendicularDepth(frame, column, distance) {
  const side = (column + 0.5 - frame.width / 2) / frame.focal;
  return Math.max(0.01, distance / Math.hypot(1, side));
}

/** First world sample and per-sample increments for a lower-half floor raster.
 * row is zero-based; raster dimensions may differ from viewport dimensions. */
export function floorRow(frame, row, rasterWidth, rasterHeight) {
  const screenY = (row + 0.5) * frame.height / (2 * rasterHeight);
  const depth = frame.focal * CAMERA_HEIGHT / screenY;
  const step = depth * frame.width / (frame.focal * rasterWidth);
  const side = ((0.5 / rasterWidth - 0.5) * frame.width / frame.focal) * depth;
  return {
    depth,
    x: frame.camera.x + frame.cosine * depth - frame.sine * side,
    y: frame.camera.y + frame.sine * depth + frame.cosine * side,
    stepX: -frame.sine * step,
    stepY: frame.cosine * step,
  };
}

/** Screen position without wall or viewport clipping, for distant forest art.
 * z is height above the ground; points before the near plane return null. */
export function position(frame, { x, y, z = 0.5 }) {
  if (!frame) return null;
  const dx = x - frame.camera.x;
  const dy = y - frame.camera.y;
  const depth = dx * frame.cosine + dy * frame.sine;
  if (depth < NEAR) return null;
  const scale = frame.focal / depth;
  return {
    x: frame.width / 2 + (-dx * frame.sine + dy * frame.cosine) * scale,
    y: frame.height / 2 + (CAMERA_HEIGHT - z) * scale,
    depth, scale,
  };
}

/** Clip a point's horizontal footprint against an explicit wall-depth buffer.
 * size is a world-space radius including transparent sprite margins. Two
 * pixels of padding cover the footprint; each {x, width} span ends exclusively
 * at x + width. Equal wall depth is occluded. The buffer is only read. */
export function project(frame, { size = 0.1, ...point }, wallDepth) {
  const screen = position(frame, point);
  if (!screen) return null;
  const left = Math.max(0, Math.floor(screen.x - size * screen.scale - 2));
  const right = Math.min(frame.width, Math.ceil(screen.x + size * screen.scale + 2));
  const visibleSpans = [];
  let start = null;
  for (let column = left; column < right; column++) {
    const visible = screen.depth < wallDepth[column];
    if (visible && start === null) start = column;
    if (!visible && start !== null) {
      visibleSpans.push({ x: start, width: column - start });
      start = null;
    }
  }
  if (start !== null) visibleSpans.push({ x: start, width: right - start });
  return visibleSpans.length ? { ...screen, visibleSpans } : null;
}
