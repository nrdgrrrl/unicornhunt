import test from 'node:test';
import assert from 'node:assert/strict';
import { GameSession, WAVE_COUNTS, INTERMISSION_SECONDS } from '../src/session.js';
import { createPlayer } from '../src/player.js';
import { spawnUnicorns, CONTACT_INVULNERABILITY } from '../src/unicorn.js';
import { FIRE_COOLDOWN } from '../src/combat.js';
import { STEP_SECONDS as STEP, snapshot, advance, clearWave, win, enemy } from './helpers/simulation.js';
import { arena } from './helpers/world.js';
import { spawnRose } from '../src/projectiles.js';
import { spawnPickups } from '../src/pickups.js';
import { rearSocket } from '../src/ranged-attacks.js';
import { ROSE_RECOVERY, ROSE_COOLDOWN, PICKUP_RADIUS, DAMAGE_INVULNERABILITY } from '../src/config.js';
import { circleCollides, hasLineOfSight } from '../src/world.js';

const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} should be near ${expected}`);

test('production movement clocks freeze for whole attack ticks and pause, then resume idle steering', () => {
  const session = new GameSession(0).start();
  const actor = session.unicorns[0];
  const phases = new Set();
  let frozenTicks = 0;
  let idleTicks = 0;
  let emissions = 0;
  for (let tick = 0; tick < 360 && session.state === 'playing'; tick++) {
    const phase = actor.attack.phase;
    const before = structuredClone(actor);
    session.update(STEP);
    phases.add(actor.attack.phase);
    if (phase === 'idle') {
      near(actor.movement.elapsed, before.movement.elapsed + STEP);
      idleTicks++;
    } else {
      // Includes the tick that ends recovery: movement precedes attack updates.
      assert.deepEqual(actor.movement, before.movement);
      assert.equal(actor.x, before.x);
      assert.equal(actor.y, before.y);
      frozenTicks++;
    }
    emissions += session.drainEvents().filter(event => event.type === 'rose-fired').length;
    if (actor.attack.phase !== 'idle') {
      session.pause();
      const paused = snapshot(session);
      session.update(20, { forward: 1, fire: true });
      assert.deepEqual(snapshot(session), paused);
      session.resume();
    }
  }
  assert.deepEqual([...phases].sort(), ['idle', 'recovery', 'windup']);
  assert.ok(frozenTicks > 0 && idleTicks > 0 && emissions > 0);
});

test('complete generated victories and natural defeats replay every fixed-tick state and event after restart', () => {
  for (const outcome of ['won', 'lost']) {
    const session = new GameSession(42).start();
    const history = [];
    const phases = new Set();
    const events = [];
    const initial = snapshot(session);
    for (let tick = 0; tick < 7200 && session.state === 'playing'; tick++) {
      // Read positions to aim; never replace the generated world or entities.
      const player = session.player;
      const target = session.unicorns.filter(actor => hasLineOfSight(session.world, player, actor))
        .sort((a, b) => Math.hypot(a.x - player.x, a.y - player.y)
          - Math.hypot(b.x - player.x, b.y - player.y))[0];
      const input = outcome === 'won' ? {
        fire: tick >= 60,
        look: target ? Math.atan2(target.y - player.y, target.x - player.x) - player.angle : 0,
      } : {};
      session.update(STEP, input);
      for (const actor of session.unicorns) {
        assert.ok(actor.movement, 'production actor keeps its seeded profile');
        assert.equal(circleCollides(session.world, actor, actor.radius), false);
        phases.add(actor.attack.phase);
      }
      const batch = session.drainEvents();
      events.push(...batch);
      // The immutable map is checked separately; retain all evolving session data.
      const { world, ...state } = snapshot(session);
      history.push({ input, batch, state });
    }
    assert.equal(session.state, outcome);
    assert.ok(events.some(event => event.type === 'rose-fired'));
    assert.deepEqual([...phases].sort(), ['idle', 'recovery', 'windup']);
    if (outcome === 'won') {
      assert.equal(events.filter(event => event.type === 'glitter').length, 24);
      assert.deepEqual(events.filter(event => event.type === 'wave').map(event => event.wave), [1, 2, 3]);
      assert.equal(events.at(-1).type, 'victory');
    } else {
      assert.equal(session.player.health, 0);
      assert.ok(events.some(event => event.type === 'damage'));
      assert.equal(events.at(-1).type, 'defeat');
    }
    session.restart();
    assert.deepEqual(snapshot(session), initial);
    for (const frame of history) {
      session.update(STEP, frame.input);
      assert.deepEqual(session.drainEvents(), frame.batch);
      const { world, ...state } = snapshot(session);
      assert.deepEqual(state, frame.state);
    }
    assert.deepEqual(session.world, initial.world);
    const terminal = snapshot(session);
    session.update(10, { forward: 1, fire: true });
    assert.deepEqual(snapshot(session), terminal);
  }
});

test('ready prepares six seeded unicorns and ignores simulation until started', () => {
  const session = new GameSession('rainbow');
  assert.equal(session.state, 'ready');
  assert.equal(session.seed, 'rainbow');
  assert.equal(session.world.seed, session.seed);
  assert.equal(session.wave, 1);
  assert.equal(session.remaining, 6);
  assert.equal(session.player.health, 5);
  assert.equal(session.player.armor, 0);
  assert.deepEqual(session.roses, []);
  assert.deepEqual(session.pickups, spawnPickups(session.world, session.player, session.unicorns));
  const before = snapshot(session);
  session.pause().resume().update(10, { forward: 1, fire: true, look: 1 });
  assert.deepEqual(snapshot(session), before);
  assert.equal(session.start(), session);
  session.start().resume();
  assert.equal(session.state, 'playing');
  assert.deepEqual(session.drainEvents(), [{ type: 'wave', wave: 1 }]);
});

test('three full waves use exactly two-second intermissions and win once without a final delay', () => {
  const session = new GameSession(0).start();
  const events = session.drainEvents();
  for (const [index, count] of WAVE_COUNTS.entries()) {
    assert.equal(session.wave, index + 1);
    assert.equal(session.unicorns.length, count);
    assert.equal(session.remaining, count);
    clearWave(session);
    assert.deepEqual(session.unicorns, []);
    if (index < 2) {
      assert.equal(session.state, 'playing');
      assert.equal(session.intermissionRemaining, INTERMISSION_SECONDS);
      const clearedAt = session.elapsed;
      advance(session, 119);
      assert.equal(session.wave, index + 1);
      assert.equal(session.remaining, 0);
      near(session.intermissionRemaining, STEP);
      assert.deepEqual(session.drainEvents(), []);
      session.update(STEP);
      near(session.elapsed - clearedAt, 2);
      assert.equal(session.intermissionRemaining, 0);
      events.push(...session.drainEvents());
    }
  }
  assert.equal(session.state, 'won');
  assert.equal(session.intermissionRemaining, 0);
  events.push(...session.drainEvents());
  assert.deepEqual(events, [
    { type: 'wave', wave: 1 }, { type: 'wave', wave: 2 },
    { type: 'wave', wave: 3 }, { type: 'victory' },
  ]);
  const before = snapshot(session);
  session.start().pause().resume();
  advance(session, 300, { forward: 1, fire: true });
  assert.deepEqual(snapshot(session), before);
});

test('health restoration happens only when a new wave begins and caps at five', () => {
  for (const [health, expected] of [[1, 2], [3, 4], [4, 5], [5, 5]]) {
    const session = new GameSession().start();
    session.player.health = health;
    session.player.armor = 2;
    clearWave(session);
    advance(session, 119);
    assert.equal(session.player.health, health);
    session.update(STEP);
    assert.equal(session.player.health, expected);
    assert.equal(session.player.armor, 2);
    session.player.health = 2;
    clearWave(session);
    advance(session, 120);
    assert.equal(session.player.health, 3);
    clearWave(session);
    assert.equal(session.state, 'won');
    assert.equal(session.player.health, 3);
  }
});

test('contact damage reaches lost once, with damage before defeat in the queue', () => {
  const session = new GameSession().start();
  session.drainEvents();
  const unicorn = session.unicorns[0];
  // Isolate contact ordering from the other actors' natural arrival/rose timing.
  session.unicorns = [unicorn];
  unicorn.x = session.player.x;
  unicorn.y = session.player.y;
  for (let hit = 1; hit <= 5; hit++) {
    session.update(hit === 1 ? 0 : CONTACT_INVULNERABILITY);
    assert.equal(session.player.health, 5 - hit);
    assert.equal(session.state, hit === 5 ? 'lost' : 'playing');
  }
  assert.deepEqual(session.drainEvents().map(event => event.type), ['damage', 'damage', 'damage', 'damage', 'damage', 'defeat']);
  const before = snapshot(session);
  session.start().resume().pause().update(10, { fire: true, forward: 1 });
  assert.deepEqual(snapshot(session), before);
});

test('zero health wins no races with wave clearance or intermission restoration', () => {
  for (const phase of ['combat', 'intermission', 'final']) {
    const session = new GameSession().start();
    if (phase === 'intermission') clearWave(session);
    if (phase === 'final') {
      clearWave(session);
      advance(session, 120);
      clearWave(session);
      advance(session, 120);
    }
    session.drainEvents();
    session.player.health = 0;
    session.player.armor = 4;
    const supplies = [{ id: 'no-revival', kind: 'health', x: session.player.x, y: session.player.y, radius: PICKUP_RADIUS }];
    session.pickups = supplies;
    for (const unicorn of session.unicorns) unicorn.alive = false;
    session.update(2, { fire: true });
    assert.equal(session.state, 'lost');
    assert.equal(session.player.health, 0);
    assert.equal(session.player.armor, 4);
    assert.equal(session.pickups, supplies);
    assert.equal(session.intermissionRemaining, 0);
    assert.deepEqual(session.drainEvents(), [{ type: 'defeat' }]);
  }
});

test('pause freezes actors, all cooldowns, combo, elapsed time, and pending events', () => {
  const session = new GameSession().start();
  session.update(STEP, { fire: true });
  session.player.invulnerableFor = 0.5;
  assert.equal(session.score, 100);
  assert.equal(session.combo, 1);
  assert.equal(session.player.fireCooldown, FIRE_COOLDOWN);
  assert.equal(session.unicorns.length, 5);
  session.pause().pause();
  const before = snapshot(session);
  advance(session, 300, { forward: 1, turn: 1, look: 1, fire: true });
  assert.deepEqual(snapshot(session), before);
  session.resume().resume().update(STEP);
  near(session.elapsed, before.elapsed + STEP);
  near(session.player.fireCooldown, FIRE_COOLDOWN - STEP);
  near(session.player.invulnerableFor, 0.5 - STEP);
  assert.notDeepEqual(session.unicorns, before.unicorns);
  assert.equal(session.combo, 1);
});

test('pause preserves a partially elapsed intermission without respawning or restoring health', () => {
  const session = new GameSession().start();
  session.player.health = 2;
  clearWave(session);
  advance(session, 60);
  near(session.intermissionRemaining, 1);
  session.pause();
  const before = snapshot(session);
  advance(session, 600, { fire: true });
  assert.deepEqual(snapshot(session), before);
  session.resume();
  advance(session, 59);
  assert.equal(session.wave, 1);
  assert.equal(session.player.health, 2);
  session.update(STEP);
  assert.equal(session.wave, 2);
  assert.equal(session.player.health, 3);
});

test('combat removes a converted contact threat before damage and starts only one intermission', () => {
  const session = new GameSession().start();
  session.drainEvents();
  const target = session.unicorns[0];
  target.x = session.player.x;
  target.y = session.player.y;
  for (const unicorn of session.unicorns.slice(1)) unicorn.alive = false;
  session.update(STEP, { fire: true });
  assert.equal(session.score, 100);
  assert.equal(session.player.health, 5);
  assert.equal(session.remaining, 0);
  assert.equal(session.intermissionRemaining, 2);
  assert.deepEqual(session.drainEvents().map(event => event.type), ['shot', 'glitter']);
  advance(session, 120);
  assert.equal(session.wave, 2);
  assert.deepEqual(session.drainEvents(), [{ type: 'wave', wave: 2 }]);
  advance(session, 5);
  assert.equal(session.wave, 2);
  assert.equal(session.remaining, 8);
  assert.equal(session.intermissionRemaining, 0);
});

test('the final conversion scores before immediate victory and cannot repeat', () => {
  const session = new GameSession().start();
  clearWave(session);
  advance(session, 120);
  clearWave(session);
  advance(session, 120);
  session.drainEvents();
  const target = session.unicorns[0];
  target.x = session.player.x + 1;
  target.y = session.player.y;
  for (const unicorn of session.unicorns.slice(1)) unicorn.alive = false;
  session.update(STEP, { fire: true });
  assert.equal(session.state, 'won');
  assert.equal(session.score, 100);
  assert.equal(session.combo, 1);
  assert.deepEqual(session.unicorns, []);
  assert.deepEqual(session.drainEvents().map(event => event.type), ['shot', 'glitter', 'victory']);
  session.update(STEP, { fire: true });
  assert.equal(session.score, 100);
  assert.deepEqual(session.drainEvents(), []);
});

test('restart from every lifecycle state replaces all previous-run objects and timers', () => {
  for (const state of ['ready', 'playing', 'paused', 'won', 'lost']) {
    const session = new GameSession('restart');
    if (state !== 'ready') session.start();
    if (state === 'won') win(session);
    if (state === 'lost') { session.player.health = 0; session.update(STEP); }
    if (state === 'paused' || state === 'playing') {
      session.update(STEP, { fire: true, forward: 1 });
      clearWave(session);
      advance(session, 30);
      if (state === 'paused') session.pause();
    }
    assert.equal(session.state, state);
    session.score = 900;
    session.combo = 5;
    session.lastHitAt = 1;
    session.player.health = 1;
    session.player.armor = 4;
    session.player.fireCooldown = 0.2;
    session.player.invulnerableFor = 0.7;
    session.events.push({ type: 'old-run' });
    session.world.tiles[0] = 0;
    session.roses.push({ id: 'old-rose', source: 'old-unicorn', x: 4, y: 4, vx: 1, vy: 0, z: 0.5, remaining: 2 });
    session.pickups.length = 0;
    const { world, player, unicorns, events, roses, pickups } = session;
    assert.equal(session.restart(), session);
    assert.deepEqual(snapshot(session), snapshot(new GameSession('restart').start()));
    assert.notEqual(session.world, world);
    assert.notEqual(session.player, player);
    assert.notEqual(session.unicorns, unicorns);
    assert.notEqual(session.events, events);
    assert.notEqual(session.roses, roses);
    assert.notEqual(session.pickups, pickups);
    assert.deepEqual(session.player, createPlayer(session.world.spawn));
    assert.deepEqual(session.drainEvents(), [{ type: 'wave', wave: 1 }]);
  }
});

// Open-space fixtures isolate tick ordering from generated navigation routes.
function survivalSession(seed = 7) {
  const session = new GameSession(seed).start();
  session.world = { ...arena(), seed, spawn: { x: 4.5, y: 5.5, angle: 0 } };
  session.player = createPlayer(session.world.spawn);
  session.unicorns = [enemy('near', 4.5, 5.5, { speed: 0 })];
  session.pickups = [];
  session.drainEvents();
  return session;
}

test('contact and roses share one damage point and invulnerability advances only in updatePlayer', () => {
  for (const armor of [0, 2]) {
    const session = survivalSession();
    session.player.armor = armor;
    session.player.invulnerableFor = STEP * 2;
    spawnRose(session, { ...session.player, id: 'near' }, { x: 1, y: 0 });
    session.update(STEP);
    assert.equal(session.player.health, 5);
    assert.equal(session.player.armor, armor);
    near(session.player.invulnerableFor, STEP);
    assert.deepEqual(session.roses, []); // Blocked impacts still consume roses.
    assert.deepEqual(session.drainEvents(), []);

    spawnRose(session, { ...session.player, id: 'near' }, { x: 1, y: 0 });
    session.update(STEP);
    assert.equal(session.player.health, armor ? 5 : 4);
    assert.equal(session.player.armor, armor ? 1 : 0);
    assert.equal(session.player.invulnerableFor, DAMAGE_INVULNERABILITY);
    assert.deepEqual(session.roses, []);
    const events = session.drainEvents();
    assert.equal(events.length, 1);
    assert.equal(events[0].cause, 'contact');
    assert.equal(events[0].resource, armor ? 'armor' : 'health');
  }
});

test('conversion disables movement, contact, and a ready ranged shot before enemy actions', () => {
  for (const distance of [0, 3]) {
    for (const phase of ['idle', 'windup']) {
      const session = survivalSession();
      const unicorn = session.unicorns[0];
      unicorn.x += distance;
      unicorn.speed = 1.2;
      unicorn.attack = { phase, facing: 0, target: { ...session.player }, remaining: 0, cooldownFor: 0 };
      const position = { x: unicorn.x, y: unicorn.y, angle: unicorn.angle };
      session.update(STEP, { fire: true });
      assert.equal(unicorn.alive, false);
      assert.equal(unicorn.attack.phase, 'idle');
      if (phase === 'windup') {
        assert.equal(unicorn.attack.remaining, 0);
        assert.equal(unicorn.attack.target, null);
        assert.equal(unicorn.attack.cooldownFor, ROSE_COOLDOWN);
      }
      assert.deepEqual({ x: unicorn.x, y: unicorn.y, angle: unicorn.angle }, position);
      assert.equal(session.player.health, 5);
      assert.deepEqual(session.roses, []);
      assert.deepEqual(session.drainEvents().map(event => event.type), ['shot', 'glitter']);
    }
  }
});

test('windup and recovery hold navigation but keep valid contact checks', () => {
  for (const phase of ['windup', 'recovery']) {
    const session = survivalSession();
    const unicorn = session.unicorns[0];
    unicorn.speed = 1.2;
    unicorn.attack = { phase, facing: 0.3, target: { ...session.player }, remaining: 1, cooldownFor: 2 };
    unicorn.angle = unicorn.attack.facing;
    session.update(STEP);
    assert.equal(unicorn.x, 4.5);
    assert.equal(unicorn.y, 5.5);
    assert.equal(unicorn.angle, 0.3);
    assert.equal(session.player.health, 4);
    assert.equal(session.drainEvents()[0].cause, 'contact');
  }
});

test('existing roses survive individual conversion, and new roses wait until the next tick to move', () => {
  const session = survivalSession();
  session.unicorns = [enemy('source', 7.5, 5.5, { speed: 0 }), enemy('other', 12.5, 9.5, { speed: 0 })];
  const rose = spawnRose(session, { id: 'source', x: 6.5, y: 5.5 }, { x: -1, y: 0 });
  session.update(STEP, { fire: true });
  assert.deepEqual(session.unicorns.map(unicorn => unicorn.id), ['other']);
  assert.equal(session.roses[0].id, rose.id);
  assert.ok(session.roses[0].x < rose.x);

  const attacker = enemy('attacker', 7.5, 5.5, { speed: 1.2 });
  attacker.angle = 0;
  attacker.attack = { phase: 'windup', facing: 0, target: { x: 4.5, y: 5.5 }, remaining: STEP, cooldownFor: 0 };
  session.unicorns.push(attacker);
  session.update(STEP);
  const emitted = session.roses.at(-1);
  assert.equal(emitted.source, 'attacker');
  assert.equal(emitted.x, rearSocket(attacker).x);
  assert.equal(emitted.y, rearSocket(attacker).y);
  assert.equal(attacker.attack.phase, 'recovery');
  assert.equal(attacker.attack.remaining, ROSE_RECOVERY);
  assert.equal(session.drainEvents().at(-1).type, 'rose-fired');
});

test('rose sweep receives the player position before movement', () => {
  const session = survivalSession();
  session.unicorns = [enemy('distant', 12.5, 9.5, { speed: 0 })];
  session.roses = [{ id: 'crossing', source: 'distant', x: 5, y: 5.5, vx: 0, vy: 0, z: 0.5, remaining: 2 }];
  session.update(0.4, { forward: 1 });
  near(session.player.x, 5.5);
  assert.equal(session.player.health, 4);
  assert.deepEqual(session.roses, []);
  assert.equal(session.drainEvents()[0].cause, 'rose');
});

test('collect supplies after movement and before combat and contact damage', () => {
  const session = survivalSession();
  session.player.health = 3;
  session.unicorns.push(enemy('contact', 4.5, 5.5, { speed: 0 }));
  session.pickups = ['health', 'armor'].map(kind => ({ id: kind, kind, x: 4.5, y: 5.5, radius: PICKUP_RADIUS }));
  session.update(STEP, { fire: true });
  assert.equal(session.player.health, 4);
  assert.equal(session.player.armor, 0);
  assert.deepEqual(session.pickups, []);
  assert.deepEqual(session.drainEvents().map(event => event.type), ['pickup', 'pickup', 'shot', 'glitter', 'damage']);
});

test('moving into supplies restores health and armor before a crowd and multiple roses can damage', () => {
  const session = survivalSession();
  session.player.health = 1;
  session.unicorns = ['first', 'second'].map(id => enemy(id, 5.5, 5.5, { speed: 0 }));
  const items = ['health', 'armor'].map(kind => ({ id: kind, kind, x: 5.5, y: 5.5, radius: PICKUP_RADIUS }));
  session.pickups = items;
  for (let i = 0; i < 2; i++) spawnRose(session, { id: 'first', x: 5.5, y: 5.5 }, { x: -1, y: 0 });

  session.update(0.4, { forward: 1 });
  near(session.player.x, 5.5);
  assert.equal(session.state, 'playing');
  assert.equal(session.player.health, 2);
  assert.equal(session.player.armor, 0);
  assert.equal(session.player.invulnerableFor, DAMAGE_INVULNERABILITY);
  assert.deepEqual(session.pickups, []);
  assert.deepEqual(session.roses, []);
  assert.deepEqual(session.drainEvents(), [
    { type: 'pickup', source: 'health', kind: 'health', amount: 1, health: 2, armor: 0, x: 5.5, y: 5.5 },
    { type: 'pickup', source: 'armor', kind: 'armor', amount: 1, health: 2, armor: 1, x: 5.5, y: 5.5 },
    { type: 'damage', cause: 'contact', source: 'first', amount: 1, resource: 'armor', health: 2, armor: 0, x: 5.5, y: 5.5 },
  ]);
  // Neither another contact nor any consumed pickup emits again during cooldown.
  session.update(STEP);
  assert.deepEqual(session.drainEvents(), []);
  near(session.player.invulnerableFor, DAMAGE_INVULNERABILITY - STEP);
});

test('a full-resource pickup stays available until the tick after damage makes room', () => {
  for (const kind of ['health', 'armor']) {
    const session = survivalSession();
    if (kind === 'armor') session.player.armor = 5;
    const pickup = { id: kind, kind, x: session.player.x, y: session.player.y, radius: PICKUP_RADIUS };
    session.pickups = [pickup];
    session.update(STEP);
    assert.deepEqual(session.pickups, [pickup]);
    assert.equal(session.player[kind], 4);
    assert.deepEqual(session.drainEvents().map(event => event.type), ['damage']);
    session.update(STEP);
    assert.equal(session.player[kind], 5);
    assert.deepEqual(session.pickups, []);
    assert.deepEqual(session.drainEvents(), [{
      type: 'pickup', source: kind, kind, amount: 1, health: 5,
      armor: kind === 'armor' ? 5 : 0, x: pickup.x, y: pickup.y,
    }]);
    session.update(STEP);
    assert.deepEqual(session.drainEvents(), []);
  }
});

test('wave completion clears all roses immediately, including after the final wave', () => {
  for (const wave of [1, 3]) {
    const session = survivalSession();
    session.wave = wave;
    spawnRose(session, { id: 'near', x: 10.5, y: 8.5 }, { x: 1, y: 0 });
    session.update(STEP, { fire: true });
    assert.deepEqual(session.roses, []);
    assert.equal(session.state, wave === 3 ? 'won' : 'playing');
    assert.equal(session.intermissionRemaining, wave === 3 ? 0 : INTERMISSION_SECONDS);
  }
});

test('a lethal rose wins a same-tick final conversion race and cannot be revived', () => {
  const session = survivalSession();
  session.wave = 3;
  session.player.health = 1;
  spawnRose(session, { ...session.player, id: 'near' }, { x: 1, y: 0 });
  session.update(STEP, { fire: true });
  assert.equal(session.player.health, 0);
  assert.equal(session.score, 100);
  assert.equal(session.remaining, 0);
  assert.equal(session.state, 'lost');
  assert.deepEqual(session.unicorns, []);
  assert.deepEqual(session.drainEvents().map(event => event.type), ['shot', 'glitter', 'damage', 'defeat']);
  const before = snapshot(session);
  session.update(10, { fire: true, forward: 1 });
  assert.deepEqual(snapshot(session), before);
});

test('lethal damage on the last intermission tick precedes healing and next-wave spawning', () => {
  const session = survivalSession();
  clearWave(session);
  session.drainEvents();
  session.player.health = 1;
  session.intermissionRemaining = STEP;
  const pickups = session.pickups;
  const rose = spawnRose(session, { ...session.player, id: 'old-wave' }, { x: 1, y: 0 });
  session.update(STEP);
  assert.equal(session.state, 'lost');
  assert.equal(session.wave, 1);
  assert.equal(session.player.health, 0);
  assert.equal(session.remaining, 0);
  assert.equal(session.intermissionRemaining, 0);
  assert.deepEqual(session.pickups, pickups);
  assert.deepEqual(session.roses, []);
  assert.deepEqual(session.drainEvents(), [
    { type: 'damage', cause: 'rose', source: rose.id, amount: 1, resource: 'health', health: 0, armor: 0, x: rose.x, y: rose.y },
    { type: 'defeat' },
  ]);
});

test('intermission allows movement, firing, and supply collection; next wave preserves armor and cooldown', () => {
  const session = survivalSession();
  clearWave(session);
  session.player.health = 2;
  session.player.armor = 2;
  session.pickups = [{ id: 'leftover', kind: 'health', x: 5.5, y: 5.5, radius: PICKUP_RADIUS }];
  session.update(0.4, { forward: 1, fire: true });
  near(session.player.x, 5.5);
  assert.equal(session.player.health, 3);
  assert.equal(session.player.armor, 2);
  assert.deepEqual(session.pickups, []);
  assert.deepEqual(session.drainEvents().map(event => event.type), ['pickup', 'shot']);
  const oldSupplies = [{ id: 'unused', kind: 'armor', x: 14.5, y: 10.5, radius: PICKUP_RADIUS }];
  session.pickups = oldSupplies;
  session.intermissionRemaining = STEP;
  session.player.invulnerableFor = 0.7;
  const nextRoseId = session.nextRoseId;
  session.update(STEP);
  assert.equal(session.wave, 2);
  assert.equal(session.player.health, 4);
  assert.equal(session.player.armor, 2);
  near(session.player.invulnerableFor, 0.7 - STEP);
  assert.equal(session.nextRoseId, nextRoseId);
  assert.notEqual(session.pickups, oldSupplies);
  assert.deepEqual(session.pickups, spawnPickups(session.world, session.player, session.unicorns, 2));
  assert.deepEqual(session.roses, []);
});

test('pause freezes supplies, roses, and ranged timers along with the player', () => {
  const session = new GameSession(7).start();
  spawnRose(session, { id: 'source', x: session.player.x + 1, y: session.player.y }, { x: 1, y: 0 });
  session.unicorns[0].attack.phase = 'windup';
  session.unicorns[0].attack.remaining = 0.5;
  session.player.armor = 2;
  session.player.invulnerableFor = 0.6;
  session.pause();
  const before = snapshot(session);
  session.update(10, { forward: 1, fire: true });
  assert.deepEqual(snapshot(session), before);
});

test('identical seeds and input histories reproduce maps, later waves, and events after restart', () => {
  for (const seed of [0, 42, 'rainbow']) {
    const session = new GameSession(seed).start();
    const replay = new GameSession(seed).start();
    function run(game) {
      for (let wave = 1; wave <= 3; wave++) {
        assert.deepEqual(game.unicorns, spawnUnicorns(game.world, game.player, WAVE_COUNTS[wave - 1], wave));
        advance(game, 20, { strafe: 0.5, turn: 0.1, fire: true });
        clearWave(game);
        if (wave < 3) advance(game, 120);
      }
      return snapshot(game);
    }
    const expected = run(session);
    assert.deepEqual(run(replay), expected);
    session.restart();
    assert.deepEqual(run(session), expected);
  }
  assert.notDeepEqual(new GameSession(1).world.tiles, new GameSession(2).world.tiles);
});

test('seeded supply collection and ranged survival replay every entity and event batch on each tick', () => {
  function prepare(session) {
    session.world = { ...arena(), seed: session.seed, spawn: { x: 4.5, y: 5.5, angle: 0 } };
    session.player = createPlayer(session.world.spawn);
    session.player.health = 4;
    session.player.armor = 4;
    // Stationary actors isolate the attack state machine from navigation tests.
    session.unicorns = [enemy('a', 7.5, 5.5, { speed: 0 }), enemy('b', 10.5, 5.5, { speed: 0 })];
    session.pickups = spawnPickups(session.world, session.player, session.unicorns);
    assert.deepEqual(session.drainEvents(), [{ type: 'wave', wave: 1 }]);
    return session;
  }

  for (const seed of [0, 42, 'rainbow']) {
    const session = prepare(new GameSession(seed).start());
    const history = [];
    const phases = new Set();
    const events = [];
    let collected = false;
    for (let tick = 0; tick < 600 && session.state === 'playing'; tick++) {
      const pickup = session.pickups.filter(item => session.player[item.kind] < 5)
        .sort((a, b) => Math.hypot(a.x - session.player.x, a.y - session.player.y)
          - Math.hypot(b.x - session.player.x, b.y - session.player.y))[0];
      const input = !collected && pickup ? {
        forward: 1, look: Math.atan2(pickup.y - session.player.y, pickup.x - session.player.x) - session.player.angle,
      } : {};
      const before = { health: session.player.health, armor: session.player.armor, pickups: [...session.pickups] };
      session.update(STEP, input);
      const batch = session.drainEvents();
      assert.deepEqual(session.drainEvents(), []);
      const pickups = batch.filter(event => event.type === 'pickup');
      const damage = batch.filter(event => event.type === 'damage');
      const removed = before.pickups.filter(item => !session.pickups.some(next => next.id === item.id));
      assert.deepEqual(pickups.map(event => event.source), removed.map(item => item.id));
      for (const resource of ['health', 'armor']) {
        assert.equal(session.player[resource], before[resource]
          + pickups.filter(event => event.kind === resource).length
          - damage.filter(event => event.resource === resource).length);
      }
      collected ||= pickups.length > 0;
      events.push(...batch);
      for (const unicorn of session.unicorns) phases.add(unicorn.attack.phase);
      history.push({ input, events: batch, snapshot: snapshot(session) });
    }
    assert.equal(collected, true);
    assert.ok(events.some(event => event.type === 'damage'));
    assert.ok(events.some(event => event.type === 'rose-fired'));
    assert.deepEqual([...phases].sort(), ['idle', 'recovery', 'windup']);
    assert.ok(history.some(frame => frame.snapshot.roses.length > 0));

    for (const replay of [prepare(new GameSession(seed).start()), prepare(session.restart())]) {
      for (const frame of history) {
        replay.update(STEP, frame.input);
        assert.deepEqual(replay.drainEvents(), frame.events);
        assert.deepEqual(snapshot(replay), frame.snapshot);
      }
    }
  }
});

test('draining returns events once, preserves ordering, and isolates subsequent events', () => {
  const session = new GameSession().start();
  session.update(STEP, { fire: true });
  const events = session.drainEvents();
  assert.deepEqual(events.map(event => event.type), ['wave', 'shot', 'glitter']);
  assert.deepEqual(session.events, []);
  assert.deepEqual(session.drainEvents(), []);
  session.player.health = 0;
  session.update(STEP);
  assert.deepEqual(events.map(event => event.type), ['wave', 'shot', 'glitter']);
  assert.deepEqual(session.drainEvents(), [{ type: 'defeat' }]);
});

test('drained survival and attack feedback contains scalar copies, never mutable entities', () => {
  const session = survivalSession();
  session.player.health = 3;
  const converted = session.unicorns[0];
  const contact = enemy('contact', session.player.x, session.player.y, { speed: 0 });
  const attacker = enemy('attacker', 7.5, 5.5, {
    speed: 0,
    attack: { phase: 'windup', facing: 0, target: { x: 4.5, y: 5.5 }, remaining: STEP, cooldownFor: 0 },
  });
  session.unicorns.push(contact, attacker);
  const pickups = ['health', 'armor'].map(kind => ({ id: kind, kind, x: 4.5, y: 5.5, radius: PICKUP_RADIUS }));
  session.pickups = pickups;
  session.update(STEP, { fire: true });
  const events = session.drainEvents();
  assert.deepEqual(events.map(event => event.type), ['pickup', 'pickup', 'shot', 'glitter', 'damage', 'rose-fired']);
  assert.ok(events.every(event => Object.values(event).every(value => typeof value !== 'object')));
  const feedback = structuredClone(events);
  const rose = session.roses[0];
  for (const entity of [session.player, converted, contact, attacker, ...pickups, rose]) {
    entity.x += 1;
    entity.y += 1;
  }
  session.player.health = 2;
  attacker.attack.target.x += 1;
  assert.deepEqual(events, feedback);

  const before = snapshot(session);
  for (const event of events) {
    for (const key of Object.keys(event)) event[key] = null;
  }
  events.push({ type: 'defeat' });
  assert.deepEqual(snapshot(session), before);
  assert.deepEqual(session.drainEvents(), []);
  session.restart();
  assert.deepEqual(session.drainEvents(), [{ type: 'wave', wave: 1 }]);
});

test('invalid time and seeds fail explicitly without changing a session', () => {
  const session = new GameSession().start();
  const before = snapshot(session);
  for (const seconds of [-1, NaN, Infinity]) assert.throws(() => session.update(seconds), RangeError);
  for (const seed of [null, {}, Infinity]) {
    assert.throws(() => new GameSession(seed), TypeError);
    assert.throws(() => session.restart(seed), TypeError);
  }
  assert.deepEqual(snapshot(session), before);
});
