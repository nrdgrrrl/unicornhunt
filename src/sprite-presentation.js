import { UNICORN_REAR_RUMP_ANCHOR } from './art.js';
import { rearSocket } from './ranged-attacks.js';

/** Pure presentation of a simulation snapshot. The returned rectangles and
 * clipping spans own no entity state, timers, randomness, or animation updates.
 * `project` uses the renderer's current camera and wall-depth buffer. */
export function presentSprites(session, art, project) {
  const sprites = [];

  function add(item, artwork, point, height, layer, anchor) {
    const sprite = art[artwork];
    if (!sprite) return;
    const origin = anchor ?? { x: sprite.width / 2, y: sprite.height / 2 };
    const worldWidth = height * sprite.width / sprite.height;
    // Include transparent margins and the entire footprint around the anchor.
    const size = worldWidth * Math.max(origin.x / sprite.width, 1 - origin.x / sprite.width);
    const screen = project({ ...point, size });
    if (!screen) return;
    const drawHeight = height * screen.scale;
    const drawWidth = worldWidth * screen.scale;
    sprites.push({
      sprite, screen, layer,
      // IDs order coincident actors; visual data also orders legacy ID-less
      // fixtures and decorations. Identical keys imply identical drawing.
      key: JSON.stringify([item.id ?? '', artwork, point.x, point.y, point.z, height, origin.x, origin.y]),
      left: screen.x - origin.x / sprite.width * drawWidth,
      top: screen.y - origin.y / sprite.height * drawHeight,
      width: drawWidth, height: drawHeight,
    });
  }

  for (const item of session.world.decorations ?? []) {
    const height = item.size * 2;
    add(item, item.type, { x: item.x, y: item.y, z: height / 2 }, height, 0);
  }
  for (const item of session.pickups ?? []) {
    const artwork = { health: 'healthCake', armor: 'armorCharm' }[item.kind];
    add(item, artwork, { x: item.x, y: item.y, z: 0.21 }, 0.42, 1);
  }
  for (const item of session.unicorns) {
    if (!item.alive) continue;
    const rear = item.attack?.phase === 'windup' || item.attack?.phase === 'recovery';
    if (rear) {
      // The artwork's exposed rump projects at the same point and depth as a
      // newly emitted rose, rather than at the center of the unicorn's body.
      add(item, 'unicornRear', { ...rearSocket(item), z: 0.5 }, 0.95, 2, UNICORN_REAR_RUMP_ANCHOR);
    } else {
      add(item, 'unicorn', { x: item.x, y: item.y, z: 0.475 }, 0.95, 2);
    }
  }
  for (const item of session.roses ?? []) {
    if (item.remaining <= 0) continue;
    add(item, 'rose', { x: item.x, y: item.y, z: item.z }, 0.3, 3);
  }

  return sprites.sort((a, b) => b.screen.depth - a.screen.depth
    // Roses win equal-depth ties with their source's rump, even if its ID or
    // the input array order changes. Other coincident sprites have stable ties.
    || a.layer - b.layer || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
}
