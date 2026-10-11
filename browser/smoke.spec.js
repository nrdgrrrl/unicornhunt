import { test, expect, origin, attachJSON, controlledClock, stepFrames as frames } from './fixtures.js';

async function load(page, query = '') {
  await page.goto(origin + query);
  await page.evaluate(async () => { window.game = (await import('/main.js')).game; });
  await expect(page.getByRole('button', { name: 'Start game', exact: true })).toBeFocused();
  expect(await page.evaluate(() => game.state)).toBe('title');
  await expect(page.getByRole('alert')).toHaveCount(0);
}

async function capture(page, testInfo, name) {
  const path = testInfo.outputPath(`${name}.png`);
  await page.screenshot({ path });
  await testInfo.attach(name, { path, contentType: 'image/png' });
}

test('startup renders a playable scene; conversion, pause, sound, restart, and denied capture work', async ({ page }, testInfo) => {
  await load(page);
  await capture(page, testInfo, 'title');
  await page.keyboard.press('Enter');
  await expect(page.locator('#game')).toBeFocused();
  const pixels = await page.evaluate(() => {
    const canvas = document.querySelector('#game');
    const data = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
    const colors = new Set();
    let opaque = 0;
    for (let i = 0; i < data.length; i += 4) {
      if (data[i + 3] === 255) opaque++;
      colors.add(`${data[i]},${data[i + 1]},${data[i + 2]}`);
    }
    return { colors: colors.size, opaque, total: canvas.width * canvas.height };
  });
  expect(pixels.opaque).toBe(pixels.total);
  expect(pixels.colors).toBeGreaterThan(1000);
  await capture(page, testInfo, 'playable');
  await page.keyboard.down('Space');
  await expect(page.locator('#score')).toHaveText('100');
  await page.keyboard.up('Space');
  await capture(page, testInfo, 'conversion');
  await page.keyboard.press('Escape');
  const elapsed = await page.evaluate(() => game.session.elapsed);
  await page.waitForTimeout(150);
  expect(await page.evaluate(() => game.session.elapsed)).toBe(elapsed);
  await capture(page, testInfo, 'paused-conversion');
  await page.keyboard.press('Enter');
  await expect(page.locator('#game')).toBeFocused();
  await page.keyboard.press('KeyM');
  await expect(page.locator('#mute')).toHaveAttribute('aria-pressed', 'true');
  expect(await page.evaluate(() => game.audio.activeSourceCount)).toBe(0);
  await page.keyboard.press('Escape');
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: 'Restart game' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('#score')).toHaveText('0');
  await expect(page.locator('#health')).toHaveText('5 / 5');
  await expect(page.locator('#mute')).toHaveAttribute('aria-pressed', 'true');
  await page.reload();
  await page.evaluate(async () => { window.game = (await import('/main.js')).game; });
  await expect(page.locator('#mute')).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('Enter');
  await page.evaluate(() => {
    document.querySelector('#game').requestPointerLock = () => Promise.reject(new Error('Capture denied by smoke test'));
  });
  const box = await page.locator('#game').boundingBox();
  await page.mouse.move(box.x + 400, box.y + 200);
  await page.mouse.down();
  await expect(page.locator('#score')).toHaveText('100');
  await page.mouse.up();
  expect(await page.evaluate(() => document.pointerLockElement)).toBe(null);
  await page.keyboard.down('KeyW');
  await expect.poll(() => page.evaluate(() => game.session.player.x)).toBeGreaterThan(3.6);
  await page.keyboard.up('KeyW');
  await expect(page.getByRole('alert')).toHaveCount(0);
});

test('keyboard movement slides along a hedge, shots stop there, and a detour reaches its far side', async ({ page }, testInfo) => {
  await controlledClock(page);
  await load(page);
  await page.evaluate(() => {
    window.shots = [];
    const consume = game.effects.consume.bind(game.effects);
    game.effects.consume = events => { shots.push(...events.filter(e => e.type === 'shot')); consume(events); };
  });
  await page.keyboard.press('Enter');
  await frames(page);
  await page.keyboard.down('Space');
  await frames(page);
  await page.keyboard.up('Space');
  const move = async (keys, count) => {
    for (const key of keys) await page.keyboard.down(key);
    await frames(page, count);
    for (const key of keys) await page.keyboard.up(key);
  };
  await move(['KeyS'], 80); // Reach the western boundary at x = 1.2.
  const contact = await page.evaluate(() => ({ ...game.session.player }));
  expect(contact.x).toBeCloseTo(1.2, 4);
  await move(['KeyS', 'KeyD'], 35); // Continue pressing into it while sliding south.
  const slid = await page.evaluate(() => ({ ...game.session.player }));
  expect(slid.x).toBeCloseTo(contact.x, 4);
  expect(slid.y).toBeGreaterThan(contact.y + 1);
  await move(['KeyA'], 48);
  await move(['ArrowLeft'], 30); // Face the hedge north of (1.2, 11.53).
  const score = await page.evaluate(() => game.session.score);
  await move(['Space'], 1);
  const blocked = await page.evaluate(() => ({ shot: shots.at(-1), player: { ...game.session.player }, score: game.session.score }));
  expect(blocked.score).toBe(score);
  expect(blocked.shot.distance).toBeCloseTo(blocked.player.y - 11, 6);
  await page.keyboard.press('Escape');
  await capture(page, testInfo, 'hedge-stops-rainbow');
  await page.keyboard.press('Enter');
  await frames(page);
  await move(['ArrowRight'], 30); // Face east, detour around row 10's two hedges.
  await move(['KeyW'], 55);
  await move(['KeyA'], 48);
  const detour = await page.evaluate(async () => {
    const { circleCollides } = await import('/src/world.js');
    const { world, player } = game.session;
    return { x: player.x, y: player.y, collision: circleCollides(world, player, player.radius), state: game.state };
  });
  expect(detour.x).toBeGreaterThan(3.4);
  expect(detour.y).toBeLessThan(10);
  expect(detour.collision).toBe(false);
  expect(detour.state).toBe('playing');
  await capture(page, testInfo, 'hedge-detour');
});

for (const controls of ['keyboard', 'mouse']) {
  test(`three generated waves are winnable through ${controls} input without changing game state`, async ({ page, browser }, testInfo) => {
    test.setTimeout(120_000);
    await controlledClock(page);
    await load(page);
    await page.evaluate(() => {
      window.observedEvents = [];
      const consume = game.effects.consume.bind(game.effects);
      game.effects.consume = events => { observedEvents.push(...events); consume(events); };
    });
    await page.keyboard.press('Enter');
    await frames(page); // Establish the app clock.
    // Exercise movement via supported controls before holding the clearing.
    await page.keyboard.down('KeyW');
    await frames(page, 12);
    await page.keyboard.up('KeyW');
    expect(await page.evaluate(() => game.session.player.x)).toBeCloseTo(4);
    let mouseX = 640;
    if (controls === 'mouse') {
      await page.mouse.move(mouseX, 360);
      await page.mouse.down();
      await expect.poll(() => page.evaluate(() => document.pointerLockElement?.id)).toBe('game');
    } else await page.keyboard.down('Space');

    let lastWave = 0;
    for (let iteration = 0; iteration < 3600; iteration++) {
      const status = await page.evaluate(async () => {
        const { hasLineOfSight } = await import('/src/world.js');
        const session = game.session;
        const player = session.player;
        const targets = session.unicorns.filter(u => hasLineOfSight(session.world, player, u));
        targets.sort((a, b) => Math.hypot(a.x - player.x, a.y - player.y) - Math.hypot(b.x - player.x, b.y - player.y));
        const target = targets[0];
        const delta = target ? Math.atan2(target.y - player.y, target.x - player.x) - player.angle : 0;
        return { state: game.state, wave: session.wave, delta: Math.atan2(Math.sin(delta), Math.cos(delta)) };
      });
      if (status.wave !== lastWave) {
        await capture(page, testInfo, `${controls}-wave-${status.wave}`);
        lastWave = status.wave;
      }
      if (status.state !== 'playing') break;
      if (controls === 'keyboard' && Math.abs(status.delta) > Math.PI / 120) {
        const key = status.delta > 0 ? 'ArrowRight' : 'ArrowLeft';
        await page.keyboard.down(key);
        await frames(page, Math.min(6, Math.max(1, Math.round(Math.abs(status.delta) * 60 / Math.PI))));
        await page.keyboard.up(key);
      } else {
        if (controls === 'mouse') {
          mouseX += Math.round(status.delta / 0.0025);
          await page.mouse.move(mouseX, 360);
        }
        await frames(page, 3);
      }
    }
    if (controls === 'keyboard') await page.keyboard.up('Space');
    else await page.mouse.up();
    await expect(page.getByRole('heading', { name: 'Victory!' })).toBeVisible();
    const result = await page.evaluate(() => ({
      state: game.state, seed: game.session.seed, score: game.session.score,
      health: game.session.player.health, armor: game.session.player.armor,
      elapsed: game.session.elapsed,
      conversions: observedEvents.filter(e => e.type === 'glitter').map(e => e.source),
      waves: observedEvents.filter(e => e.type === 'wave').map(e => e.wave),
      damage: observedEvents.filter(e => e.type === 'damage'),
      pickups: observedEvents.filter(e => e.type === 'pickup'),
      rosesFired: observedEvents.filter(e => e.type === 'rose-fired').length,
    }));
    expect(result.waves).toEqual([1, 2, 3]);
    expect(result.conversions).toHaveLength(24);
    expect(new Set(result.conversions).size).toBe(24);
    expect(result.health).toBeGreaterThan(0);
    expect(result.armor).toBeGreaterThanOrEqual(0);
    expect(result.armor).toBeLessThanOrEqual(5);
    await attachJSON(testInfo, 'playthrough-result', {
      ...result, controls, browser: browser.version(), clock: 'controlled 60 Hz',
      humanPlaytest: false,
    });
    await capture(page, testInfo, `${controls}-victory`);
  });
}

test('generated unicorn contact causes defeat and keyboard Play again resets the round', async ({ page }, testInfo) => {
  await controlledClock(page);
  await load(page);
  await page.keyboard.press('Enter');
  await frames(page);
  for (let batch = 0; batch < 60 && await page.evaluate(() => game.state === 'playing'); batch++) await frames(page, 60);
  await expect(page.getByRole('heading', { name: 'Defeat', exact: true })).toBeVisible();
  await expect(page.locator('#health')).toHaveText('0 / 5');
  await expect(page.getByRole('button', { name: 'Play again' })).toBeFocused();
  await capture(page, testInfo, 'defeat');
  await page.keyboard.press('Enter');
  await expect(page.locator('#game')).toBeFocused();
  expect(await page.evaluate(() => game.state)).toBe('playing');
  await expect(page.locator('#health')).toHaveText('5 / 5');
});

test('combined roses, supplies, and maximum glitter record frame times and reduced-motion presentation', async ({ page, browser }, testInfo) => {
  await load(page);
  await page.keyboard.press('Enter');
  // Synthetic stress fixture, never used for balance/playthrough claims. Keep
  // the generated world and production clock, simulation, renderer, and RAF.
  const result = await page.evaluate(async () => {
    const { spawnRose } = await import('/src/projectiles.js');
    const { MAX_ROSES, HEALTH_PICKUPS_PER_WAVE, ARMOR_PICKUPS_PER_WAVE } = await import('/src/config.js');
    const session = game.session;
    // Stop the generated herd from ending the sample. The protected spawn
    // corridor already provides hedge-free space for all eight real supplies.
    for (const unicorn of session.unicorns) {
      unicorn.speed = 0;
      unicorn.attack.cooldownFor = 600;
    }
    session.pickups.forEach((pickup, i) => {
      pickup.x = 5 + (i % 4) * 0.6;
      pickup.y = 11.65 + Math.floor(i / 4) * 1.7;
    });
    const consume = game.effects.consume;
    const replenish = () => {
      while (session.roses.length < MAX_ROSES) {
        const i = session.nextRoseId % MAX_ROSES;
        spawnRose(session, { id: 'stress-fixture', x: 4.75 + (i % 8) * 0.45,
          y: 11.65 + Math.floor(i / 8) * 0.5 }, { x: 1, y: 0 });
      }
      const { x, y, angle } = session.player;
      consume.call(game.effects, Array.from({ length: 6 }, () => ({
        type: 'glitter', x: x + 2 * Math.cos(angle), y: y + 2 * Math.sin(angle),
      })));
    };
    // App event consumption runs after simulation and before drawing. Refill
    // there so every measured render has moving roses and the full star cap.
    game.effects.consume = events => { consume.call(game.effects, events); replenish(); };
    window.finishBusySample = () => { game.effects.consume = consume; };
    replenish();
    return new Promise(resolve => {
      const intervals = [];
      const counts = [];
      let previous;
      let warmup = 30;
      function measure(now) {
        if (previous !== undefined && warmup === 0) {
          intervals.push(now - previous);
          counts.push({ roses: session.roses.length, particles: game.effects.particleCount,
            healthSupplies: session.pickups.filter(item => item.kind === 'health').length,
            armorSupplies: session.pickups.filter(item => item.kind === 'armor').length });
        }
        if (warmup > 0) warmup--;
        previous = now;
        if (intervals.length < 180) requestAnimationFrame(measure);
        else {
          const sorted = [...intervals].sort((a, b) => a - b);
          const percentile = fraction => sorted[Math.ceil(sorted.length * fraction) - 1];
          const range = key => ({ min: Math.min(...counts.map(sample => sample[key])),
            max: Math.max(...counts.map(sample => sample[key])) });
          let streak = 0;
          let maxStreak = 0;
          for (const ms of intervals) { streak = ms > 33 ? streak + 1 : 0; maxStreak = Math.max(maxStreak, streak); }
          resolve({ seed: session.seed, clock: 'native requestAnimationFrame', fixture: 'synthetic combined stress',
            warmupFrames: 30, samples: intervals.length, medianMs: percentile(0.5),
            p95Ms: percentile(0.95), p99Ms: percentile(0.99), maxMs: sorted.at(-1),
            over33Ms: intervals.filter(ms => ms > 33).length, maxConsecutiveOver33Ms: maxStreak,
            activeRoses: range('roses'), particles: range('particles'),
            healthSupplies: range('healthSupplies'), armorSupplies: range('armorSupplies'),
            expectedRoses: MAX_ROSES, expectedHealthSupplies: HEALTH_PICKUPS_PER_WAVE,
            expectedArmorSupplies: ARMOR_PICKUPS_PER_WAVE,
            state: game.state, intervalsMs: intervals,
            userAgent: navigator.userAgent, hardwareConcurrency: navigator.hardwareConcurrency });
        }
      }
      requestAnimationFrame(measure);
    });
  });
  expect(result.state).toBe('playing');
  expect(result.activeRoses).toEqual({ min: result.expectedRoses, max: result.expectedRoses });
  expect(result.particles).toEqual({ min: 144, max: 144 });
  expect(result.healthSupplies).toEqual({ min: result.expectedHealthSupplies, max: result.expectedHealthSupplies });
  expect(result.armorSupplies).toEqual({ min: result.expectedArmorSupplies, max: result.expectedArmorSupplies });
  await attachJSON(testInfo, 'combined-busy-performance', { ...result, browser: browser.version() });
  // Host performance varies; report slow streaks for investigation, not a flaky CI gate.
  await capture(page, testInfo, 'combined-busy-scene');
  await page.evaluate(() => window.finishBusySample());
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect.poll(() => page.evaluate(() => game.effects.reducedMotion)).toBe(true);
  await page.keyboard.press('Escape');
  await page.keyboard.press('Tab');
  await page.keyboard.press('Enter');
  await page.keyboard.down('Space');
  await expect(page.locator('#score')).toHaveText('100');
  await page.keyboard.up('Space');
  await capture(page, testInfo, 'reduced-motion-scene');
  await page.keyboard.press('Escape');
  expect(await page.evaluate(() => game.effects.particleCount)).toBeLessThanOrEqual(6);
  await capture(page, testInfo, 'reduced-motion-conversion');
});
