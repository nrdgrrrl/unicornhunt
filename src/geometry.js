// @ts-check

/**
 * Public geometry queries in tile units. The hedge primitives below delegate
 * to world.js via direct re-exports: their algorithms and function identities
 * are preserved, not duplicated. World generation stays in world.js, which
 * must not import this module. Its geometry exports remain compatible.
 *
 * Visibility is a centerline ray test, including blocking at hedge corners.
 * Circle clearance includes an actor's radius and allows exact wall tangency;
 * visibility alone does not guarantee room for an actor to move. Distance
 * fields describe cardinal paths between cell centers with that clearance.
 * Actor-to-actor contact instead compares center distance with the sum of both
 * radii (tangency counts as contact); gameplay also checks visibility so actors
 * cannot damage one another through hedges. Ray-circle tangency counts as a hit.
 *
 * Production consumer migration, including combat's private ray-circle query,
 * is deferred to issue 15.
 * @typedef {ReturnType<typeof import('./world.js').buildDistanceField>} DistanceField
 */

import { normalize } from './math.js';
import { DEFAULT_RADIUS } from './config.js';

export {
  isSolid, raycast, circleCollides, moveCircle, hasLineOfSight, buildDistanceField,
} from './world.js';

const NEIGHBORS = [[1, 0], [-1, 0], [0, 1], [0, -1]];

/**
 * First intersection on a forward ray, in tiles, or Infinity on a miss.
 * Direction is normalized here; its magnitude does not change the distance.
 * A circle containing/touching the muzzle is hit at zero. Rear circles are
 * ignored unless they overlap the muzzle. A zero direction returns Infinity,
 * even when overlapping, because it defines no forward ray.
 * @param {import('./contracts.js').Position} origin
 * @param {import('./contracts.js').Position} direction
 * @param {import('./contracts.js').Position & { radius: number }} circle
 * @returns {number}
 */
export function rayCircleDistance(origin, direction, circle) {
  if (![origin.x, origin.y, circle.x, circle.y].every(Number.isFinite)) {
    throw new TypeError('Position components must be finite numbers.');
  }
  if (!Number.isFinite(circle.radius) || circle.radius < 0) {
    throw new RangeError('Radius must be a finite, nonnegative number.');
  }
  const unit = normalize(direction);
  if (unit.x === 0 && unit.y === 0) return Infinity;
  const dx = circle.x - origin.x;
  const dy = circle.y - origin.y;
  const along = dx * unit.x + dy * unit.y;
  const across = dx * unit.y - dy * unit.x;
  const discriminant = circle.radius ** 2 - across ** 2;
  const tolerance = 8 * Number.EPSILON * Math.max(1, circle.radius ** 2, across ** 2);
  if (discriminant < -tolerance) return Infinity;
  const halfChord = Math.sqrt(Math.max(0, discriminant));
  if (along + halfChord < 0) return Infinity;
  return Math.max(0, along - halfChord);
}

/**
 * Query integer cell coordinates, not continuous world positions. Invalid or
 * out-of-bounds cells return Infinity; x never wraps into an adjacent row.
 * Solid, unreachable, and insufficiently clear cells also contain Infinity.
 * @param {DistanceField} field
 * @param {number} tileX
 * @param {number} tileY
 * @returns {number}
 */
export function distanceAt(field, tileX, tileY) {
  if (!Number.isInteger(tileX) || !Number.isInteger(tileY)
    || tileX < 0 || tileY < 0 || tileX >= field.width || tileY >= field.height) {
    return Infinity;
  }
  return field.distances[tileY * field.width + tileX];
}

/**
 * Return the first lower-distance cardinal cell in right/left/down/up order.
 * Coordinates are integer cells, not centers or movement deltas. Return null
 * at the target, outside/unreachable cells, or when no descending step exists.
 * This selects a cell; steering and centerline alignment belong to the actor.
 * @param {DistanceField} field
 * @param {number} tileX
 * @param {number} tileY
 * @returns {import('./contracts.js').Position | null}
 */
export function nextDistanceCell(field, tileX, tileY) {
  const current = distanceAt(field, tileX, tileY);
  if (!Number.isFinite(current) || current <= 0) return null;
  for (const [dx, dy] of NEIGHBORS) {
    const x = tileX + dx;
    const y = tileY + dy;
    if (distanceAt(field, x, y) < current) return { x, y };
  }
  return null;
}

/**
 * Validate a trusted field against world dimensions, the target's floored tile,
 * and the navigating actor's exact radius. Mismatches throw RangeError. Moving
 * within the same target tile is valid; blocked targets may have valid fields
 * containing only Infinity. This preserves existing navigation validation,
 * without asserting world identity or detecting subsequent tile mutations.
 * @param {DistanceField} field
 * @param {import('./contracts.js').World} world
 * @param {import('./contracts.js').Position} target
 * @param {number} [radius]
 * @returns {void}
 */
export function assertDistanceField(field, world, target, radius = DEFAULT_RADIUS) {
  if (field.width !== world.width || field.height !== world.height || field.radius !== radius
    || field.target.x !== Math.floor(target.x) || field.target.y !== Math.floor(target.y)) {
    throw new RangeError('Distance field must match world dimensions, target tile, and actor radius.');
  }
}
