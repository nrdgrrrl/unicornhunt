import test from 'node:test';
import assert from 'node:assert/strict';
import { createPlayer, updatePlayer, WALK_SPEED, RUN_MULTIPLIER, TURN_SPEED } from '../src/player.js';
import { createWorld, circleCollides, HEDGE } from '../src/world.js';

function arena() {
  const world = { width: 32, height: 32, tiles: new Uint8Array(32 * 32) };
  for (let i = 0; i < 32; i++) {
    world.tiles[i] = world.tiles[31 * 32 + i] = HEDGE;
    world.tiles[i * 32] = world.tiles[i * 32 + 31] = HEDGE;
  }
  return world;
}
const spawn = { x: 8.5, y: 8.5, angle: 0 };
const near = (actual, expected, tolerance = 1e-9) => {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} should be near ${expected}`);
};

test('player spawns from world coordinates and only has horizontal aim', () => {
  const world = createWorld(4);
  const player = createPlayer(world.spawn);
  assert.deepEqual(player, { ...world.spawn, radius: 0.2, firing: false, magic: 100, invulnerableFor: 0 });
  updatePlayer(player, world, { look: 0.2, pitch: 10, jump: true }, 0);
  near(player.angle, 0.2);
  assert.equal('pitch' in player, false);
  assert.equal('z' in player, false);
  assert.deepEqual(world.spawn, { x: 3.5, y: 12.5, angle: 0 });
});

test('forward/backward and left/right strafe follow the horizontal heading', () => {
  for (const angle of [0, Math.PI / 2, Math.PI, 3 * Math.PI / 2]) {
    for (const [forward, strafe] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const player = createPlayer({ ...spawn, angle });
      updatePlayer(player, arena(), { forward, strafe }, 0.5);
      near(player.x, spawn.x + (Math.cos(angle) * forward - Math.sin(angle) * strafe) * WALK_SPEED / 2);
      near(player.y, spawn.y + (Math.sin(angle) * forward + Math.cos(angle) * strafe) * WALK_SPEED / 2);
    }
  }
});

test('diagonals never gain speed, and running has a fixed multiplier in every direction', () => {
  for (const forward of [-1, 0, 1]) {
    for (const strafe of [-1, 0, 1]) {
      for (const run of [false, true]) {
        const player = createPlayer(spawn);
        updatePlayer(player, arena(), { forward, strafe, run }, 1);
        const speed = forward || strafe ? WALK_SPEED * (run ? RUN_MULTIPLIER : 1) : 0;
        near(Math.hypot(player.x - spawn.x, player.y - spawn.y), speed);
      }
    }
  }
  const analog = createPlayer(spawn);
  updatePlayer(analog, arena(), { forward: 0.5 }, 1);
  near(analog.x - spawn.x, WALK_SPEED / 2);
});

test('keyboard turning uses elapsed seconds; mouse look is a one-frame angle delta', () => {
  const player = createPlayer(spawn);
  updatePlayer(player, arena(), { turn: -1, look: 0.25, fire: true }, 0.5);
  near(player.angle, Math.PI * 2 - TURN_SPEED / 2 + 0.25);
  assert.equal(player.firing, true);
  const angle = player.angle;
  updatePlayer(player, arena(), {}, 1);
  near(player.angle, angle);
  assert.equal(player.firing, false);
  updatePlayer(player, arena(), { look: 100 * Math.PI }, 0);
  near(player.angle, angle);
});

test('movement is consistent across time steps in an open area', () => {
  const world = arena();
  const once = createPlayer(spawn);
  const many = createPlayer(spawn);
  const input = { forward: 1, strafe: -1, run: true };
  updatePlayer(once, world, input, 1);
  for (let frame = 0; frame < 60; frame++) updatePlayer(many, world, input, 1 / 60);
  near(many.x, once.x);
  near(many.y, once.y);
});

test('running into walls slides without penetration, even with a long frame', () => {
  const world = arena();
  for (let y = 1; y < 31; y++) world.tiles[y * 32 + 10] = HEDGE;
  const player = createPlayer(spawn);
  updatePlayer(player, world, { forward: 1, strafe: 1, run: true }, 10);
  assert.equal(circleCollides(world, player, player.radius), false);
  assert.ok(player.x <= 9.8 && player.x > 9.79);
  assert.ok(player.y > spawn.y);
  updatePlayer(player, world, { forward: -1, run: true }, 100);
  assert.equal(circleCollides(world, player, player.radius), false);
  assert.ok(player.x >= 1.2);
});

test('invalid player configuration and input fail explicitly', () => {
  assert.throws(() => createPlayer({ ...spawn, angle: NaN }), TypeError);
  assert.throws(() => createPlayer(spawn, 0), RangeError);
  assert.throws(() => updatePlayer(createPlayer(spawn), arena(), {}, -1), RangeError);
  assert.throws(() => updatePlayer(createPlayer(spawn), arena(), {}, Infinity), RangeError);
  assert.throws(() => updatePlayer(createPlayer(spawn), arena(), { look: NaN }, 1), TypeError);
});
