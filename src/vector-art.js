import { createArt, INK, PAPER, RAINBOW } from './art.js';

export const VECTOR_ART_SCALE = 4;
export const SPRITE_DESIGN_WIDTH = 128;
export const SPRITE_DESIGN_HEIGHT = 160;

let cachedArt;

function path(ctx, geometry, color, strokeWidth = 2.5) {
  // SVG geometry stays editable independently of raster resolution. Parsing at
  // atlas creation avoids repeating path construction in the frame loop.
  const outline = new Path2D(geometry);
  ctx.fillStyle = color;
  ctx.fill(outline);
  if (strokeWidth > 0) {
    ctx.strokeStyle = INK;
    ctx.lineWidth = strokeWidth;
    ctx.stroke(outline);
  }
}

function oval(ctx, x, y, rx, ry, color, strokeWidth = 2.5) {
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
  if (strokeWidth > 0) {
    ctx.strokeStyle = INK;
    ctx.lineWidth = strokeWidth;
    ctx.stroke();
  }
}

function line(ctx, geometry, color = INK, width = 2.5) {
  // Rounded strokes retain the illustrated theme without random edge jitter,
  // so reloads and repeated atlas generation have identical geometry.
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.stroke(new Path2D(geometry));
}

function rainbow(ctx, geometryForStripe, width = 4) {
  RAINBOW.forEach((color, index) => {
    line(ctx, geometryForStripe(index), color, width);
  });
}

const painters = {
  unicorn(ctx) {
    // Separate legs and broad color strands survive distant downsampling.
    // Fine ornamental detail alone would disappear at gameplay distances.
    for (const x of [27, 47, 69, 89]) {
      path(ctx, `M ${x} 104 L ${x + 10} 104 L ${x + 9} 147 L ${x - 1} 147 Z`, PAPER);
      path(ctx, `M ${x - 1} 140 H ${x + 9} V 147 H ${x - 1} Z`, '#cab7ea', 1.5);
    }
    rainbow(ctx, i => `M 30 ${85 + i * 4} Q 13 ${90 + i * 4} 15 ${116 + i * 4}`, 4);
    oval(ctx, 63, 96, 39, 24, PAPER);
    oval(ctx, 62, 91, 28, 12, '#ffffff', 0);
    path(ctx, 'M 76 95 Q 81 75 83 55 Q 91 43 104 51 L 109 78 Q 102 94 94 110 Z', PAPER);
    path(ctx, 'M 90 53 L 90 34 L 103 49 Z', PAPER);
    path(ctx, 'M 99 46 L 105 10 L 114 46 Z', '#ffe39a');
    line(ctx, 'M 103 25 L 110 29 M 102 34 L 112 38', '#bd9654', 1.5);
    oval(ctx, 101, 59, 18, 14, PAPER);
    rainbow(ctx, i => `M ${82 + i * 3} 48 Q ${69 + i * 3} 67 ${77 + i * 3} 88`, 3.5);
    oval(ctx, 107, 56, 2.2, 2.8, INK, 0);
    oval(ctx, 113, 64, 4, 2, '#f5bbd4', 0);
    line(ctx, 'M 109 69 Q 114 72 118 68', INK, 1.5);
  },
  unicornRear(ctx) {
    for (const x of [29, 44, 75, 90]) {
      path(ctx, `M ${x} 111 H ${x + 9} L ${x + 8} 148 H ${x - 1} Z`, PAPER);
      path(ctx, `M ${x - 1} 141 H ${x + 8} V 148 H ${x - 1} Z`, '#cab7ea', 1.5);
    }
    path(ctx, 'M 49 69 L 45 43 L 56 54 L 64 20 L 72 54 L 83 43 L 79 69 Z', PAPER);
    rainbow(ctx, i => `M ${49 + i * 6} 57 Q ${45 + i * 6} 69 ${49 + i * 6} 82`, 5);
    oval(ctx, 64, 100, 32, 29, PAPER);
    // Keep this cream region unobstructed: the logical (64,100) socket is
    // gameplay information and must remain visible before rose emission.
    rainbow(ctx, i => `M ${89 + i * 2} 83 Q ${113 - i} 101 ${101 - i * 2} 126`, 3);
  },
  healthCake(ctx) {
    path(ctx, 'M 23 67 L 70 44 L 109 67 L 109 122 L 23 122 Z', '#fff1d0');
    RAINBOW.forEach((color, i) => {
      // Thick cake layers communicate the pickup type at small screen sizes.
      path(ctx, `M 25 ${78 + i * 7} H 107 V ${85 + i * 7} H 25 Z`, color, 0);
    });
    path(ctx, 'M 23 67 L 70 44 L 109 67 L 72 83 Z', '#ffffff');
    line(ctx, 'M 23 122 H 109 M 23 67 V 122 M 109 67 V 122');
    oval(ctx, 71, 58, 7, 7, '#ef87b5');
    line(ctx, 'M 72 52 Q 72 43 79 42', '#57946b', 2);
  },
  armorCharm(ctx) {
    path(ctx, 'M 27 47 Q 64 31 101 47 L 96 98 Q 83 126 64 138 Q 45 126 32 98 Z', '#ffe39a');
    RAINBOW.forEach((color, i) => {
      path(ctx, `M 37 ${59 + i * 7} H 91 L 90 ${66 + i * 7} H 38 Z`, color, 0);
    });
    // A large star gives armor a different silhouette from layered cake.
    path(ctx, 'M 64 58 L 72 77 L 93 79 L 77 92 L 82 113 L 64 102 L 46 113 L 51 92 L 35 79 L 56 77 Z', '#fff1a8');
    oval(ctx, 64, 36, 7, 7, '#ffffff', 2);
  },
  rose(ctx) {
    line(ctx, 'M 64 80 Q 69 109 59 137', '#477f57', 5);
    path(ctx, 'M 65 108 Q 87 91 91 109 Q 77 118 65 108 Z', '#88bd8d', 2);
    path(ctx, 'M 62 120 Q 41 104 39 121 Q 50 130 62 120 Z', '#88bd8d', 2);
    for (const [x, y, rx, ry] of [[49, 66, 16, 18], [78, 66, 16, 18], [64, 50, 17, 16], [64, 77, 20, 15]]) {
      oval(ctx, x, y, rx, ry, '#f39abf', 2);
    }
    oval(ctx, 64, 65, 16, 15, '#e96d9f', 2);
    line(ctx, 'M 54 65 Q 60 53 72 62 Q 78 72 65 75 Q 57 75 60 65', '#9b476d', 2);
  },
  flower(ctx) {
    line(ctx, 'M 64 82 Q 60 111 65 140', '#477f57', 5);
    path(ctx, 'M 63 114 Q 35 98 38 116 Q 50 124 63 114 Z', '#88bd8d', 2);
    RAINBOW.forEach((color, i) => {
      const angle = i * Math.PI / 3;
      oval(ctx, 64 + Math.cos(angle) * 21, 65 + Math.sin(angle) * 21, 15, 15, color, 2);
    });
    oval(ctx, 64, 65, 12, 12, '#ffe39a', 2);
  },
  mushroom(ctx) {
    path(ctx, 'M 52 87 H 76 L 82 140 Q 64 148 46 140 Z', PAPER);
    path(ctx, 'M 19 89 Q 27 40 64 39 Q 103 41 110 89 Q 64 106 19 89 Z', '#e98ca5');
    for (const [x, y, r] of [[42, 69, 7], [66, 54, 6], [85, 77, 8]]) oval(ctx, x, y, r, r, PAPER, 0);
    line(ctx, 'M 26 89 Q 64 100 104 89', '#9f536e', 2);
  },
  rock(ctx) {
    path(ctx, 'M 16 132 L 26 97 L 52 81 L 81 85 L 108 110 L 114 138 L 33 144 Z', '#beb6ce');
    path(ctx, 'M 26 97 L 52 81 L 81 85 L 69 110 L 38 116 Z', '#ded7e8', 0);
    line(ctx, 'M 81 85 L 69 110 L 86 135 M 38 116 L 33 144', '#8f829f', 2);
  },
  tree(ctx) {
    path(ctx, 'M 55 79 H 74 L 80 150 H 49 Z', '#b58b73');
    line(ctx, 'M 62 100 L 60 142 M 69 110 L 71 146', '#805d56', 2);
    // Overlapping broad foliage masses read well in the distant forest ring;
    // hundreds of tiny leaves would add cost without improving recognition.
    for (const [x, y, rx, ry, color] of [[41, 66, 26, 28, '#83ad87'], [83, 66, 27, 28, '#79a581'], [62, 38, 31, 29, '#a5c899'], [64, 77, 37, 26, '#93bc8d']]) {
      oval(ctx, x, y, rx, ry, color, 2.5);
    }
    line(ctx, 'M 34 59 Q 42 47 51 50 M 57 27 Q 67 21 76 31', '#c5dfb4', 3);
  },
  weapon(ctx) {
    path(ctx, 'M 39 145 L 47 53 L 64 20 L 81 53 L 90 145 Z', '#ffe39a');
    path(ctx, 'M 47 53 L 64 20 L 81 53 Z', '#dfb98b');
    path(ctx, 'M 59 31 L 64 20 L 69 31 Z', '#ef87b5', 1.5);
    RAINBOW.forEach((color, i) => {
      path(ctx, `M ${47 + i * 5.5} 61 L ${52.5 + i * 5.5} 61 L ${57 + i * 5.5} 136 L ${51.5 + i * 5.5} 136 Z`, color, 0);
    });
    path(ctx, 'M 41 118 L 86 118 L 89 139 L 39 139 Z', PAPER);
    line(ctx, 'M 48 127 H 79', '#a791b3', 2);
  },
  hedge(ctx) {
    ctx.fillStyle = '#80a17a';
    ctx.fillRect(0, 0, 64, 64);
    // A fixed pattern retains texture continuity and replay stability without
    // consuming the world's or simulation's random stream.
    for (let row = -1; row < 5; row++) {
      for (let column = -1; column < 5; column++) {
        const x = column * 18 + (row % 2 ? 9 : 0);
        const y = row * 17;
        oval(ctx, x + 9, y + 9, 11, 9, (row + column) % 2 ? '#97b78b' : '#72966e', 1);
        line(ctx, `M ${x + 3} ${y + 10} Q ${x + 9} ${y + 4} ${x + 15} ${y + 8}`, '#b6cda7', 1.5);
      }
    }
  },
};

/** Synchronous, local SVG geometry rasterized once at four times design size.
 * The finite 512 × 640 sprite atlas improves normal and close gameplay edges;
 * extremely enlarged near-plane billboards can still soften beyond this size.
 */
export function createVectorArt() {
  if (cachedArt) return cachedArt;
  const art = { ...createArt() };
  for (const [name, paint] of Object.entries(painters)) {
    const canvas = document.createElement('canvas');
    const width = name === 'hedge' ? 64 : SPRITE_DESIGN_WIDTH;
    const height = name === 'hedge' ? 64 : SPRITE_DESIGN_HEIGHT;
    canvas.width = width * VECTOR_ART_SCALE;
    canvas.height = height * VECTOR_ART_SCALE;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D artwork is unavailable');
    // Scale geometry before painting. Enlarging an already rasterized sprite
    // would preserve the original blur instead of adding useful detail.
    ctx.scale(VECTOR_ART_SCALE, VECTOR_ART_SCALE);
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    paint(ctx);
    art[name] = canvas;
  }
  art.stone = art.rock;
  cachedArt = Object.freeze(art);
  return cachedArt;
}
