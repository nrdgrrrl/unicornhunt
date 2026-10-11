import test from 'node:test';
import assert from 'node:assert/strict';
import { COMBO_WINDOW } from '../src/combat.js';
import { STEP_SECONDS } from '../src/config.js';
import { enemy, combatSession as session, combatStep as step } from './helpers/simulation.js';

function advanceTicks(state, ticks, fireOnLast = false) {
  for (let tick = 0; tick < ticks; tick++) {
    step(state, STEP_SECONDS, fireOnLast && tick === ticks - 1);
  }
}

test('fixed-step hits preserve the inclusive combo boundary at different timestamps', () => {
  for (const start of [0, 1, 8, 64, 128]) {
    const state = session([enemy('first'), enemy('second', 6.5)]);
    state.elapsed = start;

    step(state);
    advanceTicks(state, 120, true);

    assert.equal(state.score, 300, `score at start time ${start}`);
    assert.equal(state.combo, 2, `combo at start time ${start}`);
  }
});

test('idle combat retains the combo through tick 120 and expires it at tick 121', () => {
  const state = session([enemy('first')]);
  state.elapsed = 8;
  step(state);

  advanceTicks(state, 120);
  assert.equal(state.combo, 1);

  advanceTicks(state, 1);
  assert.equal(state.combo, 0);
});

test('a hit one microsecond beyond the combo window starts a fresh combo', () => {
  const state = session([enemy('first'), enemy('second', 6.5)]);
  step(state);
  step(state, COMBO_WINDOW + 0.000001);

  assert.equal(state.score, 200);
  assert.equal(state.combo, 1);
  assert.equal(state.lastHitAt, COMBO_WINDOW + 0.000001);
});

test('the first hit starts a combo when there is no previous hit', () => {
  const state = session([enemy('first')]);
  state.elapsed = 8;
  step(state);

  assert.equal(state.score, 100);
  assert.equal(state.combo, 1);
  assert.equal(state.lastHitAt, 8);
});
