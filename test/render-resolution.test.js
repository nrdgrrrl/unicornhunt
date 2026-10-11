import test from 'node:test';
import assert from 'node:assert/strict';
import { backingSize, resizeDisplayCanvas } from '../src/render-resolution.js';

test('display resolution follows DPR, caps both axes proportionally, and rounds odd sizes', () => {
  for (const [width, height, dpr, expected] of [
    [640, 360, 1, [640, 360]], [640, 360, 2, [1280, 720]],
    [640, 360, 3, [1280, 720]], [1001, 563, 1.25, [1251, 704]],
    [1100, 618.75, 2, [1920, 1080]], [401, 601, 2, [721, 1080]],
    [3840, 2160, 1, [1920, 1080]], [0.1, 0.1, 1, [1, 1]],
  ]) {
    assert.deepEqual(backingSize(width, height, dpr), { width: expected[0], height: expected[1] });
  }
  for (const dpr of [NaN, Infinity, 0, -1]) {
    assert.deepEqual(backingSize(640, 360, dpr), { width: 640, height: 360 });
  }
  for (const invalid of [NaN, Infinity, 0, -1]) {
    assert.throws(() => backingSize(invalid, 360), RangeError);
    assert.throws(() => backingSize(640, invalid), RangeError);
  }
});

test('unchanged or hidden canvases keep their buffers; resize follows display and live DPR', () => {
  let bounds = { width: 640, height: 360 };
  const view = { devicePixelRatio: 1 };
  let dimensions = { width: 640, height: 360 };
  let assignments = 0;
  const canvas = {
    ownerDocument: { defaultView: view },
    getBoundingClientRect: () => bounds,
    get width() { return dimensions.width; },
    set width(value) { assignments++; dimensions.width = value; },
    get height() { return dimensions.height; },
    set height(value) { assignments++; dimensions.height = value; },
  };
  assert.equal(resizeDisplayCanvas(canvas), false);
  assert.equal(assignments, 0);
  view.devicePixelRatio = 2;
  assert.equal(resizeDisplayCanvas(canvas), true);
  assert.deepEqual(dimensions, { width: 1280, height: 720 });
  assert.equal(resizeDisplayCanvas(canvas), false);
  assert.equal(assignments, 2);
  bounds = { width: 0, height: 0 };
  assert.equal(resizeDisplayCanvas(canvas), false);
  assert.equal(assignments, 2);
  bounds = { width: 800, height: 450 };
  assert.equal(resizeDisplayCanvas(canvas), true);
  assert.deepEqual(dimensions, { width: 1600, height: 900 });
});
