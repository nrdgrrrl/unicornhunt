import test from 'node:test';
import assert from 'node:assert/strict';
import { GameSession, WAVE_COUNTS, INTERMISSION_SECONDS } from '../src/session.js';
import { createPlayer } from '../src/player.js';
import { spawnUnicorns, CONTACT_INVULNERABILITY } from '../src/unicorn.js';
import { FIRE_COOLDOWN } from '../src/combat.js';
import { STEP_SECONDS as STEP, snapshot, advance, clearWave, win } from './helpers/simulation.js';

const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} should be near ${expected}`);

test('ready prepares six seeded unicorns and ignores simulation until started', () => {
  const session = new GameSession('rainbow');
  assert.equal(session.state, 'ready');
  assert.equal(session.seed, 'rainbow');
  assert.equal(session.world.seed, session.seed);
  assert.equal(session.wave, 1);
  assert.equal(session.remaining, 6);
  assert.equal(session.player.magic, 100);
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

test('magic restoration happens only when a new wave begins and caps at 100', () => {
  for (const [magic, expected] of [[1, 21], [60, 80], [90, 100], [100, 100]]) {
    const session = new GameSession().start();
    session.player.magic = magic;
    clearWave(session);
    advance(session, 119);
    assert.equal(session.player.magic, magic);
    session.update(STEP);
    assert.equal(session.player.magic, expected);
    session.player.magic = 50;
    clearWave(session);
    advance(session, 120);
    assert.equal(session.player.magic, 70);
    clearWave(session);
    assert.equal(session.state, 'won');
    assert.equal(session.player.magic, 70);
  }
});

test('contact damage reaches lost once, with damage before defeat in the queue', () => {
  const session = new GameSession().start();
  session.drainEvents();
  const unicorn = session.unicorns[0];
  unicorn.x = session.player.x;
  unicorn.y = session.player.y;
  for (let hit = 1; hit <= 5; hit++) {
    session.update(hit === 1 ? 0 : CONTACT_INVULNERABILITY);
    assert.equal(session.player.magic, 100 - 20 * hit);
    assert.equal(session.state, hit === 5 ? 'lost' : 'playing');
  }
  assert.deepEqual(session.drainEvents().map(event => event.type), ['damage', 'damage', 'damage', 'damage', 'damage', 'defeat']);
  const before = snapshot(session);
  session.start().resume().pause().update(10, { fire: true, forward: 1 });
  assert.deepEqual(snapshot(session), before);
});

test('zero magic wins no races with wave clearance or intermission restoration', () => {
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
    session.player.magic = 0;
    for (const unicorn of session.unicorns) unicorn.alive = false;
    session.update(2, { fire: true });
    assert.equal(session.state, 'lost');
    assert.equal(session.player.magic, 0);
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

test('pause preserves a partially elapsed intermission without respawning or restoring magic', () => {
  const session = new GameSession().start();
  session.player.magic = 40;
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
  assert.equal(session.player.magic, 40);
  session.update(STEP);
  assert.equal(session.wave, 2);
  assert.equal(session.player.magic, 60);
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
  assert.equal(session.player.magic, 100);
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
    if (state === 'lost') { session.player.magic = 0; session.update(STEP); }
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
    session.player.magic = 20;
    session.player.fireCooldown = 0.2;
    session.player.invulnerableFor = 0.7;
    session.events.push({ type: 'old-run' });
    session.world.tiles[0] = 0;
    const { world, player, unicorns, events } = session;
    assert.equal(session.restart(), session);
    assert.deepEqual(snapshot(session), snapshot(new GameSession('restart').start()));
    assert.notEqual(session.world, world);
    assert.notEqual(session.player, player);
    assert.notEqual(session.unicorns, unicorns);
    assert.notEqual(session.events, events);
    assert.deepEqual(session.player, createPlayer(session.world.spawn));
    assert.deepEqual(session.drainEvents(), [{ type: 'wave', wave: 1 }]);
  }
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

test('draining returns events once, preserves ordering, and isolates subsequent events', () => {
  const session = new GameSession().start();
  session.update(STEP, { fire: true });
  const events = session.drainEvents();
  assert.deepEqual(events.map(event => event.type), ['wave', 'shot', 'glitter']);
  assert.deepEqual(session.events, []);
  assert.deepEqual(session.drainEvents(), []);
  session.player.magic = 0;
  session.update(STEP);
  assert.deepEqual(events.map(event => event.type), ['wave', 'shot', 'glitter']);
  assert.deepEqual(session.drainEvents(), [{ type: 'defeat' }]);
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
