import test from 'node:test';
import assert from 'node:assert/strict';
import { GameSession } from '../src/session.js';
import { createHUDSnapshot } from '../src/snapshot.js';

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
