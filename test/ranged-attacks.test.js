import test from 'node:test';
import assert from 'node:assert/strict';
import { createRangedAttackState, rearSocket, updateRangedAttacks } from '../src/ranged-attacks.js';
import { spawnUnicorns } from '../src/unicorn.js';
import { spawnRose, updateRoses } from '../src/projectiles.js';
import { createSurvivalState } from '../src/survival.js';
import { hasLineOfSight } from '../src/geometry.js';
import { HEDGE } from '../src/world.js';
import {
  MAX_ROSES, ROSE_MIN_RANGE, ROSE_MAX_RANGE, ROSE_WINDUP, ROSE_RECOVERY,
  ROSE_COOLDOWN, ROSE_REAR_OFFSET, ROSE_SPEED, STEP_SECONDS,
} from '../src/config.js';
import { enemy } from './helpers/simulation.js';
import { arena } from './helpers/world.js';

const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-9,
  `${actual} should be near ${expected}`);

function setup(overrides = {}, target = { x: 7.5, y: 5.5 }) {
  const unicorn = enemy('1:0', 4.5, 5.5, {
    attack: { ...createRangedAttackState(42, '1:0'), cooldownFor: 0 }, ...overrides,
  });
  const world = arena();
  const session = { roses: [], nextRoseId: 0 };
  const step = seconds => updateRangedAttacks([unicorn], world, target, session, seconds);
  return { unicorn, world, target, session, step };
}

test('seeded initial staggering repeats exactly and stays independent of actor order', () => {
  const states = Array.from({ length: 10 }, (_, i) => createRangedAttackState(42, `1:${i}`));
  assert.deepEqual(states, Array.from({ length: 10 }, (_, i) => createRangedAttackState(42, `1:${i}`)));
  assert.equal(new Set(states.map(state => state.cooldownFor)).size, 10);
  assert.ok(states.every(state => state.cooldownFor >= 0 && state.cooldownFor < 2.6));
  assert.notDeepEqual(states[0], createRangedAttackState(43, '1:0'));
  assert.notDeepEqual(states[0], createRangedAttackState(42, '2:0'));
  const world = { ...arena(), seed: 42 };
  const target = { x: 7.5, y: 5.5 };
  const unicorns = Array.from({ length: 10 }, (_, i) => enemy(`1:${i}`));
  updateRangedAttacks(unicorns, world, target, { roses: [], nextRoseId: 0 }, 0);
  const reversed = unicorns.map(({ attack, ...unicorn }) => unicorn).reverse();
  updateRangedAttacks(reversed, world, target, { roses: [], nextRoseId: 0 }, 0);
  assert.deepEqual(unicorns.map(unicorn => unicorn.attack), states);
  assert.deepEqual(reversed.reverse(), unicorns);
});

test('spawned waves own fresh seeded attack state without sharing timers or aim samples', () => {
  const world = { ...arena(), seed: 0 };
  const player = { x: 2.5, y: 5.5, angle: 0, radius: 0.2 };
  const first = spawnUnicorns(world, player, 6);
  const replay = spawnUnicorns(world, player, 6);
  assert.deepEqual(first, replay);
  assert.ok(first.every(unicorn => unicorn.attack.phase === 'idle'));
  for (let i = 0; i < first.length; i++) {
    assert.deepEqual(first[i].attack, createRangedAttackState('0:1', first[i].id));
    assert.notEqual(first[i].attack, replay[i].attack);
  }
  assert.equal(new Set(first.map(unicorn => unicorn.attack)).size, 6);
  first[0].attack.cooldownFor = 0;
  assert.notDeepEqual(first, replay);
});

test('no shot before the full 0.55-second windup; recovery holds for 0.25 seconds', () => {
  const { unicorn, session, step } = setup();
  const position = { x: unicorn.x, y: unicorn.y };
  assert.deepEqual(step(0), []);
  assert.equal(unicorn.attack.phase, 'windup');
  assert.equal(unicorn.attack.remaining, 0.55);
  near(unicorn.angle, Math.PI);
  for (let tick = 0; tick < 32; tick++) {
    assert.deepEqual(step(STEP_SECONDS), []);
    assert.equal(session.roses.length, 0);
  }
  const events = step(STEP_SECONDS);
  assert.deepEqual(events, [{
    type: 'rose-fired', source: unicorn.id, projectile: 'rose:0',
    x: 4.85, y: 5.5, z: 0.5, angle: Math.atan2(session.roses[0].vy, session.roses[0].vx),
  }]);
  assert.equal(unicorn.attack.phase, 'recovery');
  assert.equal(unicorn.attack.remaining, 0.25);
  assert.equal(unicorn.attack.cooldownFor, 2.6);
  for (let tick = 0; tick < 14; tick++) {
    assert.deepEqual(step(STEP_SECONDS), []);
    assert.equal(unicorn.attack.phase, 'recovery');
  }
  assert.deepEqual(step(STEP_SECONDS), []);
  assert.equal(unicorn.attack.phase, 'idle');
  assert.deepEqual({ x: unicorn.x, y: unicorn.y }, position);
});

test('a new windup waits a full 2.6-second cooldown measured from emission', () => {
  const { unicorn, session, step } = setup();
  step(0);
  step(ROSE_WINDUP);
  for (let tick = 0; tick < 155; tick++) {
    step(STEP_SECONDS);
    assert.notEqual(unicorn.attack.phase, 'windup');
  }
  step(STEP_SECONDS);
  assert.equal(unicorn.attack.phase, 'windup');
  assert.equal(session.roses.length, 1);
  step(ROSE_WINDUP - 0.001);
  assert.equal(session.roses.length, 1);
  assert.equal(step(0.001).length, 1);
});

test('rear socket and velocity point opposite forward facing for every heading', () => {
  for (let i = 0; i < 16; i++) {
    const angle = i * Math.PI / 8;
    const { unicorn, session, step } = setup({}, {
      x: 4.5 + Math.cos(angle) * 3, y: 5.5 + Math.sin(angle) * 3,
    });
    step(0);
    const socket = rearSocket(unicorn);
    const forward = { x: Math.cos(unicorn.angle), y: Math.sin(unicorn.angle) };
    const offset = { x: socket.x - unicorn.x, y: socket.y - unicorn.y };
    assert.ok(offset.x * forward.x + offset.y * forward.y < 0);
    near(Math.hypot(offset.x, offset.y), ROSE_REAR_OFFSET);
    assert.ok(Math.hypot(offset.x, offset.y) > unicorn.radius);
    assert.equal(step(ROSE_WINDUP).length, 1);
    const rose = session.roses[0];
    assert.deepEqual({ x: rose.x, y: rose.y }, socket);
    near(rose.vx, -forward.x * ROSE_SPEED);
    near(rose.vy, -forward.y * ROSE_SPEED);
  }
});

test('moving target cannot change sampled aim, locked facing, or straight projectile velocity', () => {
  const { unicorn, world, target, session, step } = setup();
  step(0);
  assert.notEqual(unicorn.attack.target, target);
  const facing = unicorn.angle;
  target.x = 4.5;
  target.y = 8.5;
  // The module restores locked facing even if a caller changed it accidentally.
  unicorn.angle = 0;
  step(ROSE_WINDUP / 2);
  assert.equal(unicorn.angle, facing);
  assert.deepEqual(unicorn.attack.target, { x: 7.5, y: 5.5 });
  step(ROSE_WINDUP / 2);
  const rose = structuredClone(session.roses[0]);
  near(rose.vx, ROSE_SPEED);
  near(rose.vy, 0);
  const advanced = updateRoses(session.roses, world, { ...target, radius: 0.2 }, createSurvivalState(), 0.5);
  near(advanced.roses[0].x, rose.x + ROSE_SPEED * 0.5);
  near(advanced.roses[0].y, rose.y);
  assert.equal(advanced.roses[0].vx, rose.vx);
  assert.equal(advanced.roses[0].vy, rose.vy);
});

test('range endpoints are inclusive; near, distant, and hidden targets never start attacks', () => {
  for (const [distance, eligible] of [
    [ROSE_MIN_RANGE - 0.001, false], [ROSE_MIN_RANGE, true],
    [ROSE_MAX_RANGE, true], [ROSE_MAX_RANGE + 0.001, false], [0, false],
  ]) {
    const { unicorn, session, step } = setup({}, { x: 4.5 + distance, y: 5.5 });
    step(0);
    assert.equal(unicorn.attack.phase, eligible ? 'windup' : 'idle');
    assert.equal(step(ROSE_WINDUP).length, eligible ? 1 : 0);
    assert.equal(session.roses.length, eligible ? 1 : 0);
  }
  const blocked = setup();
  blocked.world.tiles[5 * blocked.world.width + 6] = HEDGE;
  assert.deepEqual(blocked.step(100), []);
  assert.equal(blocked.unicorn.attack.phase, 'idle');
  assert.deepEqual(blocked.session.roses, []);
});

test('visibility loss and leaving either range boundary cancel windup without firing', () => {
  for (const change of [
    ({ world }) => { world.tiles[5 * world.width + 6] = HEDGE; },
    ({ target }) => { target.x = 5; },
    ({ target }) => { target.x = 12; },
  ]) {
    const context = setup();
    context.step(0);
    context.step(ROSE_WINDUP / 2);
    change(context);
    assert.deepEqual(context.step(100), []);
    assert.equal(context.unicorn.attack.phase, 'idle');
    assert.equal(context.unicorn.attack.cooldownFor, ROSE_COOLDOWN);
    assert.deepEqual(context.session, { roses: [], nextRoseId: 0 });
    context.world.tiles[5 * context.world.width + 6] = 0;
    context.target.x = 7.5;
    assert.deepEqual(context.step(0), []);
    assert.equal(context.unicorn.attack.phase, 'idle');
  }
});

test('a blocked rear socket cancels even when the current target remains visible', () => {
  const { unicorn, world, target, session, step } = setup({ x: 3.8, y: 3.8 }, { x: 6.5, y: 6.5 });
  step(0);
  const socket = rearSocket(unicorn);
  assert.ok(socket.x > 4 && socket.y > 4);
  world.tiles[4 * world.width + 4] = HEDGE;
  target.y = 3.5;
  assert.ok(hasLineOfSight(world, unicorn, target));
  assert.deepEqual(step(ROSE_WINDUP), []);
  assert.equal(unicorn.attack.phase, 'idle');
  assert.deepEqual(session, { roses: [], nextRoseId: 0 });
});

test('converted unicorns cannot begin or complete windup', () => {
  for (const started of [false, true]) {
    const { unicorn, session, step } = setup();
    if (started) step(0);
    unicorn.alive = false;
    assert.deepEqual(step(100), []);
    assert.equal(unicorn.attack.phase, 'idle');
    assert.deepEqual(session, { roses: [], nextRoseId: 0 });
  }
  const { world, target, session } = setup();
  const dead = enemy('dead', 4.5, 5.5, { alive: false });
  const before = structuredClone(dead);
  assert.deepEqual(updateRangedAttacks([dead], world, target, session, 100), []);
  assert.deepEqual(dead, before);
});

function fillCap(session) {
  while (session.roses.length < MAX_ROSES) {
    spawnRose(session, { id: 'other', x: 2.5, y: 2.5 }, { x: 1, y: 0 });
  }
}

test('cap rejection at readiness or emission preserves existing roses and spends a cooldown', () => {
  for (const started of [false, true]) {
    const { unicorn, session, step } = setup();
    if (started) step(0);
    fillCap(session);
    const before = structuredClone(session);
    const existing = [...session.roses];
    assert.deepEqual(step(ROSE_WINDUP), []);
    assert.deepEqual(session, before);
    assert.ok(session.roses.every((rose, i) => rose === existing[i]));
    assert.equal(unicorn.attack.cooldownFor, ROSE_COOLDOWN);
    // Free capacity; no rejected shot is waiting to be replayed.
    session.roses.pop();
    step(ROSE_RECOVERY);
    assert.equal(unicorn.attack.phase, 'idle');
    assert.deepEqual(step(0), []);
    assert.equal(session.nextRoseId, MAX_ROSES);
    step(ROSE_COOLDOWN - ROSE_RECOVERY);
    assert.equal(unicorn.attack.phase, 'windup');
    assert.equal(step(ROSE_WINDUP).length, 1);
    assert.equal(session.roses.at(-1).id, `rose:${MAX_ROSES}`);
  }
});

test('group emission obeys the shared cap and produces events only for admitted roses', () => {
  const { unicorn, world, target, session, step } = setup();
  step(0);
  const second = structuredClone(unicorn);
  second.id = '1:1';
  fillCap(session);
  session.roses.pop();
  const events = updateRangedAttacks([unicorn, second], world, target, session, ROSE_WINDUP);
  assert.equal(events.length, 1);
  assert.equal(events[0].source, unicorn.id);
  assert.equal(session.roses.length, MAX_ROSES);
  assert.equal(session.nextRoseId, MAX_ROSES + 1);
  assert.equal(second.attack.phase, 'recovery');
});

test('large updates never catch up shots or skip a newly started telegraph/recovery', () => {
  const { unicorn, session, step } = setup();
  assert.deepEqual(step(100), []);
  assert.equal(unicorn.attack.phase, 'windup');
  assert.equal(unicorn.attack.remaining, ROSE_WINDUP);
  assert.equal(step(100).length, 1);
  assert.equal(unicorn.attack.phase, 'recovery');
  assert.equal(unicorn.attack.remaining, ROSE_RECOVERY);
  assert.equal(unicorn.attack.cooldownFor, ROSE_COOLDOWN);
  assert.deepEqual(step(100), []);
  assert.equal(unicorn.attack.phase, 'idle');
  assert.equal(session.roses.length, 1);
});

test('advancing old projectiles before firing leaves new roses at their muzzle', () => {
  const { unicorn, world, target, session, step } = setup();
  step(0);
  spawnRose(session, { id: 'old', x: 2.5, y: 2.5 }, { x: 1, y: 0 });
  session.roses = updateRoses(session.roses, world, { ...target, radius: 0.2 },
    createSurvivalState(), ROSE_WINDUP).roses;
  const old = structuredClone(session.roses[0]);
  const event = step(ROSE_WINDUP)[0];
  assert.deepEqual(session.roses[0], old);
  assert.deepEqual({ x: session.roses[1].x, y: session.roses[1].y }, rearSocket(unicorn));
  assert.equal(event.projectile, session.roses[1].id);
});

test('invalid times and seeds fail explicitly without changing attack/projectile state', () => {
  const { unicorn, world, target, session } = setup();
  const before = structuredClone({ unicorn, session });
  for (const seconds of [-1, NaN, Infinity, -Infinity]) {
    for (const unicorns of [[], [unicorn]]) {
      assert.throws(() => updateRangedAttacks(unicorns, world, target, session, seconds), RangeError);
    }
  }
  for (const seed of [NaN, Infinity, -Infinity, null]) {
    assert.throws(() => createRangedAttackState(seed, unicorn.id), TypeError);
  }
  assert.deepEqual({ unicorn, session }, before);
});
