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
    cwd: new URL('../', import.meta.url),
    env: { ...process.env, PORT: '0' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  origin = await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Input test server did not start.')), 10000);
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
  await page.goto(origin);
  await page.evaluate(async () => {
    const { createInput } = await import('/src/input.js');
    const { createPlayer, updatePlayer } = await import('/src/player.js');
    const { createWorld } = await import('/src/world.js');
    const canvas = document.querySelector('#game');
    // Keyboard play must work even when the browser has no pointer lock API.
    canvas.requestPointerLock = undefined;
    canvas.focus();
    window.pauses = 0;
    window.mutes = 0;
    window.controls = createInput(canvas, {
      onPause: () => { window.pauses++; },
      onMute: () => { window.mutes++; },
    });
    window.world = createWorld(1);
    window.player = createPlayer(window.world.spawn);
    window.step = seconds => updatePlayer(window.player, window.world, window.controls.sample(), seconds);
  });
});

test('real keyboard input moves, normalizes diagonals, runs, strafes, fires, and invokes commands', async ({ page }) => {
  await page.keyboard.down('ArrowUp');
  const straight = await page.evaluate(() => { step(0.2); return { ...player }; });
  expect(straight.x - 3.5).toBeCloseTo(0.5);
  expect(straight.y).toBe(12.5);
  await page.keyboard.down('d');
  const diagonal = await page.evaluate(() => { step(0.2); return { ...player }; });
  expect(Math.hypot(diagonal.x - straight.x, diagonal.y - straight.y)).toBeCloseTo(0.5);
  await page.keyboard.down('Shift');
  const running = await page.evaluate(() => { step(0.2); return { ...player }; });
  expect(Math.hypot(running.x - diagonal.x, running.y - diagonal.y)).toBeCloseTo(1);
  await page.keyboard.up('ArrowUp');
  await page.keyboard.up('d');
  await page.keyboard.up('Shift');
  await page.keyboard.down('Alt');
  await page.keyboard.down('ArrowLeft');
  expect(await page.evaluate(() => controls.sample())).toMatchObject({ turn: 0, strafe: -1 });
  await page.keyboard.up('Alt');
  expect(await page.evaluate(() => controls.sample())).toMatchObject({ turn: -1, strafe: 0 });
  await page.keyboard.up('ArrowLeft');
  await page.keyboard.down('Control');
  expect(await page.evaluate(() => { step(0); return player.firing; })).toBe(true);
  await page.keyboard.down('m');
  await page.keyboard.down('m');
  expect(await page.evaluate(() => mutes)).toBe(1);
  await page.keyboard.up('m');
  await page.keyboard.press('Escape');
  const paused = await page.evaluate(() => { step(1); return { pauses, player: { ...player }, frame: controls.sample() }; });
  expect(paused.pauses).toBe(1);
  expect(paused.player.firing).toBe(false);
  expect(paused.frame).toMatchObject({ forward: 0, strafe: 0, turn: 0, fire: false, run: false });
  await page.keyboard.up('Control');
});

test('focus loss clears held keys and firing; auto-repeat cannot restore them', async ({ page }) => {
  await page.keyboard.down('w');
  await page.keyboard.down('Space');
  expect(await page.evaluate(() => controls.sample())).toMatchObject({ forward: 1, fire: true });
  await page.evaluate(() => {
    const button = document.createElement('button');
    button.textContent = 'Menu';
    document.body.append(button);
    button.focus();
  });
  expect(await page.evaluate(() => controls.sample())).toMatchObject({ forward: 0, fire: false });
  await page.keyboard.press('ArrowUp');
  expect(await page.evaluate(() => controls.sample())).toMatchObject({ forward: 0 });
  await page.locator('#game').focus();
  await page.keyboard.down('w');
  await page.keyboard.down('Space');
  expect(await page.evaluate(() => controls.sample())).toMatchObject({ forward: 0, fire: false });
  await page.keyboard.up('w');
  await page.keyboard.up('Space');
  await page.keyboard.down('w');
  expect(await page.evaluate(() => controls.sample())).toMatchObject({ forward: 1 });
  await page.keyboard.up('w');
});

test('rejected mouse capture never rejects globally and leaves keyboard play usable', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.evaluate(() => {
    window.rejections = [];
    window.addEventListener('unhandledrejection', event => rejections.push(event.reason.message));
    document.querySelector('#game').requestPointerLock = () => Promise.reject(new Error('Capture refused'));
  });
  await page.locator('#game').click();
  expect(await page.evaluate(async () => controls.requestPointerLock())).toBe(false);
  await page.keyboard.down('ArrowUp');
  expect(await page.evaluate(() => { step(0.1); return player.x; })).toBeGreaterThan(3.5);
  await page.keyboard.up('ArrowUp');
  expect(await page.evaluate(() => rejections)).toEqual([]);
  expect(errors).toEqual([]);
});

test('locked mouse movement consumes horizontal aim once, and lock loss pauses without keydown', async ({ page }) => {
  await page.evaluate(() => {
    const canvas = document.querySelector('#game');
    Object.defineProperty(document, 'pointerLockElement', { configurable: true, value: canvas });
    document.dispatchEvent(new Event('pointerlockchange'));
    document.dispatchEvent(new MouseEvent('mousemove', { movementX: 40, movementY: 999 }));
    step(0);
  });
  expect(await page.evaluate(() => player.angle)).toBeCloseTo(0.1);
  expect(await page.evaluate(() => controls.sample().look)).toBe(0);
  await page.keyboard.down('w');
  await page.keyboard.down('Space');
  await page.evaluate(() => {
    Object.defineProperty(document, 'pointerLockElement', { configurable: true, value: null });
    document.dispatchEvent(new Event('pointerlockchange'));
    step(0.5);
  });
  expect(await page.evaluate(() => ({ ...player }))).toMatchObject({ x: 3.5, y: 12.5, firing: false });
  expect(await page.evaluate(() => pauses)).toBe(1);
  await page.keyboard.up('w');
  await page.keyboard.up('Space');
  await page.keyboard.down('ArrowUp');
  await page.keyboard.down('Control');
  expect(await page.evaluate(() => { step(0.1); return { ...player }; })).toMatchObject({ x: 3.5, y: 12.5, firing: false });
  await page.keyboard.up('ArrowUp');
  await page.keyboard.up('Control');
  await page.evaluate(() => controls.setPaused(false));
  await page.keyboard.down('ArrowUp');
  expect(await page.evaluate(() => { step(0.1); return player.x; })).toBeGreaterThan(3.5);
  await page.keyboard.up('ArrowUp');
});

test('Escape pauses after a real pointer lock request', async ({ page }) => {
  await page.evaluate(() => { delete document.querySelector('#game').requestPointerLock; });
  await page.locator('#game').click();
  await page.waitForFunction(() => document.pointerLockElement === document.querySelector('#game'));
  await page.keyboard.down('w');
  await page.keyboard.down('Control');
  await page.keyboard.press('Escape');
  expect(await page.evaluate(() => pauses)).toBe(1);
  expect(await page.evaluate(() => controls.sample())).toMatchObject({ forward: 0, fire: false });
  await page.keyboard.up('w');
  await page.keyboard.up('Control');
});
