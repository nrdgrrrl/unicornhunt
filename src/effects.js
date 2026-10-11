import { RAINBOW, INK } from './art.js';
import { createRng } from './math.js';
import { moveCircle } from './world.js';

export const MAX_PARTICLES = 144;
export const REDUCED_PARTICLES = 24;
export const MAX_TRAILS = 8;
const STAR_LIFETIME = 0.8;

function boundedPush(items, item, limit) {
  if (items.length >= limit) items.shift();
  items.push(item);
}

// Projection owns visibility. Its optional visibleSpans clip every part of a
// star or trail against the renderer's wall depths, including partial overlap.
function projected(ctx, point, project, draw) {
  const screen = project(point);
  if (!screen) return;
  ctx.save();
  if (screen.visibleSpans) {
    ctx.beginPath();
    for (const span of screen.visibleSpans) ctx.rect(span.x, 0, span.width, ctx.canvas.height);
    ctx.clip();
  }
  draw(screen);
  ctx.restore();
}

/** World-space feedback, independent of renderer internals. Time is seconds;
 * project({x,y,z,size}) returns {x,y,scale,visibleSpans?} or null when invisible.
 */
export function createEffects({ reducedMotion = false, seed = 7 } = {}) {
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
        if (event.type === 'shot') boundedPush(trails, { ...event, age: 0 }, MAX_TRAILS);
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
            color: RAINBOW[i % RAINBOW.length], rotation: angle,
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
        const position = world ? moveCircle(world, particle, delta, 0.025)
          : { x: particle.x + delta.x, y: particle.y + delta.y };
        particle.x = position.x;
        particle.y = position.y;
        particle.z = Math.max(0.08, particle.z + particle.vz * seconds);
      }
      for (let i = trails.length - 1; i >= 0; i--) {
        trails[i].age += seconds;
        if (trails[i].age >= 0.14) trails.splice(i, 1);
      }
    },
    render(ctx, project) {
      ctx.save();
      for (const trail of trails) {
        ctx.globalAlpha = 1 - trail.age / 0.14;
        let previous = null;
        // Sample a short ribbon in world space so turning/moving the camera
        // reprojects it correctly and walls clip it at each sample's depth.
        for (let i = 0; i < 48; i++) {
          const t = i / 47;
          const distance = 0.18 + (Math.max(0.18, trail.distance - 0.01) - 0.18) * t;
          const point = {
            x: trail.x + Math.cos(trail.angle) * distance,
            y: trail.y + Math.sin(trail.angle) * distance,
            z: 0.12 + 0.38 * t, size: 0.035,
          };
          const screen = project(point);
          if (!screen) { previous = null; continue; }
          projected(ctx, point, () => screen, screen => {
            const band = Math.max(1, Math.min(3, screen.scale * 0.007));
            const dx = screen.x - (previous?.x ?? screen.x);
            const dy = screen.y - (previous?.y ?? screen.y);
            const length = Math.hypot(dx, dy);
            const normal = length > 0 ? { x: -dy / length, y: dx / length } : { x: 1, y: 0 };
            const startNormal = previous?.normal ?? normal;
            RAINBOW.forEach((color, stripe) => {
              const offset = stripe - 2.5;
              ctx.strokeStyle = color;
              ctx.lineWidth = band + 0.5;
              ctx.beginPath();
              ctx.moveTo((previous?.x ?? screen.x) + startNormal.x * offset * (previous?.band ?? band),
                (previous?.y ?? screen.y) + startNormal.y * offset * (previous?.band ?? band));
              ctx.lineTo(screen.x + normal.x * offset * band, screen.y + normal.y * offset * band);
              ctx.stroke();
            });
            previous = { ...screen, band, normal };
          });
        }
      }
      // Far-to-near alpha blending; this temporary list is bounded too.
      const stars = particles.map(particle => ({ particle, screen: project({ ...particle, size: 0.09 }) }))
        .filter(item => item.screen).sort((a, b) => b.screen.depth - a.screen.depth);
      for (const { particle, screen } of stars) {
        projected(ctx, particle, () => screen, () => {
          ctx.globalAlpha = 1 - particle.age / STAR_LIFETIME;
          ctx.translate(screen.x, screen.y);
          ctx.rotate(particle.rotation + (reducedMotion ? 0 : particle.age * 2));
          const size = Math.min(24, Math.max(2, screen.scale * 0.045));
          ctx.beginPath();
          for (let i = 0; i < 10; i++) {
            const radius = size * (i % 2 ? 0.42 : 1);
            const angle = i * Math.PI / 5 - Math.PI / 2;
            const x = Math.cos(angle) * radius;
            const y = Math.sin(angle) * radius;
            if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
          }
          ctx.closePath();
          ctx.fillStyle = particle.color;
          ctx.strokeStyle = INK;
          ctx.lineWidth = 1;
          ctx.fill();
          ctx.stroke();
        });
      }
      ctx.globalAlpha = 1;
      if (hitFor > 0) {
        ctx.strokeStyle = RAINBOW[0];
        ctx.lineWidth = 3;
        ctx.beginPath();
        for (const sx of [-1, 1]) for (const sy of [-1, 1]) {
          ctx.moveTo(ctx.canvas.width / 2 + sx * 7, ctx.canvas.height / 2 + sy * 7);
          ctx.lineTo(ctx.canvas.width / 2 + sx * 13, ctx.canvas.height / 2 + sy * 13);
        }
        ctx.stroke();
      }
      if (damageFor > 0) {
        ctx.strokeStyle = RAINBOW[0];
        ctx.lineWidth = 8;
        ctx.strokeRect(4, 4, ctx.canvas.width - 8, ctx.canvas.height - 8);
      }
      ctx.restore();
    },
    clear() { particles.length = 0; trails.length = 0; hitFor = 0; damageFor = 0; },
  };
}
