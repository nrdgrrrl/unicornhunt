import { createArt as createBaseArt, INK, PAPER, UNICORN_REAR_RUMP_ANCHOR } from './art.js';

export { INK, UNICORN_REAR_RUMP_ANCHOR };

const SKIN = '#e9ad8d';
const SHADOW = '#cc876e';
const HAIR = '#454052';
const HAIR_LIGHT = '#79718b';
const LIP = '#ab4568';
let cachedArt;

// Original, fixed pen paths keep the portraits local and identical on reload.
function shape(ctx, path, fill, width = 2.5) {
  const contour = new Path2D(path);
  ctx.fillStyle = fill;
  ctx.fill(contour);
  ctx.strokeStyle = INK;
  ctx.lineWidth = width;
  ctx.stroke(contour);
}

function line(ctx, path, color = INK, width = 2) {
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.stroke(new Path2D(path));
}

function oval(ctx, x, y, rx, ry, fill, stroke = INK, width = 2) {
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.strokeStyle = stroke;
  ctx.lineWidth = width;
  ctx.stroke();
}

function face(attacking = false) {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 160;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D is required to draw the branch artwork.');
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  // A swept bob, long jaw, cheekbones, and modest eyes give an adult portrait.
  shape(ctx, 'M22 145 Q10 119 17 88 Q9 52 23 27 Q37 8 61 10 Q97 5 111 37 Q121 57 112 92 Q120 120 108 146 Q84 153 64 140 Q42 153 22 145 Z', HAIR);
  shape(ctx, 'M49 114 L79 114 L83 140 Q65 154 45 140 Z', SKIN);
  shape(ctx, 'M24 149 Q31 139 46 136 Q63 145 81 136 Q100 140 106 149 Z', '#ae90df');
  shape(ctx, 'M48 117 Q63 129 79 115 L79 130 Q62 140 48 126 Z', SHADOW, 1);
  oval(ctx, 29, 82, 7, 13, SKIN);
  oval(ctx, 99, 82, 7, 13, SKIN);
  shape(ctx, 'M31 48 Q36 28 64 29 Q90 29 97 49 L94 91 Q89 115 64 128 Q39 116 34 92 Z', SKIN);
  // Warm shading and long nose stay legible without oversized cartoon eyes.
  line(ctx, 'M36 85 Q40 91 47 92 M81 92 Q89 90 92 84', SHADOW, 3);
  line(ctx, 'M62 73 L58 90 Q63 94 69 90', '#995f59', 2);
  line(ctx, 'M64 76 L65 86', '#ffd5af', 2);
  line(ctx, 'M51 113 Q64 118 77 111', SHADOW, 1.5);

  if (attacking) {
    // Inward brows, narrowed eyes, and an open mouth are a static telegraph.
    // The mouth covers (64,100): the compatibility anchor for emitted roses.
    line(ctx, 'M39 59 Q46 57 55 64 M73 64 Q82 57 89 59', INK, 3.5);
    shape(ctx, 'M38 72 Q46 67 55 74 Q47 79 38 72 Z', PAPER, 2);
    shape(ctx, 'M73 74 Q82 67 90 72 Q82 79 73 74 Z', PAPER, 2);
    oval(ctx, 48, 73, 2.7, 3, INK, INK, 1);
    oval(ctx, 80, 73, 2.7, 3, INK, INK, 1);
    oval(ctx, 64, 100, 12, 11, LIP, LIP, 1);
    oval(ctx, 64, 100, 8.5, 7.5, INK, INK, 1);
    line(ctx, 'M60 105 Q64 103 68 105', '#ee99ac', 2);
  } else {
    line(ctx, 'M38 61 Q46 56 55 61 M73 61 Q82 56 90 61', INK, 3);
    shape(ctx, 'M37 72 Q46 63 56 72 Q46 79 37 72 Z', PAPER, 2);
    shape(ctx, 'M72 72 Q82 63 91 72 Q82 79 72 72 Z', PAPER, 2);
    oval(ctx, 47, 71, 3, 4, INK, INK, 1);
    oval(ctx, 81, 71, 3, 4, INK, INK, 1);
    oval(ctx, 48, 70, 0.8, 1, PAPER, PAPER, 0.5);
    oval(ctx, 82, 70, 0.8, 1, PAPER, PAPER, 0.5);
    shape(ctx, 'M51 100 Q58 95 64 98 Q70 95 77 100 Q64 113 51 100 Z', LIP, 1.5);
    line(ctx, 'M53 101 Q64 104 75 101', INK, 1.5);
    line(ctx, 'M60 107 L68 107', '#ef9bb2', 1);
  }
  line(ctx, 'M37 71 L34 68 M91 71 L94 68', INK, 2);

  // Hair frames the face without covering the eyes or attack socket.
  shape(ctx, 'M22 65 Q17 37 36 23 Q61 9 88 23 Q65 27 53 43 Q40 58 22 65 Z', HAIR);
  shape(ctx, 'M71 24 Q101 23 107 48 L104 108 Q99 122 91 129 Q101 90 91 49 Q86 33 71 24 Z', HAIR);
  line(ctx, 'M26 50 Q38 29 62 24 M26 57 Q44 45 53 34 M87 31 Q103 47 102 71', HAIR_LIGHT, 2.5);
  line(ctx, 'M23 97 Q18 124 29 140 M102 119 L100 139', HAIR_LIGHT, 2);
  // Small gold hoops help the silhouette read as a styled adult face.
  oval(ctx, 28, 104, 5, 10, '#ffe7a0');
  oval(ctx, 100, 104, 5, 10, '#ffe7a0');
  oval(ctx, 28, 104, 2, 6, HAIR, HAIR, 1);
  oval(ctx, 100, 104, 2, 6, HAIR, HAIR, 1);
  return canvas;
}

/** Branch presentation only. Treat these cached canvases as read-only.
 * The atlas keys remain compatibility names; all other assets retain identity.
 * Both enemy surfaces are 128 × 160 with transparent margins. */
export function createArt() {
  if (!cachedArt) {
    cachedArt = Object.freeze({
      ...createBaseArt(),
      unicorn: face(),
      unicornRear: face(true),
    });
  }
  return cachedArt;
}
