import test from 'node:test';
import assert from 'node:assert/strict';
import { createPlayer, updatePlayer } from '../src/player.js';
import { createWorld } from '../src/world.js';
import { spawnUnicorns, updateUnicorns, UNICORN_RADIUS } from '../src/unicorn.js';
import { updateCombat, FIRE_COOLDOWN, COMBO_WINDOW, MAX_COMBO, HIT_POINTS } from '../src/combat.js';
import { arena } from './helpers/world.js';

function enemy(id, x = 4.5, y = 5.5, overrides = {}) {
  return { id, x, y, radius: UNICORN_RADIUS, speed: 1.2, angle: 0, alive: true, ...overrides };
}

function session(unicorns = [], world = arena(), spawn = { x: 2.5, y: 5.5, angle: 0 }) {
  return {
    world, player: createPlayer(spawn), unicorns,
    score: 0, combo: 0, elapsed: 0, lastHitAt: null, events: [],
  };
}

// This is the session's tick order: it owns the clock, player advances the
// cooldown, and combat consumes firing and appends events for future consumers.
function step(state, seconds = 0, fire = true) {
  state.elapsed += seconds;
  updatePlayer(state.player, state.world, { fire }, seconds);
  return updateCombat(state);
}

const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} should be near ${expected}`);
const shots = state => state.events.filter(event => event.type === 'shot');
const glitter = state => state.events.filter(event => event.type === 'glitter');

test('the generated opening unicorn converts immediately, scores, and emits separate feedback events', () => {
  const world = createWorld(1);
  const state = session([], world, world.spawn);
  state.unicorns = spawnUnicorns(world, state.player, 1);
  assert.equal(step(state), state);
  assert.equal(state.unicorns[0].alive, false);
  assert.equal(state.score, 100);
  assert.equal(state.combo, 1);
  assert.equal(state.lastHitAt, 0);
  assert.equal(state.elapsed, 0);
  assert.deepEqual(state.events, [
    { type: 'shot', x: world.spawn.x, y: world.spawn.y, angle: 0, distance: 2.75 },
    { type: 'glitter', source: '1:0', x: world.spawn.x + 3, y: world.spawn.y, points: 100, combo: 1, score: 100 },
  ]);
});

test('empty shots emit rainbow/sound data to the first hedge without points or ammo limits', () => {
  const state = session();
  for (let shot = 0; shot < 100; shot++) step(state, shot === 0 ? 0 : FIRE_COOLDOWN);
  assert.equal(shots(state).length, 100);
  assert.deepEqual(shots(state)[0], { type: 'shot', x: 2.5, y: 5.5, angle: 0, distance: 12.5 });
  assert.equal(glitter(state).length, 0);
  assert.equal(state.score, 0);
  assert.equal(state.combo, 0);
  assert.equal(state.lastHitAt, null);
  assert.equal(state.player.magic, 100);
});

test('held firing waits 0.22 seconds and is ready at the exact subdivided cooldown boundary', () => {
  const state = session([enemy('near'), enemy('far', 6.5)]);
  step(state);
  assert.equal(state.player.fireCooldown, FIRE_COOLDOWN);
  step(state); // Calling combat again without advancing time cannot score twice.
  step(state, 0.21);
  assert.equal(state.score, 100);
  assert.equal(shots(state).length, 1);
  step(state, 0.01);
  assert.equal(shots(state).length, 2);
  assert.equal(state.score, 300);
  step(state, 0.11);
  assert.equal(shots(state).length, 2);
  step(state, 0.11);
  assert.equal(shots(state).length, 3);
  assert.equal(state.score, 300);
});

test('releasing fire advances cooldown without shooting; a new press does not bypass it', () => {
  const state = session();
  step(state);
  step(state, 0.1, false);
  near(state.player.fireCooldown, 0.12);
  step(state, 0, true);
  assert.equal(shots(state).length, 1);
  step(state, 1, false);
  assert.equal(state.player.fireCooldown, 0);
  assert.equal(shots(state).length, 1);
  step(state);
  assert.equal(shots(state).length, 2);
});

test('a long tick fires only once at the current aim instead of replaying overdue shots', () => {
  const state = session([enemy('near'), enemy('far', 6.5), enemy('last', 8.5)]);
  step(state);
  step(state, 10);
  assert.equal(shots(state).length, 2);
  assert.deepEqual(state.unicorns.map(unicorn => unicorn.alive), [false, false, true]);
  assert.equal(state.score, 200); // Ten seconds also expired the combo.
});

test('aligned unicorns convert one shot at a time, nearest first regardless of array order', () => {
  const state = session([enemy('far', 6.5), enemy('near')]);
  step(state);
  assert.deepEqual(state.unicorns.map(unicorn => unicorn.alive), [true, false]);
  near(shots(state)[0].distance, 1.75);
  step(state, FIRE_COOLDOWN);
  assert.deepEqual(state.unicorns.map(unicorn => unicorn.alive), [false, false]);
  near(shots(state)[1].distance, 3.75);
  assert.deepEqual(glitter(state).map(event => event.source), ['near', 'far']);
  const score = state.score;
  for (let shot = 0; shot < 10; shot++) step(state, FIRE_COOLDOWN);
  assert.equal(state.score, score);
  assert.equal(glitter(state).length, 2);
});

test('the closest ray intersection wins even when its center is farther away', () => {
  const state = session([enemy('near-center', 4.5, 5.74), enemy('near-surface', 4.6)]);
  step(state);
  assert.equal(glitter(state)[0].source, 'near-surface');
  near(shots(state)[0].distance, 1.85);
});

test('the first hedge blocks targets behind it and wins a tie at its surface', () => {
  for (const x of [4.25, 5.5, 7.5]) {
    const state = session([enemy('blocked', x)], arena([[4, 5]]));
    step(state);
    assert.equal(state.unicorns[0].alive, true);
    assert.equal(state.score, 0);
    assert.equal(glitter(state).length, 0);
    near(shots(state)[0].distance, 1.5);
  }
});

test('targets before a hedge convert but targets beyond it remain alive', () => {
  const state = session([enemy('behind', 6.5), enemy('before', 3.5)], arena([[4, 5]]));
  step(state);
  assert.equal(glitter(state)[0].source, 'before');
  step(state, FIRE_COOLDOWN);
  assert.equal(state.unicorns[0].alive, true);
  assert.equal(state.score, 100);
  near(shots(state)[1].distance, 1.5);
});

test('hedges adjacent to an exact diagonal corner also block combat rays', () => {
  const state = session([enemy('behind-corner', 4.5, 4.5)], arena([[3, 2]]), { x: 2.5, y: 2.5, angle: Math.PI / 4 });
  step(state);
  assert.equal(state.score, 0);
  assert.equal(state.unicorns[0].alive, true);
  near(shots(state)[0].distance, Math.SQRT1_2);
});

test('off-ray, behind-player, and already converted unicorns do not intercept shots', () => {
  const state = session([
    enemy('off-ray', 3.5, 5.7501), enemy('behind', 1.5),
    enemy('dead', 3.5, 5.5, { alive: false }), enemy('valid', 6.5),
  ]);
  step(state);
  assert.equal(glitter(state)[0].source, 'valid');
  assert.equal(state.score, 100);
  assert.deepEqual(state.unicorns.map(unicorn => unicorn.alive), [true, true, false, false]);
});

test('circle tangency and a circle overlapping the muzzle are valid intersections', () => {
  for (const [x, y, expectedDistance] of [[4.5, 5.75, 2], [2.5, 5.5, 0]]) {
    const state = session([enemy('target', x, y)]);
    step(state);
    assert.equal(state.score, 100);
    near(shots(state)[0].distance, expectedDistance);
  }
});

test('aiming works on every cardinal axis and diagonal using the current player heading', () => {
  for (let heading = 0; heading < 8; heading++) {
    const angle = heading * Math.PI / 4;
    const spawn = { x: 8.5, y: 6.5, angle };
    const target = enemy('target', spawn.x + Math.cos(angle) * 3, spawn.y + Math.sin(angle) * 3);
    const state = session([target], arena(), spawn);
    step(state);
    assert.equal(target.alive, false);
    near(shots(state)[0].distance, 2.75);
  }
});

test('a successful hit exactly two seconds later continues the combo, including a first hit at time zero', () => {
  const state = session([enemy('first'), enemy('second', 6.5), enemy('third', 8.5)]);
  step(state);
  step(state, COMBO_WINDOW);
  assert.equal(state.combo, 2);
  assert.equal(state.score, 300);
  step(state, COMBO_WINDOW);
  assert.equal(state.combo, 3);
  assert.equal(state.score, 600);
  assert.equal(state.lastHitAt, 4);
});

test('combo expiration resets scoring and expires while idle even without another shot', () => {
  const state = session([enemy('first'), enemy('second', 6.5), enemy('third', 8.5)]);
  step(state);
  step(state, FIRE_COOLDOWN);
  assert.equal(state.combo, 2);
  step(state, COMBO_WINDOW, false);
  assert.equal(state.combo, 2);
  step(state, 0.001, false);
  assert.equal(state.combo, 0);
  assert.equal(state.score, 300);
  step(state);
  assert.equal(state.combo, 1);
  assert.equal(state.score, 400);
  assert.equal(glitter(state).at(-1).points, 100);
});

test('a miss neither scores nor extends the successful-hit combo window', () => {
  const state = session([enemy('first'), enemy('second', 6.5)]);
  step(state);
  state.player.angle = Math.PI / 2;
  step(state, 1.5);
  assert.equal(state.score, 100);
  assert.equal(state.combo, 1);
  assert.equal(state.lastHitAt, 0);
  state.player.angle = 0;
  step(state, 0.501);
  assert.equal(state.score, 200);
  assert.equal(state.combo, 1);
});

test('a miss between timely successful hits preserves the combo', () => {
  const state = session([enemy('first'), enemy('second', 6.5)]);
  step(state);
  state.player.angle = Math.PI / 2;
  step(state, FIRE_COOLDOWN);
  state.player.angle = 0;
  step(state, FIRE_COOLDOWN);
  assert.equal(state.score, 300);
  assert.equal(state.combo, 2);
  assert.equal(shots(state).length, 3);
  assert.equal(glitter(state).length, 2);
});

test('combo multipliers cap at five and each glitter event carries its awarded points and total', () => {
  const state = session(Array.from({ length: 8 }, (_, index) => enemy(String(index), 4 + index)));
  for (let shot = 0; shot < 8; shot++) step(state, shot === 0 ? 0 : FIRE_COOLDOWN);
  assert.equal(state.combo, MAX_COMBO);
  assert.equal(state.score, 3000);
  assert.deepEqual(glitter(state).map(event => event.points), [100, 200, 300, 400, 500, 500, 500, 500]);
  assert.deepEqual(glitter(state).map(event => event.score), [100, 300, 600, 1000, 1500, 2000, 2500, 3000]);
  assert.equal(glitter(state).at(-1).points, HIT_POINTS * MAX_COMBO);
});

test('converted unicorns cannot move or deal contact damage later in the same tick', () => {
  const target = enemy('touching', 2.9);
  const state = session([target]);
  const position = { x: target.x, y: target.y };
  step(state);
  state.events.push(...updateUnicorns(state.unicorns, state.world, state.player, 0.1));
  assert.deepEqual({ x: target.x, y: target.y }, position);
  assert.equal(state.player.magic, 100);
  assert.deepEqual(state.events.map(event => event.type), ['shot', 'glitter']);
});
