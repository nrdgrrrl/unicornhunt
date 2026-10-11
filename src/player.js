// @ts-check

import { clamp } from './math.js';
import { moveCircle } from './geometry.js';
import { DEFAULT_RADIUS, WALK_SPEED, RUN_MULTIPLIER, TURN_SPEED, MAX_MAGIC } from './config.js';

// Preserve existing consumers while config.js becomes the tuning authority.
export { WALK_SPEED, RUN_MULTIPLIER, TURN_SPEED, MAX_MAGIC } from './config.js';

const TAU = Math.PI * 2;

/** @param {number} angle */
function wrapAngle(angle) {
  return ((angle % TAU) + TAU) % TAU;
}

/**
 * A horizontal player state, independent of the browser and input devices.
 * @param {import('./contracts.js').Spawn} spawn
 * @param {number} [radius]
 * @returns {import('./contracts.js').Player}
 */
export function createPlayer(spawn, radius = DEFAULT_RADIUS) {
  if (![spawn.x, spawn.y, spawn.angle].every(Number.isFinite)) {
    throw new TypeError('Player spawn components must be finite numbers.');
  }
  if (!Number.isFinite(radius) || radius <= 0) {
    throw new RangeError('Player radius must be finite and positive.');
  }
  return {
    x: spawn.x, y: spawn.y, angle: wrapAngle(spawn.angle), radius, firing: false,
    magic: MAX_MAGIC, invulnerableFor: 0, fireCooldown: 0,
  };
}

/**
 * Mutate and return player using a sampled input frame. forward/strafe/turn are
 * axes in [-1, 1]; positive strafe and turn go right in the world's y-down plane.
 * look is a horizontal angle delta (already sensitivity-scaled), not a rate.
 * Call once per simulation tick with fresh input.sample(), including when idle.
 * @param {import('./contracts.js').Player} player
 * @param {import('./contracts.js').World} world
 * @param {Partial<import('./contracts.js').InputFrame>} input
 * @param {number} seconds
 * @returns {import('./contracts.js').Player}
 */
export function updatePlayer(player, world, input, seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) {
    throw new RangeError('Player update time must be finite and nonnegative.');
  }
  const { forward = 0, strafe = 0, turn = 0, look = 0 } = input;
  if (![forward, strafe, turn, look].every(Number.isFinite)) {
    throw new TypeError('Player input axes must be finite numbers.');
  }
  player.angle = wrapAngle(player.angle + clamp(turn, -1, 1) * TURN_SPEED * seconds + look);
  player.firing = Boolean(input.fire);
  const remaining = player.fireCooldown - seconds;
  // Round away subtraction noise so subdividing 0.22 seconds does not delay
  // the next shot by an extra simulation tick.
  const tolerance = 8 * Number.EPSILON * Math.max(1, player.fireCooldown, seconds);
  player.fireCooldown = remaining <= tolerance ? 0 : remaining;

  let ahead = clamp(forward, -1, 1);
  let sideways = clamp(strafe, -1, 1);
  // Preserve smaller analog inputs, but cap diagonals to the same speed.
  const length = Math.hypot(ahead, sideways);
  if (length > 1) {
    ahead /= length;
    sideways /= length;
  }
  const distance = WALK_SPEED * (input.run ? RUN_MULTIPLIER : 1) * seconds;
  const cosine = Math.cos(player.angle);
  const sine = Math.sin(player.angle);
  const position = moveCircle(world, player, {
    x: (cosine * ahead - sine * sideways) * distance,
    y: (sine * ahead + cosine * sideways) * distance,
  }, player.radius);
  player.x = position.x;
  player.y = position.y;
  return player;
}
