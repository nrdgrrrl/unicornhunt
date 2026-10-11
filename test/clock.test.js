import test from 'node:test';
import assert from 'node:assert/strict';
import { createClock, STEP_SECONDS, MAX_CATCH_UP_STEPS } from '../src/clock.js';
import * as config from '../src/config.js';

const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-12,
  `${actual} should be near ${expected}`);

test('clock exports the shared 60 Hz step and five-step limit', () => {
  assert.equal(STEP_SECONDS, 1 / 60);
  assert.equal(MAX_CATCH_UP_STEPS, 5);
  assert.equal(STEP_SECONDS, config.STEP_SECONDS);
  assert.equal(MAX_CATCH_UP_STEPS, config.MAX_CATCH_UP_STEPS);
});

test('first frame is only a timestamp baseline, even at a large timestamp', () => {
  const clock = createClock();
  const ticks = [];
  assert.equal(clock.advance(60_000, seconds => ticks.push(seconds)), 0);
  assert.deepEqual(ticks, []);
});

test('two 120 Hz intervals produce exactly one 1/60-second tick', () => {
  const clock = createClock();
  const ticks = [];
  const tick = seconds => ticks.push(seconds);
  clock.advance(0, tick);
  near(clock.advance(1000 / 120, tick), 1 / 120);
  assert.deepEqual(ticks, []);
  near(clock.advance(1000 / 60, tick), 1 / 120);
  assert.deepEqual(ticks, [1 / 60]);
});

test('fractional time carries across frames and each complete step gets a callback', () => {
  const clock = createClock();
  const ticks = [];
  const tick = seconds => ticks.push(seconds);
  clock.advance(0, tick);
  clock.advance(10, tick);
  assert.deepEqual(ticks, []);
  clock.advance(40, tick);
  assert.deepEqual(ticks, [1 / 60, 1 / 60]);
  clock.advance(50, tick);
  assert.deepEqual(ticks, [1 / 60, 1 / 60, 1 / 60]);
});

test('rounding epsilon accepts tiny deficits but not a meaningfully short step', () => {
  const clock = createClock();
  const ticks = [];
  const tick = seconds => ticks.push(seconds);
  clock.advance(0, tick);
  clock.advance(1000 / 60 - 2e-9, tick);
  assert.deepEqual(ticks, []);
  clock.advance(1000 / 60 - 0.5e-9, tick);
  assert.deepEqual(ticks, [1 / 60]);
  clock.advance(1000 / 60 - 0.5e-9, tick);
  assert.deepEqual(ticks, [1 / 60]);
});

test('sixty-second delay accepts only five steps and leaves no full tick queued', () => {
  const clock = createClock();
  const ticks = [];
  const tick = seconds => ticks.push(seconds);
  clock.advance(0, tick);
  assert.equal(clock.advance(60_000, tick), 5 / 60);
  assert.deepEqual(ticks, Array(5).fill(1 / 60));
  clock.advance(60_000, tick);
  assert.equal(ticks.length, 5);
  clock.advance(60_000 + 1000 / 120, tick);
  assert.equal(ticks.length, 5);
  clock.advance(60_000 + 1000 / 60, tick);
  assert.equal(ticks.length, 6);
});

test('backlog including a previous fractional step is also capped at five steps', () => {
  const clock = createClock();
  let ticks = 0;
  const tick = () => ticks++;
  clock.advance(0, tick);
  clock.advance(8, tick);
  assert.equal(ticks, 0);
  assert.equal(clock.advance(60_008, tick), 5 / 60);
  assert.equal(ticks, 5);
  clock.advance(60_008 + 10, tick);
  assert.equal(ticks, 5, 'the old eight milliseconds must have been discarded');
});

test('reset discards fractional and complete backlog and makes a fresh baseline', () => {
  const clock = createClock();
  let ticks = 0;
  const tick = () => ticks++;
  let active = true;
  clock.advance(0, tick);
  clock.advance(50, () => { ticks++; active = false; }, () => active);
  assert.equal(ticks, 1);
  clock.reset();
  active = true;
  assert.equal(clock.advance(60_000, tick), 0);
  clock.advance(60_008, tick);
  assert.equal(ticks, 1);
  clock.reset();
  assert.equal(clock.advance(120_000, tick), 0);
  clock.advance(120_010, tick);
  assert.equal(ticks, 1);
  clock.advance(120_000 + 1000 / 60, tick);
  assert.equal(ticks, 2);
});

test('result transition during the first catch-up tick prevents further ticks', () => {
  const clock = createClock();
  let state = 'playing';
  const ticks = [];
  const tick = seconds => { ticks.push(seconds); state = 'won'; };
  const isActive = () => state === 'playing';
  clock.advance(0, tick, isActive);
  assert.equal(clock.advance(60_000, tick, isActive), 5 / 60);
  assert.deepEqual(ticks, [1 / 60]);
  clock.reset();
  clock.advance(60_100, tick, isActive);
  assert.deepEqual(ticks, [1 / 60]);
});

test('reset inside a tick immediately stops catch-up even when still active', () => {
  const clock = createClock();
  const ticks = [];
  clock.advance(0, seconds => ticks.push(seconds));
  assert.equal(clock.advance(60_000, seconds => {
    ticks.push(seconds);
    clock.reset();
  }), 5 / 60);
  assert.deepEqual(ticks, [1 / 60]);
  const tick = seconds => ticks.push(seconds);
  assert.equal(clock.advance(120_000, tick), 0);
  clock.advance(120_000 + 1000 / 60, tick);
  assert.deepEqual(ticks, [1 / 60, 1 / 60]);
});

test('inactive frames return bounded cosmetic time without accumulating ticks', () => {
  const clock = createClock();
  const ticks = [];
  const tick = seconds => ticks.push(seconds);
  clock.advance(0, tick, () => false);
  near(clock.advance(10, tick, () => false), 0.01);
  assert.equal(clock.advance(60_000, tick, () => false), 5 / 60);
  assert.deepEqual(ticks, []);
  clock.advance(60_010, tick);
  assert.deepEqual(ticks, []);
  clock.advance(60_000 + 1000 / 60, tick);
  assert.deepEqual(ticks, [1 / 60]);
});

test('custom configuration uses seconds for ticks and bounds both frame and backlog', () => {
  const clock = createClock({ stepSeconds: 0.02, maxCatchUpSteps: 2 });
  const ticks = [];
  const tick = seconds => ticks.push(seconds);
  clock.advance(100, tick);
  clock.advance(110, tick);
  assert.deepEqual(ticks, []);
  assert.equal(clock.advance(60_110, tick), 0.04);
  assert.deepEqual(ticks, [0.02, 0.02]);
  clock.advance(60_120, tick);
  assert.deepEqual(ticks, [0.02, 0.02]);
  clock.advance(60_130, tick);
  assert.deepEqual(ticks, [0.02, 0.02, 0.02]);
});

test('equal and backward timestamps accept zero elapsed time', () => {
  const clock = createClock();
  const ticks = [];
  const tick = seconds => ticks.push(seconds);
  clock.advance(100, tick);
  assert.equal(clock.advance(100, tick), 0);
  assert.equal(clock.advance(90, tick), 0);
  assert.deepEqual(ticks, []);
  near(clock.advance(100, tick), 0.01);
  assert.deepEqual(ticks, []);
});

test('rounding allowance cannot create ticks from zero or half of a tiny custom step', () => {
  const clock = createClock({ stepSeconds: 1e-13 });
  const ticks = [];
  const tick = seconds => ticks.push(seconds);
  assert.equal(clock.advance(0, tick), 0);
  clock.advance(0, tick);
  clock.advance(0.5e-10, tick);
  assert.deepEqual(ticks, []);
  clock.advance(1e-10, tick);
  assert.deepEqual(ticks, [1e-13]);
  clock.advance(1e-10, tick);
  assert.deepEqual(ticks, [1e-13]);
});

test('invalid clock configuration is rejected', () => {
  for (const stepSeconds of [0, -1, NaN, Infinity, -Infinity, '0.02', null]) {
    assert.throws(() => createClock({ stepSeconds }), RangeError);
  }
  for (const maxCatchUpSteps of [0, -1, 1.5, NaN, Infinity, '5', null, Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => createClock({ maxCatchUpSteps }), RangeError);
  }
  assert.throws(() => createClock({ stepSeconds: Number.MAX_VALUE, maxCatchUpSteps: 2 }), RangeError);
});

test('nonfinite timestamps are rejected without changing the baseline or backlog', () => {
  const clock = createClock();
  const ticks = [];
  const tick = seconds => ticks.push(seconds);
  for (const now of [NaN, Infinity, -Infinity, undefined, null, '10']) {
    assert.throws(() => clock.advance(now, tick), RangeError);
  }
  assert.equal(clock.advance(100, tick), 0);
  clock.advance(110, tick);
  for (const now of [NaN, Infinity, -Infinity]) {
    assert.throws(() => clock.advance(now, tick), RangeError);
  }
  clock.advance(100 + 1000 / 60, tick);
  assert.deepEqual(ticks, [1 / 60]);
});

test('invalid callbacks fail before modifying clock time', () => {
  const clock = createClock();
  const ticks = [];
  const tick = seconds => ticks.push(seconds);
  assert.throws(() => clock.advance(100, null), TypeError);
  assert.throws(() => clock.advance(100, tick, false), TypeError);
  assert.equal(clock.advance(200, tick), 0);
  assert.deepEqual(ticks, []);
});
