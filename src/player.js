import { clamp } from './math.js';
import { DEFAULT_RADIUS, moveCircle } from './world.js';

// World distances are tiles, time is seconds, and angles are radians.
export const WALK_SPEED = 2.5;
export const RUN_MULTIPLIER = 2;
export const TURN_SPEED = Math.PI;
export const MAX_MAGIC = 100;
const TAU = Math.PI * 2;

function wrapAngle(angle) {
  return ((angle % TAU) + TAU) % TAU;
}

/** A horizontal player state, independent of the browser and input devices. */
export function createPlayer(spawn, radius = DEFAULT_RADIUS) {
  if (![spawn.x, spawn.y, spawn.angle].every(Number.isFinite)) {
    throw new TypeError('Player spawn components must be finite numbers.');
  }
  if (!Number.isFinite(radius) || radius <= 0) {
    throw new RangeError('Player radius must be finite and positive.');
  }
  return {
    x: spawn.x, y: spawn.y, angle: wrapAngle(spawn.angle), radius, firing: false,
    magic: MAX_MAGIC, invulnerableFor: 0,
  };
}

/**
 * Mutate and return player using a sampled input frame. forward/strafe/turn are
 * axes in [-1, 1]; positive strafe and turn go right in the world's y-down plane.
 * look is a horizontal angle delta (already sensitivity-scaled), not a rate.
 * Call once per simulation tick with fresh input.sample(), including when idle.
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
