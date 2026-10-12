import { RAINBOW, INK } from './art.js';
import { STAR_LIFETIME, TRAIL_LIFETIME } from './effects-state.js';

// Projection owns visibility. Its optional visibleSpans clip every part of a
// star or shot against the renderer's wall depths, including partial overlap.
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

/**
 * Draw a read-only effects snapshot without advancing simulation.
 * project({x,y,z,size}) returns {x,y,scale,depth,visibleSpans?} or null.
 */
export function renderEffects(ctx, project, snapshot) {
  const { particles, trails, hitFor, damageFor, reducedMotion } = snapshot;
  ctx.save();
  for (const trail of trails) {
    // A muzzle-overlap hit has no segment to draw, but its hit feedback still
    // renders below. Short segments must never inherit a minimum travel range.
    if (trail.distance <= 0) continue;
    const progress = reducedMotion ? 0.5 : Math.max(0, Math.min(1, trail.age / TRAIL_LIFETIME));
    const end = trail.distance * 0.98;
    const start = Math.min(0.65, end * 0.35);
    const distance = start + (end - start) * progress;
    const point = {
      x: trail.x + Math.cos(trail.angle) * distance,
      y: trail.y + Math.sin(trail.angle) * distance,
      z: 0.55, size: 0.12,
    };
    projected(ctx, point, project, screen => {
      ctx.globalAlpha = 1 - trail.age / TRAIL_LIFETIME;
      ctx.translate(screen.x, screen.y);
      const size = Math.min(28, screen.scale * 0.075);
      // One flat, closed cartoon contour: rounded shaft and paired base lobes.
      ctx.beginPath();
      ctx.moveTo(-size * 0.28, size * 0.4);
      ctx.lineTo(-size * 0.28, -size * 0.55);
      ctx.quadraticCurveTo(-size * 0.28, -size, 0, -size);
      ctx.quadraticCurveTo(size * 0.28, -size, size * 0.28, -size * 0.55);
      ctx.lineTo(size * 0.28, size * 0.4);
      ctx.quadraticCurveTo(size * 0.78, size * 0.12, size * 0.78, size * 0.68);
      ctx.quadraticCurveTo(size * 0.78, size * 1.12, 0, size * 0.86);
      ctx.quadraticCurveTo(-size * 0.78, size * 1.12, -size * 0.78, size * 0.68);
      ctx.quadraticCurveTo(-size * 0.78, size * 0.12, -size * 0.28, size * 0.4);
      ctx.closePath();
      ctx.fillStyle = '#e9ad8d';
      ctx.strokeStyle = INK;
      ctx.lineWidth = 1.5;
      ctx.fill();
      ctx.stroke();
    });
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
      ctx.fillStyle = RAINBOW[particle.colorIndex];
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
}
