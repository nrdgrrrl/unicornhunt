import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnPickups, collectPickups } from '../src/pickups.js';
import { createWorld, HEDGE } from '../src/world.js';
import { createPlayer } from '../src/player.js';
import { spawnUnicorns } from '../src/unicorn.js';
import {
  buildDistanceField, circleCollides, distanceAt, hasLineOfSight, moveCircle, nextDistanceCell,
} from '../src/geometry.js';
import { createSurvivalState, applyDamage } from '../src/survival.js';
import {
  PICKUP_RADIUS, HEALTH_PICKUPS_PER_WAVE, ARMOR_PICKUPS_PER_WAVE, MAX_HEALTH, MAX_ARMOR,
} from '../src/config.js';
import { arena } from './helpers/world.js';
import { enemy } from './helpers/simulation.js';

const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const playerAt = (x = 4.5, y = 4.5, radius) => createPlayer({ x, y, angle: 0 }, radius);
const pickup = (id, kind = 'health', x = 4.5, y = 4.5, radius = PICKUP_RADIUS) => ({
  id, kind, x, y, radius,
});

test('generated forests supply deterministic, distinct, reachable cakes and armor each wave', () => {
  for (let seed = 0; seed < 50; seed++) {
    const world = createWorld(seed);
    const player = createPlayer(world.spawn);
    for (const wave of [1, 2, 3]) {
      const unicorns = spawnUnicorns(world, player, 4 + wave * 2, wave);
      const before = structuredClone({ world, player, unicorns });
      const items = spawnPickups(world, player, unicorns, wave);
      assert.equal(items.filter(item => item.kind === 'health').length, HEALTH_PICKUPS_PER_WAVE);
      assert.equal(items.filter(item => item.kind === 'armor').length, ARMOR_PICKUPS_PER_WAVE);
      assert.equal(new Set(items.map(item => item.id)).size, items.length);
      assert.equal(new Set(items.map(item => `${item.x}:${item.y}`)).size, items.length);
      assert.deepEqual(items, spawnPickups(world, player, unicorns, wave));
      assert.deepEqual({ world, player, unicorns }, before);
      assert.deepEqual(unicorns, spawnUnicorns(world, player, unicorns.length, wave));
      const field = buildDistanceField(world, player, player.radius);
      for (const item of items) {
        assert.equal(item.x % 1, 0.5);
        assert.equal(item.y % 1, 0.5);
        assert.equal(circleCollides(world, item, player.radius), false);
        assert.equal(circleCollides(world, item, item.radius), false);
        assert.ok(Number.isFinite(distanceAt(field, Math.floor(item.x), Math.floor(item.y))));
        assert.ok(distance(item, player) > player.radius + item.radius);
        assert.ok(unicorns.every(unicorn => distance(item, unicorn) > unicorn.radius + item.radius));
      }
    }
  }
});

test('generated pickup centers have traversable paths for the player circle', () => {
  for (let seed = 0; seed < 10; seed++) {
    const world = createWorld(seed);
    const player = createPlayer(world.spawn);
    const field = buildDistanceField(world, player, player.radius);
    const items = spawnPickups(world, player, spawnUnicorns(world, player, 6));
    for (const item of items) {
      let position = { x: item.x, y: item.y };
      for (let step = 0; step < world.width * world.height; step++) {
        const cell = nextDistanceCell(field, Math.floor(position.x), Math.floor(position.y));
        if (!cell) break;
        const center = { x: cell.x + 0.5, y: cell.y + 0.5 };
        position = moveCircle(world, position, {
          x: center.x - position.x, y: center.y - position.y,
        }, player.radius);
        assert.deepEqual(position, center);
      }
      assert.deepEqual(position, { x: player.x, y: player.y });
    }
  }
});

test('disconnected pockets and cells without clearance for a larger player are excluded', () => {
  const world = arena(Array.from({ length: 10 }, (_, i) => [7, i + 1]));
  const player = playerAt(3.5, 4.5, 0.6);
  const items = spawnPickups(world, player, []);
  assert.equal(items.length, HEALTH_PICKUPS_PER_WAVE + ARMOR_PICKUPS_PER_WAVE);
  const field = buildDistanceField(world, player, player.radius);
  for (const item of items) {
    assert.ok(item.x < 7);
    assert.equal(circleCollides(world, item, player.radius), false);
    assert.ok(Number.isFinite(distanceAt(field, Math.floor(item.x), Math.floor(item.y))));
  }
});

test('capacity exhaustion returns fewer pickups, including none, without throwing', () => {
  const world = arena([], 5, 3);
  const player = playerAt(1.5, 1.5);
  const items = spawnPickups(world, player, []);
  assert.equal(items.length, 2);
  assert.deepEqual(new Set(items.map(item => item.x)), new Set([2.5, 3.5]));
  assert.equal(spawnPickups(world, player, [enemy('occupied', 2.5, 1.5)]).length, 1);
  assert.deepEqual(spawnPickups(world, player, [enemy('all', 2.5, 1.5, { radius: 2 })]), []);
  assert.deepEqual(spawnPickups(arena([], 3, 3), player, []), []);
  world.tiles[world.width + 1] = HEDGE;
  assert.deepEqual(spawnPickups(world, player, []), []);
});

test('off-center player overlap is excluded and dead unicorns do not reserve cells', () => {
  const world = arena([], 5, 3);
  const player = playerAt(2.2, 1.5);
  const dead = enemy('dead', 3.5, 1.5, { alive: false });
  const items = spawnPickups(world, player, [dead]);
  assert.deepEqual(new Set(items.map(item => item.x)), new Set([1.5, 3.5]));
  assert.ok(items.every(item => distance(item, player) > player.radius + item.radius));
});

test('a fresh wave replaces leftovers and restarting recreates initial items and IDs', () => {
  const world = createWorld(42);
  const player = createPlayer(world.spawn);
  const original = spawnPickups(world, player, spawnUnicorns(world, player, 6), 1);
  let items = original;
  const collected = collectPickups(items, world, items[0], { ...createSurvivalState(), health: 3 });
  items = collected.pickups;
  assert.equal(items.length, original.length - 1);
  items = spawnPickups(world, player, spawnUnicorns(world, player, 8, 2), 2);
  assert.equal(items.length, HEALTH_PICKUPS_PER_WAVE + ARMOR_PICKUPS_PER_WAVE);
  assert.ok(items.every(item => original.every(old => old.id !== item.id)));
  items = spawnPickups(world, player, spawnUnicorns(world, player, 6), 1);
  assert.deepEqual(items, original);
  assert.notEqual(items, original);
  assert.notEqual(items[0], original[0]);
});

test('full health still collects armor, and full armor still collects health', () => {
  const world = arena();
  const player = playerAt();
  const items = [pickup('cake'), pickup('charm', 'armor')];
  for (const [health, armor, kind, remainingId] of [
    [MAX_HEALTH, 2, 'armor', 'cake'], [2, MAX_ARMOR, 'health', 'charm'],
  ]) {
    const result = collectPickups(items, world, player, { health, armor, invulnerableFor: 0.5 });
    assert.deepEqual(result.pickups.map(item => item.id), [remainingId]);
    assert.deepEqual(result.events, [{
      type: 'pickup', source: kind === 'armor' ? 'charm' : 'cake', kind, amount: 1,
      health: health + (kind === 'health' ? 1 : 0),
      armor: armor + (kind === 'armor' ? 1 : 0), x: 4.5, y: 4.5,
    }]);
    assert.equal(result.state.invulnerableFor, 0.5);
  }
  const full = { ...createSurvivalState(), armor: MAX_ARMOR };
  assert.deepEqual(collectPickups(items, world, player, full), { pickups: items, state: full, events: [] });
});

test('one successful item emits once and disappears on subsequent collection ticks', () => {
  const world = arena();
  const player = playerAt();
  const first = collectPickups([pickup('cake')], world, player, {
    health: 2, armor: 0, invulnerableFor: 0,
  });
  assert.equal(first.state.health, 3);
  assert.equal(first.events.length, 1);
  assert.deepEqual(first.pickups, []);
  for (let tick = 0; tick < 10; tick++) {
    assert.deepEqual(collectPickups(first.pickups, world, player, first.state), {
      pickups: [], state: first.state, events: [],
    });
  }
});

test('collection caps resources during a tick and retains excess items for later damage', () => {
  const world = arena();
  const player = playerAt();
  const items = [pickup('cake:0'), pickup('cake:1'), pickup('charm:0', 'armor'), pickup('charm:1', 'armor')];
  const first = collectPickups(items, world, player, { health: 4, armor: 4, invulnerableFor: 0 });
  assert.deepEqual(first.state, { health: MAX_HEALTH, armor: MAX_ARMOR, invulnerableFor: 0 });
  assert.deepEqual(first.events.map(event => event.source), ['cake:0', 'charm:0']);
  assert.deepEqual(first.pickups.map(item => item.id), ['cake:1', 'charm:1']);
  const later = collectPickups(first.pickups, world, player, { health: 4, armor: 4, invulnerableFor: 0 });
  assert.deepEqual(later.pickups, []);
  assert.deepEqual(later.events.map(event => event.source), ['cake:1', 'charm:1']);
});

test('overlap requires line of sight, including blocked hedge corners', () => {
  // Oversized pickup circles isolate visibility from the overlap predicate.
  for (const [hedges, player, item] of [
    [[[4, 4]], playerAt(3.8, 4.5), pickup('behind-wall', 'health', 5.2, 4.5, 1.3)],
    [[[4, 3]], playerAt(3.8, 3.8), pickup('behind-corner', 'armor', 4.2, 4.2, 0.4)],
  ]) {
    const world = arena(hedges);
    const state = { health: 2, armor: 2, invulnerableFor: 0 };
    assert.ok(distance(player, item) <= player.radius + item.radius);
    assert.equal(hasLineOfSight(world, player, item), false);
    assert.deepEqual(collectPickups([item], world, player, state), { pickups: [item], state, events: [] });
    for (const [x, y] of hedges) world.tiles[y * world.width + x] = 0;
    assert.equal(collectPickups([item], world, player, state).events.length, 1);
  }
});

test('visible distant items stay until player movement reaches overlap; tangency counts', () => {
  const world = arena();
  const player = playerAt();
  const item = pickup('nearby', 'armor', 5.5, 4.5);
  const state = createSurvivalState();
  assert.equal(collectPickups([item], world, player, state).events.length, 0);
  player.x = item.x - player.radius - item.radius;
  assert.equal(collectPickups([item], world, player, state).events.length, 1);
});

test('dead players cannot collect either kind, even with armor remaining', () => {
  const items = [pickup('cake'), pickup('charm', 'armor')];
  for (const armor of [0, MAX_ARMOR]) {
    const state = Object.freeze({ health: 0, armor, invulnerableFor: 0 });
    assert.deepEqual(collectPickups(items, arena(), playerAt(), state), { pickups: items, state, events: [] });
  }
});

test('armor collected before an attack protects health later in that tick', () => {
  const result = collectPickups([pickup('charm', 'armor')], arena(), playerAt(), {
    health: 1, armor: 0, invulnerableFor: 0,
  });
  const hit = applyDamage(result.state, { cause: 'contact', source: 'unicorn' });
  assert.equal(hit.state.health, 1);
  assert.equal(hit.state.armor, 0);
  assert.equal(hit.event.resource, 'armor');
});

test('collection accepts frozen inputs without mutating authoritative data', () => {
  const world = arena();
  const player = Object.freeze(playerAt());
  const items = Object.freeze([Object.freeze(pickup('cake')), Object.freeze(pickup('charm', 'armor'))]);
  const state = Object.freeze({ health: 2, armor: 0, invulnerableFor: 0.5 });
  const before = structuredClone({ items, state, player });
  const result = collectPickups(items, world, player, state);
  assert.equal(result.events.length, 2);
  assert.deepEqual({ items, state, player }, before);
});

test('wave and seed validation follows simulation conventions', () => {
  const world = arena();
  const player = playerAt();
  for (const wave of [0, -1, 1.5, Infinity, NaN]) {
    assert.throws(() => spawnPickups(world, player, [], wave), RangeError);
  }
  for (const seed of [NaN, Infinity, {}, null]) {
    assert.throws(() => spawnPickups(world, player, [], 1, seed), TypeError);
  }
  const zero = spawnPickups(world, player, [], 1, 0);
  assert.deepEqual(zero, spawnPickups(world, player, [], 1, 0));
  assert.notDeepEqual(zero, spawnPickups(world, player, [], 1, 'different'));
});
