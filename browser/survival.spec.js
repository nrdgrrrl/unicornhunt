import { test, expect, origin, controlledClock, stepFrames as step, attachJSON } from './fixtures.js';

async function load(page) {
  await page.goto(origin);
  await page.evaluate(async () => {
    window.game = (await import('/main.js')).game;
    window.feedback = { effects: [], audio: [] };
    for (const name of ['effects', 'audio']) {
      const consume = game[name].consume.bind(game[name]);
      game[name].consume = events => { feedback[name].push(...structuredClone(events)); consume(events); };
    }
  });
  await page.keyboard.press('Enter');
  await step(page); // Establish the production clock without a simulation tick.
}

test.beforeEach(async ({ page }) => {
  await controlledClock(page);
  await load(page);
});

// Controlled scenarios retain real entities and the app's movement, collection,
// combat, event consumers, HUD, and renderer. Natural smoke rounds never use this.
async function arrange(page, attacking = true) {
  return page.evaluate(attacking => {
    const session = game.session;
    const { world, player } = session;
    for (let y = 1; y < world.height - 1; y++) {
      for (let x = 1; x < world.width - 1; x++) world.tiles[y * world.width + x] = 0;
    }
    world.decorations = [];
    const unicorn = session.unicorns[0];
    Object.assign(unicorn, { x: 6.5, y: 12.5, speed: 0, angle: Math.PI });
    Object.assign(unicorn.attack, { phase: 'idle', remaining: 0, cooldownFor: attacking ? 0 : 600, target: null });
    session.unicorns = [unicorn];
    const cake = session.pickups.find(item => item.kind === 'health');
    const charm = session.pickups.find(item => item.kind === 'armor');
    if (attacking) {
      // Collect the charm by overlap on the first tick; no assigned armor.
      Object.assign(charm, { x: player.x, y: player.y });
      session.pickups = [charm];
    } else {
      player.health = 4;
      Object.assign(cake, { x: 5.5, y: 12 });
      Object.assign(charm, { x: 5.5, y: 13 });
      session.pickups = [cake, charm];
    }
    return { cake: cake.id, charm: charm.id, unicorn: unicorn.id };
  }, attacking);
}

async function capture(page, testInfo, name) {
  const path = testInfo.outputPath(`${name}.png`);
  await page.screenshot({ path });
  await testInfo.attach(name, { path, contentType: 'image/png' });
}

const snapshot = page => page.evaluate(() => ({
  elapsed: game.session.elapsed,
  player: { ...game.session.player },
  unicorns: structuredClone(game.session.unicorns),
  roses: structuredClone(game.session.roses),
  nextRoseId: game.session.nextRoseId,
  feedback: structuredClone(feedback),
  hud: document.querySelector('.hud').textContent,
  canvas: document.querySelector('#game').toDataURL(),
}));

async function until(page, predicate, limit = 240) {
  for (let tick = 0; tick < limit; tick++) {
    if (await page.evaluate(predicate)) return;
    await step(page);
  }
  expect(await page.evaluate(predicate), 'Scenario reached its expected state within four seconds').toBe(true);
}

test('walking over the visible cake and armor charm collects each once and updates the HUD', async ({ page }, testInfo) => {
  const ids = await arrange(page, false);
  await step(page);
  await expect(page.locator('#health')).toHaveText('4 / 5');
  await expect(page.locator('#armor')).toHaveText('0 / 5');
  await capture(page, testInfo, 'cake-and-armor-charm');
  await page.keyboard.down('KeyA');
  await step(page, 12); // Line up with the cake using keyboard strafing.
  await page.keyboard.up('KeyA');
  await page.keyboard.down('KeyW');
  await step(page, 38); // Still outside the combined 0.4-tile pickup radius.
  expect(await page.evaluate(() => game.session.pickups.length)).toBe(2);
  await step(page);
  await page.keyboard.up('KeyW');
  await expect(page.locator('#health')).toHaveText('5 / 5');
  await expect(page.locator('#armor')).toHaveText('0 / 5');
  expect(await page.evaluate(() => game.session.pickups.map(item => item.id))).toEqual([ids.charm]);
  await page.keyboard.down('KeyW');
  await step(page, 9);
  await page.keyboard.up('KeyW');
  await page.keyboard.down('KeyD');
  await step(page, 24);
  await page.keyboard.up('KeyD');
  await expect(page.locator('#health')).toHaveText('5 / 5');
  await expect(page.locator('#armor')).toHaveText('1 / 5');
  await step(page, 10);
  const result = await page.evaluate(() => ({ pickups: game.session.pickups, feedback, pending: game.session.events }));
  const events = result.feedback.effects.filter(event => event.type === 'pickup');
  expect(events).toMatchObject([
    { source: ids.cake, kind: 'health', amount: 1, health: 5, armor: 0 },
    { source: ids.charm, kind: 'armor', amount: 1, health: 5, armor: 1 },
  ]);
  expect(result.feedback.audio).toEqual(result.feedback.effects);
  expect(result.pickups).toEqual([]);
  expect(result.pending).toEqual([]);
  await capture(page, testInfo, 'collected-supplies-hud');
  await attachJSON(testInfo, 'collection-events', events);
});

test('a complete rear windup emits a real rose; impacts consume armor before health and remove the rose', async ({ page }, testInfo) => {
  const ids = await arrange(page);
  expect(await page.evaluate(() => game.session.roses)).toEqual([]);
  await step(page);
  const windup = await snapshot(page);
  expect(windup.unicorns[0].attack).toMatchObject({ phase: 'windup', remaining: 0.55, facing: 0 });
  expect(windup.roses).toEqual([]);
  await expect(page.locator('#armor')).toHaveText('1 / 5');
  await capture(page, testInfo, 'rear-windup');
  await step(page, 32);
  const before = await snapshot(page);
  expect(before.unicorns[0].attack.remaining).toBeCloseTo(1 / 60, 10);
  expect(before.unicorns[0].attack.phase).toBe('windup');
  expect(before.roses).toEqual([]);
  expect(before.feedback.effects.filter(event => event.type === 'rose-fired')).toEqual([]);
  for (const property of ['x', 'y', 'angle']) expect(before.unicorns[0][property]).toBe(windup.unicorns[0][property]);
  await step(page);
  const emitted = await snapshot(page);
  expect(emitted.unicorns[0].attack).toMatchObject({ phase: 'recovery', remaining: 0.25, cooldownFor: 2.6 });
  expect(emitted.nextRoseId).toBe(1);
  expect(emitted.roses).toHaveLength(1);
  const rose = emitted.roses[0];
  expect(rose).toMatchObject({ id: 'rose:0', source: ids.unicorn, x: 6.15, y: 12.5, z: 0.5, vx: -3.5, remaining: 3 });
  expect(rose.vy).toBeCloseTo(0, 10);
  expect(emitted.feedback.effects.filter(event => event.type === 'rose-fired')).toMatchObject([
    { source: ids.unicorn, projectile: rose.id, x: rose.x, y: rose.y, z: rose.z },
  ]);
  await capture(page, testInfo, 'rear-origin-rose');
  await step(page, 5);
  expect(await page.evaluate(() => game.session.roses[0].x)).toBeCloseTo(rose.x + rose.vx * 5 / 60, 10);
  // Swept point contact happens on the first tick reaching the player radius.
  const hitTick = Math.ceil((rose.x - emitted.player.x - emitted.player.radius) / (3.5 / 60));
  await step(page, hitTick - 6);
  expect(await page.evaluate(() => game.session.roses.map(item => item.id))).toContain(rose.id);
  await expect(page.locator('#armor')).toHaveText('1 / 5');
  await step(page);
  await expect(page.locator('#armor')).toHaveText('0 / 5');
  await expect(page.locator('#health')).toHaveText('5 / 5');
  expect(await page.evaluate(() => game.session.roses)).toEqual([]);
  await capture(page, testInfo, 'armor-absorbed-impact');
  await until(page, () => feedback.effects.some(event => event.type === 'rose-fired' && event.projectile === 'rose:1'));
  await until(page, () => feedback.effects.filter(event => event.type === 'damage').length === 2);
  await expect(page.locator('#armor')).toHaveText('0 / 5');
  await expect(page.locator('#health')).toHaveText('4 / 5');
  const result = await page.evaluate(() => ({ feedback, roses: game.session.roses, pending: game.session.events }));
  expect(result.feedback.effects.filter(event => event.type === 'damage')).toMatchObject([
    { cause: 'rose', source: 'rose:0', resource: 'armor', amount: 1, health: 5, armor: 0 },
    { cause: 'rose', source: 'rose:1', resource: 'health', amount: 1, health: 4, armor: 0 },
  ]);
  expect(result.roses).toEqual([]);
  expect(result.pending).toEqual([]);
  expect(result.feedback.audio).toEqual(result.feedback.effects);
  await attachJSON(testInfo, 'attack-and-impact-events', result.feedback.effects);
});

test('pause freezes windup, recovery, cooldown, and airborne roses; keyboard restart clears the attack', async ({ page }) => {
  const initialAttacks = await page.evaluate(() => game.session.unicorns.map(({ id, attack }) => ({ id, attack })));
  await arrange(page);
  await step(page, 8);
  expect(await page.evaluate(() => game.session.unicorns[0].attack.phase)).toBe('windup');
  await page.keyboard.press('Escape');
  const windup = await snapshot(page);
  await step(page, 180);
  expect(await snapshot(page)).toEqual(windup);
  await page.keyboard.press('Enter');
  await step(page); // Resume establishes a baseline, with no catch-up.
  expect(await snapshot(page)).toEqual(windup);
  await until(page, () => game.session.roses.length === 1);
  await step(page, 3);
  expect(await page.evaluate(() => game.session.unicorns[0].attack.phase)).toBe('recovery');
  await page.keyboard.press('Escape');
  const airborne = await snapshot(page);
  await step(page, 180);
  expect(await snapshot(page)).toEqual(airborne);
  await page.keyboard.press('Enter');
  await step(page, 2);
  const resumed = await snapshot(page);
  expect(resumed.roses[0].x).toBeCloseTo(airborne.roses[0].x - 3.5 / 60, 10);
  expect(resumed.unicorns[0].attack.remaining).toBeCloseTo(airborne.unicorns[0].attack.remaining - 1 / 60, 10);
  expect(resumed.unicorns[0].attack.cooldownFor).toBeCloseTo(airborne.unicorns[0].attack.cooldownFor - 1 / 60, 10);
  await page.keyboard.press('Escape');
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: 'Restart game' })).toBeFocused();
  await page.keyboard.press('Enter');
  const fresh = await snapshot(page);
  expect(fresh.elapsed).toBe(0);
  expect(fresh.roses).toEqual([]);
  expect(fresh.nextRoseId).toBe(0);
  expect(fresh.unicorns).toHaveLength(6);
  expect(fresh.unicorns.map(({ id, attack }) => ({ id, attack }))).toEqual(initialAttacks);
  for (const unicorn of fresh.unicorns) {
    expect(unicorn.attack).toMatchObject({ phase: 'idle', remaining: 0, target: null });
    expect(unicorn.attack.cooldownFor).toBeLessThan(2.6);
  }
  await expect(page.locator('#health')).toHaveText('5 / 5');
  await expect(page.locator('#armor')).toHaveText('0 / 5');
  await expect(page.locator('#game')).toBeFocused();
  expect(await page.evaluate(() => game.effects.particleCount)).toBe(0);
});

test('reduced motion changes the canvas presentation while rose trajectories and impact ticks stay identical', async ({ page }, testInfo) => {
  const runs = [];
  for (const reducedMotion of ['no-preference', 'reduce']) {
    await page.emulateMedia({ reducedMotion });
    await load(page);
    await arrange(page);
    expect(await page.evaluate(() => game.effects.reducedMotion)).toBe(reducedMotion === 'reduce');
    await page.keyboard.down('KeyW');
    await step(page, 6);
    await page.keyboard.up('KeyW');
    const walking = await snapshot(page);
    const trajectory = await page.evaluate(() => {
      const ticks = [];
      for (let tick = 0; tick < 100; tick++) {
        stepFrames();
        ticks.push({ elapsed: game.session.elapsed, player: { ...game.session.player },
          attack: structuredClone(game.session.unicorns[0].attack),
          roses: structuredClone(game.session.roses), events: structuredClone(feedback.effects) });
      }
      return ticks;
    });
    runs.push({ canvas: walking.canvas, trajectory });
    await capture(page, testInfo, `${reducedMotion}-rose-impact`);
  }
  expect(runs[0].canvas).not.toBe(runs[1].canvas); // Normal weapon bob is visible.
  expect(runs[0].trajectory).toEqual(runs[1].trajectory);
  const emissionTick = runs[0].trajectory.findIndex(tick => tick.roses.length > 0);
  const impactTick = runs[0].trajectory.findIndex(tick => tick.events.some(event => event.type === 'damage'));
  expect(emissionTick).toBeGreaterThan(0);
  expect(impactTick).toBeGreaterThan(emissionTick);
  expect(runs[0].trajectory[impactTick].player).toMatchObject({ health: 5, armor: 0 });
  await attachJSON(testInfo, 'motion-comparison', { identical: true, emissionTick, impactTick, trajectory: runs[0].trajectory });
});
