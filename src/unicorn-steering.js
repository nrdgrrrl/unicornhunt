// @ts-check

import { createRng, normalize } from './math.js';
import { circleCollides, hasLineOfSight, moveCircle } from './geometry.js';

const PURSUIT_SECONDS = 2.4;
const WEAVING_SECONDS = 2.4;
const BURST_SECONDS = 1.8;
const CYCLE_SECONDS = PURSUIT_SECONDS + WEAVING_SECONDS + BURST_SECONDS;
const SEPARATION_RANGE = 1.1;
const SEPARATION_WEIGHT = 0.3;
const EPSILON = 1e-9;

/**
 * Clock counts only living, idle simulation time, including navigation fallback.
 * Profiles have a private seed stream; updates never draw random numbers.
 * @typedef {'pursuit' | 'weaving' | 'burst'} MovementPhase
 * @typedef {{ elapsed: number, phase: MovementPhase, phaseOffset: number, navigationFor: number,
 *   weaveAmplitude: number, weaveFrequency: number, weavePhase: number }} MovementState
 * @typedef {Readonly<import('./contracts.js').Position & { id: string }>} HerdMember
 */

/** @param {number} time @returns {MovementPhase} */
function phaseAt(time) {
  const cycle = time % CYCLE_SECONDS;
  if (cycle < PURSUIT_SECONDS) return 'pursuit';
  if (cycle < PURSUIT_SECONDS + WEAVING_SECONDS) return 'weaving';
  return 'burst';
}

/**
 * @param {import('./contracts.js').Seed} seed
 * @param {string} id
 * @returns {MovementState}
 */
export function createMovementState(seed, id) {
  createRng(seed); // Validate before composing this independent stream's key.
  const random = createRng(JSON.stringify([seed, id, 'movement']));
  const phaseOffset = random() * CYCLE_SECONDS;
  return {
    elapsed: 0, phase: phaseAt(phaseOffset), phaseOffset, navigationFor: 0,
    weaveAmplitude: 0.25 + random() * 0.25,
    weaveFrequency: 0.6 + random() * 0.4,
    weavePhase: random() * Math.PI * 2,
  };
}

/**
 * Copy before moving ANY actor. Stable ID ordering also fixes floating-point
 * summation order, so reversing the actor array does not alter steering.
 * Frozen attack actors still occupy space; dead actors do not.
 * @param {import('./contracts.js').Unicorn[]} unicorns
 * @returns {readonly HerdMember[]}
 */
export function snapshotHerd(unicorns) {
  return unicorns.filter(unicorn => unicorn.alive)
    .map(({ id, x, y }) => ({ id, x, y }))
    .sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}

/**
 * Attempt an open-area step. False leaves position/facing untouched so the
 * caller can navigate on this same tick. A positive idle tick advances the
 * clock even on fallback; zero time never initializes or changes state.
 * The pursuit component dominates bounded lateral/separation steering, keeping
 * progress toward the player. Pace never exceeds the per-wave speed ceiling.
 * @param {import('./contracts.js').Unicorn} unicorn
 * @param {import('./contracts.js').World} world
 * @param {import('./contracts.js').Player} player
 * @param {readonly HerdMember[]} herd
 * @param {number} seconds
 * @returns {boolean}
 */
export function tryVariedMovement(unicorn, world, player, herd, seconds) {
  const movement = unicorn.movement;
  if (!movement || seconds === 0 || !unicorn.alive
    || (unicorn.attack && unicorn.attack.phase !== 'idle')) return false;

  // Sample at the tick midpoint, rather than biasing smooth weaving to one end.
  const time = movement.elapsed + movement.phaseOffset + seconds / 2;
  const phase = phaseAt(time);
  movement.elapsed += seconds;
  movement.phase = phaseAt(movement.elapsed + movement.phaseOffset);
  const navigating = movement.navigationFor > 0;
  movement.navigationFor = Math.max(0, movement.navigationFor - seconds);

  const dx = player.x - unicorn.x;
  const dy = player.y - unicorn.y;
  const length = Math.hypot(dx, dy);
  // Give the field enough travel to finish centerline alignment and a cardinal
  // step before retrying steering. Otherwise a clear-but-narrow corner can
  // alternate pursuit and alignment in opposite directions forever.
  const deferToNavigation = () => {
    movement.navigationFor = 2 / Math.max(0.01, unicorn.speed);
    return false;
  };
  // Reserve a whole step of clearance before entering reliable contact pursuit.
  // Commit here as well: alignment can temporarily increase player distance.
  if (length <= Math.max(1.1, unicorn.radius + player.radius + unicorn.speed * seconds)) {
    return deferToNavigation();
  }
  if (navigating) return false;
  if (!hasLineOfSight(world, unicorn, player)) return deferToNavigation();

  const forward = { x: dx / length, y: dy / length };
  let separationX = 0;
  let separationY = 0;
  for (const other of herd) {
    if (other.id === unicorn.id) continue;
    const awayX = unicorn.x - other.x;
    const awayY = unicorn.y - other.y;
    const distance = Math.hypot(awayX, awayY);
    if (distance >= SEPARATION_RANGE) continue;
    if (distance <= EPSILON) {
      // An antisymmetric, deterministic lateral nudge also separates overlaps.
      const sign = unicorn.id < other.id ? -1 : 1;
      separationX += -forward.y * sign;
      separationY += forward.x * sign;
    } else {
      const weight = 1 - distance / SEPARATION_RANGE;
      separationX += awayX / distance * weight;
      separationY += awayY / distance * weight;
    }
  }
  const separationLength = Math.hypot(separationX, separationY);
  const separationScale = SEPARATION_WEIGHT / Math.max(1, separationLength);
  const lateral = phase === 'weaving'
    ? movement.weaveAmplitude * Math.sin(time * movement.weaveFrequency * Math.PI * 2 + movement.weavePhase)
    : 0;
  const direction = normalize({
    x: forward.x - forward.y * lateral + separationX * separationScale,
    y: forward.y + forward.x * lateral + separationY * separationScale,
  });
  const burstTime = time % CYCLE_SECONDS - PURSUIT_SECONDS - WEAVING_SECONDS;
  const pace = phase === 'burst' ? (burstTime < BURST_SECONDS * 0.45 ? 0.55 : 1)
    : phase === 'weaving' ? 0.8 : 0.85;
  const amount = unicorn.speed * seconds * pace;
  const delta = { x: direction.x * amount, y: direction.y * amount };
  const proposed = { x: unicorn.x + delta.x, y: unicorn.y + delta.y };
  const moved = moveCircle(world, unicorn, delta, unicorn.radius);
  // Reject any clipped/sliding step atomically. Visibility alone only checks
  // the centerline; moveCircle checks swept body clearance without tunneling.
  if (Math.hypot(moved.x - proposed.x, moved.y - proposed.y) > EPSILON
    || circleCollides(world, moved, unicorn.radius)) return deferToNavigation();
  if (amount > 0) unicorn.angle = Math.atan2(moved.y - unicorn.y, moved.x - unicorn.x);
  unicorn.x = moved.x;
  unicorn.y = moved.y;
  return true;
}
