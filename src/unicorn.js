import { createRng } from './math.js';
import { createRangedAttackState } from './ranged-attacks.js';
import {
  buildDistanceField, circleCollides, hasLineOfSight, moveCircle,
  distanceAt, nextDistanceCell, assertDistanceField,
} from './geometry.js';
import {
  UNICORN_RADIUS, UNICORN_SPEED, WAVE_SPEED_INCREMENT, PLAYER_SPAWN_DISTANCE,
  UNICORN_SPAWN_DISTANCE, CONTACT_DAMAGE, CONTACT_INVULNERABILITY,
} from './config.js';

// Keep historical imports working without retaining duplicate declarations.
export {
  UNICORN_RADIUS, UNICORN_SPEED, WAVE_SPEED_INCREMENT, PLAYER_SPAWN_DISTANCE,
  UNICORN_SPAWN_DISTANCE, CONTACT_DAMAGE, CONTACT_INVULNERABILITY,
} from './config.js';
const EPSILON = 1e-9;
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

/**
 * Return exactly count living unicorns for a new wave. Enumerate reachable cell
 * centers once, then shuffle without replacement: no random retry loop.
 * Wave one reserves a visible unicorn three tiles directly ahead when clear
 * (the generated world's protected introduction corridor guarantees this).
 * Impossible requests fail explicitly rather than returning a partial wave.
 * @param {import('./contracts.js').World} world
 * @param {import('./contracts.js').Player} player
 * @param {number} count
 * @param {number} [wave]
 * @param {import('./contracts.js').Seed} [seed]
 * @returns {import('./contracts.js').Unicorn[]}
 */
export function spawnUnicorns(world, player, count, wave = 1, seed = `${world.seed ?? 1}:${wave}`) {
  if (!Number.isSafeInteger(count) || count < 0) {
    throw new RangeError('Unicorn count must be a nonnegative safe integer.');
  }
  if (!Number.isSafeInteger(wave) || wave < 1) {
    throw new RangeError('Wave must be a positive safe integer.');
  }
  if (!Number.isFinite(player.angle)) throw new TypeError('Player angle must be finite.');
  const random = createRng(seed);
  const field = buildDistanceField(world, player, UNICORN_RADIUS);
  const candidates = [];
  // Reachability describes cell centers; an off-center introduction also needs
  // circle clearance at its exact position, even when its cell is reachable.
  const safe = position => Number.isFinite(distanceAt(field, Math.floor(position.x), Math.floor(position.y)))
    && !circleCollides(world, position, UNICORN_RADIUS)
    && distance(position, player) + EPSILON >= Math.max(PLAYER_SPAWN_DISTANCE, player.radius + UNICORN_RADIUS);
  for (let y = 0; y < world.height; y++) {
    for (let x = 0; x < world.width; x++) {
      const position = { x: x + 0.5, y: y + 0.5 };
      if (safe(position)) candidates.push(position);
    }
  }
  const positions = [];
  if (wave === 1 && count > 0) {
    const ahead = {
      x: player.x + Math.cos(player.angle) * PLAYER_SPAWN_DISTANCE,
      y: player.y + Math.sin(player.angle) * PLAYER_SPAWN_DISTANCE,
    };
    if (safe(ahead) && hasLineOfSight(world, player, ahead)) positions.push(ahead);
  }
  // Cell centers are at least one tile apart. Only the introductory position
  // can be off-center, so filter its clearance before selecting candidates.
  const available = candidates.filter(position => positions.every(other => distance(position, other) + EPSILON >= UNICORN_SPAWN_DISTANCE));
  if (count > positions.length + available.length) {
    throw new RangeError('Requested wave exceeds the number of safe spawn positions.');
  }
  for (let i = available.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [available[i], available[j]] = [available[j], available[i]];
  }
  positions.push(...available.slice(0, count - positions.length));
  return positions.map((position, index) => ({
    id: `${wave}:${index}`, ...position, radius: UNICORN_RADIUS,
    speed: UNICORN_SPEED + (wave - 1) * WAVE_SPEED_INCREMENT,
    angle: Math.atan2(player.y - position.y, player.x - position.x), alive: true,
    attack: createRangedAttackState(seed, `${wave}:${index}`),
  }));
}

function navigate(unicorn, world, player, field, seconds) {
  let remaining = unicorn.speed * seconds;
  // Each completed cardinal step descends the field. This bound also handles
  // very long frames without discarding ordinary frame movement or tunneling.
  for (let step = 0; step < field.width * field.height + 2 && remaining > 0; step++) {
    const x = Math.floor(unicorn.x);
    const y = Math.floor(unicorn.y);
    const current = distanceAt(field, x, y);
    if (!Number.isFinite(current)) break;
    let target = player;
    if (current > 0) {
      const neighbor = nextDistanceCell(field, x, y);
      if (!neighbor) break;
      const dx = neighbor.x - x;
      const dy = neighbor.y - y;
      // Finish reaching this cell's centerline before turning. Steering
      // diagonally at a lower-distance cell can otherwise stick on corners.
      const aligned = dx ? Math.abs(unicorn.y - (y + 0.5)) < EPSILON
        : Math.abs(unicorn.x - (x + 0.5)) < EPSILON;
      target = { x: x + 0.5 + (aligned ? dx : 0), y: y + 0.5 + (aligned ? dy : 0) };
    }
    const length = distance(unicorn, target);
    if (length < EPSILON) break;
    const amount = Math.min(remaining, length);
    const delta = { x: (target.x - unicorn.x) / length * amount, y: (target.y - unicorn.y) / length * amount };
    const moved = moveCircle(world, unicorn, delta, unicorn.radius);
    const traveled = distance(unicorn, moved);
    if (traveled < EPSILON) break;
    unicorn.angle = Math.atan2(moved.y - unicorn.y, moved.x - unicorn.x);
    unicorn.x = moved.x;
    unicorn.y = moved.y;
    remaining -= amount;
    if (traveled + EPSILON < amount) break;
  }
}

/**
 * Mutate living unicorns and the player's magic/cooldown; return damage events
 * for later sound and visuals. Call once for the entire group per simulation
 * tick, after updatePlayer. A caller may supply this tick's shared distance
 * field, built for UNICORN_RADIUS; otherwise it is built once for the group.
 * Setting alive=false immediately disables both movement and contact damage.
 * @param {import('./contracts.js').Unicorn[]} unicorns
 * @param {import('./contracts.js').World} world
 * @param {import('./contracts.js').Player} player
 * @param {number} seconds
 * @param {ReturnType<typeof buildDistanceField>} [field]
 * @returns {import('./contracts.js').DamageEvent[]}
 */
export function updateUnicorns(unicorns, world, player, seconds, field) {
  if (!Number.isFinite(seconds) || seconds < 0) {
    throw new RangeError('Unicorn update time must be finite and nonnegative.');
  }
  field ??= buildDistanceField(world, player, UNICORN_RADIUS);
  assertDistanceField(field, world, player, UNICORN_RADIUS);
  player.invulnerableFor = Math.max(0, player.invulnerableFor - seconds);
  const events = [];
  for (const unicorn of unicorns) {
    if (!unicorn.alive) continue;
    const touching = () => distance(unicorn, player) <= unicorn.radius + player.radius + EPSILON
      && hasLineOfSight(world, unicorn, player);
    const contacted = touching();
    navigate(unicorn, world, player, field, seconds);
    if ((contacted || touching()) && player.invulnerableFor === 0 && player.magic > 0 && events.length === 0) {
      const amount = Math.min(CONTACT_DAMAGE, player.magic);
      player.magic -= amount;
      player.invulnerableFor = CONTACT_INVULNERABILITY;
      events.push({ type: 'damage', source: unicorn.id, amount, magic: player.magic, x: player.x, y: player.y });
    }
  }
  return events;
}
