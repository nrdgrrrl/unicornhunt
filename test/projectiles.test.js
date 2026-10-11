import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnRose, updateRoses } from '../src/projectiles.js';
import { createSurvivalState, applyDamage } from '../src/survival.js';
import { GameSession } from '../src/session.js';
import { ROSE_SPEED, ROSE_LIFETIME, MAX_ROSES, DAMAGE_INVULNERABILITY } from '../src/config.js';
import { arena } from './helpers/world.js';

const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} should be near ${expected}`);
const playerAt = (x = 4.5, y = 4.5) => ({ x, y, radius: 0.2 });
const roseAt = (overrides = {}) => ({
  id: 'rose:0', source: 'unicorn:1', x: 2.5, y: 4.5, z: 0.5,
  vx: ROSE_SPEED, vy: 0, remaining: ROSE_LIFETIME, ...overrides,
});
const source = { id: 'unicorn:1', x: 2.5, y: 4.5 };

test('session owns independent projectile storage and restart resets projectiles and IDs', () => {
  const session = new GameSession();
  const other = new GameSession();
  assert.deepEqual(session.roses, []);
  assert.equal(session.nextRoseId, 0);
  const first = spawnRose(session, source, { x: 10, y: 0 });
  assert.deepEqual(first, roseAt());
  assert.deepEqual(other.roses, []);
  assert.equal(other.nextRoseId, 0);
  const old = session.roses;
  session.start().pause().update(10);
  assert.deepEqual(session.roses, [first]);
  session.restart();
  assert.notEqual(session.roses, old);
  assert.deepEqual(session.roses, []);
  assert.equal(session.nextRoseId, 0);
  assert.deepEqual(spawnRose(session, source, { x: 1, y: 0 }), first);
});

test('spawning normalizes direction to 3.5 tiles/second with three seconds of life', () => {
  const session = { roses: [], nextRoseId: 0 };
  for (const direction of [{ x: 3, y: 4 }, { x: -1, y: 0 }, { x: 1e308, y: 1e308 }]) {
    const rose = spawnRose(session, source, direction, 0.75);
    near(Math.hypot(rose.vx, rose.vy), 3.5);
    assert.equal(rose.remaining, 3);
    assert.equal(rose.source, source.id);
    assert.equal(rose.z, 0.75);
  }
  assert.equal(new Set(session.roses.map(rose => rose.id)).size, 3);
});

test('32-rose cap rejects new shots; freed capacity uses a fresh monotonic ID', () => {
  const session = { roses: [], nextRoseId: 0 };
  for (let i = 0; i < 32; i++) assert.ok(spawnRose(session, source, { x: 1, y: 0 }));
  assert.equal(MAX_ROSES, 32);
  const before = structuredClone(session);
  assert.equal(spawnRose(session, source, { x: 1, y: 0 }), null);
  assert.deepEqual(session, before);
  session.roses = updateRoses(session.roses, arena(), playerAt(), createSurvivalState(), 1).roses;
  assert.deepEqual(session.roses, []);
  assert.equal(spawnRose(session, source, { x: 1, y: 0 }).id, 'rose:32');
  assert.equal(session.nextRoseId, 33);
});

test('a rose crossing an entire player in one update hits exactly once', () => {
  const first = updateRoses([roseAt()], arena(), playerAt(), createSurvivalState(), 1);
  assert.deepEqual(first.roses, []);
  assert.deepEqual(first.state, { health: 4, armor: 0, invulnerableFor: DAMAGE_INVULNERABILITY });
  assert.equal(first.events.length, 1);
  const { x, y, ...event } = first.events[0];
  near(x, 4.3);
  near(y, 4.5);
  assert.deepEqual(event, {
    type: 'damage', cause: 'rose', source: 'rose:0', amount: 1, resource: 'health',
    health: 4, armor: 0,
  });
  const second = updateRoses(first.roses, arena(), playerAt(), first.state, 1);
  assert.deepEqual(second, { roses: [], state: first.state, events: [] });
});

test('rose damage uses the shared armor-first rule and projectile identity', () => {
  const state = { health: 2, armor: 1, invulnerableFor: 0 };
  const result = updateRoses([roseAt()], arena(), playerAt(), state, 1);
  const expected = applyDamage(state, { cause: 'rose', source: 'rose:0' });
  assert.deepEqual(result.state, expected.state);
  const { x, y, ...event } = result.events[0];
  assert.deepEqual(event, expected.event);
  near(x, 4.3);
  near(y, 4.5);
  assert.equal(result.state.health, 2);
  assert.equal(result.state.armor, 0);
});

test('hedges block a full long sweep, exact surface ties, and rounding-near ties', () => {
  const world = arena([[4, 4]]);
  const state = createSurvivalState();
  for (const x of [5.5, 4.2, 4.2 - Number.EPSILON * 4]) {
    const result = updateRoses([roseAt()], world, playerAt(x), state, 2);
    assert.deepEqual(result, { roses: [], state, events: [] });
  }
});

test('hedge collision at the movement endpoint and at a corner consumes the rose', () => {
  const state = createSurvivalState();
  assert.deepEqual(updateRoses([roseAt({ vx: 1.5 })], arena([[4, 4]]), playerAt(8), state, 1), {
    roses: [], state, events: [],
  });
  assert.deepEqual(updateRoses([roseAt({ x: 3.5, y: 3.5, vx: 1, vy: 1 })],
    arena([[4, 3]]), playerAt(5, 5), state, 1), { roses: [], state, events: [] });
});

test('player contact before a later hedge still damages', () => {
  const result = updateRoses([roseAt()], arena([[5, 4]]), playerAt(), createSurvivalState(), 2);
  assert.deepEqual(result.roses, []);
  assert.equal(result.events.length, 1);
  near(result.events[0].x, 4.3);
});

test('hedge and moving-player collisions compare times rather than different ray distances', () => {
  // Relative player distance is 1.3, less than the 1.5 wall distance, but
  // the player moves away: wall impact at 1.5/3.5 precedes contact at 1.3/2.5.
  const state = createSurvivalState();
  const result = updateRoses([roseAt()], arena([[4, 4]]), playerAt(5), state, 1, playerAt(4));
  assert.deepEqual(result, { roses: [], state, events: [] });
});

test('a moving player crossing a stationary rose is hit even when both endpoints miss', () => {
  const result = updateRoses([roseAt({ x: 4.5, vx: 0 })], arena(), playerAt(4.5, 5.5),
    createSurvivalState(), 1, playerAt(4.5, 3.5));
  assert.deepEqual(result.roses, []);
  assert.equal(result.events.length, 1);
  assert.equal(result.state.health, 4);
  near(result.events[0].x, 4.5);
  near(result.events[0].y, 4.5);
});

test('simultaneously moving roses and player collide along their relative sweep', () => {
  const result = updateRoses([roseAt()], arena(), playerAt(4.25, 6.25),
    createSurvivalState(), 1, playerAt(4.25, 2.75));
  assert.deepEqual(result.roses, []);
  assert.equal(result.events.length, 1);
  assert.equal(result.state.health, 4);
  assert.ok(result.events[0].x < 4.25);
});

test('crossing spatial paths at different times is a miss', () => {
  const result = updateRoses([roseAt()], arena(), playerAt(3.2, 5.5),
    createSurvivalState(), 1, playerAt(3.2, 3.5));
  assert.equal(result.roses.length, 1);
  assert.equal(result.events.length, 0);
  assert.equal(result.state.health, 5);
});

test('equal-velocity motion handles initial overlap and separation without a relative ray', () => {
  for (const [x, hit] of [[2.5, true], [3.5, false]]) {
    const result = updateRoses([roseAt()], arena(), playerAt(x + ROSE_SPEED),
      createSurvivalState(), 1, playerAt(x));
    assert.equal(result.events.length, hit ? 1 : 0);
    assert.equal(result.roses.length, hit ? 0 : 1);
  }
});

test('stationary relative contact includes floating-point tangency with no decorative radius', () => {
  for (const vx of [0, ROSE_SPEED]) {
    for (const [offset, hit] of [[0.2, true], [0.201, false]]) {
      const result = updateRoses([roseAt({ x: 4.5, y: 4.5 + offset, vx })], arena(),
        playerAt(4.5 + vx), createSurvivalState(), 1, playerAt());
      assert.equal(result.events.length, hit ? 1 : 0);
      assert.equal(result.roses.length, hit ? 0 : 1);
    }
  }
});

test('invulnerable and defeated impacts consume roses without damage events or cooldown changes', () => {
  for (const state of [
    { health: 5, armor: 3, invulnerableFor: 0.5 },
    { health: 0, armor: 3, invulnerableFor: 0 },
  ]) {
    assert.deepEqual(updateRoses([roseAt()], arena(), playerAt(), state, 1), {
      roses: [], state, events: [],
    });
  }
});

test('multiple impacts share one damage cooldown while all contacted roses are consumed', () => {
  const roses = [roseAt(), roseAt({ id: 'rose:1' }), roseAt({ id: 'rose:2', y: 7.5 })];
  const result = updateRoses(roses, arena(), playerAt(), createSurvivalState(), 1);
  assert.equal(result.events.length, 1);
  assert.equal(result.state.health, 4);
  assert.deepEqual(result.roses.map(rose => rose.id), ['rose:2']);
});

test('point collision includes tangency but height and petals do not enlarge the shape', () => {
  for (const z of [0, 0.5, 10]) {
    const hit = updateRoses([roseAt({ y: 4.5 + 0.2, z })], arena(), playerAt(), createSurvivalState(), 1);
    assert.equal(hit.events.length, 1);
    const miss = updateRoses([roseAt({ y: 4.5 + 0.201, z })], arena(), playerAt(), createSurvivalState(), 1);
    assert.equal(miss.events.length, 0);
    assert.equal(miss.roses.length, 1);
  }
});

test('remaining lifetime clips both projectile travel and player motion within a long tick', () => {
  const state = createSurvivalState();
  const rose = roseAt({ remaining: 0.1 });
  assert.deepEqual(updateRoses([rose], arena(), playerAt(), state, 10), { roses: [], state, events: [] });
  // Player crosses this stationary point late in the tick, after it expired.
  assert.deepEqual(updateRoses([roseAt({ x: 4.5, vx: 0, remaining: 0.1 })], arena(),
    playerAt(4.5, 5.5), state, 1, playerAt(4.5, 3.5)), { roses: [], state, events: [] });
  // An early contact within its remaining lifetime still hits.
  const early = updateRoses([rose], arena(), playerAt(2.8), state, 10);
  assert.equal(early.events.length, 1);
  assert.equal(early.state.health, 4);
});

test('expired roses cannot hit, and contact at the exact lifetime endpoint still counts', () => {
  const state = createSurvivalState();
  for (const remaining of [0, -0.1]) {
    assert.deepEqual(updateRoses([roseAt({ x: 4.5, remaining })], arena(), playerAt(), state, 0), {
      roses: [], state, events: [],
    });
  }
  const result = updateRoses([roseAt({ vx: 1, remaining: 1 })], arena(), playerAt(3.7), state, 2);
  assert.equal(result.events.length, 1);
  near(result.events[0].x, 3.5);
});

test('survivors advance position and lifetime; 180 fractional steps expire three-second roses', () => {
  const original = roseAt({ vx: 0.5, vy: 0.25, z: 0.8 });
  const first = updateRoses([original], arena(), playerAt(10), createSurvivalState(), 0.5);
  assert.deepEqual(first.roses, [{ ...original, x: 2.75, y: 4.625, remaining: 2.5 }]);
  let roses = [roseAt({ vx: 0, vy: 0 })];
  for (let tick = 0; tick < 179; tick++) {
    roses = updateRoses(roses, arena(), playerAt(10), createSurvivalState(), 1 / 60).roses;
    assert.equal(roses.length, 1);
  }
  near(roses[0].remaining, 1 / 60);
  assert.deepEqual(updateRoses(roses, arena(), playerAt(10), createSurvivalState(), 1 / 60).roses, []);
});

test('zero-time updates resolve initial contact and solid origins without moving or aging', () => {
  const state = createSurvivalState();
  const rose = roseAt({ x: 4.5, vx: 0 });
  assert.equal(updateRoses([rose], arena(), playerAt(), state, 0).events.length, 1);
  assert.deepEqual(updateRoses([rose], arena([[4, 4]]), playerAt(), state, 0), {
    roses: [], state, events: [],
  });
  assert.deepEqual(updateRoses([rose], arena(), playerAt(8), state, 0), {
    roses: [rose], state, events: [],
  });
});

test('advancement accepts frozen inputs and does not mutate projectile, player, world, or survival data', () => {
  const roses = Object.freeze([Object.freeze(roseAt()), Object.freeze(roseAt({ id: 'rose:1', y: 7 }))]);
  const player = Object.freeze(playerAt());
  const previous = Object.freeze(playerAt());
  const state = Object.freeze(createSurvivalState());
  const world = arena();
  const before = structuredClone({ roses, player, previous, state, world });
  const result = updateRoses(roses, world, player, state, 1, previous);
  assert.equal(result.events.length, 1);
  assert.notEqual(result.roses[0], roses[1]);
  assert.deepEqual({ roses, player, previous, state, world }, before);
});

test('invalid elapsed times fail explicitly, even without projectiles, without changing data', () => {
  const roses = [roseAt()];
  const state = createSurvivalState();
  const before = structuredClone({ roses, state });
  for (const seconds of [-1, NaN, Infinity, -Infinity]) {
    for (const items of [roses, []]) {
      assert.throws(() => updateRoses(items, arena(), playerAt(), state, seconds), RangeError);
    }
  }
  assert.deepEqual({ roses, state }, before);
});

test('invalid spawn data fails without enqueueing or consuming IDs', () => {
  const session = { roses: [], nextRoseId: 0 };
  assert.throws(() => spawnRose(session, source, { x: 0, y: 0 }), RangeError);
  for (const invalid of [NaN, Infinity, -Infinity]) {
    assert.throws(() => spawnRose(session, { ...source, x: invalid }, { x: 1, y: 0 }), TypeError);
    assert.throws(() => spawnRose(session, source, { x: invalid, y: 0 }), TypeError);
    assert.throws(() => spawnRose(session, source, { x: 1, y: 0 }, invalid), TypeError);
  }
  assert.deepEqual(session, { roses: [], nextRoseId: 0 });
  for (const nextRoseId of [-1, NaN, 0.5, Number.MAX_SAFE_INTEGER]) {
    assert.throws(() => spawnRose({ roses: [], nextRoseId }, source, { x: 1, y: 0 }), RangeError);
  }
});
