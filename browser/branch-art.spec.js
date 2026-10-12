import { test, expect, origin } from './fixtures.js';

test('branch atlas is local, cached, and replaces only the two enemy surfaces', async ({ page }) => {
  const requests = [];
  page.on('request', request => requests.push(request.url()));
  await page.goto(origin);
  // A fresh module instance exercises lazy generation after the app has booted.
  await page.evaluate(async () => { window.branchArtModule = await import('/src/branch-art.js?cache-test'); });
  const before = requests.length;
  const result = await page.evaluate(async () => {
    const baseModule = await import('/src/art.js');
    const base = baseModule.createArt();
    Math.random = () => { throw new Error('Branch artwork consumed ambient randomness.'); };
    const art = window.branchArtModule.createArt();
    const createElement = document.createElement;
    document.createElement = () => { throw new Error('Cached artwork allocated a new surface.'); };
    let reused;
    try { reused = window.branchArtModule.createArt() === art; }
    finally { document.createElement = createElement; }
    return {
      reused, frozen: Object.isFrozen(art),
      keys: Object.keys(art).sort(), baseKeys: Object.keys(base).sort(),
      replaced: Object.keys(base).filter(key => base[key] !== art[key]).sort(),
      anchorReused: window.branchArtModule.UNICORN_REAR_RUMP_ANCHOR === baseModule.UNICORN_REAR_RUMP_ANCHOR,
    };
  });
  expect(result.reused).toBe(true);
  expect(result.frozen).toBe(true);
  expect(result.keys).toEqual(result.baseKeys);
  expect(result.replaced).toEqual(['unicorn', 'unicornRear']);
  expect(result.anchorReused).toBe(true);
  expect(requests).toHaveLength(before);
  expect(requests.every(url => url.startsWith(origin))).toBe(true);
});

test('both portraits keep transparent margins at native and 32 × 40 sizes', async ({ page }) => {
  await page.goto(origin);
  const results = await page.evaluate(async () => {
    const { createArt } = await import('/src/branch-art.js');
    return ['unicorn', 'unicornRear'].flatMap(name => [[128, 160], [32, 40]].map(([width, height]) => {
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(createArt()[name], 0, 0, width, height);
      const pixels = ctx.getImageData(0, 0, width, height).data;
      let drawn = 0;
      let borderAlpha = 0;
      for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
        const alpha = pixels[(y * width + x) * 4 + 3];
        if (alpha) drawn++;
        if (x === 0 || y === 0 || x === width - 1 || y === height - 1) borderAlpha += alpha;
      }
      return { name, width, height, drawn, borderAlpha,
        nativeSize: [createArt()[name].width, createArt()[name].height] };
    }));
  });
  for (const asset of results) {
    expect(asset.nativeSize, asset.name).toEqual([128, 160]);
    expect(asset.borderAlpha, `${asset.name} at ${asset.width}px`).toBe(0);
    expect(asset.drawn).toBeGreaterThan(asset.width * asset.height * 0.4);
    expect(asset.drawn).toBeLessThan(asset.width * asset.height * 0.8);
  }
});

test('expressions differ in brows, eyes, and mouth even at small size with reduced motion', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(origin);
  const results = await page.evaluate(async () => {
    const { createArt } = await import('/src/branch-art.js');
    return [1, 0.25].map(scale => {
      const pixels = ['unicorn', 'unicornRear'].map(name => {
        const canvas = document.createElement('canvas');
        canvas.width = 128 * scale;
        canvas.height = 160 * scale;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(createArt()[name], 0, 0, canvas.width, canvas.height);
        return ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      });
      // These fixed face regions must change, rather than just hair/accessories.
      const changed = (left, top, right, bottom) => {
        let count = 0;
        for (let y = Math.floor(top * scale); y < bottom * scale; y++) {
          for (let x = Math.floor(left * scale); x < right * scale; x++) {
            const i = (y * 128 * scale + x) * 4;
            if ([0, 1, 2].some(channel => Math.abs(pixels[0][i + channel] - pixels[1][i + channel]) > 20)) count++;
          }
        }
        return count;
      };
      return { scale, brows: changed(36, 55, 92, 65), eyes: changed(34, 66, 94, 80),
        mouth: changed(49, 88, 79, 113) };
    });
  });
  for (const result of results) {
    for (const region of ['brows', 'eyes', 'mouth']) {
      expect(result[region], `${region} at scale ${result.scale}`).toBeGreaterThan(result.scale === 1 ? 30 : 3);
    }
  }
});

test('attack mouth covers the unchanged rose anchor with opaque pixels', async ({ page }) => {
  await page.goto(origin);
  const result = await page.evaluate(async () => {
    const { createArt, UNICORN_REAR_RUMP_ANCHOR: anchor, INK } = await import('/src/branch-art.js');
    const mouth = createArt().unicornRear.getContext('2d').getImageData(anchor.x - 3, anchor.y - 3, 7, 7).data;
    return { anchor, frozen: Object.isFrozen(anchor), pixels: Array.from(mouth),
      center: Array.from(createArt().unicornRear.getContext('2d').getImageData(anchor.x, anchor.y, 1, 1).data),
      ink: [1, 3, 5].map(index => parseInt(INK.slice(index, index + 2), 16)) };
  });
  expect(result.anchor).toEqual({ x: 64, y: 100 });
  expect(result.frozen).toBe(true);
  expect(result.center).toEqual([...result.ink, 255]);
  for (let i = 3; i < result.pixels.length; i += 4) {
    expect(result.pixels[i]).toBe(255);
  }
});

test('fresh loads reproduce both portraits pixel for pixel', async ({ page }) => {
  const capture = async () => {
    await page.goto(origin);
    return page.evaluate(async () => {
      const { createArt } = await import('/src/branch-art.js');
      return ['unicorn', 'unicornRear'].map(name => createArt()[name].toDataURL());
    });
  };
  expect(await capture()).toEqual(await capture());
});
