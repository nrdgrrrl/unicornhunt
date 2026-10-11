import { normalize } from './math.js';
import { raycast } from './world.js';

export const FIRE_COOLDOWN = 0.22;
export const COMBO_WINDOW = 2;
export const MAX_COMBO = 5;
export const HIT_POINTS = 100;

// Return the first intersection with a unicorn's circle on the forward ray.
// A circle containing the muzzle is hit at zero; circles behind it are ignored.
function hitDistance(origin, direction, unicorn) {
  const dx = unicorn.x - origin.x;
  const dy = unicorn.y - origin.y;
  const along = dx * direction.x + dy * direction.y;
  const across = dx * direction.y - dy * direction.x;
  const discriminant = unicorn.radius ** 2 - across ** 2;
  const tolerance = 8 * Number.EPSILON * Math.max(1, unicorn.radius ** 2, across ** 2);
  if (discriminant < -tolerance) return Infinity;
  const halfChord = Math.sqrt(Math.max(0, discriminant));
  if (along + halfChord < 0) return Infinity;
  return Math.max(0, along - halfChord);
}

/**
 * Process at most one instantaneous rainbow shot per simulation tick, after
 * updatePlayer has advanced fireCooldown. Session owns world, player, unicorns,
 * score (initially 0), combo (0), elapsed (seconds), lastHitAt (null), and events
 * (an array drained by the caller). Combat does not advance the session clock.
 * Every shot appends a shot event, including misses, for rainbow/sound feedback.
 * A conversion appends a separate glitter event and sets alive=false, preventing
 * further scoring, movement, or contact damage. No rendering/audio APIs are used.
 */
export function updateCombat(session) {
  const { world, player, unicorns, elapsed, events } = session;
  if (session.lastHitAt != null && elapsed - session.lastHitAt > COMBO_WINDOW) {
    session.combo = 0;
  }
  if (!player.firing || player.fireCooldown > 0) return session;

  const direction = normalize({ x: Math.cos(player.angle), y: Math.sin(player.angle) });
  const wall = raycast(world, player, direction);
  let distance = wall.distance;
  let target = null;
  const wallTolerance = 8 * Number.EPSILON * Math.max(1, wall.distance);
  for (const unicorn of unicorns) {
    if (!unicorn.alive) continue;
    const candidate = hitDistance(player, direction, unicorn);
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
