import { clamp, createRng, normalize } from './math.js';
import { DEFAULT_RADIUS } from './config.js';

export const MAP_SIZE = 24;
export const EMPTY = 0;
export const HEDGE = 1;
// Preserve the world API used by existing geometry consumers.
export { DEFAULT_RADIUS } from './config.js';

const MOVE_STEP = 0.125;
export const MAX_MOVE_STEPS = 512;
const CONTACT_STEPS = 12;
const NEIGHBORS = [[1, 0], [-1, 0], [0, 1], [0, -1]];

/**
 * World coordinates are in tiles. Tiles are row-major: tiles[y * width + x].
 * Only EMPTY tiles are walkable; decorations have no collision geometry.
 * The spawn faces east (angle 0), down a protected three-tile-wide corridor.
 * @param {import('./contracts.js').Seed} [seed]
 * @returns {import('./contracts.js').GeneratedWorld}
 */
export function createWorld(seed = 1) {
  const random = createRng(seed);
  const world = {
    seed,
    width: MAP_SIZE,
    height: MAP_SIZE,
    tiles: new Uint8Array(MAP_SIZE * MAP_SIZE).fill(HEDGE),
    spawn: { x: 3.5, y: 12.5, angle: 0 },
    decorations: [],
  };
  const inCorridor = (x, y) => x >= 2 && x <= 9 && y >= 11 && y <= 13;

  for (let y = 1; y < world.height - 1; y++) {
    for (let x = 1; x < world.width - 1; x++) {
      world.tiles[y * world.width + x] = inCorridor(x, y) || random() >= 0.18 ? EMPTY : HEDGE;
    }
  }

  // Fill isolated pockets instead of retrying generation. The flood visits at
  // most width * height cells, guaranteeing a connected result for every seed.
  const field = buildDistanceField(world, world.spawn);
  for (let i = 0; i < world.tiles.length; i++) {
    if (!Number.isFinite(field.distances[i])) world.tiles[i] = HEDGE;
  }

  const types = ['mushroom', 'stone', 'flower'];
  for (let y = 1; y < world.height - 1; y++) {
    for (let x = 1; x < world.width - 1; x++) {
      if (isSolid(world, x, y) || inCorridor(x, y) || random() >= 0.16) continue;
      world.decorations.push({
        type: types[Math.floor(random() * types.length)],
        x: x + 0.2 + random() * 0.6,
        y: y + 0.2 + random() * 0.6,
        size: 0.12 + random() * 0.12,
      });
    }
  }
  return world;
}

/** Query integer tile coordinates. Outside the map is always solid. */
export function isSolid(world, tileX, tileY) {
  return !Number.isInteger(tileX) || !Number.isInteger(tileY)
    || tileX < 0 || tileY < 0 || tileX >= world.width || tileY >= world.height
    || world.tiles[tileY * world.width + tileX] !== EMPTY;
}

function assertPosition({ x, y }) {
  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    throw new TypeError('Position components must be finite numbers.');
  }
}

function assertRadius(radius) {
  if (!Number.isFinite(radius) || radius < 0) {
    throw new RangeError('Radius must be a finite, nonnegative number.');
  }
}

/**
 * DDA raycast with a normalized direction, so distance is always in tiles.
 * Returns { hit, distance, x, y, tileX, tileY, normal: { x, y } }.
 * A miss ends at maxDistance and has null tile coordinates. A zero direction
 * ends at the origin. Rays starting in solid geometry hit at distance zero.
 * At an exact corner, either adjacent hedge blocks the ray (no corner leaks).
 */
export function raycast(world, origin, direction, maxDistance = Infinity) {
  assertPosition(origin);
  const unit = normalize(direction);
  if (!(maxDistance >= 0) || (maxDistance !== Infinity && !Number.isFinite(maxDistance))) {
    throw new RangeError('Ray distance must be nonnegative or Infinity.');
  }
  let tileX = Math.floor(origin.x);
  let tileY = Math.floor(origin.y);
  const result = (hit, distance, x = null, y = null, normalX = 0, normalY = 0) => ({
    hit,
    distance,
    x: origin.x + unit.x * distance,
    y: origin.y + unit.y * distance,
    tileX: x,
    tileY: y,
    normal: { x: normalX, y: normalY },
  });
  if (isSolid(world, tileX, tileY)) return result(true, 0, tileX, tileY);
  if (unit.x === 0 && unit.y === 0) return result(false, 0);

  const stepX = Math.sign(unit.x);
  const stepY = Math.sign(unit.y);
  const deltaX = unit.x === 0 ? Infinity : Math.abs(1 / unit.x);
  const deltaY = unit.y === 0 ? Infinity : Math.abs(1 / unit.y);
  let nextX = unit.x === 0 ? Infinity : (tileX + (stepX > 0 ? 1 : 0) - origin.x) / unit.x;
  let nextY = unit.y === 0 ? Infinity : (tileY + (stepY > 0 ? 1 : 0) - origin.y) / unit.y;

  // A ray from inside the map must leave it within this many grid crossings.
  for (let crossing = 0; crossing < world.width + world.height + 2; crossing++) {
    const crossingDistance = Math.max(0, Math.min(nextX, nextY));
    // Successive crossings accumulate tiny rounding differences. Treat values
    // within floating-point precision as the same corner or segment endpoint.
    const tolerance = 8 * Number.EPSILON * Math.max(1, crossingDistance);
    if (crossingDistance - maxDistance > tolerance) return result(false, maxDistance);
    const distance = Math.min(crossingDistance, maxDistance);
    if (Math.abs(nextX - nextY) <= tolerance) {
      if (isSolid(world, tileX + stepX, tileY)) {
        return result(true, distance, tileX + stepX, tileY, -stepX, 0);
      }
      if (isSolid(world, tileX, tileY + stepY)) {
        return result(true, distance, tileX, tileY + stepY, 0, -stepY);
      }
      tileX += stepX;
      tileY += stepY;
      nextX += deltaX;
      nextY += deltaY;
      if (isSolid(world, tileX, tileY)) return result(true, distance, tileX, tileY, -stepX, 0);
    } else if (nextX < nextY) {
      tileX += stepX;
      nextX += deltaX;
      if (isSolid(world, tileX, tileY)) return result(true, distance, tileX, tileY, -stepX, 0);
    } else {
      tileY += stepY;
      nextY += deltaY;
      if (isSolid(world, tileX, tileY)) return result(true, distance, tileX, tileY, 0, -stepY);
    }
  }
  throw new Error('Ray exceeded the grid crossing bound.');
}

/** Circle versus full hedge tiles. Tangency is allowed; overlap is blocked. */
export function circleCollides(world, position, radius = DEFAULT_RADIUS) {
  assertPosition(position);
  assertRadius(radius);
  const { x, y } = position;
  if (radius === 0) return isSolid(world, Math.floor(x), Math.floor(y));
  if (x - radius < 0 || y - radius < 0 || x + radius > world.width || y + radius > world.height) {
    return true;
  }
  for (let tileY = Math.floor(y - radius); tileY <= Math.floor(y + radius); tileY++) {
    for (let tileX = Math.floor(x - radius); tileX <= Math.floor(x + radius); tileX++) {
      if (!isSolid(world, tileX, tileY)) continue;
      const dx = x - clamp(x, tileX, tileX + 1);
      const dy = y - clamp(y, tileY, tileY + 1);
      if (Math.hypot(dx, dy) < radius) return true;
    }
  }
  return false;
}

/**
 * Return a new position after sliding a circle by delta; inputs are unchanged.
 * Axis-separated substeps cannot skip a hedge tile. On contact, bounded binary
 * search advances to the wall while preserving movement along the other axis.
 * Displacements over 64 tiles are capped; at most MAX_MOVE_STEPS are performed.
 * An initially overlapping circle stays put; this is not a depenetration tool.
 */
export function moveCircle(world, position, delta, radius = DEFAULT_RADIUS) {
  assertPosition(position);
  assertPosition(delta);
  assertRadius(radius);
  const moved = { x: position.x, y: position.y };
  if (circleCollides(world, moved, radius)) return moved;
  const direction = normalize(delta);
  const distance = Math.min(Math.hypot(delta.x, delta.y), MOVE_STEP * MAX_MOVE_STEPS);
  const steps = Math.min(MAX_MOVE_STEPS, Math.ceil(distance / MOVE_STEP));
  if (steps === 0) return moved;
  const step = { x: direction.x * distance / steps, y: direction.y * distance / steps };

  const advance = (axis, amount) => {
    if (amount === 0) return;
    const candidate = { ...moved, [axis]: moved[axis] + amount };
    if (!circleCollides(world, candidate, radius)) {
      moved[axis] = candidate[axis];
      return;
    }
    let low = 0;
    let high = 1;
    for (let attempt = 0; attempt < CONTACT_STEPS; attempt++) {
      const middle = (low + high) / 2;
      candidate[axis] = moved[axis] + amount * middle;
      if (circleCollides(world, candidate, radius)) high = middle;
      else low = middle;
    }
    moved[axis] += amount * low;
  };

  for (let stepIndex = 0; stepIndex < steps; stepIndex++) {
    advance('x', step.x);
    advance('y', step.y);
  }
  return moved;
}

/** Visibility uses the same hedge geometry as rendering and shooting rays. */
export function hasLineOfSight(world, from, to) {
  assertPosition(from);
  assertPosition(to);
  if (isSolid(world, Math.floor(to.x), Math.floor(to.y))) return false;
  const direction = { x: to.x - from.x, y: to.y - from.y };
  return !raycast(world, from, direction, Math.hypot(direction.x, direction.y)).hit;
}

/**
 * Cardinal BFS distances to the target's tile center, measured in tile steps.
 * Returns { width, height, distances, target, radius }; distances is a row-major
 * Float64Array with Infinity for solid, unreachable, or insufficiently clear
 * cells. Pass the navigating actor's radius to use its collision clearance.
 * An invalid/blocked target produces an entirely unreachable field.
 */
export function buildDistanceField(world, target, radius = DEFAULT_RADIUS) {
  assertPosition(target);
  assertRadius(radius);
  const distances = new Float64Array(world.width * world.height).fill(Infinity);
  const tileX = Math.floor(target.x);
  const tileY = Math.floor(target.y);
  const field = { width: world.width, height: world.height, distances, target: { x: tileX, y: tileY }, radius };
  if (isSolid(world, tileX, tileY) || circleCollides(world, { x: tileX + 0.5, y: tileY + 0.5 }, radius)) {
    return field;
  }

  const queue = new Int32Array(distances.length);
  const start = tileY * world.width + tileX;
  queue[0] = start;
  distances[start] = 0;
  let tail = 1;
  for (let head = 0; head < tail; head++) {
    const index = queue[head];
    const x = index % world.width;
    const y = Math.floor(index / world.width);
    for (const [dx, dy] of NEIGHBORS) {
      const nextX = x + dx;
      const nextY = y + dy;
      if (isSolid(world, nextX, nextY)) continue;
      const next = nextY * world.width + nextX;
      if (Number.isFinite(distances[next]) || circleCollides(world, { x: nextX + 0.5, y: nextY + 0.5 }, radius)) continue;
      distances[next] = distances[index] + 1;
      queue[tail++] = next;
    }
  }
  return field;
}
