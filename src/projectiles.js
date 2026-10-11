// @ts-check

import { normalize } from './math.js';
import { raycast, rayCircleDistance } from './geometry.js';
import { applyDamage } from './survival.js';
import { ROSE_SPEED, ROSE_LIFETIME, MAX_ROSES } from './config.js';

/**
 * Enqueue a point rose in session-owned storage. Enemy firing decides when and
 * where to call this; the module has no firing timers or global ID counter.
 * Saturation rejects the new rose without replacing an existing one or using
 * an ID. Direction magnitude is ignored; z is decorative height in tiles.
 * @param {import('./contracts.js').RoseState} session
 * @param {import('./contracts.js').Position & { id: string }} source
 * @param {import('./contracts.js').Position} direction
 * @param {number} [z]
 * @returns {import('./contracts.js').RoseProjectile | null}
 */
export function spawnRose(session, source, direction, z = 0.5) {
  if (![source.x, source.y, z].every(Number.isFinite)) {
    throw new TypeError('Rose position and height must be finite numbers.');
  }
  const unit = normalize(direction);
  if (unit.x === 0 && unit.y === 0) {
    throw new RangeError('Rose direction must be nonzero.');
  }
  if (session.roses.length >= MAX_ROSES) return null;
  if (!Number.isSafeInteger(session.nextRoseId) || session.nextRoseId < 0
    || session.nextRoseId >= Number.MAX_SAFE_INTEGER) {
    throw new RangeError('Rose ID counter must be a nonnegative safe integer with room to advance.');
  }
  const rose = {
    id: `rose:${session.nextRoseId}`, source: source.id,
    x: source.x, y: source.y, z,
    vx: unit.x * ROSE_SPEED, vy: unit.y * ROSE_SPEED, remaining: ROSE_LIFETIME,
  };
  session.nextRoseId++;
  session.roses.push(rose);
  return rose;
}

/**
 * Advance roses independently of firing or presentation. Inputs are trusted
 * projectile data and remain unchanged; callers adopt the returned array and
 * survival state and queue events. Call once per active fixed step, after
 * movement, with the player's pre-movement position. The shared invulnerability
 * timer must already have been advanced once by the tick owner.
 *
 * Player motion is linear between the supplied start and current position.
 * Sweeping relative displacement catches both fast roses and a moving player
 * crossing a stationary rose. Hedge and player intersections are compared as
 * fractions of the SAME lifetime-limited segment, with hedges winning ties.
 * Collision uses only the player's radius; decorative rose height/petals do
 * not change gameplay. Contact always consumes a rose, even if damage is blocked.
 * @param {readonly import('./contracts.js').RoseProjectile[]} roses
 * @param {import('./contracts.js').World} world
 * @param {import('./contracts.js').Position & { radius: number }} player
 * @param {Readonly<import('./contracts.js').SurvivalState>} state
 * @param {number} seconds
 * @param {import('./contracts.js').Position} [previousPosition]
 * @returns {import('./contracts.js').RoseResult}
 */
export function updateRoses(roses, world, player, state, seconds, previousPosition = player) {
  if (!Number.isFinite(seconds) || seconds < 0) {
    throw new RangeError('Rose update time must be finite and nonnegative.');
  }
  /** @type {import('./contracts.js').RoseProjectile[]} */
  const remaining = [];
  /** @type {import('./contracts.js').RoseDamageEvent[]} */
  const events = [];
  let next = state;
  for (const rose of roses) {
    if (rose.remaining <= 0) continue;
    const duration = Math.min(seconds, rose.remaining);
    const tickFraction = seconds === 0 ? 0 : duration / seconds;
    const delta = { x: rose.vx * duration, y: rose.vy * duration };
    const length = Math.hypot(delta.x, delta.y);
    const wall = raycast(world, rose, delta, length);
    const wallFraction = wall.hit ? (length === 0 ? 0 : wall.distance / length) : Infinity;

    const relative = {
      x: delta.x - (player.x - previousPosition.x) * tickFraction,
      y: delta.y - (player.y - previousPosition.y) * tickFraction,
    };
    const relativeLength = Math.hypot(relative.x, relative.y);
    const circle = { ...previousPosition, radius: player.radius };
    const tolerance = 8 * Number.EPSILON;
    const initialDistance = Math.hypot(rose.x - circle.x, rose.y - circle.y);
    const overlapTolerance = tolerance * Math.max(1, circle.radius, initialDistance);
    // The ray primitive intentionally misses zero-direction rays. A stationary
    // relative segment instead has contact if its initial point is in the circle.
    const playerFraction = relativeLength === 0
      ? (initialDistance <= circle.radius + overlapTolerance ? 0 : Infinity)
      : rayCircleDistance(rose, relative, circle) / relativeLength;
    if (Number.isFinite(playerFraction) && playerFraction <= 1 + tolerance
      && playerFraction < wallFraction - tolerance) {
      const hit = applyDamage(next, { cause: 'rose', source: rose.id });
      next = hit.state;
      if (hit.event) {
        const fraction = Math.min(1, playerFraction);
        events.push({ ...hit.event, x: rose.x + delta.x * fraction, y: rose.y + delta.y * fraction });
      }
      continue;
    }
    if (wall.hit) continue;

    const lifetime = rose.remaining - duration;
    // Avoid one extra tick of life after repeated fractional subtraction.
    const lifetimeTolerance = 32 * Number.EPSILON * Math.max(1, ROSE_LIFETIME, duration);
    if (lifetime > lifetimeTolerance) {
      remaining.push({ ...rose, x: rose.x + delta.x, y: rose.y + delta.y, remaining: lifetime });
    }
  }
  return { roses: remaining, state: next, events };
}
