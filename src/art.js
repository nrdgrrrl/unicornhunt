import { createRng } from './math.js';

export const INK = '#302736';
export const PAPER = '#fff8e8';
export const RAINBOW = Object.freeze(['#f26586', '#ffae58', '#ffe16b', '#80cf91', '#79bfea', '#ae90df']);

const LEAF = '#a9c7a5';
const LEAF_INK = '#739778';
const TAU = Math.PI * 2;
let cachedArt;

function surface(width = 128, height = 160) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D is required to draw the artwork.');
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  return { canvas, ctx };
}

// Fixed offsets suggest repeated pen strokes without jittering during play.
function outline(ctx, path, color = INK, width = 3) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.stroke(path);
  ctx.translate(1.2, -0.8);
  ctx.globalAlpha *= 0.35;
  ctx.lineWidth = 1;
  ctx.stroke(path);
  ctx.restore();
}

function shape(ctx, path, fill) {
  const contour = typeof path === 'string' ? new Path2D(path) : path;
  ctx.fillStyle = fill;
  ctx.fill(contour);
  outline(ctx, contour);
  return contour;
}

function line(ctx, points, color = INK, width = 2) {
  const path = new Path2D();
  points.forEach(([x, y], i) => i ? path.lineTo(x, y) : path.moveTo(x, y));
  outline(ctx, path, color, width);
}

function oval(ctx, x, y, rx, ry, fill, rotation = 0) {
  const path = new Path2D();
  path.ellipse(x, y, rx, ry, rotation, 0, TAU);
  return shape(ctx, path, fill);
}

function rainbowHair(ctx, paths) {
  const contours = paths.map(path => new Path2D(path));
  // Ink goes underneath the whole bundle, preserving each colored strand.
  contours.forEach(path => outline(ctx, path, INK, 5));
  contours.forEach((path, i) => outline(ctx, path, RAINBOW[i], 3));
}

function unicorn() {
  const { canvas, ctx } = surface();
  // Tail and four separated legs precede the body, keeping a readable silhouette.
  rainbowHair(ctx, RAINBOW.map((_, i) =>
    `M30 ${86 + i * 3} Q10 ${83 + i * 3} 14 ${104 + i * 3} Q18 ${117 + i * 3} 7 ${123 + i * 3}`));
  for (const [x, offset, fill] of [[48, 3, '#e4dbcd'], [89, 3, '#e4dbcd'], [35, 0, PAPER], [75, 0, PAPER]]) {
    shape(ctx, `M${x} 99 L${x + 8} 99 L${x + 6 + offset} 146 L${x - 3 + offset} 147 Z`, fill);
    shape(ctx, `M${x - 2 + offset} 139 L${x + 6 + offset} 139 L${x + 6 + offset} 146 L${x - 3 + offset} 147 Z`, '#ae90df');
  }
  shape(ctx, 'M25 87 Q33 68 70 76 L79 52 Q81 35 96 40 Q104 37 109 48 L120 61 Q122 74 107 76 L97 70 L94 99 Q84 116 49 111 Q25 109 25 87 Z', PAPER);
  shape(ctx, 'M87 43 L83 24 Q94 29 97 38 Z', PAPER);
  line(ctx, [[87, 31], [91, 37]], '#ef9bb2', 3);
  shape(ctx, 'M102 44 L111 8 L115 48 Z', RAINBOW[2]);
  line(ctx, [[108, 24], [112, 27]], INK, 1.5);
  line(ctx, [[106, 33], [113, 36]], INK, 1.5);
  line(ctx, [[104, 41], [114, 44]], INK, 1.5);
  rainbowHair(ctx, RAINBOW.map((_, i) =>
    `M${82 + i * 2} 43 Q${70 + i * 2} 51 ${73 + i * 2} 65 Q${74 + i * 2} 77 ${66 + i * 2} 84`));
  oval(ctx, 103, 54, 3.4, 4, INK);
  ctx.fillStyle = PAPER;
  ctx.beginPath();
  ctx.arc(104, 52.5, 1.3, 0, TAU);
  ctx.fill();
  line(ctx, [[100, 50], [98, 47]], INK, 1.5);
  line(ctx, [[104, 49], [105, 46]], INK, 1.5);
  oval(ctx, 99, 65, 4, 2.5, '#ffd0e6');
  line(ctx, [[109, 68], [114, 69], [117, 66]], INK, 1.5);
  line(ctx, [[115, 61], [116, 61]], INK, 2);
  line(ctx, [[35, 91], [40, 94], [46, 90]], '#c9bca9', 1);
  line(ctx, [[42, 102], [47, 104]], '#c9bca9', 1);
  line(ctx, [[53, 103], [58, 105]], '#c9bca9', 1);
  return canvas;
}

function tree() {
  const { canvas, ctx } = surface();
  shape(ctx, 'M54 150 L59 66 L72 60 L77 151 Q67 146 54 150 Z', '#bc9274');
  shape(ctx, 'M13 91 L34 61 L22 62 L48 32 L44 32 L64 6 L84 34 L79 34 L107 67 L94 65 L117 96 Q63 109 13 91 Z', LEAF);
  line(ctx, [[61, 145], [64, 106], [68, 116], [70, 140]], '#765f58');
  for (let y = 40; y < 94; y += 15) {
    line(ctx, [[43, y], [57, y + 7], [82, y + 2]], LEAF_INK, 1.5);
    line(ctx, [[51, y + 3], [49, y - 1]], LEAF_INK, 1);
    line(ctx, [[72, y + 3], [74, y - 1]], LEAF_INK, 1);
  }
  return canvas;
}

function mushroom() {
  const { canvas, ctx } = surface();
  shape(ctx, 'M51 77 L75 77 L82 145 Q64 155 45 145 Z', PAPER);
  line(ctx, [[56, 107], [54, 141]], '#c9bca9', 1);
  line(ctx, [[72, 112], [75, 143]], '#c9bca9', 1);
  shape(ctx, 'M13 86 Q24 20 64 22 Q104 24 115 86 Q63 105 13 86 Z', '#ee99ac');
  for (const [x, y] of [[40, 59], [67, 43], [88, 70]]) oval(ctx, x, y, 7, 5, PAPER, -0.2);
  line(ctx, [[24, 87], [63, 92], [104, 87]], INK, 1);
  return canvas;
}

function stone() {
  const { canvas, ctx } = surface();
  shape(ctx, 'M13 138 L25 94 L63 69 L101 91 L116 142 Q65 154 13 138 Z', '#c5c1ca');
  line(ctx, [[25, 94], [58, 110], [63, 69]], '#918899');
  line(ctx, [[58, 110], [101, 91]], '#918899');
  line(ctx, [[31, 119], [27, 129]], '#918899', 1);
  line(ctx, [[37, 121], [33, 132]], '#918899', 1);
  line(ctx, [[44, 123], [39, 135]], '#918899', 1);
  line(ctx, [[80, 133], [101, 135]], PAPER, 1.5);
  return canvas;
}

function flower() {
  const { canvas, ctx } = surface();
  line(ctx, [[64, 148], [62, 67]], INK, 7);
  line(ctx, [[64, 148], [62, 67]], LEAF_INK, 4);
  shape(ctx, 'M62 121 Q20 114 32 92 Q59 91 62 121 Z', LEAF);
  shape(ctx, 'M64 136 Q101 121 100 104 Q72 99 64 136 Z', LEAF);
  line(ctx, [[62, 121], [38, 99]], LEAF_INK, 1);
  line(ctx, [[64, 136], [92, 112]], LEAF_INK, 1);
  RAINBOW.forEach((color, i) => {
    const angle = i * Math.PI / 3;
    ctx.save();
    ctx.translate(64 + Math.cos(angle) * 20, 58 + Math.sin(angle) * 20);
    ctx.rotate(angle);
    shape(ctx, 'M-17 0 Q-9 -17 10 -12 Q25 0 10 12 Q-9 17 -17 0 Z', color);
    ctx.restore();
  });
  oval(ctx, 64, 58, 12, 12, RAINBOW[2]);
  line(ctx, [[59, 56], [60, 56]], INK, 2);
  line(ctx, [[68, 56], [69, 56]], INK, 2);
  line(ctx, [[60, 63], [64, 65], [68, 62]], INK, 1);
  return canvas;
}

function hedge() {
  const { canvas, ctx } = surface(64, 64);
  // Wall textures are deliberately opaque; all billboard sprites stay clear.
  ctx.fillStyle = '#a9c39a';
  ctx.fillRect(0, 0, 64, 64);
  const random = createRng(91);
  for (let i = 0; i < 60; i++) {
    const x = random() * 64;
    const y = random() * 64;
    const color = i % 3 ? LEAF_INK : '#d7dfb8';
    // Wrap marks over both edges so repeated texture tiles join cleanly.
    for (const dx of [-64, 0, 64]) {
      for (const dy of [-64, 0, 64]) {
        line(ctx, [[x + dx, y + dy + 6], [x + dx + 3, y + dy], [x + dx + 8, y + dy + 4]], color, 1);
      }
    }
  }
  return canvas;
}

function weapon() {
  const { canvas, ctx } = surface();
  shape(ctx, 'M40 154 L37 96 L89 94 L96 154 Q67 151 40 154 Z', '#d3b4e3');
  const wrapper = shape(ctx, 'M35 108 L39 51 L62 22 L89 50 L94 109 Q65 115 35 108 Z', PAPER);
  ctx.save();
  ctx.clip(wrapper);
  RAINBOW.forEach((color, i) => line(ctx, [[43 + i * 8, 53], [43 + i * 8, 104]], color, 8));
  ctx.restore();
  outline(ctx, wrapper);
  shape(ctx, 'M39 51 L62 22 L89 50 Q65 56 39 51 Z', '#f8cd8e');
  shape(ctx, 'M54 34 L62 22 L71 34 Q63 38 54 34 Z', RAINBOW[0]);
  line(ctx, [[35, 108], [64, 112], [94, 109]], INK, 3);
  line(ctx, [[46, 61], [45, 93]], PAPER, 1);
  line(ctx, [[87, 64], [89, 95]], INK, 1);
  // Draw the label with strokes so the artwork does not depend on installed fonts.
  shape(ctx, 'M49 133 L52 123 L76 122 L81 133 Z', PAPER);
  RAINBOW.forEach((color, i) => line(ctx, [[54 + i * 4, 126], [55 + i * 4, 130]], color, 2));
  line(ctx, [[47, 141], [50, 148]], INK, 1);
  line(ctx, [[53, 140], [56, 147]], INK, 1);
  return canvas;
}

/**
 * Lazily draw once in the browser and reuse the same offscreen canvases.
 * Treat returned canvases as read-only: render with drawImage and transforms.
 * Sprites are 128 × 160 with transparent margins; hedge is an opaque 64 × 64
 * wall texture. `rock` aliases `stone` for the planned renderer's asset key.
 */
export function createArt() {
  if (!cachedArt) {
    const rock = stone();
    cachedArt = Object.freeze({
      unicorn: unicorn(), tree: tree(), mushroom: mushroom(), stone: rock,
      rock, flower: flower(), hedge: hedge(), weapon: weapon(),
    });
  }
  return cachedArt;
}
