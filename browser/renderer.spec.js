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

test('hedges fully hide cakes, charms, and roses and clip their visible edge without leaks', async ({ page }) => {
  const results = await page.evaluate(() => {
    return ['health', 'armor', 'rose'].map(kind => {
      session.pickups = [];
      session.roses = [];
      for (let y = 0; y < session.world.height; y++) session.world.tiles[y * session.world.width + 5] = 1;
      const background = capture();
      const place = y => {
        const item = { id: kind, kind, x: 6.5, y, z: 0.5, remaining: 3 };
        if (kind === 'rose') session.roses = [item];
        else session.pickups = [item];
      };
      place(12.5);
      const hidden = capture() === background;
      for (let y = 13; y < session.world.height; y++) session.world.tiles[y * session.world.width + 5] = 0;
      session.pickups = [];
      session.roses = [];
      capture();
      const before = renderer.ctx.getImageData(0, 0, 640, 360).data;
      place(13.46);
      capture();
      const after = renderer.ctx.getImageData(0, 0, 640, 360).data;
      const screen = renderer.project({ x: 6.5, y: 13.46,
        z: kind === 'rose' ? 0.5 : 0.21, size: kind === 'rose' ? 0.12 : 0.168 });
      let changed = 0;
      let leaked = 0;
      for (let i = 0; i < after.length; i += 4) {
        if (after.slice(i, i + 3).every((value, channel) => value === before[i + channel])) continue;
        changed++;
        const x = i / 4 % 640;
        if (!screen.visibleSpans.some(span => x >= span.x && x < span.x + span.width)) leaked++;
      }
      return { kind, hidden, changed, leaked, centerBlocked: screen.visibleSpans[0].x > screen.x };
    });
  });
  for (const result of results) {
    expect(result.hidden, result.kind).toBe(true);
    expect(result.changed, result.kind).toBeGreaterThan(20);
    expect(result.leaked, result.kind).toBe(0);
    expect(result.centerBlocked, result.kind).toBe(true);
  }
});

test('all entity arrays have stable pixels including coincident depth ties', async ({ page }) => {
  const result = await page.evaluate(() => {
    session.world.decorations = ['flower', 'rock'].map(type => ({ type, x: 7.5, y: 12.5, size: 0.4 }));
    session.unicorns = ['b', 'a'].map(id => ({ id, x: 6.5, y: 12.5, alive: true }));
    session.pickups = ['health', 'armor'].map(kind => ({ id: kind, kind, x: 6.5, y: 12.5 }));
    session.roses = [0.5, 0.7].map((z, index) => ({ id: `rose:${index}`, x: 6.5, y: 12.5, z, remaining: 3 }));
    const first = capture();
    for (const items of [session.world.decorations, session.unicorns, session.pickups, session.roses]) items.reverse();
    const reordered = capture();
    const snapshot = JSON.stringify(session);
    const freeze = value => {
      if (value && typeof value === 'object' && !ArrayBuffer.isView(value)) {
        Object.values(value).forEach(freeze);
        Object.freeze(value);
      }
    };
    freeze(session);
    Math.random = () => { throw new Error('Rendering consumed randomness'); };
    return { reordered: reordered === first, repeated: capture() === first && capture() === first,
      unchanged: JSON.stringify(session) === snapshot };
  });
  expect(result).toEqual({ reordered: true, repeated: true, unchanged: true });
});

test('emitted rose draws on the rear rump and remains visible with reduced motion', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const { rearSocket, updateRangedAttacks } = await import('/src/ranged-attacks.js');
    const { UNICORN_REAR_RUMP_ANCHOR: anchor } = await import('/src/art.js');
    const unicorn = { id: 'source', x: 6.5, y: 12.5, angle: 0, alive: true,
      attack: { phase: 'windup', facing: 0, remaining: 0.01, cooldownFor: 0, target: { x: 3.5, y: 12.5 } } };
    session.unicorns = [unicorn];
    session.roses = [];
    session.nextRoseId = 0;
    // Use a real simulation emission, without advancing the newly born rose.
    updateRangedAttacks(session.unicorns, session.world, session.player, session, 0.01);
    const snapshot = JSON.stringify(session);
    const drawn = [];
    const draw = renderer.ctx.drawImage.bind(renderer.ctx);
    renderer.ctx.drawImage = (...args) => {
      if (args[0] === art.unicornRear || args[0] === art.rose) {
        drawn.push({ name: args[0] === art.rose ? 'rose' : 'rear',
          x: args[1], y: args[2], width: args[3], height: args[4] });
      }
      draw(...args);
    };
    const normal = capture();
    const [rear, rose] = drawn;
    const rump = { x: rear.x + anchor.x / 128 * rear.width, y: rear.y + anchor.y / 160 * rear.height };
    const center = { x: rose.x + rose.width / 2, y: rose.y + rose.height / 2 };
    const socket = renderer.project({ ...rearSocket(unicorn), z: 0.5 });
    // The petals visibly replace cream rump pixels above the exact origin.
    const sample = () => Array.from(renderer.ctx.getImageData(Math.round(rump.x) - 10,
      Math.round(rump.y) - 14, 20, 14).data);
    const withRose = sample();
    renderer.setReducedMotion(true);
    const reducedSame = capture() === normal;
    renderer.update(0.1, 0.5);
    renderer.consume([{ type: 'shot' }]);
    const reducedStill = capture() === normal;
    const unchanged = JSON.stringify(session) === snapshot;
    session.roses = [];
    capture();
    const withoutRose = sample();
    session.unicorns[0].attack.phase = 'idle';
    const idle = capture();
    session.unicorns[0].attack.phase = 'windup';
    const windup = capture();
    return { order: drawn.slice(0, 2).map(item => item.name), rump, center, socket,
      visibleRose: withRose.some((value, i) => value !== withoutRose[i]),
      reducedSame, reducedStill, unchanged, visibleWindup: windup !== idle };
  });
  expect(result.order).toEqual(['rear', 'rose']);
  expect(result.rump.x).toBeCloseTo(result.center.x, 8);
  expect(result.rump.y).toBeCloseTo(result.center.y, 8);
  expect(result.rump.x).toBeCloseTo(result.socket.x, 8);
  expect(result.rump.y).toBeCloseTo(result.socket.y, 8);
  for (const property of ['visibleRose', 'reducedSame', 'reducedStill', 'unchanged', 'visibleWindup']) {
    expect(result[property], property).toBe(true);
  }
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
