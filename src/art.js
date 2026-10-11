import { createRng } from './math.js';

export const INK = '#302736';
export const PAPER = '#fff8e8';
export const RAINBOW = Object.freeze(['#f26586', '#ffae58', '#ffe16b', '#80cf91', '#79bfea', '#ae90df']);

const LEAF = '#a9c7a5';
const LEAF_INK = '#739778';
const TAU = Math.PI * 2;
let cachedArt;

// Sprite-local pixels measured from the top-left of unicornRear's 128 × 160
// canvas. For a drawImage at (left, top, width, height), the rear attack origin
// is (left + x * width / 128, top + y * height / 160). Mirror x with 128 - x
// when flipping the sprite. This is a presentation anchor, not a world socket.
export const UNICORN_REAR_RUMP_ANCHOR = Object.freeze({ x: 64, y: 100 });

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

// New billboard art shares the same surface setup and fixed ink helpers.
function sprite(draw) {
  const { canvas, ctx } = surface();
  draw(ctx);
  return canvas;
}

function healthCake() {
  return sprite(ctx => {
    // Two cut faces form a wedge; each has all six horizontal cake layers.
    const front = new Path2D('M22 63 L84 77 L84 134 L22 120 Z');
    const side = new Path2D('M84 77 L108 53 L108 110 L84 134 Z');
    for (const [face, points] of [
      [front, i => [[22, 63 + i * 9.5], [84, 77 + i * 9.5], [84, 86.5 + i * 9.5], [22, 72.5 + i * 9.5]]],
      [side, i => [[84, 77 + i * 9.5], [108, 53 + i * 9.5], [108, 62.5 + i * 9.5], [84, 86.5 + i * 9.5]]],
    ]) {
      RAINBOW.forEach((color, i) => {
        const path = new Path2D();
        points(i).forEach(([x, y], j) => j ? path.lineTo(x, y) : path.moveTo(x, y));
        path.closePath();
        ctx.fillStyle = color;
        ctx.fill(path);
        if (i) line(ctx, points(i).slice(0, 2), PAPER, 1.5);
      });
      outline(ctx, face);
    }
    // The triangular top and scalloped icing identify a slice at small sizes.
    shape(ctx, 'M22 63 L84 77 L108 34 L108 53 Q102 60 99 53 L91 66 Q88 77 84 81 Q79 85 75 79 L61 76 Q56 81 51 73 L38 70 Q33 75 29 68 L22 67 Z', PAPER);
    shape(ctx, 'M22 63 L108 34 L84 77 Z', '#ffe7ef');
    line(ctx, [[35, 62], [83, 72], [98, 45]], PAPER, 2);
    // A little piped cream and berry, drawn with paths rather than fonts.
    shape(ctx, 'M65 58 Q58 52 66 46 Q65 38 73 35 Q71 42 79 47 Q87 57 77 61 Z', PAPER);
    oval(ctx, 74, 48, 5, 5, RAINBOW[0]);
    line(ctx, [[74, 43], [78, 39]], LEAF_INK, 2);
  });
}

function armorCharm() {
  return sprite(ctx => {
    oval(ctx, 64, 26, 10, 12, '#ffe7b0');
    oval(ctx, 64, 26, 4, 6, PAPER);
    shape(ctx, 'M23 43 Q43 43 64 32 Q85 43 105 43 L101 91 Q96 122 64 144 Q32 122 27 91 Z', '#d8c6ee');
    shape(ctx, 'M33 51 Q49 49 64 42 Q79 49 95 51 L92 89 Q87 112 64 131 Q41 112 36 89 Z', '#e5f1ef');
    // Six nested pastel arcs read as a rainbow above the prominent star.
    RAINBOW.forEach((color, i) => {
      const path = new Path2D(`M${39 + i * 4} 64 Q64 ${16 + i * 7} ${89 - i * 4} 64`);
      outline(ctx, path, color, 4);
    });
    shape(ctx, 'M64 64 L73 82 L93 85 L78 99 L81 119 L64 109 L47 119 L50 99 L35 85 L55 82 Z', '#ffe7a0');
    line(ctx, [[64, 75], [66, 89], [82, 90]], PAPER, 2);
    oval(ctx, 30, 49, 2, 2, '#ffe7a0');
    oval(ctx, 98, 49, 2, 2, '#ffe7a0');
  });
}

function rose() {
  return sprite(ctx => {
    line(ctx, [[61, 146], [68, 111], [63, 70]], INK, 7);
    line(ctx, [[61, 146], [68, 111], [63, 70]], LEAF_INK, 4);
    shape(ctx, 'M66 115 Q35 118 27 91 Q51 87 66 115 Z', LEAF);
    shape(ctx, 'M65 131 Q93 134 104 103 Q78 101 65 131 Z', LEAF);
    line(ctx, [[66, 115], [35, 97]], LEAF_INK, 1.5);
    line(ctx, [[65, 131], [96, 110]], LEAF_INK, 1.5);
    shape(ctx, 'M63 82 L43 74 L49 62 L78 62 L86 75 Z', LEAF);
    // Overlapping cups and curled petals, rather than radial daisy petals.
    shape(ctx, 'M64 83 Q34 82 25 58 Q20 42 35 34 Q37 22 52 24 Q63 17 77 25 Q94 22 96 37 Q113 45 101 65 Q88 84 64 83 Z', '#ef9bb2');
    shape(ctx, 'M64 76 Q37 71 33 44 Q49 40 66 56 Q80 39 96 43 Q94 69 64 76 Z', '#f7b9ce');
    shape(ctx, 'M42 36 Q54 24 70 30 Q88 30 87 47 Q76 61 63 61 Q46 53 42 36 Z', '#f48faa');
    shape(ctx, 'M39 56 Q50 44 65 53 Q81 41 94 54 Q87 77 64 80 Q44 77 39 56 Z', '#ffd0e0');
    shape(ctx, 'M52 40 Q65 30 78 40 Q84 51 69 57 Q56 56 52 40 Z', '#f7b9ce');
    shape(ctx, 'M58 44 Q65 38 73 43 L69 50 Q63 53 58 44 Z', '#e7799b');
    line(ctx, [[43, 59], [56, 64], [65, 59], [75, 64], [87, 57]], '#b6577d', 1.5);
  });
}

function unicornRear() {
  return sprite(ctx => {
    // The distant head is seen from behind: ears, horn, mane, and no muzzle.
    shape(ctx, 'M46 49 L41 26 Q53 29 57 45 Z', PAPER);
    shape(ctx, 'M71 45 Q76 29 87 26 L82 51 Z', PAPER);
    line(ctx, [[46, 33], [50, 43]], '#ef9bb2', 3);
    line(ctx, [[82, 33], [78, 43]], '#ef9bb2', 3);
    shape(ctx, 'M58 39 L64 9 L70 39 Z', RAINBOW[2]);
    line(ctx, [[62, 22], [67, 25]], INK, 1.5);
    line(ctx, [[60, 31], [69, 34]], INK, 1.5);
    oval(ctx, 64, 53, 23, 23, PAPER);
    shape(ctx, 'M47 58 Q41 80 36 102 L92 102 Q87 80 81 58 Z', PAPER);
    rainbowHair(ctx, RAINBOW.map((_, i) =>
      `M${57 + i * 3} 36 Q${48 + i * 3} 51 ${56 + i * 3} 64 Q${61 + i * 3} 70 ${56 + i * 3} 79`));
    for (const [x, y, fill] of [[45, 94, '#e4dbcd'], [73, 94, '#e4dbcd'], [30, 101, PAPER], [86, 101, PAPER]]) {
      shape(ctx, `M${x} ${y} L${x + 11} ${y} L${x + 10} 147 L${x - 1} 147 Z`, fill);
      shape(ctx, `M${x - 1} 139 L${x + 10} 139 L${x + 10} 147 L${x - 1} 147 Z`, '#ae90df');
    }
    // Broad paired haunches and an off-center lifted tail expose the rump.
    shape(ctx, 'M64 81 Q39 71 28 88 Q20 111 37 123 Q51 131 64 118 Q77 131 91 123 Q108 111 100 88 Q89 71 64 81 Z', PAPER);
    line(ctx, [[36, 98], [34, 108], [39, 115]], '#c9bca9', 1.5);
    line(ctx, [[92, 98], [94, 108], [89, 115]], '#c9bca9', 1.5);
    line(ctx, [[64, 106], [64, 118]], '#c9bca9', 1.5);
    rainbowHair(ctx, RAINBOW.map((_, i) =>
      `M${61 + i * 1.5} 88 Q${88 + i * 2} 68 ${94 + i * 2} 86 Q${96 + i * 2} 104 ${87 + i * 2} 115`));
  });
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

function paper(grassy = false) {
  const { canvas, ctx } = surface(64, 64);
  ctx.fillStyle = grassy ? '#e6e6c8' : PAPER;
  ctx.fillRect(0, 0, 64, 64);
  const random = createRng(grassy ? 124 : 123);
  // Grain and crayon marks are generated once, never in the frame loop.
  for (let i = 0; i < 450; i++) {
    ctx.fillStyle = i % 2 ? '#b9aa8a' : '#ffffff';
    ctx.globalAlpha = 0.09;
    ctx.fillRect(Math.floor(random() * 64), Math.floor(random() * 64), 1, 1);
  }
  ctx.globalAlpha = 1;
  if (grassy) {
    for (let i = 0; i < 16; i++) {
      const x = random() * 64;
      const y = random() * 64;
      for (const dx of [-64, 0, 64]) for (const dy of [-64, 0, 64]) {
        line(ctx, [[x + dx - 2, y + dy - 3], [x + dx, y + dy], [x + dx + 3, y + dy - 4]], '#b5c49c', 0.7);
      }
    }
  }
  return canvas;
}

/**
 * Lazily draw once in the browser and reuse the same offscreen canvases.
 * Treat returned canvases as read-only: render with drawImage and transforms.
 * Sprites are 128 × 160 with transparent margins; hedge is an opaque 64 × 64
 * wall texture. Paper and grass are opaque, repeating 64 × 64 textures.
 * `rock` aliases `stone` for the planned renderer's asset key.
 * `unicornRear` exposes the rump at UNICORN_REAR_RUMP_ANCHOR; use that
 * sprite-local anchor when placing a rear attack telegraph or firing effect.
 */
export function createArt() {
  if (!cachedArt) {
    const rock = stone();
    cachedArt = Object.freeze({
      unicorn: unicorn(), tree: tree(), mushroom: mushroom(), stone: rock,
      rock, flower: flower(), hedge: hedge(), weapon: weapon(),
      paper: paper(), grass: paper(true),
      healthCake: healthCake(), armorCharm: armorCharm(), rose: rose(),
      unicornRear: unicornRear(),
    });
  }
  return cachedArt;
}
