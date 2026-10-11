import test from 'node:test';
import assert from 'node:assert/strict';
import { createPlayer, updatePlayer } from '../src/player.js';
import { createWorld, HEDGE, circleCollides, buildDistanceField, hasLineOfSight } from '../src/world.js';
import {
  spawnUnicorns, updateUnicorns, UNICORN_RADIUS, UNICORN_SPEED, WAVE_SPEED_INCREMENT,
  PLAYER_SPAWN_DISTANCE, UNICORN_SPAWN_DISTANCE, CONTACT_DAMAGE, CONTACT_INVULNERABILITY,
} from '../src/unicorn.js';
import { arena as createArena } from './helpers/world.js';
import { createMovementState, snapshotHerd, tryVariedMovement } from '../src/unicorn-steering.js';
import { createRangedAttackState } from '../src/ranged-attacks.js';
import { GameSession } from '../src/session.js';

const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-8, `${actual} should be near ${expected}`);

function arena(hedges = []) {
  return createArena(hedges, 9, 9);
}

function enemy(x, y, overrides = {}) {
  return { id: 'test', x, y, radius: UNICORN_RADIUS, speed: UNICORN_SPEED, angle: 0, alive: true, ...overrides };
}

// These tests advance navigation/contact through updateUnicorns alone. Natural
// pathfinding must not depend on ranged windup/recovery pauses; ranged timing
// lives in ranged-attacks.test.js and the complete ordering in session.test.js.

test('waves spawn their full counts safely and reproducibly over generated forests', () => {
  for (let seed = 0; seed < 200; seed++) {
    const world = createWorld(seed);
    const player = createPlayer(world.spawn);
    for (const [wave, count] of [[1, 6], [2, 12], [10, 60], [20, 120]]) {
      const unicorns = spawnUnicorns(world, player, count, wave);
      assert.equal(unicorns.length, count);
      assert.equal(new Set(unicorns.map(unicorn => unicorn.id)).size, count);
      assert.deepEqual(unicorns, spawnUnicorns(world, player, count, wave));
      const field = buildDistanceField(world, player, UNICORN_RADIUS);
      for (let i = 0; i < count; i++) {
        const unicorn = unicorns[i];
        assert.equal(unicorn.alive, true);
        assert.equal(circleCollides(world, unicorn, unicorn.radius), false);
        assert.ok(distance(unicorn, player) >= PLAYER_SPAWN_DISTANCE);
        assert.ok(Number.isFinite(field.distances[Math.floor(unicorn.y) * world.width + Math.floor(unicorn.x)]));
        for (let j = 0; j < i; j++) assert.ok(distance(unicorn, unicorns[j]) >= UNICORN_SPAWN_DISTANCE);
      }
      if (wave === 1) {
        near(unicorns[0].x, player.x + PLAYER_SPAWN_DISTANCE);
        near(unicorns[0].y, player.y);
        assert.equal(hasLineOfSight(world, player, unicorns[0]), true);
      }
    }
  }
});

test('wave one introduction follows heading when clear and safely falls back when blocked', () => {
  const world = arena();
  const player = createPlayer({ x: 4.5, y: 4.5, angle: Math.PI / 2 });
  const unicorns = spawnUnicorns(world, player, 8);
  near(unicorns[0].x, 4.5);
  near(unicorns[0].y, 7.5);
  world.tiles[6 * world.width + 4] = HEDGE;
  const fallback = spawnUnicorns(world, player, 8);
  assert.equal(fallback.length, 8);
  for (const unicorn of fallback) {
    assert.equal(circleCollides(world, unicorn, unicorn.radius), false);
    assert.ok(distance(unicorn, player) >= PLAYER_SPAWN_DISTANCE);
  }
});

test('candidate exhaustion and unreachable pockets terminate without partial waves', () => {
  const world = arena(Array.from({ length: 7 }, (_, i) => [4, i + 1]));
  const player = createPlayer({ x: 2.5, y: 2.5, angle: 0 });
  const field = buildDistanceField(world, player, UNICORN_RADIUS);
  const capacity = Array.from(field.distances).filter((value, index) => Number.isFinite(value)
    && distance({ x: index % world.width + 0.5, y: Math.floor(index / world.width) + 0.5 }, player) >= PLAYER_SPAWN_DISTANCE).length;
  const unicorns = spawnUnicorns(world, player, capacity, 2);
  assert.equal(unicorns.length, capacity);
  assert.ok(unicorns.every(unicorn => unicorn.x < 4));
  assert.throws(() => spawnUnicorns(world, player, capacity + 1, 2), RangeError);
  assert.throws(() => spawnUnicorns(world, player, Number.MAX_SAFE_INTEGER), RangeError);
  assert.deepEqual(spawnUnicorns(world, player, 0), []);
});

test('unicorns route around a blocking hedge and corners using a shared distance field', () => {
  const world = arena([[4, 1], [4, 2], [4, 3], [4, 4], [4, 5], [4, 6]]);
  const player = createPlayer({ x: 5.7, y: 2.3, angle: 0 });
  const unicorns = [enemy(3.5, 2.5), enemy(2.2, 3.2)];
  assert.equal(hasLineOfSight(world, unicorns[0], player), false);
  const field = buildDistanceField(world, player, UNICORN_RADIUS);
  let detoured = false;
  let damaged = false;
  for (let tick = 0; tick < 300; tick++) {
    const events = updateUnicorns(unicorns, world, player, 0.05, field);
    damaged ||= events.length > 0;
    detoured ||= unicorns[0].y >= 7;
    for (const unicorn of unicorns) assert.equal(circleCollides(world, unicorn, unicorn.radius), false);
  }
  assert.equal(detoured, true);
  assert.equal(damaged, true);
  for (const unicorn of unicorns) assert.ok(distance(unicorn, player) <= unicorn.radius + player.radius);
});

test('spawned unicorns reach the player across generated forests', () => {
  for (let seed = 0; seed < 10; seed++) {
    const world = createWorld(seed);
    const player = createPlayer(world.spawn);
    const unicorns = spawnUnicorns(world, player, 20, 2);
    const field = buildDistanceField(world, player, UNICORN_RADIUS);
    for (let tick = 0; tick < 600; tick++) {
      updateUnicorns(unicorns, world, player, 0.1, field);
      for (const unicorn of unicorns) assert.equal(circleCollides(world, unicorn, unicorn.radius), false);
    }
    for (const unicorn of unicorns) assert.ok(distance(unicorn, player) <= unicorn.radius + player.radius);
  }
});

test('navigation follows a moving target and handles long frames and unreachable actors', () => {
  const world = arena([[4, 1], [4, 2], [4, 3], [4, 4], [4, 5], [4, 6]]);
  const player = createPlayer({ x: 5.5, y: 2.5, angle: 0 });
  const unicorn = enemy(3.5, 2.5);
  updateUnicorns([unicorn], world, player, 0.25);
  player.x = 2.5;
  player.y = 5.5;
  updateUnicorns([unicorn], world, player, 1000);
  near(distance(unicorn, player), 0);
  assert.equal(circleCollides(world, unicorn, unicorn.radius), false);

  world.tiles[7 * world.width + 4] = HEDGE;
  player.x = 5.5;
  const before = { ...unicorn };
  assert.deepEqual(updateUnicorns([unicorn], world, player, 1000), []);
  assert.deepEqual(unicorn, before);
});

test('legacy navigation retains per-wave speed and exact straight time-step behavior', () => {
  const world = createWorld(1);
  const player = createPlayer(world.spawn);
  const first = spawnUnicorns(world, player, 1)[0];
  const later = { ...spawnUnicorns(world, player, 1, 2)[0], x: first.x, y: first.y };
  // Profile-less consumers retain the historical navigation contract. Varied
  // trajectories have their own documented subdivision tolerance below.
  delete first.movement;
  delete later.movement;
  const many = { ...first };
  updateUnicorns([first, later], world, player, 0.5);
  for (let tick = 0; tick < 30; tick++) updateUnicorns([many], world, player, 1 / 60);
  near(first.x, many.x);
  near(first.y, many.y);
  near(6.5 - first.x, UNICORN_SPEED * 0.5);
  near(first.x - later.x, WAVE_SPEED_INCREMENT * 0.5);
});

function steeringEnemy(id, x, y, movement = {}) {
  return enemy(x, y, { id, movement: { ...createMovementState('steering', id), ...movement } });
}

test('movement profiles are fresh, seed/ID-derived, and preserve spawn and attack streams', () => {
  const world = createWorld(1);
  const player = createPlayer(world.spawn);
  const herd = spawnUnicorns(world, player, 6);
  assert.deepEqual(herd.map(({ x, y }) => [x, y]), [
    [6.5, 12.5], [21.5, 21.5], [2.5, 21.5], [9.5, 4.5], [14.5, 10.5], [12.5, 21.5],
  ]);
  for (const unicorn of herd) {
    assert.deepEqual(unicorn.movement, createMovementState('1:1', unicorn.id));
    assert.deepEqual(unicorn.attack, createRangedAttackState('1:1', unicorn.id));
  }
  const replay = spawnUnicorns(world, player, 6);
  assert.notEqual(herd[0].movement, replay[0].movement);
  assert.notEqual(herd[0].movement, herd[1].movement);
  assert.notDeepEqual(createMovementState(0, 'a'), createMovementState(0, 'b'));
  assert.notDeepEqual(createMovementState(0, 'a'), createMovementState('0', 'a'));
  for (const seed of [null, Infinity, NaN, {}]) assert.throws(() => createMovementState(seed, 'a'), TypeError);
});

test('all three phases steer visibly, burst accelerates, and accepted steps obey geometry/speed/facing', () => {
  const world = createArena([], 30, 30);
  const player = createPlayer({ x: 25.5, y: 15.5, angle: 0 });
  const step = (phaseOffset, expectedPhase) => {
    const unicorn = steeringEnemy('phase', 4.5, 15.5, {
      phaseOffset, elapsed: 0, weaveAmplitude: 0.5, weaveFrequency: 0.6, weavePhase: 0,
    });
    const before = { x: unicorn.x, y: unicorn.y };
    assert.equal(tryVariedMovement(unicorn, world, player, snapshotHerd([unicorn]), 0.1), true);
    assert.equal(unicorn.movement.phase, expectedPhase);
    near(unicorn.movement.elapsed, 0.1);
    assert.ok(distance(before, unicorn) <= unicorn.speed * 0.1 + 1e-9);
    assert.equal(circleCollides(world, unicorn, unicorn.radius), false);
    near(unicorn.angle, Math.atan2(unicorn.y - before.y, unicorn.x - before.x));
    return { unicorn, traveled: distance(before, unicorn) };
  };
  const pursuit = step(0, 'pursuit');
  near(pursuit.unicorn.y, 15.5);
  const weaving = step(2.8, 'weaving');
  assert.ok(Math.abs(weaving.unicorn.y - 15.5) > 0.01, 'weaving has observable lateral displacement');
  const slow = step(4.9, 'burst');
  const fast = step(5.8, 'burst');
  assert.ok(fast.traveled > slow.traveled * 1.5);
  near(fast.traveled, fast.unicorn.speed * 0.1);

  const bursting = steeringEnemy('burst-cycle', 4.5, 15.5, { phaseOffset: 4.8 });
  const burstSteps = [];
  for (let tick = 0; tick < 15; tick++) {
    const before = { x: bursting.x, y: bursting.y };
    updateUnicorns([bursting], world, player, 0.1);
    assert.equal(bursting.movement.phase, 'burst');
    burstSteps.push(distance(before, bursting));
  }
  assert.ok(burstSteps[12] > burstSteps[0] * 1.5, 'one actor accelerates after its slow burst portion');

  const cycling = steeringEnemy('cycle', 4.5, 15.5, { phaseOffset: 0 });
  const phases = new Set();
  for (let tick = 0; tick < 420; tick++) {
    const before = { x: cycling.x, y: cycling.y };
    updateUnicorns([cycling], world, player, 1 / 60);
    phases.add(cycling.movement.phase);
    assert.ok(distance(before, cycling) <= cycling.speed / 60 + 1e-9);
    assert.equal(circleCollides(world, cycling, cycling.radius), false);
  }
  assert.deepEqual([...phases], ['pursuit', 'weaving', 'burst']);
  near(cycling.movement.elapsed, 7);
  assert.equal(cycling.movement.phase, 'pursuit');
});

test('herd separation uses living copies, spreads overlaps, and is independent of actor order', () => {
  const world = createArena([], 30, 30);
  const player = createPlayer({ x: 25.5, y: 15.5, angle: 0 });
  const herd = ['a', 'b', 'c'].map(id => steeringEnemy(id, 4.5, 15.5, { phaseOffset: 0 }));
  const dead = steeringEnemy('dead', 4.5, 15.6);
  dead.alive = false;
  const deadBefore = structuredClone(dead);
  herd.push(dead);
  const snapshot = snapshotHerd(herd);
  assert.deepEqual(snapshot.map(member => member.id), ['a', 'b', 'c']);
  const reversed = structuredClone(herd).reverse();
  updateUnicorns(herd, world, player, 1 / 60);
  assert.equal(snapshot[0].x, 4.5, 'snapshot does not alias moving actors');
  assert.ok(distance(herd[0], herd[2]) > 0, 'overlapping living actors spread apart');
  updateUnicorns(reversed, world, player, 1 / 60);
  for (let tick = 1; tick < 420; tick++) {
    updateUnicorns(herd, world, player, 1 / 60);
    updateUnicorns(reversed, world, player, 1 / 60);
  }
  assert.deepEqual(herd, reversed.reverse());
  assert.deepEqual(dead, deadBefore);
});

test('blocked steering is atomic and falls back on the same tick, including repeated corner fallback', () => {
  // The centerline is visible below this hedge, but a northward weave clips it.
  const world = arena([[4, 3]]);
  const player = createPlayer({ x: 7.5, y: 4.2, angle: 0 });
  const unicorn = steeringEnemy('blocked', 3.7, 4.2, {
    phaseOffset: 2.5, weaveAmplitude: 0.5, weaveFrequency: 0, weavePhase: -Math.PI / 2,
  });
  assert.equal(hasLineOfSight(world, unicorn, player), true);
  const before = structuredClone(unicorn);
  assert.equal(tryVariedMovement(unicorn, world, player, snapshotHerd([unicorn]), 0.2), false);
  near(unicorn.x, before.x);
  near(unicorn.y, before.y);
  near(unicorn.angle, before.angle);
  near(unicorn.movement.elapsed, 0.2);
  const legacy = { ...before };
  delete legacy.movement;
  const integrated = structuredClone(before);
  updateUnicorns([legacy], world, player, 0.2);
  updateUnicorns([integrated], world, player, 0.2);
  near(integrated.x, legacy.x);
  near(integrated.y, legacy.y);
  near(integrated.angle, legacy.angle);
  for (let tick = 0; tick < 300; tick++) updateUnicorns([integrated], world, player, 1 / 60);
  assert.ok(distance(integrated, player) <= integrated.radius + player.radius);
});

test('close and occluded pursuit use the field, while zero time and attack phases freeze steering', () => {
  const world = arena([[4, 2], [4, 3], [4, 4]]);
  const player = createPlayer({ x: 5.5, y: 3.5, angle: 0 });
  for (const [x, y] of [[3.5, 3.5], [5.5, 4.3]]) {
    const varied = steeringEnemy('fallback', x, y);
    const legacy = { ...varied };
    delete legacy.movement;
    updateUnicorns([varied], world, player, 0.1);
    updateUnicorns([legacy], world, player, 0.1);
    near(varied.x, legacy.x);
    near(varied.y, legacy.y);
    near(varied.angle, legacy.angle);
    near(varied.movement.elapsed, 0.1);
  }
  for (const phase of ['windup', 'recovery']) {
    const frozen = steeringEnemy('frozen', 2.5, 6.5);
    frozen.attack = { phase, remaining: 1, cooldownFor: 1, facing: 2, target: { ...player } };
    const before = structuredClone(frozen);
    updateUnicorns([frozen], world, player, 1);
    assert.deepEqual(frozen, before);
  }
  const fixtures = [steeringEnemy('zero', 2.5, 6.5), enemy(2.5, 6.5)];
  const before = structuredClone(fixtures);
  updateUnicorns(fixtures, world, player, 0);
  assert.deepEqual(fixtures, before);
  for (const seconds of [-1, NaN, Infinity]) {
    assert.throws(() => updateUnicorns(fixtures, world, player, seconds), RangeError);
    assert.deepEqual(fixtures, before);
  }
  assert.equal(Object.hasOwn(fixtures[1], 'movement'), false);
  const stale = buildDistanceField(world, player, UNICORN_RADIUS);
  player.x += 1;
  assert.throws(() => updateUnicorns(fixtures, world, player, 0.1, stale), RangeError);
  assert.deepEqual(fixtures, before, 'field validation precedes movement clock mutation');
});

test('steering trajectories approximate different subdivisions within 0.12 tiles over five seconds', () => {
  const world = createArena([], 30, 30);
  const player = createPlayer({ x: 25.5, y: 15.5, angle: 0 });
  const runs = [30, 60, 120].map(hz => {
    const unicorn = steeringEnemy('subdivisions', 4.5, 15.5, { phaseOffset: 0 });
    for (let tick = 0; tick < hz * 5; tick++) updateUnicorns([unicorn], world, player, 1 / hz);
    near(unicorn.movement.elapsed, 5);
    return unicorn;
  });
  for (const unicorn of runs) assert.ok(distance(unicorn, runs[1]) <= 0.12);
});

test('generated herds follow moving players through detours and eventually contact every actor', () => {
  for (let seed = 0; seed < 5; seed++) {
    const world = createWorld(seed);
    const player = createPlayer(world.spawn);
    const herd = spawnUnicorns(world, player, 12, 2);
    for (let tick = 0; tick < 900; tick++) {
      // Move within the protected corridor for 20 seconds, then hold position.
      if (tick < 200) updatePlayer(player, world, { forward: Math.sin(tick / 20) }, 0.1);
      const before = herd.map(({ x, y }) => ({ x, y }));
      updateUnicorns(herd, world, player, 0.1);
      herd.forEach((unicorn, i) => {
        assert.equal(circleCollides(world, unicorn, unicorn.radius), false);
        assert.ok(distance(before[i], unicorn) <= unicorn.speed * 0.1 + 1e-8);
      });
    }
    for (const unicorn of herd) assert.ok(distance(unicorn, player) <= unicorn.radius + player.radius);
  }
});

test('restart exactly replays profiles, steering state, actor positions, and event batches; pause freezes all', () => {
  const session = new GameSession('steering-replay').start();
  const play = () => {
    const history = [{ state: structuredClone({ ...session }), events: session.drainEvents() }];
    for (let tick = 0; tick < 600; tick++) {
      session.update(1 / 60, { turn: Math.sin(tick / 60), fire: tick % 20 < 10, strafe: tick % 120 < 60 ? 0.2 : -0.2 });
      history.push({ state: structuredClone({ ...session }), events: session.drainEvents() });
      if (tick === 120) {
        session.pause();
        const before = structuredClone({ ...session });
        session.update(10, { forward: 1, fire: true });
        assert.deepEqual(structuredClone({ ...session }), before);
        session.resume();
      }
    }
    return history;
  };
  const first = play();
  session.restart();
  assert.deepEqual(play(), first);
});

test('a group emits one damage event, shares invulnerability, and never drives health negative', () => {
  const world = arena();
  const player = createPlayer({ x: 4.5, y: 4.5, angle: 0 });
  const unicorns = Array.from({ length: 20 }, (_, i) => enemy(4.5, 4.5, { id: `contact:${i}` }));
  const events = updateUnicorns(unicorns, world, player, 0.01);
  assert.deepEqual(events, [{ type: 'damage', cause: 'contact', source: 'contact:0', amount: CONTACT_DAMAGE, resource: 'health', health: 4, armor: 0, x: 4.5, y: 4.5 }]);
  assert.equal(player.invulnerableFor, CONTACT_INVULNERABILITY);
  assert.deepEqual(updateUnicorns(unicorns, world, player, CONTACT_INVULNERABILITY / 2), []);
  near(player.invulnerableFor, CONTACT_INVULNERABILITY);
  updatePlayer(player, world, {}, CONTACT_INVULNERABILITY);
  assert.equal(updateUnicorns(unicorns, world, player, CONTACT_INVULNERABILITY / 2).length, 1);
  assert.equal(player.health, 5 - 2 * CONTACT_DAMAGE);
  // Even a frame longer than the cooldown emits at most one hit.
  updatePlayer(player, world, {}, 10);
  assert.equal(updateUnicorns(unicorns, world, player, 10).length, 1);
  assert.equal(player.health, 5 - 3 * CONTACT_DAMAGE);
  player.health = 1;
  updatePlayer(player, world, {}, 10);
  assert.equal(updateUnicorns(unicorns, world, player, 10)[0].amount, 1);
  assert.equal(player.health, 0);
  assert.deepEqual(updateUnicorns(unicorns, world, player, 10), []);
});

test('dead unicorns cannot move or damage, and contact before movement still counts', () => {
  const world = arena();
  const player = createPlayer({ x: 4.5, y: 4.5, angle: 0 });
  const dead = enemy(4.5, 4.5, { alive: false });
  const before = { ...dead };
  assert.deepEqual(updateUnicorns([dead], world, player, 10), []);
  assert.deepEqual(dead, before);
  assert.equal(player.health, 5);
  // Exact circle tangency is contact, even at the start of a zero-duration tick.
  const live = enemy(player.x + player.radius + UNICORN_RADIUS, player.y);
  assert.equal(updateUnicorns([dead, live], world, player, 0).length, 1);
  live.alive = false;
  const removed = { ...live };
  assert.deepEqual(updateUnicorns([dead, live], world, player, 10), []);
  assert.deepEqual(live, removed);
});

test('invalid configuration, elapsed time, and stale or incompatible fields fail explicitly', () => {
  const world = createWorld(1);
  const player = createPlayer(world.spawn);
  for (const count of [-1, 1.5, Infinity]) assert.throws(() => spawnUnicorns(world, player, count), RangeError);
  for (const wave of [0, 1.5, Infinity]) assert.throws(() => spawnUnicorns(world, player, 1, wave), RangeError);
  for (const seconds of [-1, NaN, Infinity]) assert.throws(() => updateUnicorns([], world, player, seconds), RangeError);
  const wrongRadius = buildDistanceField(world, player);
  assert.throws(() => updateUnicorns([], world, player, 0.1, wrongRadius), RangeError);
  const stale = buildDistanceField(world, player, UNICORN_RADIUS);
  player.x += 1;
  assert.throws(() => updateUnicorns([], world, player, 0.1, stale), RangeError);
});
