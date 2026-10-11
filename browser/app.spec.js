import { test, expect, origin } from './fixtures.js';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    // Control frame timing without mocking any of the application subsystems.
    const frames = new Map();
    let id = 0;
    let now = 0;
    window.requestAnimationFrame = callback => { frames.set(++id, callback); return id; };
    window.cancelAnimationFrame = id => frames.delete(id);
    window.pendingFrames = () => frames.size;
    window.advance = (milliseconds, count = 1) => {
      for (let i = 0; i < count; i++) {
        now += milliseconds;
        const pending = [...frames.values()];
        frames.clear();
        for (const callback of pending) callback(now);
      }
    };
    window.scoreWrites = [];
    const setItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key === 'unicornhunt:bestScore') scoreWrites.push(value);
      return setItem.call(this, key, value);
    };
    window.audioContexts = [];
    window.audioGestures = [];
    const NativeContext = window.AudioContext;
    window.AudioContext = class extends NativeContext {
      constructor(...args) { super(...args); audioContexts.push(this); }
      resume() { audioGestures.push(navigator.userActivation.isActive); return super.resume(); }
    };
  });
  await page.goto(origin);
  await page.evaluate(async () => { window.game = (await import('/main.js')).game; });
});

const advance = (page, milliseconds, count = 1) => page.evaluate(
  ({ milliseconds, count }) => window.advance(milliseconds, count), { milliseconds, count },
);
const start = page => page.getByRole('button', { name: 'Start game', exact: true }).click();

test('simulation uses 60 Hz steps, bounds delayed frames, and consumes mouse motion once', async ({ page }) => {
  await start(page);
  await page.evaluate(() => {
    window.steps = [];
    const update = game.session.update.bind(game.session);
    game.session.update = (seconds, input) => { steps.push({ seconds, input }); return update(seconds, input); };
  });
  await advance(page, 0);
  await advance(page, 1000 / 120, 2);
  expect(await page.evaluate(() => steps.map(step => step.seconds))).toEqual([1 / 60]);
  await page.evaluate(() => {
    Object.defineProperty(document, 'pointerLockElement', { configurable: true, value: document.querySelector('#game') });
    document.dispatchEvent(new Event('pointerlockchange'));
    document.dispatchEvent(new MouseEvent('mousemove', { movementX: 40 }));
  });
  await advance(page, 60_000);
  const result = await page.evaluate(() => ({ steps, elapsed: game.session.elapsed, frames: pendingFrames() }));
  expect(result.steps).toHaveLength(6);
  expect(result.steps.every(step => step.seconds === 1 / 60)).toBe(true);
  expect(result.steps.slice(1).map(step => step.input.look)).toEqual([0.1, 0, 0, 0, 0]);
  expect(result.elapsed).toBeCloseTo(6 / 60, 12);
  expect(result.frames).toBe(1);
  await advance(page, 1000 / 60);
  expect(await page.evaluate(() => steps.length)).toBe(7);
});

test('a movement tick drains pickup-before-damage feedback once to effects and audio and updates the HUD', async ({ page }) => {
  await start(page);
  await advance(page, 0);
  await page.evaluate(async () => {
    const { PICKUP_RADIUS, STEP_SECONDS, WALK_SPEED } = await import('/src/config.js');
    const { spawnRose } = await import('/src/projectiles.js');
    const session = game.session;
    session.player.health = 1;
    const contact = session.unicorns[0];
    contact.x = session.player.x + session.player.radius + contact.radius;
    contact.y = session.player.y;
    contact.speed = 0;
    contact.attack.cooldownFor = 100;
    session.unicorns.slice(1).forEach(unicorn => { unicorn.alive = false; });
    // Just outside pickup range now; one movement tick overlaps both supplies.
    session.pickups = ['health', 'armor'].map(kind => ({
      id: kind, kind, radius: PICKUP_RADIUS,
      x: session.player.x + session.player.radius + PICKUP_RADIUS + WALK_SPEED * STEP_SECONDS / 2,
      y: session.player.y,
    }));
    spawnRose(session, { id: contact.id, x: session.player.x, y: session.player.y }, { x: 1, y: 0 });
    window.feedback = { effects: [], audio: [] };
    for (const name of ['effects', 'audio']) {
      const consume = game[name].consume.bind(game[name]);
      game[name].consume = events => { feedback[name].push(events); consume(events); };
    }
  });
  await page.keyboard.down('KeyW');
  await advance(page, 1000 / 60);
  await page.keyboard.up('KeyW');
  const result = await page.evaluate(() => ({
    effects: feedback.effects, audio: feedback.audio,
    sharedBatch: feedback.effects[0] === feedback.audio[0],
    pending: game.session.events, pickups: game.session.pickups, roses: game.session.roses,
    state: game.state,
  }));
  expect(result.effects).toHaveLength(1);
  expect(result.effects[0].map(event => event.type)).toEqual(['pickup', 'pickup', 'damage']);
  expect(result.effects[0][2]).toMatchObject({ cause: 'contact', resource: 'armor', health: 2, armor: 0 });
  expect(result.audio).toEqual(result.effects);
  expect(result.sharedBatch).toBe(true);
  expect(result.pending).toEqual([]);
  expect(result.pickups).toEqual([]);
  expect(result.roses).toEqual([]);
  expect(result.state).toBe('playing');
  await expect(page.locator('#health')).toHaveText('2 / 5');
  await expect(page.locator('#armor')).toHaveText('0 / 5');
  await advance(page, 1000 / 60);
  expect(await page.evaluate(() => feedback.effects[1])).toEqual([]);
  expect(await page.evaluate(() => feedback.audio[1])).toEqual([]);
});

for (const cause of ['Escape', 'hidden tab', 'focus loss', 'pointer-lock loss']) {
  test(`${cause} freezes play until explicit Resume and discards held input and elapsed time`, async ({ page }) => {
    await start(page);
    await page.keyboard.down('KeyW');
    await page.keyboard.down('Space');
    await advance(page, 1000 / 60, 2);
    if (cause === 'Escape') await page.keyboard.press('Escape');
    else await page.evaluate(cause => {
      if (cause === 'hidden tab') {
        Object.defineProperty(document, 'hidden', { configurable: true, value: true });
        document.dispatchEvent(new Event('visibilitychange'));
      } else if (cause === 'focus loss') window.dispatchEvent(new Event('blur'));
      else {
        Object.defineProperty(document, 'pointerLockElement', { configurable: true, value: document.querySelector('#game') });
        document.dispatchEvent(new Event('pointerlockchange'));
        Object.defineProperty(document, 'pointerLockElement', { configurable: true, value: null });
        document.dispatchEvent(new Event('pointerlockchange'));
      }
    }, cause);
    await expect(page.getByRole('button', { name: 'Resume game' })).toBeFocused();
    // Include intermission timing in the frozen snapshot.
    await page.evaluate(async () => {
      const { spawnRose } = await import('/src/projectiles.js');
      game.session.intermissionRemaining = 1;
      game.session.player.armor = 2;
      game.session.player.invulnerableFor = 0.6;
      game.session.unicorns[0].attack.phase = 'windup';
      game.session.unicorns[0].attack.remaining = 0.5;
      spawnRose(game.session, { id: 'paused-source', x: game.session.player.x + 1, y: game.session.player.y }, { x: 1, y: 0 });
    });
    const snapshot = await page.evaluate(() => JSON.stringify({
      elapsed: game.session.elapsed, player: game.session.player, unicorns: game.session.unicorns,
      wave: game.session.wave, intermission: game.session.intermissionRemaining,
      pickups: game.session.pickups, roses: game.session.roses, nextRoseId: game.session.nextRoseId, events: game.session.events,
      particles: game.effects.particleCount, trails: game.effects.trailCount,
    }));
    await advance(page, 60_000, 2);
    await page.evaluate(() => {
      Object.defineProperty(document, 'hidden', { configurable: true, value: false });
      document.dispatchEvent(new Event('visibilitychange'));
      window.dispatchEvent(new Event('focus'));
    });
    await advance(page, 60_000);
    expect(await page.evaluate(() => game.state)).toBe('paused');
    expect(await page.evaluate(() => JSON.stringify({
      elapsed: game.session.elapsed, player: game.session.player, unicorns: game.session.unicorns,
      wave: game.session.wave, intermission: game.session.intermissionRemaining,
      pickups: game.session.pickups, roses: game.session.roses, nextRoseId: game.session.nextRoseId, events: game.session.events,
      particles: game.effects.particleCount, trails: game.effects.trailCount,
    }))).toBe(snapshot);
    await page.getByRole('button', { name: 'Resume game' }).click();
    await advance(page, 60_000); // The first resumed frame establishes a new clock.
    const before = await page.evaluate(() => ({ x: game.session.player.x, y: game.session.player.y, elapsed: game.session.elapsed }));
    await advance(page, 1000 / 60);
    const after = await page.evaluate(() => ({ x: game.session.player.x, y: game.session.player.y, elapsed: game.session.elapsed }));
    expect(after.x).toBe(before.x);
    expect(after.y).toBe(before.y);
    expect(after.elapsed - before.elapsed).toBeCloseTo(1 / 60, 12);
    expect(await page.evaluate(() => game.session.player.firing)).toBe(false);
    expect(await page.evaluate(() => audioContexts.length)).toBe(1);
    expect(await page.evaluate(() => audioGestures.every(Boolean))).toBe(true);
    await page.keyboard.up('KeyW');
    await page.keyboard.up('Space');
  });
}

test('ten restarts retain one loop and audio context, clear cosmetics, and preserve firing rate', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await start(page);
  await page.evaluate(() => {
    window.shots = 0;
    const consume = game.effects.consume.bind(game.effects);
    game.effects.consume = events => { shots += events.filter(event => event.type === 'shot').length; consume(events); };
    window.originalEffects = game.effects;
    window.originalAudio = game.audio;
    window.originalSession = game.session;
    window.initialSurvival = JSON.stringify({
      player: game.session.player, unicorns: game.session.unicorns, pickups: game.session.pickups,
      roses: game.session.roses, nextRoseId: game.session.nextRoseId,
    });
  });
  for (let run = 0; run <= 10; run++) {
    expect(await page.evaluate(() => pendingFrames())).toBe(1);
    expect(await page.evaluate(() => game.effects === originalEffects && game.audio === originalAudio && game.session === originalSession)).toBe(true);
    await page.evaluate(() => { window.shots = 0; });
    await advance(page, 0);
    await page.keyboard.down('Space');
    await advance(page, 1000 / 60, 60);
    expect(await page.evaluate(() => shots)).toBe(5);
    await page.keyboard.press('Escape');
    // Add lingering feedback and held movement to check the restart boundary.
    await page.evaluate(async () => {
      const { spawnRose } = await import('/src/projectiles.js');
      game.effects.consume([{ type: 'glitter', source: 'old-run', points: 100, combo: 1, score: 100,
        x: game.session.player.x, y: game.session.player.y }]);
      spawnRose(game.session, { id: 'old-run', x: game.session.player.x + 1, y: game.session.player.y }, { x: 1, y: 0 });
      game.session.pickups.length = 0;
      game.session.player.armor = 4;
      game.session.player.invulnerableFor = 0.7;
      game.session.unicorns[0].attack.phase = 'recovery';
      game.session.unicorns[0].attack.remaining = 0.2;
    });
    await page.getByRole('button', { name: 'Restart game' }).click();
    expect(await page.evaluate(() => ({
      score: game.session.score, particles: game.effects.particleCount, trails: game.effects.trailCount,
      elapsed: game.session.elapsed, health: game.session.player.health, firing: game.session.player.firing,
    }))).toEqual({ score: 0, particles: 0, trails: 0, elapsed: 0, health: 5, firing: false });
    expect(await page.evaluate(() => JSON.stringify({
      player: game.session.player, unicorns: game.session.unicorns, pickups: game.session.pickups,
      roses: game.session.roses, nextRoseId: game.session.nextRoseId,
    }))).toBe(await page.evaluate(() => initialSurvival));
    await advance(page, 1000 / 60, 2);
    expect(await page.evaluate(() => game.session.player.firing)).toBe(false);
    await page.keyboard.up('Space');
  }
  expect(await page.evaluate(() => audioContexts.length)).toBe(1);
  // A duplicate key handler would toggle mute twice instead of once.
  await page.keyboard.press('KeyM');
  expect(await page.evaluate(() => game.audio.muted)).toBe(true);
  await page.evaluate(() => { game.destroy(); game.destroy(); });
  expect(await page.evaluate(() => pendingFrames())).toBe(0);
  await page.keyboard.press('KeyM');
  expect(await page.evaluate(() => game.audio.muted)).toBe(true);
  expect(errors).toEqual([]);
});

test('both results stop simulation, persist each new record once, and support another run', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await start(page);
  await advance(page, 0);
  await page.evaluate(() => { game.session.score = 400; });
  for (let wave = 1; wave <= 3; wave++) {
    await page.evaluate(() => { game.session.unicorns.forEach(unicorn => { unicorn.alive = false; }); });
    await advance(page, 1000 / 60, wave === 3 ? 1 : 121);
  }
  expect(await page.evaluate(() => game.state)).toBe('victory');
  const elapsed = await page.evaluate(() => game.session.elapsed);
  await advance(page, 1000, 10);
  expect(await page.evaluate(() => game.session.elapsed)).toBe(elapsed);
  expect(await page.evaluate(() => scoreWrites)).toEqual(['400']);
  await page.getByRole('button', { name: 'Play again' }).click();
  await advance(page, 0);
  await page.evaluate(() => { game.session.player.health = 0; });
  await advance(page, 1000 / 60);
  expect(await page.evaluate(() => game.state)).toBe('defeat');
  await advance(page, 1000, 10);
  expect(await page.evaluate(() => scoreWrites)).toEqual(['400']);
  await page.getByRole('button', { name: 'Play again' }).click();
  expect(await page.evaluate(() => game.state)).toBe('playing');
  await page.reload();
  await expect(page.locator('#best-score')).toHaveText('400');
  expect(errors).toEqual([]);
});

for (const storageFailure of ['access denied', 'write denied']) {
  test(`${storageFailure}, rejected audio, and rejected pointer capture preserve keyboard play`, async ({ page }) => {
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(storageFailure => {
      if (storageFailure === 'access denied') Object.defineProperty(window, 'localStorage', {
        get() { throw new Error('Storage blocked'); },
      });
      else Storage.prototype.setItem = () => { throw new Error('Quota exceeded'); };
      window.AudioContext = class { constructor() { throw new Error('Audio blocked'); } };
      window.webkitAudioContext = undefined;
      HTMLCanvasElement.prototype.requestPointerLock = () => Promise.reject(new Error('Pointer lock blocked'));
    }, storageFailure);
    await page.reload();
    await page.evaluate(async () => { window.game = (await import('/main.js')).game; });
    await start(page);
    await page.locator('#game').click({ position: { x: 300, y: 250 } });
    await page.keyboard.down('Space');
    await advance(page, 1000 / 60, 2);
    await page.keyboard.up('Space');
    await expect(page.locator('#score')).toHaveText('100');
    await expect(page.locator('#mute')).toContainText('Silent mode');
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Restart game' }).click();
    await expect(page.locator('#best-score')).toHaveText('100');
    expect(await page.evaluate(() => game.state)).toBe('playing');
    expect(errors).toEqual([]);
  });
}

for (const [query, expected] of [['?seed=0', 0], ['?seed=-12.5', -12.5], ['?seed=1e3', 1000], ['?seed=invalid', 1], ['?seed=', 1], ['?seed=Infinity', 1]]) {
  test(`numeric seed ${query} produces a reproducible run`, async ({ page }) => {
    await page.goto(origin + query);
    await page.evaluate(async () => { window.game = (await import('/main.js')).game; });
    expect(await page.evaluate(() => game.session.seed)).toBe(expected);
    const world = await page.evaluate(() => Array.from(game.session.world.tiles));
    await start(page);
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Restart game' }).click();
    expect(await page.evaluate(() => game.session.seed)).toBe(expected);
    expect(await page.evaluate(() => Array.from(game.session.world.tiles))).toEqual(world);
    await page.reload();
    await page.evaluate(async () => { window.game = (await import('/main.js')).game; });
    expect(await page.evaluate(() => Array.from(game.session.world.tiles))).toEqual(world);
  });
}

for (const failure of ['missing canvas', 'missing menus', 'unavailable canvas', 'failed initial render']) {
  test(`startup reports ${failure} without uncaught errors or a leftover loop`, async ({ page }) => {
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.evaluate(async failure => {
      game.destroy();
      if (failure === 'missing canvas') document.querySelector('#game').remove();
      else if (failure === 'missing menus') document.querySelector('#ui').remove();
      else if (failure === 'unavailable canvas') HTMLCanvasElement.prototype.getContext = () => null;
      else CanvasRenderingContext2D.prototype.fillRect = () => { throw new Error('Drawing failed'); };
      const { boot } = await import('/src/app.js');
      window.failedGame = boot(document.querySelector('#game'));
    }, failure);
    await expect(page.getByRole('alert')).toContainText('Unable to start Unicorn Hunt');
    await expect(page.getByRole('alert')).toContainText('Reload to try again');
    expect(await page.evaluate(() => failedGame.state)).toBe('error');
    expect(await page.evaluate(() => pendingFrames())).toBe(0);
    expect(errors).toEqual([]);
  });
}
