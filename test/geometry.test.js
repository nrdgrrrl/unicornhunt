import test from 'node:test';
import assert from 'node:assert/strict';
import {
  EMPTY, HEDGE, createWorld, raycast, circleCollides, moveCircle, hasLineOfSight,
} from '../src/world.js';
import { createPlayer, updatePlayer } from '../src/player.js';
import { spawnUnicorns, updateUnicorns } from '../src/unicorn.js';

const near = (actual, expected, tolerance = 1e-9) =>
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} should be near ${expected}`);

function arena(hedges = []) {
  const width = 10;
  const height = 10;
  const tiles = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (x === 0 || y === 0 || x === width - 1 || y === height - 1) tiles[y * width + x] = HEDGE;
    }
  }
  for (const [x, y] of hedges) tiles[y * width + x] = HEDGE;
  return { width, height, tiles };
}

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
  assert.equal(player.magic, 80);
  assert.ok(Math.hypot(unicorn.x - player.x, unicorn.y - player.y) <= 0.45 + 1e-9);
});
