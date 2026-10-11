// @ts-check

import { raycast, rayCircleDistance } from './geometry.js';
import { FIRE_COOLDOWN, COMBO_WINDOW, MAX_COMBO, HIT_POINTS } from './config.js';

// Compatibility exports keep this ownership change separate from API changes.
export { FIRE_COOLDOWN, COMBO_WINDOW, MAX_COMBO, HIT_POINTS } from './config.js';

/**
 * Process at most one instantaneous rainbow shot per simulation tick, after
 * updatePlayer has advanced fireCooldown. Session owns world, player, unicorns,
 * score (initially 0), combo (0), elapsed (seconds), lastHitAt (null), and events
 * (an array drained by the caller). Combat does not advance the session clock.
 * Every shot appends a shot event, including misses, for rainbow/sound feedback.
 * A conversion appends a separate glitter event and sets alive=false, preventing
 * further scoring, movement, or contact damage. No rendering/audio APIs are used.
 * @template {import('./contracts.js').CombatState} T
 * @param {T} session
 * @returns {T}
 */
export function updateCombat(session) {
  const { world, player, unicorns, elapsed, events } = session;
  if (session.lastHitAt != null && elapsed - session.lastHitAt > COMBO_WINDOW) {
    session.combo = 0;
  }
  if (!player.firing || player.fireCooldown > 0) return session;

  const direction = { x: Math.cos(player.angle), y: Math.sin(player.angle) };
  const wall = raycast(world, player, direction);
  let distance = wall.distance;
  /** @type {import('./contracts.js').Unicorn | null} */
  let target = null;
  const wallTolerance = 8 * Number.EPSILON * Math.max(1, wall.distance);
  for (const unicorn of unicorns) {
    if (!unicorn.alive) continue;
    const candidate = rayCircleDistance(player, direction, unicorn);
    // Hedges win ties, including tiny rounding differences at their surface.
    if (candidate < distance && candidate < wall.distance - wallTolerance) {
      distance = candidate;
      target = unicorn;
    }
  }

  player.fireCooldown = FIRE_COOLDOWN;
  events.push({ type: 'shot', x: player.x, y: player.y, angle: player.angle, distance });
  if (target) {
    target.alive = false;
    session.combo = session.lastHitAt != null && elapsed - session.lastHitAt <= COMBO_WINDOW
      ? Math.min(MAX_COMBO, session.combo + 1) : 1;
    const points = HIT_POINTS * session.combo;
    session.score += points;
    session.lastHitAt = elapsed;
    events.push({
      type: 'glitter', source: target.id, x: target.x, y: target.y,
      points, combo: session.combo, score: session.score,
    });
  }
  return session;
}
