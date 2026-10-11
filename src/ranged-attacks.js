// @ts-check

import { createRng } from './math.js';
import { hasLineOfSight } from './geometry.js';
import { spawnRose } from './projectiles.js';
import {
  MAX_ROSES, ROSE_MIN_RANGE, ROSE_MAX_RANGE, ROSE_WINDUP,
  ROSE_RECOVERY, ROSE_COOLDOWN, ROSE_REAR_OFFSET,
} from './config.js';

/**
 * Independent per-unicorn stream: staggering never changes spawn positions
 * and does not depend on update order or other unicorns being converted.
 * @param {import('./contracts.js').Seed} seed
 * @param {string} id
 * @returns {import('./contracts.js').RangedAttackState}
 */
export function createRangedAttackState(seed, id) {
  // Validate seed before composing the independent stream's key.
  createRng(seed);
  const random = createRng(JSON.stringify([seed, id, 'ranged-attack']));
  return {
    phase: 'idle', remaining: 0, cooldownFor: random() * ROSE_COOLDOWN,
    facing: 0, target: null,
  };
}

/**
 * A point socket beyond the body radius, opposite the forward facing vector.
 * Presentation can use the same position for the muzzle and attack telegraph.
 * @param {import('./contracts.js').Spawn} unicorn
 * @returns {import('./contracts.js').Position}
 */
export function rearSocket(unicorn) {
  return {
    x: unicorn.x - Math.cos(unicorn.angle) * ROSE_REAR_OFFSET,
    y: unicorn.y - Math.sin(unicorn.angle) * ROSE_REAR_OFFSET,
  };
}

/** @param {number} timer @param {number} seconds */
function advanceTimer(timer, seconds) {
  const remaining = timer - seconds;
  const tolerance = 32 * Number.EPSILON * Math.max(1, timer);
  return remaining <= tolerance ? 0 : remaining;
}

/** @param {import('./contracts.js').RangedAttackState} attack */
function cancelAttack(attack) {
  attack.phase = 'idle';
  attack.remaining = 0;
  attack.target = null;
  attack.cooldownFor = ROSE_COOLDOWN;
}

/**
 * @param {import('./contracts.js').Unicorn} unicorn
 * @param {import('./contracts.js').World} world
 * @param {import('./contracts.js').Position} target
 */
function targetEligible(unicorn, world, target) {
  const distance = Math.hypot(target.x - unicorn.x, target.y - unicorn.y);
  return distance >= ROSE_MIN_RANGE && distance <= ROSE_MAX_RANGE
    && hasLineOfSight(world, unicorn, target);
}

/**
 * Mutate attack state/facing and enqueue at most one new rose per unicorn.
 * Return only successful firing events; no rendering or wall-clock timers.
 *
 * The session tick owner calls this AFTER advancing existing roses and combat
 * conversions. Newly emitted roses stay at the rear socket for their first
 * rendered frame. Navigation must skip windup/recovery actors before this
 * call, preserving their position and facing throughout those phases.
 *
 * Starting a windup always grants its full 0.55 seconds. A completed windup
 * starts a full recovery and 2.6-second cooldown at this tick's emission time.
 * Overshoot never advances a newly entered phase or replays overdue shots.
 * Cancellation and cap rejection spend a cooldown, so freeing capacity does
 * not release a queued shot. Legacy fixtures lazily receive seeded state.
 * @param {import('./contracts.js').Unicorn[]} unicorns
 * @param {import('./contracts.js').World} world
 * @param {import('./contracts.js').Position} target
 * @param {import('./contracts.js').RoseState} session
 * @param {number} seconds
 * @returns {import('./contracts.js').RoseFiredEvent[]}
 */
export function updateRangedAttacks(unicorns, world, target, session, seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) {
    throw new RangeError('Ranged attack update time must be finite and nonnegative.');
  }
  /** @type {import('./contracts.js').RoseFiredEvent[]} */
  const events = [];
  for (const unicorn of unicorns) {
    if (!unicorn.alive) {
      if (unicorn.attack && unicorn.attack.phase !== 'idle') cancelAttack(unicorn.attack);
      continue;
    }
    const attack = unicorn.attack ??= createRangedAttackState(world.seed ?? 1, unicorn.id);
    attack.cooldownFor = advanceTimer(attack.cooldownFor, seconds);

    if (attack.phase === 'recovery') {
      unicorn.angle = attack.facing;
      attack.remaining = advanceTimer(attack.remaining, seconds);
      if (attack.remaining === 0) {
        attack.phase = 'idle';
        attack.target = null;
      }
      continue;
    }

    if (attack.phase === 'windup') {
      unicorn.angle = attack.facing;
      const socket = rearSocket(unicorn);
      if (!targetEligible(unicorn, world, target)
        || !hasLineOfSight(world, unicorn, socket)
        || !attack.target || !hasLineOfSight(world, socket, attack.target)) {
        cancelAttack(attack);
        continue;
      }
      attack.remaining = advanceTimer(attack.remaining, seconds);
      if (attack.remaining > 0) continue;

      const rose = spawnRose(session, { ...socket, id: unicorn.id }, {
        x: -Math.cos(attack.facing), y: -Math.sin(attack.facing),
      });
      attack.phase = 'recovery';
      attack.remaining = ROSE_RECOVERY;
      attack.cooldownFor = ROSE_COOLDOWN;
      if (rose) events.push({
        type: 'rose-fired', source: unicorn.id, projectile: rose.id,
        x: rose.x, y: rose.y, z: rose.z, angle: Math.atan2(rose.vy, rose.vx),
      });
      continue;
    }

    if (attack.cooldownFor > 0 || !targetEligible(unicorn, world, target)) continue;
    if (session.roses.length >= MAX_ROSES) {
      cancelAttack(attack);
      continue;
    }
    // Forward points away from the copied target; the rear points toward it.
    const facing = Math.atan2(unicorn.y - target.y, unicorn.x - target.x);
    const socket = rearSocket({ ...unicorn, angle: facing });
    if (!hasLineOfSight(world, unicorn, socket)
      || !hasLineOfSight(world, socket, target)) continue;
    attack.phase = 'windup';
    attack.remaining = ROSE_WINDUP;
    attack.facing = facing;
    attack.target = { x: target.x, y: target.y };
    unicorn.angle = facing;
  }
  return events;
}
