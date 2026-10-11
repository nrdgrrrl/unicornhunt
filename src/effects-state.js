import { createRng } from './math.js';
import { moveCircle } from './world.js';
import { EFFECT_PARTICLE_RADIUS } from './config.js';

export const MAX_PARTICLES = 144;
export const REDUCED_PARTICLES = 24;
export const MAX_TRAILS = 8;
export const STAR_LIFETIME = 0.8;
export const TRAIL_LIFETIME = 0.14;
const RAINBOW_SIZE = 6;

function boundedPush(items, item, limit) {
  if (items.length >= limit) items.shift();
  items.push(item);
}

function snapshotItems(items) {
  return Object.freeze(items.map(item => Object.freeze({ ...item })));
}

/**
 * Browser-independent effects state. Time is in seconds and positions are in
 * world tiles. snapshot() copies and freezes every record and array; consumers
 * translate colorIndex through their rainbow palette when drawing.
 * The existing effects facade remains independent until drawing is migrated.
 */
export function createEffectsState({ reducedMotion = false, seed = 7 } = {}) {
  const random = createRng(seed);
  const particles = [];
  const trails = [];
  let hitFor = 0;
  let damageFor = 0;

  return {
    get particleCount() { return particles.length; },
    get trailCount() { return trails.length; },
    get reducedMotion() { return reducedMotion; },
    setReducedMotion(value) {
      if (reducedMotion === Boolean(value)) return;
      reducedMotion = Boolean(value);
      if (reducedMotion) {
        particles.splice(0, Math.max(0, particles.length - REDUCED_PARTICLES));
        for (const particle of particles) {
          particle.vx *= 0.12;
          particle.vy *= 0.12;
          particle.vz *= 0.12;
        }
      }
    },
    consume(events) {
      for (const event of events) {
        if (event.type === 'shot') {
          // Keep only scalar trail data so event objects cannot alias state.
          boundedPush(trails, {
            type: event.type, x: event.x, y: event.y,
            angle: event.angle, distance: event.distance, age: 0,
          }, MAX_TRAILS);
        }
        if (event.type === 'damage') damageFor = 0.25;
        if (event.type !== 'glitter') continue;
        hitFor = 0.2;
        const count = reducedMotion ? 6 : 24;
        const motion = reducedMotion ? 0.12 : 1;
        for (let i = 0; i < count; i++) {
          const angle = i * Math.PI * 2 / count + random() * 0.2;
          const speed = (0.65 + random() * 0.65) * motion;
          boundedPush(particles, {
            x: event.x, y: event.y, z: 0.55, age: 0,
            vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
            vz: (random() - 0.3) * motion,
            colorIndex: i % RAINBOW_SIZE, rotation: angle,
          }, reducedMotion ? REDUCED_PARTICLES : MAX_PARTICLES);
        }
      }
    },
    update(seconds, world) {
      if (!Number.isFinite(seconds) || seconds < 0) throw new RangeError('Effects time must be finite and nonnegative.');
      hitFor = Math.max(0, hitFor - seconds);
      damageFor = Math.max(0, damageFor - seconds);
      for (let i = particles.length - 1; i >= 0; i--) {
        const particle = particles[i];
        particle.age += seconds;
        if (particle.age >= STAR_LIFETIME) { particles.splice(i, 1); continue; }
        const delta = { x: particle.vx * seconds, y: particle.vy * seconds };
        const position = world ? moveCircle(world, particle, delta, EFFECT_PARTICLE_RADIUS)
          : { x: particle.x + delta.x, y: particle.y + delta.y };
        particle.x = position.x;
        particle.y = position.y;
        particle.z = Math.max(0.08, particle.z + particle.vz * seconds);
      }
      for (let i = trails.length - 1; i >= 0; i--) {
        trails[i].age += seconds;
        if (trails[i].age >= TRAIL_LIFETIME) trails.splice(i, 1);
      }
    },
    snapshot() {
      return Object.freeze({
        particles: snapshotItems(particles),
        trails: snapshotItems(trails),
        hitFor, damageFor, reducedMotion,
      });
    },
    clear() {
      // Clearing feedback preserves both the preference and the RNG lifetime.
      particles.length = 0;
      trails.length = 0;
      hitFor = 0;
      damageFor = 0;
    },
  };
}
