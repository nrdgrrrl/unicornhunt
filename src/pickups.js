// @ts-check

import { createRng } from './math.js';
import { buildDistanceField, circleCollides, distanceAt, hasLineOfSight } from './geometry.js';
import { restoreHealth, restoreArmor } from './survival.js';
import {
  PICKUP_RADIUS, HEALTH_PICKUPS_PER_WAVE, ARMOR_PICKUPS_PER_WAVE, MAX_HEALTH, MAX_ARMOR,
} from './config.js';

const EPSILON = 1e-9;

/**
 * @param {import('./contracts.js').Position} a
 * @param {import('./contracts.js').Position} b
 */
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

/**
 * Create a fresh wave's rainbow cakes and pastel star-shield armor charms.
 * Enumerate reachable cell centers and shuffle without replacement using a
 * local pickup stream, independent of unicorn spawning. Capacity exhaustion
 * returns fewer items; work is bounded by the map size, with no random retries.
 *
 * Session integration calls this after spawning unicorns and replaces the old
 * array, both at wave transitions and on restart. No pickup state is retained
 * in this module, so restarting with the same inputs recreates the same IDs.
 * @param {import('./contracts.js').World} world
 * @param {import('./contracts.js').Position & { radius: number }} player
 * @param {readonly import('./contracts.js').Unicorn[]} unicorns
 * @param {number} [wave]
 * @param {import('./contracts.js').Seed} [seed]
 * @returns {import('./contracts.js').Pickup[]}
 */
export function spawnPickups(world, player, unicorns, wave = 1, seed = `${world.seed ?? 1}:${wave}:pickups`) {
  if (!Number.isSafeInteger(wave) || wave < 1) {
    throw new RangeError('Wave must be a positive safe integer.');
  }
  const random = createRng(seed);
  const field = buildDistanceField(world, player, player.radius);
  const candidates = [];
  for (let y = 0; y < world.height; y++) {
    for (let x = 0; x < world.width; x++) {
      if (!Number.isFinite(distanceAt(field, x, y))) continue;
      const position = { x: x + 0.5, y: y + 0.5 };
      if (circleCollides(world, position, PICKUP_RADIUS)
        || distance(position, player) <= player.radius + PICKUP_RADIUS + EPSILON
        || unicorns.some(unicorn => unicorn.alive
          && distance(position, unicorn) <= unicorn.radius + PICKUP_RADIUS + EPSILON)) continue;
      candidates.push(position);
    }
  }
  for (let i = candidates.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
  }
  return candidates.slice(0, HEALTH_PICKUPS_PER_WAVE + ARMOR_PICKUPS_PER_WAVE)
    .map((position, index) => ({
      id: `pickup:${wave}:${index}`,
      kind: index < HEALTH_PICKUPS_PER_WAVE ? 'health' : 'armor',
      ...position, radius: PICKUP_RADIUS,
    }));
}

/**
 * Pure overlap collection against the player's position after movement.
 * Callers adopt both the returned pickup array and survival state, and queue
 * the events, before attacks in the same tick. Full-resource, hidden, distant,
 * and dead-player pickups remain available. Each success restores one point,
 * removes that item, and emits one event; cooldown is preserved by survival.
 * @param {readonly import('./contracts.js').Pickup[]} pickups
 * @param {import('./contracts.js').World} world
 * @param {import('./contracts.js').Position & { radius: number }} player
 * @param {Readonly<import('./contracts.js').SurvivalState>} state
 * @returns {import('./contracts.js').PickupResult}
 */
export function collectPickups(pickups, world, player, state) {
  /** @type {import('./contracts.js').Pickup[]} */
  const remaining = [];
  /** @type {import('./contracts.js').PickupEvent[]} */
  const events = [];
  let next = state;
  for (const pickup of pickups) {
    const full = pickup.kind === 'health' ? next.health >= MAX_HEALTH : next.armor >= MAX_ARMOR;
    if (next.health <= 0 || full
      || distance(pickup, player) > pickup.radius + player.radius + EPSILON
      || !hasLineOfSight(world, player, pickup)) {
      remaining.push(pickup);
      continue;
    }
    next = pickup.kind === 'health' ? restoreHealth(next) : restoreArmor(next);
    events.push({
      type: 'pickup', source: pickup.id, kind: pickup.kind, amount: 1,
      health: next.health, armor: next.armor, x: pickup.x, y: pickup.y,
    });
  }
  return { pickups: remaining, state: next, events };
}
