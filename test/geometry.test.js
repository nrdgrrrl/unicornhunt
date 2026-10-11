import test from 'node:test';
import assert from 'node:assert/strict';
import {
  EMPTY, createWorld, raycast, circleCollides, moveCircle, hasLineOfSight,
} from '../src/world.js';
import { createPlayer, updatePlayer } from '../src/player.js';
import { spawnUnicorns, updateUnicorns } from '../src/unicorn.js';
import { arena as createArena } from './helpers/world.js';
import * as worldGeometry from '../src/world.js';
import * as geometry from '../src/geometry.js';
import {
  rayCircleDistance, distanceAt, nextDistanceCell, assertDistanceField,
} from '../src/geometry.js';

const near = (actual, expected, tolerance = 1e-9) =>
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} should be near ${expected}`);

function arena(hedges = []) {
  return createArena(hedges, 10, 10);
}

test('public hedge queries are the authoritative world function objects', () => {
  for (const name of ['isSolid', 'raycast', 'circleCollides', 'moveCircle', 'hasLineOfSight', 'buildDistanceField']) {
    assert.equal(geometry[name], worldGeometry[name], name);
  }
});

test('ray-circle distances normalize direction and include tangency', () => {
  const origin = { x: 2, y: 3 };
  for (const magnitude of [1, 10, 1e308]) {
    const direction = { x: magnitude, y: 0 };
    assert.equal(rayCircleDistance(origin, direction, { x: 5, y: 3, radius: 1 }), 2);
    assert.equal(rayCircleDistance(origin, direction, { x: 5, y: 4, radius: 1 }), 3);
    assert.equal(rayCircleDistance(origin, direction, { x: 5, y: 4.001, radius: 1 }), Infinity);
    // Preserve combat's tolerance for roundoff at the tangent surface.
    assert.equal(rayCircleDistance(origin, direction, { x: 5, y: 4 + Number.EPSILON * 4, radius: 1 }), 3);
  }
  near(rayCircleDistance(origin, { x: 3, y: 4 }, { x: 5, y: 7, radius: 1 }), 4);
  assert.equal(rayCircleDistance(origin, { x: -3, y: 0 }, { x: -1, y: 3, radius: 1 }), 2);
  assert.equal(rayCircleDistance(origin, { x: 0, y: -3 }, { x: 2, y: 0, radius: 1 }), 2);
});

test('ray-circle queries handle muzzle overlap, rear targets, point circles, and zero direction', () => {
  const origin = { x: 0, y: 0 };
  const direction = { x: 1, y: 0 };
  for (const circle of [
    { x: 0, y: 0, radius: 1 },
    { x: -0.5, y: 0, radius: 1 },
    { x: -1, y: 0, radius: 1 },
    { x: 1, y: 0, radius: 1 },
    { x: 0, y: 0, radius: 0 },
  ]) assert.equal(rayCircleDistance(origin, direction, circle), 0);
  assert.equal(rayCircleDistance(origin, direction, { x: -2, y: 0, radius: 1 }), Infinity);
  assert.equal(rayCircleDistance(origin, direction, { x: 2, y: 0, radius: 0 }), 2);
  assert.equal(rayCircleDistance(origin, direction, { x: 2, y: 0.1, radius: 0 }), Infinity);
  for (const circle of [{ x: 0, y: 0, radius: 1 }, { x: 10, y: 0, radius: 1 }]) {
    assert.equal(rayCircleDistance(origin, { x: 0, y: 0 }, circle), Infinity);
  }
});

test('ray-circle queries reject invalid positions, directions, and radii', () => {
  const origin = { x: 0, y: 0 };
  const direction = { x: 1, y: 0 };
  const circle = { x: 2, y: 0, radius: 1 };
  for (const invalid of [NaN, Infinity, -Infinity]) {
    for (const axis of ['x', 'y']) {
      assert.throws(() => rayCircleDistance({ ...origin, [axis]: invalid }, direction, circle), TypeError);
      assert.throws(() => rayCircleDistance(origin, { ...direction, [axis]: invalid }, circle), TypeError);
      assert.throws(() => rayCircleDistance(origin, direction, { ...circle, [axis]: invalid }), TypeError);
    }
  }
  for (const radius of [-1, NaN, Infinity]) {
    assert.throws(() => rayCircleDistance(origin, direction, { ...circle, radius }), RangeError);
  }
});

test('distance queries use field dimensions and never wrap rows or accept fractional cells', () => {
  // Open edges give neighboring rows finite distances, exposing accidental wrap.
  const world = { width: 4, height: 3, tiles: new Uint8Array(12) };
  const field = geometry.buildDistanceField(world, { x: 2.5, y: 1.5 }, 0);
  assert.equal(distanceAt(field, 2, 1), 0);
  assert.equal(distanceAt(field, 0, 0), 3);
  assert.equal(distanceAt(field, 3, 2), 2);
  for (const [x, y] of [
    [-1, 1], [4, 0], [4, 1], [0, -1], [0, 3],
    [0.5, 1], [1, 0.5], [NaN, 1], [1, NaN], [Infinity, 1], [1, -Infinity],
  ]) assert.equal(distanceAt(field, x, y), Infinity, `cell ${x},${y}`);
});

test('distance queries retain solid, unreachable, and radius clearance semantics', () => {
  const closed = arena(Array.from({ length: 8 }, (_, i) => [5, i + 1]));
  const field = geometry.buildDistanceField(closed, { x: 6.5, y: 4.5 });
  for (const [x, y] of [[0, 0], [5, 4], [4, 4]]) {
    assert.equal(distanceAt(field, x, y), Infinity);
    assert.equal(nextDistanceCell(field, x, y), null);
  }
  const opening = arena([[5, 3], [5, 5]]);
  const small = geometry.buildDistanceField(opening, { x: 6.5, y: 4.5 }, 0.25);
  const large = geometry.buildDistanceField(opening, { x: 6.5, y: 4.5 }, 0.6);
  assert.equal(distanceAt(small, 5, 4), 1);
  assert.equal(distanceAt(large, 5, 4), Infinity);
});

test('next distance cell preserves every right/left/down/up tie and returns integer cells', () => {
  const field = geometry.buildDistanceField(arena(), { x: 4.5, y: 4.5 });
  // Synthetic ties isolate neighbor selection from BFS construction.
  field.distances.fill(1);
  field.distances[4 * field.width + 4] = 2;
  const neighbors = [{ x: 5, y: 4 }, { x: 3, y: 4 }, { x: 4, y: 5 }, { x: 4, y: 3 }];
  for (const expected of neighbors) {
    const before = field.distances.slice();
    assert.deepEqual(nextDistanceCell(field, 4, 4), expected);
    assert.deepEqual(field.distances, before, 'query does not mutate distances');
    field.distances[expected.y * field.width + expected.x] = 2;
  }
  assert.equal(nextDistanceCell(field, 4, 4), null);
});

test('next distance cell stops at targets and map edges without wrapping rows', () => {
  const world = { width: 4, height: 3, tiles: new Uint8Array(12) };
  const field = geometry.buildDistanceField(world, { x: 0.5, y: 1.5 }, 0);
  assert.equal(nextDistanceCell(field, 0, 1), null);
  assert.deepEqual(nextDistanceCell(field, 3, 0), { x: 2, y: 0 });
  assert.deepEqual(nextDistanceCell(field, 0, 0), { x: 0, y: 1 });
  for (const [x, y] of [[-1, 1], [4, 0], [0, -1], [0, 3], [0.5, 1]]) {
    assert.equal(nextDistanceCell(field, x, y), null);
  }
});

test('field validation accepts same-tile movement and rejects stale targets, sizes, and radii', () => {
  const world = arena();
  const target = { x: 4.5, y: 3.5 };
  const field = geometry.buildDistanceField(world, target, 0.25);
  assert.doesNotThrow(() => assertDistanceField(field, world, target, 0.25));
  assert.doesNotThrow(() => assertDistanceField(field, world, { x: 4, y: 3.99 }, 0.25));
  assert.throws(() => assertDistanceField(field, world, { x: 5, y: 3.5 }, 0.25), RangeError);
  assert.throws(() => assertDistanceField(field, world, { x: 4.5, y: 2.99 }, 0.25), RangeError);
  assert.throws(() => assertDistanceField(field, { ...world, width: 11 }, target, 0.25), RangeError);
  assert.throws(() => assertDistanceField(field, { ...world, height: 11 }, target, 0.25), RangeError);
  assert.throws(() => assertDistanceField(field, world, target, 0.2), RangeError);
  const defaultField = geometry.buildDistanceField(world, target);
  assert.doesNotThrow(() => assertDistanceField(defaultField, world, target));
  for (const blocked of [{ x: 0.5, y: 0.5 }, { x: -0.5, y: 2.5 }]) {
    const blockedField = geometry.buildDistanceField(world, blocked, 0.25);
    assert.doesNotThrow(() => assertDistanceField(blockedField, world, blocked, 0.25));
  }
});

// Check connectivity independently of the distance field used by generation
// and spawning, so a shared implementation defect cannot validate itself.
function reachableCells(world) {
  const start = Math.floor(world.spawn.y) * world.width + Math.floor(world.spawn.x);
  const seen = new Set([start]);
  const queue = [start];
  for (let head = 0; head < queue.length; head++) {
    const index = queue[head];
    const x = index % world.width;
    const y = Math.floor(index / world.width);
    for (const [nx, ny] of [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]]) {
      if (nx < 0 || ny < 0 || nx >= world.width || ny >= world.height) continue;
      const next = ny * world.width + nx;
      if (world.tiles[next] !== EMPTY || seen.has(next)) continue;
      seen.add(next);
      queue.push(next);
    }
  }
  return seen;
}

test('100 seeded maps reproduce all geometry and safely spawn every reachable wave', () => {
  for (let seed = 0; seed < 100; seed++) {
    const world = createWorld(seed);
    assert.deepEqual(createWorld(seed), world, `map seed ${seed}`);
    const reachable = reachableCells(world);
    assert.equal(reachable.size, world.tiles.filter(tile => tile === EMPTY).length, `connectivity seed ${seed}`);
    const player = createPlayer(world.spawn);
    assert.equal(circleCollides(world, player, player.radius), false);
    for (const [wave, count] of [[1, 6], [2, 8], [3, 10]]) {
      const unicorns = spawnUnicorns(world, player, count, wave);
      assert.deepEqual(spawnUnicorns(world, player, count, wave), unicorns, `spawn seed ${seed}, wave ${wave}`);
      assert.equal(unicorns.length, count);
      for (const [index, unicorn] of unicorns.entries()) {
        assert.equal(unicorn.alive, true);
        assert.ok(reachable.has(Math.floor(unicorn.y) * world.width + Math.floor(unicorn.x)));
        assert.equal(circleCollides(world, unicorn, unicorn.radius), false);
        assert.ok(Math.hypot(unicorn.x - player.x, unicorn.y - player.y) >= 3);
        for (const other of unicorns.slice(0, index)) {
          assert.ok(Math.hypot(unicorn.x - other.x, unicorn.y - other.y) >= 1);
        }
      }
    }
  }
});

test('horizontal and vertical rays return exact first-wall distances and endpoints', () => {
  const world = arena([[6, 4], [4, 6]]);
  const origin = { x: 4.5, y: 4.5 };
  for (const [direction, distance, endpoint] of [
    [{ x: 7, y: 0 }, 1.5, [6, 4.5]],
    [{ x: -7, y: 0 }, 3.5, [1, 4.5]],
    [{ x: 0, y: 7 }, 1.5, [4.5, 6]],
    [{ x: 0, y: -7 }, 3.5, [4.5, 1]],
  ]) {
    const hit = raycast(world, origin, direction);
    assert.equal(hit.hit, true);
    near(hit.distance, distance);
    near(hit.x, endpoint[0]);
    near(hit.y, endpoint[1]);
    const miss = raycast(world, origin, direction, distance / 2);
    assert.equal(miss.hit, false);
    near(miss.distance, distance / 2);
  }
});

test('circle edges and corners permit tangency and sliding in either axis without tunneling', () => {
  const corner = arena([[5, 5]]);
  assert.equal(circleCollides(corner, { x: 4.75, y: 5.5 }, 0.25), false);
  assert.equal(circleCollides(corner, { x: 4.76, y: 5.5 }, 0.25), true);
  assert.equal(circleCollides(corner, { x: 4.8, y: 4.8 }, 0.25), false);
  assert.equal(circleCollides(corner, { x: 4.9, y: 4.9 }, 0.25), true);
  for (const vertical of [true, false]) {
    const world = arena(Array.from({ length: 8 }, (_, i) => vertical ? [5, i + 1] : [i + 1, 5]));
    const start = vertical ? { x: 4.5, y: 2.5 } : { x: 2.5, y: 4.5 };
    const moved = moveCircle(world, start, { x: 2, y: 2 }, 0.25);
    near(vertical ? moved.x : moved.y, 4.75, 0.0001);
    near(vertical ? moved.y : moved.x, 4.5);
    assert.equal(circleCollides(world, moved, 0.25), false);
    const fast = moveCircle(world, start, vertical ? { x: 1000, y: 0 } : { x: 0, y: 1000 }, 0.25);
    near(vertical ? fast.x : fast.y, 4.75, 0.0001);
    assert.equal(circleCollides(world, fast, 0.25), false);
  }
});

test('diagonal movement has the same walking and running speed at different headings', () => {
  const world = arena();
  for (const angle of [0, Math.PI / 2, Math.PI, Math.PI / 4]) {
    for (const run of [false, true]) {
      for (const input of [{ forward: 1 }, { strafe: -1 }, { forward: 1, strafe: 1 }]) {
        const player = createPlayer({ x: 4.5, y: 4.5, angle });
        updatePlayer(player, world, { ...input, run }, 0.25);
        near(Math.hypot(player.x - 4.5, player.y - 4.5), run ? 1.25 : 0.625);
      }
    }
  }
});

test('impossible spawn requests terminate and navigation detours through the only hedge opening', { timeout: 2000 }, () => {
  const world = arena(Array.from({ length: 6 }, (_, i) => [5, i + 1]));
  const player = createPlayer({ x: 6.5, y: 2.5, angle: 0 });
  assert.throws(() => spawnUnicorns(world, player, Number.MAX_SAFE_INTEGER, 2), RangeError);
  const unicorn = { id: 'detour', x: 4.5, y: 2.5, radius: 0.25, speed: 1.2, angle: 0, alive: true };
  assert.equal(hasLineOfSight(world, unicorn, player), false);
  let passedOpening = false;
  let contact = false;
  for (let tick = 0; tick < 1200 && !contact; tick++) {
    const events = updateUnicorns([unicorn], world, player, 1 / 60);
    passedOpening ||= unicorn.y >= 7;
    assert.equal(circleCollides(world, unicorn, unicorn.radius), false, `navigation tick ${tick}`);
    contact = events.some(event => event.type === 'damage');
  }
  assert.equal(passedOpening, true);
  assert.equal(contact, true);
  assert.equal(player.health, 4);
  assert.ok(Math.hypot(unicorn.x - player.x, unicorn.y - player.y) <= 0.45 + 1e-9);
});
