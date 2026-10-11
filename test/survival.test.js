import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createSurvivalState, updateInvulnerability, applyDamage, restoreHealth, restoreArmor,
} from '../src/survival.js';
import {
  MAX_HEALTH, MAX_ARMOR, DAMAGE_INVULNERABILITY, CONTACT_INVULNERABILITY, STEP_SECONDS,
} from '../src/config.js';

const contact = { cause: 'contact', source: 'unicorn:1' };
const rose = { cause: 'rose', source: 'rose:1' };

test('new survival states start with five health, no armor, and no cooldown', () => {
  const state = createSurvivalState();
  assert.deepEqual(state, { health: 5, armor: 0, invulnerableFor: 0 });
  assert.equal(MAX_HEALTH, 5);
  assert.equal(MAX_ARMOR, 5);
  assert.equal(DAMAGE_INVULNERABILITY, 0.75);
  assert.equal(DAMAGE_INVULNERABILITY, CONTACT_INVULNERABILITY);
  assert.notEqual(state, createSurvivalState());
});

test('the fifth accepted unarmored hit defeats the player with exact damage events', () => {
  let state = createSurvivalState();
  for (let hit = 1; hit <= 5; hit++) {
    const result = applyDamage(state, contact);
    assert.deepEqual(result.event, {
      type: 'damage', ...contact, amount: 1, resource: 'health', health: 5 - hit, armor: 0,
    });
    assert.deepEqual(result.state, {
      health: 5 - hit, armor: 0, invulnerableFor: DAMAGE_INVULNERABILITY,
    });
    state = updateInvulnerability(result.state, DAMAGE_INVULNERABILITY);
  }
  assert.deepEqual(applyDamage(state, rose), { state, event: null });
});

test('full health and armor absorb exactly ten accepted hits before defeat', () => {
  let state = createSurvivalState();
  for (let pickup = 0; pickup < 5; pickup++) state = restoreArmor(state);
  const sequence = [];
  for (let hit = 1; hit <= 10; hit++) {
    const cause = hit % 2 ? contact : rose;
    const result = applyDamage(state, cause);
    const health = hit <= 5 ? 5 : 10 - hit;
    const armor = Math.max(0, 5 - hit);
    assert.deepEqual(result.event, {
      type: 'damage', ...cause, amount: 1, resource: hit <= 5 ? 'armor' : 'health', health, armor,
    });
    sequence.push([result.state.health, result.state.armor]);
    state = updateInvulnerability(result.state, DAMAGE_INVULNERABILITY);
  }
  assert.deepEqual(sequence, [
    [5, 4], [5, 3], [5, 2], [5, 1], [5, 0], [4, 0], [3, 0], [2, 0], [1, 0], [0, 0],
  ]);
  assert.deepEqual(applyDamage(state, contact), { state, event: null });
});

test('contact and roses share invulnerability and blocked hits emit no duplicate events', () => {
  for (const [first, second] of [[contact, rose], [rose, contact]]) {
    const accepted = applyDamage({ ...createSurvivalState(), armor: 1 }, first);
    assert.equal(accepted.event.resource, 'armor');
    assert.deepEqual(applyDamage(accepted.state, second), { state: accepted.state, event: null });
    const halfway = updateInvulnerability(accepted.state, DAMAGE_INVULNERABILITY / 2);
    assert.deepEqual(applyDamage(halfway, first), { state: halfway, event: null });
    assert.deepEqual(applyDamage(halfway, second), { state: halfway, event: null });
    const ready = updateInvulnerability(halfway, DAMAGE_INVULNERABILITY / 2);
    const next = applyDamage(ready, second);
    assert.equal(next.event.resource, 'health');
    assert.equal(next.state.health, 4);
    assert.equal(next.state.armor, 0);
    assert.equal(next.state.invulnerableFor, DAMAGE_INVULNERABILITY);
  }
});

test('fractional cooldown steps expire at the intended boundary, never one tick late or early', () => {
  for (const step of [STEP_SECONDS, 0.01, 0.05, DAMAGE_INVULNERABILITY / 7]) {
    let state = applyDamage(createSurvivalState(), contact).state;
    const ticks = Math.round(DAMAGE_INVULNERABILITY / step);
    for (let tick = 1; tick < ticks; tick++) {
      state = updateInvulnerability(state, step);
      assert.ok(state.invulnerableFor > 0);
      assert.equal(applyDamage(state, rose).event, null);
    }
    state = updateInvulnerability(state, step);
    assert.equal(state.invulnerableFor, 0);
    assert.equal(applyDamage(state, rose).state.health, 3);
    assert.equal(updateInvulnerability(state, 10).invulnerableFor, 0);
  }
  const state = applyDamage(createSurvivalState(), contact).state;
  assert.ok(updateInvulnerability(state, DAMAGE_INVULNERABILITY - 0.000001).invulnerableFor > 0);
  assert.deepEqual(updateInvulnerability(state, 0), state);
});

test('pickups restore one point of only their resource, preserve cooldown, and cap at five', () => {
  const state = Object.freeze({ health: 2, armor: 3, invulnerableFor: 0.5 });
  assert.deepEqual(restoreHealth(state), { ...state, health: 3 });
  assert.deepEqual(restoreArmor(state), { ...state, armor: 4 });
  let full = state;
  for (let pickup = 0; pickup < 20; pickup++) full = restoreArmor(restoreHealth(full));
  assert.deepEqual(full, { health: 5, armor: 5, invulnerableFor: 0.5 });
});

test('neither pickup nor damage revives a defeated player, even with armor remaining', () => {
  for (const armor of [0, 5]) {
    const state = Object.freeze({ health: 0, armor, invulnerableFor: 0 });
    assert.deepEqual(restoreHealth(state), state);
    assert.deepEqual(restoreArmor(state), state);
    assert.deepEqual(applyDamage(state, contact), { state, event: null });
    assert.deepEqual(applyDamage(state, rose), { state, event: null });
  }
});

test('damage and pickups keep every valid combination within independent resource bounds', () => {
  for (let health = 0; health <= MAX_HEALTH; health++) {
    for (let armor = 0; armor <= MAX_ARMOR; armor++) {
      const initial = { health, armor, invulnerableFor: 0 };
      let state = initial;
      for (let hit = 0; hit < 12; hit++) {
        state = updateInvulnerability(applyDamage(state, rose).state, DAMAGE_INVULNERABILITY);
        assert.ok(state.health >= 0 && state.health <= MAX_HEALTH);
        assert.ok(state.armor >= 0 && state.armor <= MAX_ARMOR);
      }
      for (const restore of [restoreHealth, restoreArmor]) {
        state = initial;
        for (let pickup = 0; pickup < 12; pickup++) state = restore(state);
        assert.ok(state.health >= 0 && state.health <= MAX_HEALTH);
        assert.ok(state.armor >= 0 && state.armor <= MAX_ARMOR);
      }
    }
  }
});

test('survival transitions do not mutate inputs or retain mutable damage metadata', () => {
  const initial = Object.freeze(createSurvivalState());
  const hit = { ...contact };
  const result = applyDamage(initial, hit);
  hit.source = 'changed';
  assert.equal(result.event.source, contact.source);
  assert.deepEqual(initial, createSurvivalState());
  const damaged = Object.freeze(result.state);
  updateInvulnerability(damaged, 0.5);
  restoreHealth(damaged);
  restoreArmor(damaged);
  assert.deepEqual(damaged, { health: 4, armor: 0, invulnerableFor: DAMAGE_INVULNERABILITY });
});

test('invalid elapsed time fails explicitly without altering state', () => {
  const state = Object.freeze(createSurvivalState());
  for (const seconds of [-1, NaN, Infinity, -Infinity]) {
    assert.throws(() => updateInvulnerability(state, seconds), RangeError);
  }
});
