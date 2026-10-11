import test from 'node:test';
import assert from 'node:assert/strict';
import { GameSession } from '../src/session.js';
import { createHUDSnapshot } from '../src/snapshot.js';
import { STEP_SECONDS, advance, clearWave } from './helpers/simulation.js';

const presentation = { bestScore: 500, muted: true, audioUnavailable: false };

test('HUD snapshots freeze health and armor scalars and expose independent resource caps', () => {
  const session = new GameSession();
  const snapshot = createHUDSnapshot(session, presentation);
  assert.deepEqual(snapshot, {
    state: 'title', score: 0, bestScore: 500, health: 5, maxHealth: 5,
    armor: 0, maxArmor: 5, wave: 1, remaining: 6, combo: 0,
    muted: true, audioUnavailable: false,
  });
  assert.equal(Object.isFrozen(snapshot), true);
  assert.ok(Object.values(snapshot).every(value => value === null || typeof value !== 'object'));
  session.player.health = 3;
  session.player.armor = 2;
  assert.equal(snapshot.health, 5);
  assert.equal(snapshot.armor, 0);
  const next = createHUDSnapshot(session, presentation);
  assert.equal(next.health, 3);
  assert.equal(next.armor, 2);
  assert.equal(Object.isFrozen(next), true);
  for (const key of Object.keys(next)) {
    assert.throws(() => { next[key] = null; }, TypeError);
  }
  assert.equal(session.player.health, 3);
  assert.equal(session.player.armor, 2);
});

test('defeat depends on health even with remaining armor, and restart resets the HUD resources', () => {
  const session = new GameSession().start();
  session.player.health = 0;
  session.player.armor = 4;
  session.update(0);
  const lost = createHUDSnapshot(session, presentation);
  assert.equal(lost.state, 'defeat');
  assert.equal(lost.health, 0);
  assert.equal(lost.armor, 4);
  session.restart();
  const restarted = createHUDSnapshot(session, presentation);
  assert.equal(restarted.state, 'playing');
  assert.equal(restarted.health, 5);
  assert.equal(restarted.armor, 0);
  assert.equal(lost.health, 0);
  assert.equal(lost.armor, 4);
});

test('fresh HUD snapshots stay detached across public pause, wave, victory, and restart transitions', () => {
  const session = new GameSession(42);
  const options = { ...presentation };
  const snapshots = [];
  function capture(state, wave, health, remaining) {
    const next = createHUDSnapshot(session, options);
    assert.equal(next.state, state);
    assert.equal(next.wave, wave);
    assert.equal(next.health, health);
    assert.equal(next.remaining, remaining);
    assert.equal(Object.isFrozen(next), true);
    assert.ok(Object.values(next).every(value => typeof value !== 'object'));
    for (const previous of snapshots) assert.notEqual(next, previous.snapshot);
    snapshots.push({ snapshot: next, copy: { ...next } });
  }
  capture('title', 1, 5, 6);
  session.start();
  session.player.health = 2;
  session.player.armor = 3;
  capture('playing', 1, 2, 6);
  session.pause().update(10, { fire: true });
  capture('paused', 1, 2, 6);
  session.resume();
  clearWave(session);
  capture('playing', 1, 2, 0);
  advance(session, 120);
  capture('playing', 2, 3, 8);
  clearWave(session);
  advance(session, 120);
  clearWave(session);
  capture('victory', 3, 4, 0);
  session.update(STEP_SECONDS, { forward: 1 });
  session.restart();
  options.bestScore = 900;
  options.muted = false;
  capture('playing', 1, 5, 6);
  for (const { snapshot, copy } of snapshots) assert.deepEqual(snapshot, copy);
});
