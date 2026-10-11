import { test, expect } from '@playwright/test';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';

const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
  || (existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined);
test.use({ launchOptions: { executablePath } });
let server;
let origin;
test.beforeAll(async () => {
  server = spawn(process.execPath, ['tools/serve.mjs'], {
    cwd: new URL('../', import.meta.url), env: { ...process.env, PORT: '0' }, stdio: ['ignore', 'pipe', 'pipe'],
  });
  origin = await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Effects test server did not start.')), 10000);
    server.once('error', error => { clearTimeout(timeout); reject(error); });
    server.once('exit', code => { clearTimeout(timeout); reject(new Error(`Test server exited: ${code}`)); });
    server.stdout.on('data', data => {
      const url = data.toString().match(/http:\/\/127\.0\.0\.1:\d+/);
      if (url) { clearTimeout(timeout); resolve(url[0]); }
    });
  });
});
test.afterAll(() => { server?.kill(); });

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    const NativeContext = window.AudioContext;
    window.audioContexts = [];
    window.AudioContext = class extends NativeContext {
      constructor(...args) { super(...args); window.audioContexts.push(this); }
    };
  });
  await page.goto(origin);
  await page.evaluate(async () => { window.game = (await import('/main.js')).game; });
});

test('the game gates audio on Start, drains a conversion, and freezes/silences on pause', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  expect(await page.evaluate(() => audioContexts.length)).toBe(0);
  await page.getByRole('button', { name: 'Start game', exact: true }).click();
  await expect.poll(() => page.evaluate(() => audioContexts[0]?.state)).toBe('running');
  await page.keyboard.down('Space');
  await expect.poll(() => page.evaluate(() => game.session.score)).toBe(100);
  await page.keyboard.up('Space');
  const hit = await page.evaluate(() => ({ particles: game.effects.particleCount, alive: game.session.unicorns[0].alive, events: game.session.events.length }));
  expect(hit.particles).toBe(24);
  expect(hit.alive).toBe(false);
  expect(hit.events).toBe(0);
  await page.keyboard.press('Escape');
  const paused = await page.evaluate(() => ({ state: game.state, particles: game.effects.particleCount, elapsed: game.session.elapsed, sources: game.audio.activeSourceCount }));
  expect(paused.state).toBe('paused');
  expect(paused.sources).toBe(0);
  await expect.poll(() => page.evaluate(() => audioContexts[0].state)).toBe('suspended');
  // Render several frames while paused to verify simulation/effect time freezes.
  await page.evaluate(() => new Promise(resolve => {
    let frames = 0;
    const next = () => ++frames === 5 ? resolve() : requestAnimationFrame(next);
    requestAnimationFrame(next);
  }));
  expect(await page.evaluate(() => game.session.elapsed)).toBe(paused.elapsed);
  expect(await page.evaluate(() => game.effects.particleCount)).toBe(paused.particles);
  await page.getByRole('button', { name: 'Resume game' }).click();
  await expect.poll(() => page.evaluate(() => audioContexts[0].state)).toBe('running');
  expect(await page.evaluate(() => audioContexts.length)).toBe(1);
  expect(errors).toEqual([]);
});

test('muting stops current sources, persists on reload, and bounds real audio sources', async ({ page }) => {
  await page.getByRole('button', { name: 'Start game', exact: true }).click();
  await expect.poll(() => page.evaluate(() => audioContexts[0]?.state)).toBe('running');
  const sources = await page.evaluate(() => {
    game.audio.consume(Array.from({ length: 100 }, () => ({ type: 'shot' })));
    return game.audio.activeSourceCount;
  });
  expect(sources).toBe(12);
  // A longer cue makes the immediate mute assertion independent of frame rate.
  await page.evaluate(() => game.audio.consume([{ type: 'victory' }]));
  await page.getByRole('button', { name: 'Mute sound', exact: true }).click();
  expect(await page.evaluate(() => game.audio.activeSourceCount)).toBe(0);
  await page.reload();
  await expect(page.getByRole('button', { name: 'Unmute sound', exact: true })).toHaveAttribute('aria-pressed', 'true');
  expect(await page.evaluate(() => audioContexts.length)).toBe(0);
});

test('live reduced-motion preference keeps conversions visible with six stars', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect.poll(() => page.evaluate(() => game.effects.reducedMotion)).toBe(true);
  await page.getByRole('button', { name: 'Start game', exact: true }).click();
  await page.keyboard.down('Space');
  await expect.poll(() => page.evaluate(() => game.session.score)).toBe(100);
  await page.keyboard.up('Space');
  expect(await page.evaluate(() => game.effects.particleCount)).toBe(6);
});

test('real canvas stars expand, stay multicolored, and are fully clipped behind a hedge', async ({ page }) => {
  const result = await page.evaluate(async () => {
    game.destroy();
    const { createRenderer } = await import('/src/renderer.js');
    const { createEffects } = await import('/src/effects.js');
    const { createWorld, HEDGE } = await import('/src/world.js');
    const { createPlayer } = await import('/src/player.js');
    const { RAINBOW } = await import('/src/art.js');
    const canvas = document.querySelector('#game');
    const renderer = createRenderer(canvas);
    const world = createWorld(1);
    world.decorations = [];
    const session = { world, player: createPlayer(world.spawn), unicorns: [] };
    const effects = createEffects();
    const colors = RAINBOW.map(color => [1, 3, 5].map(index => parseInt(color.slice(index, index + 2), 16)));
    renderer.render(session);
    effects.consume([{ type: 'shot', x: 3.5, y: 12.5, angle: 0, distance: 2.75 }]);
    effects.render(renderer.ctx, renderer.project);
    const ribbon = renderer.ctx.getImageData(0, 0, 640, 360).data;
    const ribbonColors = new Set();
    for (let y = 180; y < 275; y++) for (let x = 305; x < 335; x++) {
      const i = (y * 640 + x) * 4;
      colors.forEach((color, index) => {
        if (color.every((channel, c) => Math.abs(channel - ribbon[i + c]) < 10)) ribbonColors.add(index);
      });
    }
    effects.clear();
    renderer.render(session);
    const before = renderer.ctx.getImageData(0, 0, 640, 360).data;
    effects.consume([{ type: 'glitter', x: 6.5, y: 12.5 }]);
    effects.update(0.2, world); // Hit indicator expired; measure only world stars.
    effects.render(renderer.ctx, renderer.project);
    const expanded = renderer.ctx.getImageData(0, 0, 640, 360).data;
    const changed = [];
    const found = new Set();
    for (let i = 0; i < expanded.length; i += 4) {
      if (expanded[i] === before[i] && expanded[i + 1] === before[i + 1] && expanded[i + 2] === before[i + 2]) continue;
      changed.push({ x: (i / 4) % 640, y: Math.floor(i / 4 / 640) });
      // Alpha blending mixes each pastel with the paper/floor beneath it.
      colors.forEach((color, index) => {
        const blended = color.map((channel, c) => Math.round(channel * 0.75 + before[i + c] * 0.25));
        if (blended.every((channel, c) => Math.abs(channel - expanded[i + c]) < 8)) found.add(index);
      });
    }
    // Put a whole vertical hedge between the camera and the same stars.
    for (let y = 1; y < world.height - 1; y++) world.tiles[y * world.width + 5] = HEDGE;
    renderer.render(session);
    const wallBefore = canvas.toDataURL();
    effects.render(renderer.ctx, renderer.project);
    const wallAfter = canvas.toDataURL();
    const spans = renderer.project({ x: 4.5, y: 12.5, z: 0.5, size: 0.1 });
    const behind = renderer.project({ x: 6.5, y: 12.5, z: 0.5, size: 0.1 });
    return {
      changed: changed.length, colors: found.size, ribbonColors: ribbonColors.size,
      spread: Math.max(...changed.map(point => point.x)) - Math.min(...changed.map(point => point.x)),
      occluded: wallBefore === wallAfter, frontVisible: !!spans, behindHidden: behind === null,
    };
  });
  expect(result.changed).toBeGreaterThan(100);
  expect(result.colors).toBe(6);
  expect(result.ribbonColors).toBe(6);
  expect(result.spread).toBeGreaterThan(40);
  expect(result.occluded).toBe(true);
  expect(result.frontVisible).toBe(true);
  expect(result.behindHidden).toBe(true);
});

test('unavailable Web Audio leaves a playable, silent game', async ({ page }) => {
  await page.reload();
  await page.evaluate(async () => {
    window.AudioContext = undefined;
    window.webkitAudioContext = undefined;
    window.game = (await import('/main.js')).game;
  });
  await page.getByRole('button', { name: 'Start game', exact: true }).click();
  await page.keyboard.down('Space');
  await expect.poll(() => page.evaluate(() => game.session.score)).toBe(100);
  await page.keyboard.up('Space');
  expect(await page.evaluate(() => game.audio.unavailable)).toBe(true);
  expect(await page.evaluate(() => game.state)).toBe('playing');
});

test('wave, damage, victory, and defeat transitions reach both feedback consumers', async ({ page }) => {
  await page.evaluate(() => {
    window.feedback = { audio: [], effects: [] };
    for (const name of ['audio', 'effects']) {
      const consume = game[name].consume.bind(game[name]);
      game[name].consume = events => { feedback[name].push(...events.map(event => event.type)); consume(events); };
    }
  });
  await page.getByRole('button', { name: 'Start game', exact: true }).click();
  for (let wave = 1; wave <= 3; wave++) {
    await page.evaluate(() => { for (const unicorn of game.session.unicorns) unicorn.alive = false; });
    await expect.poll(() => page.evaluate(() => game.session.wave === 3 && game.state === 'victory' ? 4 : game.session.wave)).toBe(wave + 1);
  }
  await expect(page.locator('#message')).toContainText('All unicorns glittered!');
  expect(await page.evaluate(() => feedback.audio)).toEqual(['wave', 'wave', 'wave', 'victory']);
  expect(await page.evaluate(() => feedback.effects)).toEqual(['wave', 'wave', 'wave', 'victory']);
  await page.getByRole('button', { name: 'Play again' }).click();
  await page.evaluate(() => {
    game.session.player.magic = 20;
    game.session.unicorns[0].x = game.session.player.x;
    game.session.unicorns[0].y = game.session.player.y;
  });
  await expect(page.locator('#message')).toContainText('Your magic ran out.');
  expect(await page.evaluate(() => game.state)).toBe('defeat');
  expect(await page.evaluate(() => feedback.audio.slice(-2))).toEqual(['damage', 'defeat']);
  expect(await page.evaluate(() => feedback.effects.slice(-2))).toEqual(['damage', 'defeat']);
});
