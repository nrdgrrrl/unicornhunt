import { test, expect, origin } from './fixtures.js';

for (const vector of [false, true]) {
  const modulePath = vector ? '/src/vector-art.js' : '/src/art.js';
  const factoryName = vector ? 'createVectorArt' : 'createArt';
  const scale = vector ? 4 : 1;

  test(`${vector ? 'vector' : 'legacy'} artwork is cached, local, and uses transparent sprite surfaces`, async ({ page }) => {
    const errors = [];
    const requests = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('request', request => requests.push(request.url()));
    await page.goto(origin);
    // A separate module instance ensures generation is still lazy after app boot.
    await page.evaluate(async modulePath => { window.artModule = await import(`${modulePath}?cache-test`); }, modulePath);
    const before = requests.length;
    const result = await page.evaluate(factoryName => {
      // Fail if generation uses ambient randomness or creates more surfaces on reuse.
      Math.random = () => { throw new Error('Artwork must use seeded randomness.'); };
      const art = window.artModule[factoryName]();
      const createElement = document.createElement;
      document.createElement = () => { throw new Error('Cached artwork allocated a new surface.'); };
      let reused;
      try { reused = window.artModule[factoryName]() === art; }
      finally { document.createElement = createElement; }
      return {
        reused, alias: art.stone === art.rock,
        assets: Object.entries(art).map(([name, canvas]) => {
          const { width, height } = canvas;
          const pixels = canvas.getContext('2d').getImageData(0, 0, width, height).data;
          let drawn = 0;
          let opaque = 0;
          let borderAlpha = 0;
          for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
              const alpha = pixels[(y * width + x) * 4 + 3];
              if (alpha) drawn++;
              if (alpha === 255) opaque++;
              if (x === 0 || y === 0 || x === width - 1 || y === height - 1) borderAlpha += alpha;
            }
          }
          return { name, width, height, drawn, opaque, borderAlpha };
        }),
      };
    }, factoryName);
    expect(result.reused).toBe(true);
    expect(result.alias).toBe(true);
    expect(result.assets.map(asset => asset.name).sort()).toEqual(
      ['armorCharm', 'flower', 'grass', 'healthCake', 'hedge', 'mushroom', 'paper',
        'rock', 'rose', 'stone', 'tree', 'unicorn', 'unicornRear', 'weapon']);
    for (const asset of result.assets) {
      expect(asset.drawn, asset.name).toBeGreaterThan(1000);
      if (['hedge', 'paper', 'grass'].includes(asset.name)) {
        const textureSize = asset.name === 'hedge' ? 64 * scale : 64;
        expect([asset.width, asset.height]).toEqual([textureSize, textureSize]);
        expect(asset.opaque).toBe(textureSize * textureSize);
      } else {
        expect([asset.width, asset.height]).toEqual([128 * scale, 160 * scale]);
        expect(asset.borderAlpha, `${asset.name} transparent margins`).toBe(0);
        expect(asset.drawn).toBeLessThan(asset.width * asset.height * 0.8);
      }
    }
    expect(requests).toHaveLength(before);
    expect(requests.every(url => url.startsWith(origin))).toBe(true);
    expect(errors).toEqual([]);
  });

  test(`${vector ? 'vector' : 'legacy'} survival sprites keep their identifying colors and a visible rear attack anchor`, async ({ page }) => {
    await page.goto(origin);
    const result = await page.evaluate(async ({ modulePath, factoryName, scale }) => {
      const { RAINBOW, UNICORN_REAR_RUMP_ANCHOR } = await import('/src/art.js');
      const art = (await import(modulePath))[factoryName]();
      const colors = RAINBOW.map(color => [1, 3, 5].map(index => parseInt(color.slice(index, index + 2), 16)));
      const inspect = (name, width = 128, height = 160) => {
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(art[name], 0, 0, width, height);
        const pixels = ctx.getImageData(0, 0, width, height).data;
        const count = predicate => {
          let total = 0;
          for (let i = 0; i < pixels.length; i += 4) {
            if (pixels[i + 3] > 100 && predicate(pixels[i], pixels[i + 1], pixels[i + 2])) total++;
          }
          return total;
        };
        return {
          rainbow: colors.map(color => count((r, g, b) =>
            [r, g, b].every((value, channel) => Math.abs(value - color[channel]) < 15))),
          pink: count((r, g, b) => r > 200 && r > g * 1.2 && b > g),
          green: count((r, g, b) => g > r * 1.1 && g > b),
          yellow: count((r, g, b) => r > 220 && g > 190 && b < 180),
        };
      };
      const anchor = UNICORN_REAR_RUMP_ANCHOR;
      // Inspect physical pixels around the logical socket in either atlas.
      const rump = art.unicornRear.getContext('2d').getImageData(anchor.x * scale - 2, anchor.y * scale - 2, 4, 4).data;
      return {
        cake: inspect('healthCake'), charm: inspect('armorCharm'), rose: inspect('rose'),
        smallCake: inspect('healthCake', 32, 40), smallCharm: inspect('armorCharm', 32, 40),
        smallRose: inspect('rose', 32, 40), rear: inspect('unicornRear'),
        anchor, frozenAnchor: Object.isFrozen(anchor), rump: Array.from(rump),
      };
    }, { modulePath, factoryName, scale });
    // Every cake layer and shield rainbow stripe survives drawing in the atlas.
    for (const asset of [result.cake, result.charm, result.rear]) {
      for (const count of asset.rainbow) expect(count).toBeGreaterThan(10);
    }
    expect(result.smallCake.rainbow.filter(count => count > 0)).toHaveLength(6);
    expect(result.smallCharm.yellow).toBeGreaterThan(20);
    expect(result.smallRose.pink).toBeGreaterThan(20);
    expect(result.smallRose.green).toBeGreaterThan(5);
    expect(result.anchor).toEqual({ x: 64, y: 100 });
    expect(result.frozenAnchor).toBe(true);
    // The exposed socket is on the cream rump, away from the mane and tail.
    for (let i = 0; i < result.rump.length; i += 4) {
      expect(result.rump.slice(i, i + 4)).toEqual([255, 248, 232, 255]);
    }
  });

  test(`${vector ? 'vector' : 'legacy'} fresh loads produce identical pixels for every asset`, async ({ page }) => {
    const capture = async () => {
      await page.goto(origin);
      return page.evaluate(async ({ modulePath, factoryName }) => {
        const art = (await import(modulePath))[factoryName]();
        return Object.fromEntries(Object.entries(art).map(([name, canvas]) => [name, canvas.toDataURL()]));
      }, { modulePath, factoryName });
    };
    expect(await capture()).toEqual(await capture());
  });

  test(`${vector ? 'vector' : 'legacy'} small unicorn keeps four separate legs and rainbow accents`, async ({ page }) => {
    await page.goto(origin);
    const result = await page.evaluate(async ({ modulePath, factoryName }) => {
      const { RAINBOW } = await import('/src/art.js');
      const sprite = (await import(modulePath))[factoryName]().unicorn;
      const small = document.createElement('canvas');
      small.width = 32;
      small.height = 40;
      const ctx = small.getContext('2d');
      ctx.drawImage(sprite, 0, 0, 32, 40);
      const row = ctx.getImageData(0, 35, 32, 1).data;
      let legs = 0;
      let previous = false;
      for (let x = 0; x < 32; x++) {
        const filled = row[x * 4 + 3] > 100;
        if (filled && !previous) legs++;
        previous = filled;
      }
      const pixels = ctx.getImageData(0, 0, 32, 40).data;
      const colors = RAINBOW.map(color => [1, 3, 5].map(index => parseInt(color.slice(index, index + 2), 16)));
      const countColors = (data, tolerance) => colors.filter(color => {
        for (let i = 0; i < data.length; i += 4) {
          if (data[i + 3] > 100 && color.every((value, channel) => Math.abs(value - data[i + channel]) < tolerance)) return true;
        }
        return false;
      }).length;
      const nativePixels = sprite.getContext('2d').getImageData(0, 0, sprite.width, sprite.height).data;
      // The horn must remain visible above the head after projection to 40px tall.
      const horn = ctx.getImageData(25, 2, 4, 7).data;
      return {
        legs, visibleColors: countColors(pixels, 45), nativeColors: countColors(nativePixels, 15),
        hornVisible: horn.some((value, i) => i % 4 === 3 && value > 100),
      };
    }, { modulePath, factoryName });
    expect(result.legs).toBe(4);
    // Thin adjacent strands blend on downsampling but still read as multicolored.
    expect(result.visibleColors).toBeGreaterThanOrEqual(3);
    expect(result.nativeColors).toBe(6);
    expect(result.hornVisible).toBe(true);
  });

}
