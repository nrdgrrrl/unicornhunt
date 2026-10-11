import { test, expect, origin, controlledClock, stepFrames } from './fixtures.js';

test('the live application resizes with its stage and device pixel ratio', async ({ page }) => {
  await controlledClock(page);
  await page.goto(origin);
  const sample = () => page.evaluate(() => {
    const canvas = document.querySelector('#game');
    const { width, height } = canvas.getBoundingClientRect();
    return { width: canvas.width, height: canvas.height, cssWidth: width, cssHeight: height };
  });
  const initial = await sample();
  expect(initial.width).toBe(Math.round(initial.cssWidth));
  expect(initial.height).toBe(Math.round(initial.cssHeight));
  await page.setViewportSize({ width: 803, height: 601 });
  await stepFrames(page);
  const resized = await sample();
  expect(resized.width).toBe(Math.round(resized.cssWidth));
  expect(resized.width).toBeLessThan(initial.width);
  await page.evaluate(() => Object.defineProperty(window, 'devicePixelRatio', { value: 3, configurable: true }));
  await stepFrames(page);
  const dense = await sample();
  expect(dense.width).toBe(Math.round(dense.cssWidth * 2));
  expect(dense.height).toBe(Math.round(dense.cssHeight * 2));
  await page.setViewportSize({ width: 2000, height: 1200 });
  await stepFrames(page);
  expect(await sample()).toMatchObject({ width: 1920, height: 1080 });
});

test('responsive sizing is opt-in and the floor raster stays bounded after resizing', async ({ page }) => {
  await controlledClock(page);
  await page.goto(origin);
  const result = await page.evaluate(async () => {
    const { game } = await import('/main.js');
    game.destroy();
    const { createRenderer } = await import('/src/renderer.js');
    const canvas = document.querySelector('#game');
    canvas.width = 401;
    canvas.height = 601;
    const fixed = createRenderer(canvas);
    fixed.render(game.session);
    const isolated = { width: canvas.width, height: canvas.height };
    const responsive = createRenderer(canvas, { responsive: true });
    const draw = responsive.ctx.drawImage.bind(responsive.ctx);
    const floors = [];
    responsive.ctx.drawImage = (...args) => {
      // The floor is the sole canvas drawn into the lower half of the stage.
      if (args.length === 5 && args[1] === 0 && args[2] === canvas.height / 2) {
        floors.push({ width: args[0].width, height: args[0].height });
      }
      draw(...args);
    };
    Object.defineProperty(window, 'devicePixelRatio', { value: 2 });
    responsive.render(game.session);
    const bounds = canvas.getBoundingClientRect();
    return { isolated, width: canvas.width, height: canvas.height,
      cssWidth: bounds.width, floors, smoothing: responsive.ctx.imageSmoothingEnabled,
      quality: responsive.ctx.imageSmoothingQuality };
  });
  expect(result.isolated).toEqual({ width: 401, height: 601 });
  expect(result.width).toBe(1920);
  expect(result.height).toBe(1080);
  expect(result.floors).toEqual([{ width: 320, height: 180 }]);
  expect(result.smoothing).toBe(true);
  expect(result.quality).toBe('high');
});
