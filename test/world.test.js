import test from 'node:test';
import assert from 'node:assert/strict';
import { createRng, normalize } from '../src/math.js';
import {
  MAP_SIZE, EMPTY, createWorld, isSolid, raycast, circleCollides,
  moveCircle, hasLineOfSight, buildDistanceField,
} from '../src/world.js';
import { fixture } from './helpers/world.js';

function near(actual, expected, tolerance = 1e-9) {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} should be near ${expected}`);
}

test('seeded randomness and vector normalization handle zero and large values', () => {
  for (const seed of [0, 1, -12, 1.5, 'Glitter Grove', '🦄']) {
    const a = createRng(seed);
    const b = createRng(seed);
    for (let i = 0; i < 100; i++) {
      const value = a();
      assert.equal(value, b());
      assert.ok(value >= 0 && value < 1);
    }
  }
  assert.deepEqual(normalize({ x: 0, y: 0 }), { x: 0, y: 0 });
  near(normalize({ x: 3, y: 4 }).x, 0.6);
  const large = normalize({ x: 1e308, y: 1e308 });
  near(Math.hypot(large.x, large.y), 1);
  assert.throws(() => createRng(NaN), TypeError);
  assert.throws(() => normalize({ x: Infinity, y: 0 }), TypeError);
});

test('identical seeds reproduce the entire world and decoration layout', () => {
  for (const seed of [0, 1, -2, 'Glitter Grove', '🦄']) {
    assert.deepEqual(createWorld(seed), createWorld(seed));
  }
  assert.notDeepEqual(createWorld(0).tiles, createWorld(1).tiles);
  assert.notDeepEqual(createWorld('forest').decorations, createWorld('clearing').decorations);
});

test('generated forests are bounded, connected, and preserve the introduction corridor', () => {
  for (let seed = 0; seed < 200; seed++) {
    const world = createWorld(seed);
    assert.equal(world.width, MAP_SIZE);
    assert.equal(world.height, MAP_SIZE);
    assert.equal(world.tiles.length, 24 * 24);
    assert.equal(world.spawn.angle, 0);
    assert.equal(circleCollides(world, world.spawn), false);
    for (let coordinate = 0; coordinate < MAP_SIZE; coordinate++) {
      assert.ok(isSolid(world, coordinate, 0));
      assert.ok(isSolid(world, coordinate, MAP_SIZE - 1));
      assert.ok(isSolid(world, 0, coordinate));
      assert.ok(isSolid(world, MAP_SIZE - 1, coordinate));
    }
    for (let y = 11; y <= 13; y++) {
      for (let x = 2; x <= 9; x++) assert.equal(isSolid(world, x, y), false);
    }
    assert.equal(raycast(world, world.spawn, { x: 1, y: 0 }, 6).hit, false);
    assert.equal(hasLineOfSight(world, world.spawn, { x: 9.5, y: world.spawn.y }), true);

    // Independent flood-fill, rather than checking generation against itself.
    const seen = new Set();
    const queue = [[Math.floor(world.spawn.x), Math.floor(world.spawn.y)]];
    seen.add(queue[0][1] * MAP_SIZE + queue[0][0]);
    for (let head = 0; head < queue.length; head++) {
      const [x, y] = queue[head];
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nextX = x + dx;
        const nextY = y + dy;
        const index = nextY * MAP_SIZE + nextX;
        if (world.tiles[index] !== EMPTY || seen.has(index)) continue;
        seen.add(index);
        queue.push([nextX, nextY]);
      }
    }
    assert.equal(seen.size, world.tiles.filter(tile => tile === EMPTY).length);
    assert.ok(world.decorations.length > 0);
    assert.deepEqual(new Set(world.decorations.map(decoration => decoration.type)), new Set(['mushroom', 'stone', 'flower']));
    for (const decoration of world.decorations) {
      assert.equal(isSolid(world, Math.floor(decoration.x), Math.floor(decoration.y)), false);
      assert.equal(decoration.x >= 2 && decoration.x < 10 && decoration.y >= 11 && decoration.y < 14, false);
    }
  }
});

test('raycasts stop at the first hedge with normalized distances on every axis', () => {
  const world = fixture(8, 8, [[4, 3], [3, 5]]);
  const origin = { x: 3.5, y: 3.5 };
  const cases = [
    [{ x: 10, y: 0 }, 0.5, 4, 3, { x: -1, y: 0 }],
    [{ x: -10, y: 0 }, 2.5, 0, 3, { x: 1, y: 0 }],
    [{ x: 0, y: 10 }, 1.5, 3, 5, { x: 0, y: -1 }],
    [{ x: 0, y: -10 }, 2.5, 3, 0, { x: 0, y: 1 }],
  ];
  for (const [direction, distance, tileX, tileY, normal] of cases) {
    const hit = raycast(world, origin, direction);
    assert.equal(hit.hit, true);
    near(hit.distance, distance);
    assert.equal(hit.tileX, tileX);
    assert.equal(hit.tileY, tileY);
    assert.deepEqual(hit.normal, normal);
    assert.ok(Number.isFinite(hit.x) && Number.isFinite(hit.y));
  }
  const diagonal = raycast(fixture(8, 8, [[4, 4]]), origin, { x: 2, y: 2 });
  near(diagonal.distance, Math.SQRT1_2);
  near(diagonal.x, 4);
  near(diagonal.y, 4);
});

test('raycasts handle ranges, zero directions, solid origins, boundaries, and corners', () => {
  const world = fixture(8, 8, [[4, 3], [3, 4]]);
  const origin = { x: 3.5, y: 3.5 };
  const miss = raycast(world, origin, { x: 10, y: 0 }, 0.25);
  assert.equal(miss.hit, false);
  assert.equal(miss.distance, 0.25);
  assert.equal(miss.x, 3.75);
  assert.equal(miss.tileX, null);
  assert.equal(raycast(world, origin, { x: 1, y: 0 }, 0.5).hit, true);
  const stationary = raycast(world, origin, { x: 0, y: 0 });
  assert.equal(stationary.hit, false);
  assert.equal(stationary.distance, 0);
  assert.equal(stationary.x, origin.x);
  assert.equal(raycast(world, { x: 4.5, y: 3.5 }, { x: 0, y: 0 }).distance, 0);
  assert.equal(raycast(world, { x: -1, y: 3.5 }, { x: 1, y: 0 }).hit, true);
  assert.equal(raycast(world, { x: 1, y: 3.5 }, { x: -1, y: 0 }).distance, 0);
  assert.equal(raycast(world, origin, { x: 1, y: 1 }).hit, true);
  near(raycast(world, origin, { x: 1, y: 1 }).distance, Math.SQRT1_2);
  assert.equal(raycast(world, origin, { x: 0, y: 1 }, 0).distance, 0);
  assert.throws(() => raycast(world, origin, { x: 1, y: 0 }, NaN), RangeError);
  assert.throws(() => raycast(world, origin, { x: 1, y: 0 }, -1), RangeError);
});

test('rays and visibility block corners despite accumulated floating-point rounding', () => {
  const world = fixture(8, 8, [[4, 3]]);
  for (const origin of [{ x: 1.2, y: 1.3 }, { x: 2.3, y: 1.8 }, { x: 1.1, y: 1.9 }]) {
    const direction = { x: 4 - origin.x, y: 4 - origin.y };
    const distance = Math.hypot(direction.x, direction.y);
    const hit = raycast(world, origin, direction, distance);
    assert.equal(hit.hit, true);
    assert.equal(hit.tileX, 4);
    assert.equal(hit.tileY, 3);
    near(hit.distance, distance);
    assert.equal(hasLineOfSight(world, origin, { x: 4, y: 4 }), false);
  }
});

test('circle collision respects edges, rounded corners, tangency, and passable decorations', () => {
  const world = fixture(8, 8, [[4, 4]]);
  assert.equal(circleCollides(world, { x: 3.75, y: 4.5 }, 0.25), false);
  assert.equal(circleCollides(world, { x: 3.8, y: 4.5 }, 0.25), true);
  assert.equal(circleCollides(world, { x: 3.8, y: 3.8 }, 0.25), false);
  assert.equal(circleCollides(world, { x: 3.9, y: 3.9 }, 0.25), true);
  assert.equal(circleCollides(world, { x: 4.5, y: 4.5 }, 0), true);
  assert.equal(circleCollides(world, { x: 4.5, y: 4.5 }, 1e-300), true);
  assert.equal(circleCollides(world, { x: -0.25, y: 3 }, 0.25), true);
  assert.equal(circleCollides(world, { x: 3, y: 3 }, 1e300), true);
  const position = { x: 2.5, y: 2.5 };
  world.decorations = ['mushroom', 'stone', 'flower'].map(type => ({ type, ...position, size: 1 }));
  assert.equal(circleCollides(world, position), false);
  assert.equal(hasLineOfSight(world, { x: 1.5, y: 2.5 }, { x: 5.5, y: 2.5 }), true);
  assert.throws(() => circleCollides(world, position, -1), RangeError);
  assert.throws(() => circleCollides(world, { x: NaN, y: 1 }), TypeError);
});

test('movement slides along walls in both axes and stops near contact', () => {
  const verticalWall = fixture(8, 8, [[4, 1], [4, 2], [4, 3], [4, 4], [4, 5], [4, 6]]);
  const position = { x: 3.5, y: 2.5 };
  const delta = { x: 2, y: 2 };
  const moved = moveCircle(verticalWall, position, delta, 0.25);
  near(moved.x, 3.75, 0.0001);
  near(moved.y, 4.5);
  assert.equal(circleCollides(verticalWall, moved, 0.25), false);
  assert.deepEqual(position, { x: 3.5, y: 2.5 });
  assert.deepEqual(delta, { x: 2, y: 2 });

  const horizontalWall = fixture(8, 8, [[1, 4], [2, 4], [3, 4], [4, 4], [5, 4], [6, 4]]);
  const along = moveCircle(horizontalWall, { x: 2.5, y: 3.5 }, delta, 0.25);
  near(along.x, 4.5);
  near(along.y, 3.75, 0.0001);
});

test('movement cannot tunnel with large deltas, escape the map, or squeeze through hedge corners', () => {
  const world = fixture(8, 8, [[4, 1], [4, 2], [4, 3], [4, 4], [4, 5], [4, 6]]);
  for (const delta of [{ x: 10000, y: 0 }, { x: 1e308, y: 1e308 }, { x: -10000, y: -10000 }]) {
    const moved = moveCircle(world, { x: 2.5, y: 3.5 }, delta, 0.25);
    assert.equal(circleCollides(world, moved, 0.25), false);
    assert.ok(moved.x >= 1.25 && moved.x <= 3.75);
    assert.ok(moved.y >= 1.25 && moved.y <= 6.75);
  }
  const corner = fixture(8, 8, [[4, 3], [3, 4]]);
  const moved = moveCircle(corner, { x: 3.5, y: 3.5 }, { x: 3, y: 3 }, 0.25);
  assert.ok(moved.x < 4 && moved.y < 4);
  assert.equal(circleCollides(corner, moved, 0.25), false);
  assert.deepEqual(moveCircle(world, { x: 4.5, y: 3.5 }, { x: 1, y: 1 }), { x: 4.5, y: 3.5 });
  assert.deepEqual(moveCircle(world, { x: 2.5, y: 3.5 }, { x: 0, y: 0 }), { x: 2.5, y: 3.5 });
});

test('visibility shares raycast geometry, including blocked endpoints and corner occlusion', () => {
  const world = fixture(8, 8, [[4, 3], [3, 4]]);
  const from = { x: 3.5, y: 3.5 };
  assert.equal(hasLineOfSight(world, from, { x: 3.5, y: 1.5 }), true);
  assert.equal(hasLineOfSight(world, from, { x: 5.5, y: 3.5 }), false);
  assert.equal(hasLineOfSight(world, from, { x: 4.5, y: 4.5 }), false);
  assert.equal(hasLineOfSight(world, from, { x: 4.5, y: 3.5 }), false);
  assert.equal(hasLineOfSight(world, from, from), true);
  assert.equal(hasLineOfSight(world, { x: 4.5, y: 3.5 }, from), false);
  assert.equal(hasLineOfSight(world, from, { x: 20, y: 3.5 }), false);
});

test('navigation distances take the shortest cardinal detour around hedges', () => {
  const world = fixture(8, 8, [[4, 1], [4, 2], [4, 3], [4, 4], [4, 5]]);
  const field = buildDistanceField(world, { x: 5.5, y: 2.5 });
  const distanceAt = (x, y) => field.distances[y * world.width + x];
  assert.equal(distanceAt(5, 2), 0);
  assert.equal(distanceAt(3, 2), 10);
  assert.equal(distanceAt(4, 2), Infinity);
  assert.equal(distanceAt(0, 0), Infinity);

  let x = 3;
  let y = 2;
  for (let steps = 0; steps < 10; steps++) {
    const next = [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]
      .find(([nextX, nextY]) => distanceAt(nextX, nextY) === distanceAt(x, y) - 1);
    assert.ok(next, 'A lower-distance walkable neighbor exists.');
    const moved = moveCircle(world, { x: x + 0.5, y: y + 0.5 }, { x: next[0] - x, y: next[1] - y });
    near(moved.x, next[0] + 0.5);
    near(moved.y, next[1] + 0.5);
    [x, y] = next;
  }
  assert.deepEqual([x, y], [5, 2]);
});

test('navigation reports unreachable cells and uses the navigating circle radius', () => {
  const closed = fixture(8, 8, [[4, 1], [4, 2], [4, 3], [4, 4], [4, 5], [4, 6]]);
  const field = buildDistanceField(closed, { x: 5.5, y: 2.5 });
  assert.equal(field.distances[2 * closed.width + 3], Infinity);
  assert.ok(buildDistanceField(closed, { x: 4.5, y: 2.5 }).distances.every(value => value === Infinity));
  assert.ok(buildDistanceField(closed, { x: -1, y: 2.5 }).distances.every(value => value === Infinity));

  const narrow = fixture(9, 9, [[4, 1], [4, 2], [4, 3], [4, 5], [4, 6], [4, 7]]);
  const small = buildDistanceField(narrow, { x: 6.5, y: 4.5 }, 0.25);
  const large = buildDistanceField(narrow, { x: 6.5, y: 4.5 }, 0.6);
  assert.ok(Number.isFinite(small.distances[4 * narrow.width + 2]));
  assert.equal(large.distances[4 * narrow.width + 2], Infinity);
  assert.equal(large.radius, 0.6);
});
