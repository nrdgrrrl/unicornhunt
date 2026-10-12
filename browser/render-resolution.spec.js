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

test.describe('native DPR 2 display', () => {
  test.use({ deviceScaleFactor: 2 });

  test('the live app handles odd CSS sizes and proportional caps without changing simulation state', async ({ page }) => {
    await controlledClock(page);
    await page.setViewportSize({ width: 803, height: 601 });
    await page.goto(origin);
    const initial = await page.evaluate(async () => {
      const { game } = await import('/main.js');
      return JSON.stringify(game.session);
    });
    for (const [viewport, css, backing] of [
      [{ width: 803, height: 601 }, [797, 448.3125], [1594, 897]],
      [{ width: 2000, height: 1200 }, [1100, 618.75], [1920, 1080]],
      [{ width: 401, height: 601 }, [395, 222.1875], [790, 444]],
    ]) {
      await page.setViewportSize(viewport);
      await stepFrames(page);
      const result = await page.evaluate(async () => {
        const { game } = await import('/main.js');
        const canvas = document.querySelector('#game');
        const bounds = canvas.getBoundingClientRect();
        const ctx = canvas.getContext('2d');
        return { css: [bounds.width, bounds.height], backing: [canvas.width, canvas.height],
          dpr: devicePixelRatio, state: JSON.stringify(game.session),
          smoothing: ctx.imageSmoothingEnabled, quality: ctx.imageSmoothingQuality };
      });
      expect(result.dpr).toBe(2);
      expect(result.css).toEqual(css);
      expect(result.backing).toEqual(backing);
      expect(result.state).toBe(initial);
      expect(result.smoothing).toBe(true);
      expect(result.quality).toBe('high');
    }
  });
});
