import test from 'node:test';
import assert from 'node:assert/strict';
import { EMPTY, HEDGE, createWorld, hasLineOfSight } from '../src/world.js';
import { createPlayer, updatePlayer } from '../src/player.js';
import { updateCombat } from '../src/combat.js';
import { GameSession } from '../src/session.js';
import { STEP_SECONDS as STEP, snapshot } from './helpers/simulation.js';

const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} should be near ${expected}`);
const target = (id, x, y = 12.5, radius = 0.25) => ({ id, x, y, radius, alive: true });

function combat(unicorns) {
  const world = createWorld(0);
  return { world, player: createPlayer(world.spawn), unicorns, score: 0, combo: 0, elapsed: 0, lastHitAt: null, events: [] };
}

function shoot(session, seconds = 0, fire = true) {
  session.elapsed += seconds;
  updatePlayer(session.player, session.world, { fire }, seconds);
  updateCombat(session);
  return session.events.splice(0);
}

test('combat chooses the nearest circle surface and cannot score a converted target twice', () => {
  const state = combat([target('far', 8.5), target('near', 6.5)]);
  assert.deepEqual(shoot(state).map(event => event.type), ['shot', 'glitter']);
  assert.equal(state.unicorns[1].alive, false);
  assert.equal(state.unicorns[0].alive, true);
  assert.equal(state.score, 100);
  assert.deepEqual(shoot(state, 0.219), []);
  const next = shoot(state, 0.001);
  assert.equal(next[1].source, 'far');
  assert.equal(state.score, 300);
  assert.equal(state.combo, 2);
  const repeated = shoot(state, 0.22);
  assert.deepEqual(repeated.map(event => event.type), ['shot']);
  assert.equal(state.score, 300);
  assert.equal(state.lastHitAt, 0.22);
});

test('a hedge blocks scoring until removed; a cooldown-ready retry still converts exactly once', () => {
  const state = combat([target('occluded', 8.5)]);
  state.world.tiles[12 * state.world.width + 7] = HEDGE;
  const blocked = shoot(state);
  assert.deepEqual(blocked.map(event => event.type), ['shot']);
  near(blocked[0].distance, 3.5);
  assert.equal(state.score, 0);
  assert.equal(state.combo, 0);
  assert.equal(state.lastHitAt, null);
  assert.equal(state.unicorns[0].alive, true);
  state.world.tiles[12 * state.world.width + 7] = EMPTY;
  assert.deepEqual(shoot(state), []);
  assert.equal(shoot(state, 0.22)[1].source, 'occluded');
  assert.equal(state.score, 100);
  assert.deepEqual(shoot(state, 0.22).map(event => event.type), ['shot']);
  assert.equal(state.score, 100);
});

test('ray-circle intersections include surface, tangent, and muzzle overlap, but exclude misses and rear targets', () => {
  for (const [unicorn, hit, distance] of [
    [target('surface', 6.5), true, 2.75],
    [target('tangent', 6.5, 12.75), true, 3],
    [target('muzzle', 3.5), true, 0],
    [target('outside', 6.5, 12.751), false],
    [target('behind', 2.5), false],
  ]) {
    const state = combat([unicorn]);
    const events = shoot(state);
    assert.equal(unicorn.alive, !hit, unicorn.id);
    assert.equal(state.score, hit ? 100 : 0, unicorn.id);
    assert.equal(events.length, hit ? 2 : 1, unicorn.id);
    if (hit) near(events[0].distance, distance);
  }
});

test('misses do not refresh combos; the inclusive two-second window caps at five then expires', () => {
  const state = combat(Array.from({ length: 8 }, (_, index) => target(String(index), 4.5 + index * 0.5)));
  const points = [shoot(state)[1].points];
  state.player.angle = Math.PI / 2;
  assert.deepEqual(shoot(state, 1).map(event => event.type), ['shot']);
  assert.equal(state.lastHitAt, 0);
  state.player.angle = 0;
  points.push(shoot(state, 1)[1].points);
  for (let i = 0; i < 4; i++) points.push(shoot(state, 0.22)[1].points);
  assert.deepEqual(points, [100, 200, 300, 400, 500, 500]);
  assert.equal(state.score, 2000);
  shoot(state, 2, false);
  assert.equal(state.combo, 5);
  shoot(state, 0.001, false);
  assert.equal(state.combo, 0);
  assert.equal(shoot(state)[1].points, 100);
  assert.equal(state.score, 2100);
});

// This controller changes only sampled input. Generated actors must navigate
// into view and every conversion must go through GameSession.update/combat.
function inputFor(session) {
  const visible = session.unicorns.filter(unicorn => hasLineOfSight(session.world, session.player, unicorn));
  visible.sort((a, b) => Math.hypot(a.x - session.player.x, a.y - session.player.y)
    - Math.hypot(b.x - session.player.x, b.y - session.player.y));
  const nearest = visible[0];
  return nearest ? {
    look: Math.atan2(nearest.y - session.player.y, nearest.x - session.player.x) - session.player.angle,
    fire: true,
  } : {};
}

function play(session, done = game => game.state !== 'playing') {
  const events = session.drainEvents();
  const history = [];
  const breaks = [];
  let breakTicks = 0;
  for (let tick = 0; tick < 3600 && !done(session); tick++) {
    const input = inputFor(session);
    const betweenWaves = session.intermissionRemaining > 0;
    if (betweenWaves) breakTicks++;
    session.update(STEP, input);
    const batch = session.drainEvents();
    assert.deepEqual(session.drainEvents(), []);
    for (const event of batch) {
      if (event.type === 'wave') {
        assert.equal(session.remaining, [6, 8, 10][event.wave - 1]);
        assert.equal(session.unicorns.length, session.remaining);
        breaks.push(breakTicks);
        breakTicks = 0;
      }
    }
    events.push(...batch);
    history.push({ input, events: batch, state: session.state, wave: session.wave, score: session.score, combo: session.combo });
    assert.ok(session.player.magic > 0, `controller survived tick ${tick}`);
  }
  assert.ok(done(session), 'session must finish within 60 simulated seconds');
  return { events, history, breaks };
}

// Derive scoring from the fixed-step clock and hit times independently of
// session.combo/lastHitAt. Enemies behind hedges can take over two seconds to
// enter view, so a generated wave need not be one uninterrupted combo.
function verifyScoring(history) {
  let elapsed = 0;
  let lastHitAt = null;
  let combo = 0;
  let score = 0;
  for (const frame of history) {
    elapsed += STEP;
    if (lastHitAt !== null && elapsed - lastHitAt > 2) combo = 0;
    for (const [index, event] of frame.events.entries()) {
      if (event.type !== 'glitter') continue;
      assert.equal(frame.events[index - 1]?.type, 'shot');
      combo = lastHitAt !== null && elapsed - lastHitAt <= 2 ? Math.min(combo + 1, 5) : 1;
      score += combo * 100;
      assert.equal(event.combo, combo);
      assert.equal(event.points, combo * 100);
      assert.equal(event.score, score);
      lastHitAt = elapsed;
    }
    assert.equal(frame.score, score);
    assert.equal(frame.combo, combo);
  }
  return score;
}

test('three generated waves reach victory through 24 real conversions and replay identically after restart', () => {
  for (const seed of [0, 42, 'rainbow']) {
    const session = new GameSession(seed).start();
    const initial = snapshot(session);
    const { events, history, breaks } = play(session);
    assert.equal(session.state, 'won');
    assert.equal(session.wave, 3);
    assert.equal(session.remaining, 0);
    assert.equal(session.intermissionRemaining, 0);
    assert.deepEqual(breaks, [120, 120]);
    assert.deepEqual(events.filter(event => event.type === 'wave'), [
      { type: 'wave', wave: 1 }, { type: 'wave', wave: 2 }, { type: 'wave', wave: 3 },
    ]);
    const hits = events.filter(event => event.type === 'glitter');
    assert.equal(hits.length, 24);
    assert.equal(new Set(hits.map(event => event.source)).size, 24);
    for (const [wave, count] of [[1, 6], [2, 8], [3, 10]]) {
      const waveHits = hits.filter(event => event.source.startsWith(`${wave}:`));
      assert.equal(waveHits.length, count);
      assert.deepEqual(waveHits.map(event => event.source).sort(),
        Array.from({ length: count }, (_, index) => `${wave}:${index}`).sort());
    }
    assert.equal(session.score, verifyScoring(history));
    assert.equal(hits.at(-1).score, session.score);
    assert.deepEqual(events.slice(-3).map(event => event.type), ['shot', 'glitter', 'victory']);
    assert.equal(events.filter(event => event.type === 'victory').length, 1);
    assert.equal(events.filter(event => event.type === 'defeat').length, 0);
    const won = snapshot(session);
    session.update(10, { forward: 1, fire: true });
    assert.deepEqual(snapshot(session), won);

    session.restart();
    assert.deepEqual(snapshot(session), initial);
    assert.deepEqual(session.drainEvents(), [{ type: 'wave', wave: 1 }]);
    for (const frame of history) {
      session.update(STEP, frame.input);
      assert.deepEqual(session.drainEvents(), frame.events);
      assert.equal(session.state, frame.state);
      assert.equal(session.wave, frame.wave);
      assert.equal(session.score, frame.score);
      assert.equal(session.combo, frame.combo);
    }
    assert.deepEqual(snapshot(session), won);
  }
});

test('ready and pause freeze simulation, including a live combo and a partially elapsed intermission', () => {
  const session = new GameSession(42);
  const ready = snapshot(session);
  session.update(10, { forward: 1, fire: true });
  assert.deepEqual(snapshot(session), ready);
  session.start().update(STEP, { fire: true });
  assert.equal(session.score, 100);
  assert.equal(session.combo, 1);
  session.pause();
  const paused = snapshot(session);
  session.update(10, { forward: 1, look: 1, fire: true });
  assert.deepEqual(snapshot(session), paused);
  session.resume().update(STEP);
  near(session.elapsed, paused.elapsed + STEP);
  near(session.player.fireCooldown, paused.player.fireCooldown - STEP);
  assert.equal(session.score, 100);

  play(session, game => game.intermissionRemaining > 0);
  session.update(0.5);
  near(session.intermissionRemaining, 1.5);
  session.pause();
  const intermission = snapshot(session);
  session.update(10, { fire: true });
  assert.deepEqual(snapshot(session), intermission);
  session.resume();
  for (let tick = 0; tick < 89; tick++) session.update(STEP);
  assert.equal(session.wave, 1);
  assert.equal(session.remaining, 0);
  session.update(STEP);
  assert.equal(session.wave, 2);
  assert.equal(session.remaining, 8);
  assert.deepEqual(session.drainEvents(), [{ type: 'wave', wave: 2 }]);
});

test('generated enemies cause defeat without firing; restart discards damage, timers, and queued events', () => {
  const session = new GameSession(0).start();
  for (let tick = 0; tick < 3600 && session.state === 'playing'; tick++) session.update(STEP);
  assert.equal(session.state, 'lost');
  assert.equal(session.player.magic, 0);
  assert.equal(session.score, 0);
  assert.equal(session.wave, 1);
  const lost = snapshot(session);
  assert.deepEqual(lost.events.map(event => event.type), ['wave', 'damage', 'damage', 'damage', 'damage', 'damage', 'defeat']);
  assert.deepEqual(lost.events.filter(event => event.type === 'damage').map(event => event.magic), [80, 60, 40, 20, 0]);
  session.resume().update(10, { fire: true });
  assert.deepEqual(snapshot(session), lost);
  const { world, player, unicorns, events } = session;
  session.restart();
  assert.notEqual(session.world, world);
  assert.notEqual(session.player, player);
  assert.notEqual(session.unicorns, unicorns);
  assert.notEqual(session.events, events);
  assert.deepEqual(snapshot(session), snapshot(new GameSession(0).start()));
  const batch = session.drainEvents();
  assert.deepEqual(batch, [{ type: 'wave', wave: 1 }]);
  assert.deepEqual(session.drainEvents(), []);
  session.update(STEP, { fire: true });
  assert.deepEqual(session.drainEvents().map(event => event.type), ['shot', 'glitter']);
  assert.deepEqual(batch, [{ type: 'wave', wave: 1 }]);
});
