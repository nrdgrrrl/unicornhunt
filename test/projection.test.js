import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CAMERA_HEIGHT, HORIZONTAL_FOV, createCameraFrame, columnRay,
  perpendicularDepth, floorRow, position, project,
} from '../src/projection.js';

const near = (actual, expected, tolerance = 1e-9) =>
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} should be near ${expected}`);
const viewports = [[640, 360], [1001, 563], [401, 601]];

test('projection imports in Node without browser globals or canvas mocks', () => {
  for (const name of ['document', 'window', 'Path2D', 'HTMLCanvasElement']) {
    assert.equal(typeof globalThis[name], 'undefined');
  }
  assert.equal(typeof createCameraFrame, 'function');
});

test('literal 70 degree horizontal FOV and 0.65 tile eye height at all browser viewport sizes', () => {
  assert.equal(CAMERA_HEIGHT, 0.65);
  near(HORIZONTAL_FOV, 70 * Math.PI / 180);
  for (const [width, height] of viewports) {
    const frame = createCameraFrame(width, height, { x: 3.5, y: 12.5, angle: 0 });
    const depths = new Float64Array(width).fill(Infinity);
    const center = project(frame, { x: 5.5, y: 12.5, z: 0.65 }, depths);
    assert.equal(center.x, width / 2);
    assert.equal(center.y, height / 2);
    assert.equal(center.depth, 2);
    // Expectations deliberately use literal tuning, independently of exports.
    const scale = width / (4 * Math.tan(35 * Math.PI / 180));
    near(center.scale, scale);
    near(frame.focal, 2 * scale);
    const ground = project(frame, { x: 5.5, y: 12.5, z: 0 }, depths);
    near(ground.y, height / 2 + 0.65 * scale);
    const edge = project(frame, { x: 5.5, y: 12.5 + 2 * Math.tan(35 * Math.PI / 180), z: 0.65 }, depths);
    near(edge.x, width);
    const lastColumn = project(frame, {
      x: 5.5, y: 12.5 + (width - 1 - width / 2) / scale, z: 0.65, size: 0.001,
    }, depths);
    assert.ok(lastColumn.visibleSpans.some(span => span.x + span.width === width));
  }
});

test('column rays sample pixel centers and recover perpendicular depth across a planar wall', () => {
  for (const [width, height] of viewports) {
    for (const angle of [0, 0.25, Math.PI / 2]) {
      const frame = createCameraFrame(width, height, { x: 3.5, y: 12.5, angle });
      const focal = width / (2 * Math.tan(35 * Math.PI / 180));
      for (const column of [0, Math.floor(width / 2), width - 1]) {
        const side = (column + 0.5 - width / 2) / focal;
        const ray = columnRay(frame, column);
        near(ray.x, Math.cos(angle) - Math.sin(angle) * side);
        near(ray.y, Math.sin(angle) + Math.cos(angle) * side);
        near(ray.x * Math.cos(angle) + ray.y * Math.sin(angle), 1);
        near(perpendicularDepth(frame, column, 3.5 * Math.hypot(ray.x, ray.y)), 3.5);
        assert.equal(perpendicularDepth(frame, column, 0), 0.01);
      }
      if (width % 2) {
        const center = columnRay(frame, (width - 1) / 2);
        near(center.x, Math.cos(angle));
        near(center.y, Math.sin(angle));
      }
    }
  }
});

test('floor rows map raster sample centers back to the lower half of each viewport', () => {
  for (const [width, height] of viewports) {
    const rasterWidth = Math.min(320, Math.ceil(width / 2));
    const rasterHeight = Math.min(180, Math.ceil(height / 4));
    for (const angle of [0, 0.25, Math.PI / 2]) {
      const camera = { x: 3.5, y: 12.5, angle };
      const frame = createCameraFrame(width, height, camera);
      for (const row of [0, rasterHeight - 1]) {
        const samples = floorRow(frame, row, rasterWidth, rasterHeight);
        const screenY = height / 2 + (row + 0.5) * height / (2 * rasterHeight);
        const focal = width / (2 * Math.tan(35 * Math.PI / 180));
        near(samples.depth, focal * 0.65 / (screenY - height / 2));
        const step = samples.depth * width / (focal * rasterWidth);
        near(samples.stepX, -Math.sin(angle) * step);
        near(samples.stepY, Math.cos(angle) * step);
        for (const column of [0, rasterWidth - 1]) {
          const screen = position(frame, {
            x: samples.x + column * samples.stepX,
            y: samples.y + column * samples.stepY,
            z: 0,
          });
          near(screen.x, (column + 0.5) * width / rasterWidth);
          near(screen.y, screenY);
          near(screen.depth, samples.depth);
        }
      }
    }
  }
});

test('position uses camera-forward depth, default height, and the inclusive 0.08 near plane', () => {
  const frame = createCameraFrame(640, 360, { x: 0, y: 0, angle: 0 });
  const depths = new Float64Array(640).fill(Infinity);
  for (const x of [-1, 0, 0.079999]) {
    assert.equal(position(frame, { x, y: 0 }), null);
    assert.equal(project(frame, { x, y: 0 }, depths), null);
  }
  const atNearPlane = position(frame, { x: 0.08, y: 0 });
  assert.equal(atNearPlane.depth, 0.08);
  near(atNearPlane.y, 180 + (0.65 - 0.5) * atNearPlane.scale);
  assert.ok(project(frame, { x: 0.08, y: 0 }, depths));
  assert.equal(position(null, { x: 1, y: 0 }), null);
  assert.equal(project(null, { x: 1, y: 0 }, depths), null);

  const turned = createCameraFrame(640, 360, { x: 2, y: 3, angle: Math.PI / 2 });
  const screen = position(turned, { x: 1, y: 5, z: 0.65 });
  near(screen.depth, 2);
  near(screen.x, 320 + screen.scale);
  near(screen.y, 180);
});

test('wall visibility is strict and position remains available for occluded or offscreen forest art', () => {
  const frame = createCameraFrame(11, 9, { x: 0, y: 0, angle: 0 });
  const point = { x: 2, y: 0, size: 0.5 };
  for (const wallDepth of [1, 2]) {
    assert.equal(project(frame, point, new Float64Array(11).fill(wallDepth)), null);
  }
  assert.ok(position(frame, point));
  assert.ok(project(frame, point, new Float64Array(11).fill(2 + 1e-9)));
  for (const y of [-100, 100]) {
    const distant = { x: 40, y, z: 3 };
    assert.ok(position(frame, distant));
    assert.equal(project(frame, distant, new Float64Array(11).fill(Infinity)), null);
  }
});

test('partially occluded footprints produce exact separate spans even when the center is hidden', () => {
  const frame = createCameraFrame(11, 9, { x: 0, y: 0, angle: 0 });
  // Footprint is [1, 10); equal-depth columns are hidden, including its center.
  const depths = new Float64Array([3, 3, 2, 1, 3, 2, 3, 3, 3, 2, 3]);
  const screen = project(frame, { x: 2, y: 0, size: 0.5 }, depths);
  assert.deepEqual(screen.visibleSpans, [
    { x: 1, width: 1 }, { x: 4, width: 1 }, { x: 6, width: 3 },
  ]);
});

test('two pixel padding, default radius, viewport clipping, and the final column use exclusive ends', () => {
  const frame = createCameraFrame(11, 9, { x: 0, y: 0, angle: 0 });
  const depths = new Float64Array(11).fill(Infinity);
  assert.deepEqual(project(frame, { x: 2, y: 0, size: 0 }, depths).visibleSpans,
    [{ x: 3, width: 5 }]);
  assert.deepEqual(project(frame, { x: 2, y: 0 }, depths).visibleSpans,
    [{ x: 3, width: 5 }]);
  assert.deepEqual(project(frame, { x: 2, y: 0, size: 100 }, depths).visibleSpans,
    [{ x: 0, width: 11 }]);
  depths.fill(2);
  depths[10] = 3;
  assert.deepEqual(project(frame, { x: 2, y: 0, size: 100 }, depths).visibleSpans,
    [{ x: 10, width: 1 }]);
});

test('frames snapshot player state and helpers leave all inputs and depth buffers unchanged', () => {
  const player = { x: 3.5, y: 12.5, angle: 0.25, health: 5, z: 9 };
  const originalPlayer = { ...player };
  const frame = createCameraFrame(401, 601, player);
  assert.deepEqual(player, originalPlayer);
  assert.notEqual(frame.camera, player);
  assert.deepEqual(frame.camera, { x: 3.5, y: 12.5, angle: 0.25 });
  const point = Object.freeze({ x: 6.5, y: 13.5, z: 0.4, size: 0.2 });
  const depths = new Float64Array(401).fill(Infinity);
  depths[200] = 1;
  const originalDepths = depths.slice();
  const originalFrame = structuredClone(frame);
  Object.freeze(frame.camera);
  Object.freeze(frame);
  const expected = project(frame, point, depths);
  player.x = -10;
  player.y = 20;
  player.angle = Math.PI;
  assert.deepEqual(project(frame, point, depths), expected);
  columnRay(frame, 400);
  perpendicularDepth(frame, 400, 8);
  floorRow(frame, 2, 201, 151);
  position(frame, point);
  assert.deepEqual(frame, originalFrame);
  assert.deepEqual(point, { x: 6.5, y: 13.5, z: 0.4, size: 0.2 });
  assert.deepEqual(depths, originalDepths);
  const frozenDepths = Object.freeze(Array.from(depths));
  assert.deepEqual(project(frame, point, frozenDepths), expected);
});
