import test from 'node:test';
import assert from 'node:assert/strict';
import { createPlayer } from '../src/player.js';
import { createWorld, HEDGE, circleCollides, buildDistanceField, hasLineOfSight } from '../src/world.js';
import {
  spawnUnicorns, updateUnicorns, UNICORN_RADIUS, UNICORN_SPEED, WAVE_SPEED_INCREMENT,
  PLAYER_SPAWN_DISTANCE, UNICORN_SPAWN_DISTANCE, CONTACT_DAMAGE, CONTACT_INVULNERABILITY,
} from '../src/unicorn.js';

const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-8, `${actual} should be near ${expected}`);

function arena(hedges = []) {
  const width = 9;
  const height = 9;
  const world = { width, height, tiles: new Uint8Array(width * height) };
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (x === 0 || y === 0 || x === width - 1 || y === height - 1) world.tiles[y * width + x] = HEDGE;
    }
  }
  for (const [x, y] of hedges) world.tiles[y * width + x] = HEDGE;
  return world;
}

function enemy(x, y, overrides = {}) {
  return { id: 'test', x, y, radius: UNICORN_RADIUS, speed: UNICORN_SPEED, angle: 0, alive: true, ...overrides };
}

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

test('later waves move modestly faster and movement is consistent across time steps', () => {
  const world = createWorld(1);
  const player = createPlayer(world.spawn);
  const first = spawnUnicorns(world, player, 1)[0];
  const later = { ...spawnUnicorns(world, player, 1, 2)[0], x: first.x, y: first.y };
  const many = { ...first };
  updateUnicorns([first, later], world, player, 0.5);
  for (let tick = 0; tick < 30; tick++) updateUnicorns([many], world, player, 1 / 60);
  near(first.x, many.x);
  near(first.y, many.y);
  near(6.5 - first.x, UNICORN_SPEED * 0.5);
  near(first.x - later.x, WAVE_SPEED_INCREMENT * 0.5);
});

test('a group emits one damage event, shares invulnerability, and never drives magic negative', () => {
  const world = arena();
  const player = createPlayer({ x: 4.5, y: 4.5, angle: 0 });
  const unicorns = Array.from({ length: 20 }, (_, i) => enemy(4.5, 4.5, { id: `contact:${i}` }));
  const events = updateUnicorns(unicorns, world, player, 0.01);
  assert.deepEqual(events, [{ type: 'damage', source: 'contact:0', amount: CONTACT_DAMAGE, magic: 100 - CONTACT_DAMAGE, x: 4.5, y: 4.5 }]);
  assert.equal(player.invulnerableFor, CONTACT_INVULNERABILITY);
  assert.deepEqual(updateUnicorns(unicorns, world, player, CONTACT_INVULNERABILITY / 2), []);
  near(player.invulnerableFor, CONTACT_INVULNERABILITY / 2);
  assert.equal(updateUnicorns(unicorns, world, player, CONTACT_INVULNERABILITY / 2).length, 1);
  assert.equal(player.magic, 100 - 2 * CONTACT_DAMAGE);
  // Even a frame longer than the cooldown emits at most one hit.
  assert.equal(updateUnicorns(unicorns, world, player, 10).length, 1);
  assert.equal(player.magic, 100 - 3 * CONTACT_DAMAGE);
  player.magic = 3;
  assert.equal(updateUnicorns(unicorns, world, player, 10)[0].amount, 3);
  assert.equal(player.magic, 0);
  assert.deepEqual(updateUnicorns(unicorns, world, player, 10), []);
});

test('dead unicorns cannot move or damage, and contact before movement still counts', () => {
  const world = arena();
  const player = createPlayer({ x: 4.5, y: 4.5, angle: 0 });
  const dead = enemy(4.5, 4.5, { alive: false });
  const before = { ...dead };
  assert.deepEqual(updateUnicorns([dead], world, player, 10), []);
  assert.deepEqual(dead, before);
  assert.equal(player.magic, 100);
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
