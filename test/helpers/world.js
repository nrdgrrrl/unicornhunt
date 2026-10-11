import { HEDGE } from '../../src/world.js';

export function arena(hedges = [], width = 16, height = 12) {
  const world = { width, height, tiles: new Uint8Array(width * height), decorations: [] };
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (x === 0 || y === 0 || x === width - 1 || y === height - 1) {
        world.tiles[y * width + x] = HEDGE;
      }
    }
  }
  for (const [x, y] of hedges) world.tiles[y * width + x] = HEDGE;
  return world;
}

export function fixture(width = 8, height = 8, hedges = []) {
  return arena(hedges, width, height);
}
