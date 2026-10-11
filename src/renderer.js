import { createArt, INK, PAPER } from './art.js';
import { raycast } from './world.js';

/** Projection is the effects' only rendering contract. Its visibleSpans clip
 * every part of a billboard against per-column wall depths. */
export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d');
  const art = createArt();
  const { width, height } = canvas;
  const focal = width / (2 * Math.tan(Math.PI / 6));
  const wallDepth = new Float64Array(width);
  let camera;

  function project({ x, y, z = 0.5, size = 0.1 }) {
    if (!camera) return null;
    const dx = x - camera.x;
    const dy = y - camera.y;
    const cosine = Math.cos(camera.angle);
    const sine = Math.sin(camera.angle);
    const depth = dx * cosine + dy * sine;
    if (depth < 0.08) return null;
    const scale = focal / depth;
    const screenX = width / 2 + (-dx * sine + dy * cosine) * scale;
    const screenY = height / 2 + (0.5 - z) * scale;
    const left = Math.max(0, Math.floor(screenX - size * scale - 2));
    const right = Math.min(width, Math.ceil(screenX + size * scale + 2));
    const visibleSpans = [];
    let start = null;
    for (let column = left; column < right; column++) {
      const visible = depth < wallDepth[column] + 1e-6;
      if (visible && start === null) start = column;
      if (!visible && start !== null) {
        visibleSpans.push({ x: start, width: column - start });
        start = null;
      }
    }
    if (start !== null) visibleSpans.push({ x: start, width: right - start });
    return visibleSpans.length ? { x: screenX, y: screenY, depth, scale, visibleSpans } : null;
  }

  function render(session) {
    camera = session.player;
    ctx.fillStyle = PAPER;
    ctx.fillRect(0, 0, width, height / 2);
    ctx.fillStyle = '#e6e6c8';
    ctx.fillRect(0, height / 2, width, height / 2);
    const cosine = Math.cos(camera.angle);
    const sine = Math.sin(camera.angle);
    for (let column = 0; column < width; column += 2) {
      const side = (column + 1 - width / 2) / focal;
      const hit = raycast(session.world, camera, { x: cosine - sine * side, y: sine + cosine * side });
      const depth = Math.max(0.01, hit.distance / Math.hypot(1, side));
      wallDepth[column] = depth;
      wallDepth[column + 1] = depth;
      const wallHeight = focal / depth;
      const coordinate = hit.normal.x ? hit.y : hit.x;
      const textureX = Math.floor((coordinate - Math.floor(coordinate)) * art.hedge.width);
      ctx.drawImage(art.hedge, textureX, 0, 1, art.hedge.height,
        column, (height - wallHeight) / 2, 2, wallHeight);
      ctx.fillStyle = `rgba(48,39,54,${Math.min(0.55, depth * 0.022)})`;
      ctx.fillRect(column, (height - wallHeight) / 2, 2, wallHeight);
    }
    const sprites = [
      ...session.world.decorations.map(item => ({ ...item, sprite: art[item.type], height: item.size * 2 })),
      ...session.unicorns.filter(item => item.alive).map(item => ({ ...item, sprite: art.unicorn, height: 0.95 })),
    ].map(item => ({ ...item, screen: project({ ...item, z: item.height / 2, size: item.height * 0.4 }) }))
      .filter(item => item.screen).sort((a, b) => b.screen.depth - a.screen.depth);
    for (const { sprite, height: worldHeight, screen } of sprites) {
      if (!sprite) continue;
      const spriteHeight = screen.scale * worldHeight;
      const spriteWidth = spriteHeight * sprite.width / sprite.height;
      ctx.save();
      ctx.beginPath();
      for (const span of screen.visibleSpans) ctx.rect(span.x, 0, span.width, height);
      ctx.clip();
      ctx.drawImage(sprite, screen.x - spriteWidth / 2, screen.y - spriteHeight / 2, spriteWidth, spriteHeight);
      ctx.restore();
    }
    ctx.drawImage(art.weapon, width / 2 - 48, height - 115, 96, 120);
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(width / 2 - 4, height / 2); ctx.lineTo(width / 2 + 4, height / 2);
    ctx.moveTo(width / 2, height / 2 - 4); ctx.lineTo(width / 2, height / 2 + 4);
    ctx.stroke();
  }

  return { ctx, render, project };
}
