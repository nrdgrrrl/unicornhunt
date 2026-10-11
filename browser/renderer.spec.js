import { test, expect, origin } from './fixtures.js';

test.beforeEach(async ({ page }) => {
  await page.goto(origin);
  await page.evaluate(async () => {
    const { game } = await import('/main.js');
    game.destroy();
    const { createRenderer } = await import('/src/renderer.js');
    const { createArt } = await import('/src/art.js');
    const { createWorld } = await import('/src/world.js');
    const { createPlayer } = await import('/src/player.js');
    window.canvas = document.querySelector('#game');
    window.renderer = createRenderer(canvas);
    window.art = createArt();
    const world = createWorld(1);
    world.tiles.fill(0);
    world.decorations = [];
    window.session = { world, player: createPlayer({ x: 3.5, y: 12.5, angle: 0 }), unicorns: [] };
    window.capture = () => { renderer.render(session); return canvas.toDataURL(); };
  });
});

test('perpendicular wall depth keeps planar hedges straight while turning', async ({ page }) => {
  const result = await page.evaluate(() => {
    for (let y = 0; y < session.world.height; y++) session.world.tiles[y * session.world.width + 7] = 1;
    const draw = renderer.ctx.drawImage.bind(renderer.ctx);
    const walls = [];
    renderer.ctx.drawImage = (...args) => {
      if (args[0] === art.hedge) walls.push({ x: args[5], top: args[6], height: args[8] });
      draw(...args);
    };
    capture();
    const flatSpread = Math.max(...walls.map(wall => wall.top)) - Math.min(...walls.map(wall => wall.top));
    walls.length = 0;
    session.player.angle = 0.25;
    capture();
    // A rotated plane has linear top and bottom edges in screen space.
    const steps = walls.slice(1).map((wall, i) => wall.top - walls[i].top);
    const slopeSpread = Math.max(...steps) - Math.min(...steps);
    const focal = 640 / (2 * Math.tan(35 * Math.PI / 180));
    return { flatSpread, slopeSpread,
      actualHeight: walls[320].height,
      expectedHeight: focal * (Math.cos(0.25) - Math.sin(0.25) * 0.5 / focal) / 3.5 };
  });
  expect(result.flatSpread).toBeLessThan(1e-8);
  expect(result.slopeSpread).toBeLessThan(1e-8);
  expect(result.actualHeight).toBeCloseTo(result.expectedHeight, 8);
});

test('70 degree projection and 0.65 tile eye height survive odd sizes and aspect changes', async ({ page }) => {
  const results = await page.evaluate(() => {
    return [[640, 360], [1001, 563], [401, 601]].map(([width, height]) => {
      canvas.width = width;
      canvas.height = height;
      capture();
      const center = renderer.project({ x: 5.5, y: 12.5, z: 0.65 });
      const ground = renderer.project({ x: 5.5, y: 12.5, z: 0 });
      const edge = renderer.project({ x: 5.5, y: 12.5 + 2 * Math.tan(35 * Math.PI / 180), z: 0.65 });
      const lastColumn = renderer.project({ x: 5.5, y: 12.5 + (width - 1 - width / 2) / center.scale, z: 0.65, size: 0.001 });
      return { width, height, center, ground, edge, lastColumn };
    });
  });
  for (const { width, height, center, ground, edge, lastColumn } of results) {
    expect(center.x).toBe(width / 2);
    expect(center.y).toBe(height / 2);
    expect(center.depth).toBe(2);
    expect(center.scale).toBeCloseTo(width / (4 * Math.tan(35 * Math.PI / 180)), 8);
    expect(ground.y).toBeCloseTo(height / 2 + center.scale * 0.65, 8);
    expect(edge.x).toBeCloseTo(width, 8);
    expect(lastColumn.visibleSpans.some(span => span.x + span.width === width)).toBe(true);
  }
});

test('hedges hide unicorns and clip partially visible billboard columns', async ({ page }) => {
  const result = await page.evaluate(() => {
    for (let y = 0; y < session.world.height; y++) session.world.tiles[y * session.world.width + 5] = 1;
    const background = capture();
    session.unicorns = [{ x: 6.5, y: 12.5, alive: true }];
    const hidden = capture() === background;
    // Remove the wall to one side of the unicorn. Its center stays blocked.
    for (let y = 13; y < session.world.height; y++) session.world.tiles[y * session.world.width + 5] = 0;
    session.unicorns = [];
    capture();
    const before = renderer.ctx.getImageData(0, 0, 640, 360).data;
    session.unicorns = [{ x: 6.5, y: 13.35, alive: true }];
    capture();
    const after = renderer.ctx.getImageData(0, 0, 640, 360).data;
    const screen = renderer.project({ x: 6.5, y: 13.35, z: 0.475, size: 0.38 });
    let changed = 0;
    let leaked = 0;
    for (let i = 0; i < after.length; i += 4) {
      if (after[i] === before[i] && after[i + 1] === before[i + 1] && after[i + 2] === before[i + 2]) continue;
      changed++;
      const x = i / 4 % 640;
      if (!screen.visibleSpans.some(span => x >= span.x && x < span.x + span.width)) leaked++;
    }
    return { hidden, changed, leaked, spans: screen.visibleSpans,
      behindCamera: renderer.project({ x: 2.5, y: 12.5 }) };
  });
  expect(result.hidden).toBe(true);
  expect(result.changed).toBeGreaterThan(20);
  expect(result.leaked).toBe(0);
  expect(result.spans[0].x).toBeGreaterThan(350);
  expect(result.behindCamera).toBeNull();
});

test('near unicorns and decorative props draw over farther billboards regardless of input order', async ({ page }) => {
  const result = await page.evaluate(() => {
    const near = { x: 5.5, y: 12.5, alive: true };
    const far = { x: 7.5, y: 12.5, alive: true };
    session.unicorns = [near, far];
    session.world.decorations = [{ type: 'flower', x: 6.5, y: 12.5, size: 0.4 }];
    const drawn = [];
    const draw = renderer.ctx.drawImage.bind(renderer.ctx);
    renderer.ctx.drawImage = (...args) => {
      if (args[0] === art.unicorn || args[0] === art.flower) drawn.push({ flower: args[0] === art.flower, height: args[4] });
      draw(...args);
    };
    const first = capture();
    session.unicorns.reverse();
    const reversed = capture();
    const combined = renderer.ctx.getImageData(313, 232, 10, 10).data;
    session.unicorns = [near];
    session.world.decorations = [];
    capture();
    const nearOnly = renderer.ctx.getImageData(313, 232, 10, 10).data;
    return { orderIndependent: first === reversed, order: drawn.slice(0, 3),
      covered: combined.every((channel, i) => channel === nearOnly[i]) };
  });
  expect(result.orderIndependent).toBe(true);
  expect(result.order.map(item => item.flower)).toEqual([false, true, false]);
  expect(result.order[0].height).toBeLessThan(result.order[2].height);
  expect(result.covered).toBe(true);
});

test('cached paper, trees, grass, and sprites stay still; walking and recoil change only the weapon', async ({ page }) => {
  const result = await page.evaluate(() => {
    session.unicorns = [{ x: 6.5, y: 12.5, alive: true }];
    const still = capture();
    Math.random = () => { throw new Error('Rendering regenerated random artwork'); };
    const stable = capture() === still;
    renderer.update(0.05, 0.125);
    const walking = capture();
    const walkFrozen = capture() === walking;
    renderer.consume([{ type: 'shot' }]);
    const recoiling = capture();
    const recoilFrozen = capture() === recoiling;
    renderer.setReducedMotion(true);
    renderer.update(0.1, 0.5);
    renderer.consume([{ type: 'shot' }]);
    const reduced = capture();
    renderer.update(0.1, 0.5);
    return { stable, walkChanged: walking !== still, recoilChanged: recoiling !== walking,
      walkFrozen, recoilFrozen, reducedStill: reduced === still && capture() === still };
  });
  expect(result).toEqual({ stable: true, walkChanged: true, recoilChanged: true,
    walkFrozen: true, recoilFrozen: true, reducedStill: true });
});

test('the running game freezes walking on pause and observes live reduced motion', async ({ page }) => {
  // Reload to use the real bootstrap instead of the isolated renderer.
  await page.reload();
  await page.evaluate(async () => { window.game = (await import('/main.js')).game; });
  await page.getByRole('button', { name: 'Start game', exact: true }).click();
  await page.keyboard.down('w');
  await expect.poll(() => page.evaluate(() => game.session.player.x)).toBeGreaterThan(3.65);
  await page.keyboard.press('Escape');
  await page.keyboard.up('w');
  const before = await page.evaluate(() => document.querySelector('#game').toDataURL());
  await page.evaluate(() => new Promise(resolve => {
    let frames = 0;
    const next = () => ++frames === 6 ? resolve() : requestAnimationFrame(next);
    requestAnimationFrame(next);
  }));
  expect(await page.evaluate(() => document.querySelector('#game').toDataURL())).toBe(before);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect.poll(() => page.evaluate(() => game.effects.reducedMotion)).toBe(true);
  await expect.poll(() => page.evaluate(previous => document.querySelector('#game').toDataURL() !== previous, before)).toBe(true);
});
