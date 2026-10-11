import { createArt, INK } from './art.js';
import { createRng } from './math.js';
import {
  CAMERA_HEIGHT, HORIZONTAL_FOV, createCameraFrame, columnRay,
  perpendicularDepth, floorRow, position as projectPosition, project as projectPoint,
} from './projection.js';
import { raycast } from './geometry.js';

export { CAMERA_HEIGHT, HORIZONTAL_FOV };
const RECOIL_TIME = 0.16;
const PAPER_RGB = [255, 248, 232];

/** The camera stays horizontal at a fixed height. All world artwork and effects
 * share perpendicular depth and per-column wall clipping. Render never advances
 * animation time; update and consume are called only by the simulation. */
export function createRenderer(canvas, { reducedMotion = false } = {}) {
  const ctx = canvas.getContext('2d');
  const art = createArt();
  const paper = ctx.createPattern(art.paper, 'repeat');
  const grass = art.grass.getContext('2d').getImageData(0, 0, 64, 64).data;
  const floor = canvas.ownerDocument.createElement('canvas');
  const floorCtx = floor.getContext('2d');
  const forests = new WeakMap();
  let width = 0;
  let height = 0;
  let wallDepth;
  let floorPixels;
  let view;
  let walkPhase = 0;
  let walking = 0;
  let recoil = 0;

  function resize() {
    if (width === canvas.width && height === canvas.height) return;
    width = canvas.width;
    height = canvas.height;
    wallDepth = new Float64Array(width);
    // A bounded paper raster keeps floor casting inexpensive on large canvases.
    floor.width = Math.min(320, Math.ceil(width / 2));
    floor.height = Math.min(180, Math.ceil(height / 4));
    floorPixels = floorCtx.createImageData(floor.width, floor.height);
  }

  function position(point) {
    return projectPosition(view, point);
  }

  function project(point) {
    return projectPoint(view, point, wallDepth);
  }

  function drawFloor() {
    const data = floorPixels.data;
    for (let row = 0; row < floor.height; row++) {
      const samples = floorRow(view, row, floor.width, floor.height);
      const { depth, stepX, stepY } = samples;
      const fog = Math.min(1, depth / 28);
      let { x, y } = samples;
      for (let column = 0; column < floor.width; column++) {
        const tx = ((Math.floor(x * 64) % 64) + 64) % 64;
        const ty = ((Math.floor(y * 64) % 64) + 64) % 64;
        const texture = (ty * 64 + tx) * 4;
        const pixel = (row * floor.width + column) * 4;
        for (let channel = 0; channel < 3; channel++) {
          data[pixel + channel] = grass[texture + channel] * (1 - fog) + PAPER_RGB[channel] * fog;
        }
        data[pixel + 3] = 255;
        x += stepX;
        y += stepY;
      }
    }
    floorCtx.putImageData(floorPixels, 0, 0);
    ctx.drawImage(floor, 0, height / 2, width, height / 2);
  }

  function drawForest(world) {
    let trees = forests.get(world);
    if (!trees) {
      const random = createRng(world.seed ?? 1);
      const radius = Math.hypot(world.width, world.height) / 2 + 6;
      trees = Array.from({ length: 72 }, (_, i) => {
        const angle = i * Math.PI * 2 / 72;
        return { x: world.width / 2 + Math.cos(angle) * radius,
          y: world.height / 2 + Math.sin(angle) * radius, height: 4 + random() * 2 };
      });
      forests.set(world, trees);
    }
    ctx.save();
    ctx.globalAlpha = 0.65;
    const visible = trees.map(tree => ({ tree, screen: position({ ...tree, z: tree.height / 2 }) }))
      .filter(item => item.screen).sort((a, b) => b.screen.depth - a.screen.depth);
    for (const { tree, screen } of visible) {
      const h = tree.height * screen.scale;
      const w = h * art.tree.width / art.tree.height;
      ctx.drawImage(art.tree, screen.x - w / 2, screen.y - h / 2, w, h);
    }
    ctx.restore();
  }

  function render(session, { effects } = {}) {
    resize();
    view = createCameraFrame(width, height, session.player);
    ctx.fillStyle = paper;
    ctx.fillRect(0, 0, width, height);
    drawFloor();
    drawForest(session.world);
    for (let column = 0; column < width; column++) {
      const hit = raycast(session.world, view.camera, columnRay(view, column));
      const depth = perpendicularDepth(view, column, hit.distance);
      wallDepth[column] = depth;
      const scale = view.focal / depth;
      const top = height / 2 - (1 - CAMERA_HEIGHT) * scale;
      const coordinate = hit.normal.x ? hit.y : hit.x;
      const textureX = Math.floor((coordinate - Math.floor(coordinate)) * art.hedge.width);
      ctx.drawImage(art.hedge, textureX, 0, 1, art.hedge.height, column, top, 1, scale);
      ctx.fillStyle = `rgba(48,39,54,${Math.min(0.5, depth * 0.018 + (hit.normal.y ? 0.07 : 0))})`;
      ctx.fillRect(column, top, 1, scale);
    }
    const sprites = [
      ...session.world.decorations.map(item => ({ ...item, sprite: art[item.type], height: item.size * 2 })),
      ...session.unicorns.filter(item => item.alive).map(item => ({ ...item, sprite: art.unicorn, height: 0.95 })),
    ].filter(item => item.sprite).map(item => ({ ...item,
      screen: project({ ...item, z: item.height / 2, size: item.height * item.sprite.width / item.sprite.height / 2 }),
    })).filter(item => item.screen).sort((a, b) => b.screen.depth - a.screen.depth);
    for (const { sprite, height: worldHeight, screen } of sprites) {
      const spriteHeight = screen.scale * worldHeight;
      const spriteWidth = spriteHeight * sprite.width / sprite.height;
      ctx.save();
      ctx.beginPath();
      for (const span of screen.visibleSpans) ctx.rect(span.x, 0, span.width, height);
      ctx.clip();
      ctx.drawImage(sprite, screen.x - spriteWidth / 2, screen.y - spriteHeight / 2, spriteWidth, spriteHeight);
      ctx.restore();
    }
    // World feedback goes underneath the foreground crayon and centered aim.
    effects?.render(ctx, project);
    const unit = height / 360;
    const bobX = reducedMotion ? 0 : Math.sin(walkPhase) * walking * 2.5 * unit;
    const bobY = reducedMotion ? 0 : Math.cos(walkPhase * 2) * walking * 1.5 * unit;
    const kick = reducedMotion ? 0 : Math.sin(recoil / RECOIL_TIME * Math.PI / 2) * 9 * unit;
    const weaponHeight = height / 3;
    const weaponWidth = weaponHeight * art.weapon.width / art.weapon.height;
    ctx.drawImage(art.weapon, width / 2 - weaponWidth / 2 + bobX,
      height - weaponHeight + bobY + kick, weaponWidth, weaponHeight);
    ctx.strokeStyle = INK;
    ctx.lineWidth = Math.max(1, 1.5 * unit);
    const aim = Math.max(3, 4 * unit);
    ctx.beginPath();
    ctx.moveTo(width / 2 - aim, height / 2); ctx.lineTo(width / 2 + aim, height / 2);
    ctx.moveTo(width / 2, height / 2 - aim); ctx.lineTo(width / 2, height / 2 + aim);
    ctx.stroke();
  }

  return {
    ctx, render, project,
    get reducedMotion() { return reducedMotion; },
    setReducedMotion(value) {
      reducedMotion = Boolean(value);
      if (reducedMotion) { walking = 0; recoil = 0; }
    },
    update(seconds, distance = 0) {
      walkPhase = (walkPhase + distance * Math.PI * 3) % (Math.PI * 2);
      const target = !reducedMotion && distance > 0.0001 ? 1 : 0;
      walking += (target - walking) * Math.min(1, seconds * 12);
      recoil = Math.max(0, recoil - seconds);
    },
    consume(events) {
      if (!reducedMotion && events.some(event => event.type === 'shot')) recoil = RECOIL_TIME;
    },
    reset() { walkPhase = 0; walking = 0; recoil = 0; },
  };
}
