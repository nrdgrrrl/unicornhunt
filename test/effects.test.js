import test from 'node:test';
import assert from 'node:assert/strict';
import { createEffects, MAX_PARTICLES, MAX_TRAILS, REDUCED_PARTICLES } from '../src/effects.js';
import { renderEffects } from '../src/effects-renderer.js';
import { createEffectsState } from '../src/effects-state.js';
import { RAINBOW } from '../src/art.js';
import { createWorld, circleCollides } from '../src/world.js';

const glitter = { type: 'glitter', x: 6.5, y: 12.5 };
const shot = { type: 'shot', x: 3.5, y: 12.5, angle: 0, distance: 2.75 };
function context() {
  const fills = [];
  const lines = [];
  const points = [];
  const rotations = [];
  const borders = [];
  const ctx = { canvas: { width: 640, height: 360 }, fills, lines, points, rotations, borders,
    save() {}, restore() {}, beginPath() {}, closePath() {}, clip() {}, translate() {},
    rotate(angle) { rotations.push(angle); },
    rect(...args) { points.push(args); }, moveTo() {}, lineTo() {},
    fill() { fills.push(this.fillStyle); }, stroke() { lines.push(this.strokeStyle); },
    strokeRect(...args) { borders.push({ args, color: this.strokeStyle, width: this.lineWidth, alpha: this.globalAlpha }); },
  };
  return ctx;
}
function positions(effects) {
  return effects.snapshot().particles;
}

test('conversion stars start at the unicorn and expand in multiple colors', () => {
  const effects = createEffects();
  effects.consume([glitter]);
  assert.equal(effects.particleCount, 24);
  assert.ok(positions(effects).every(point => point.x === glitter.x && point.y === glitter.y));
  effects.update(0.2);
  const points = positions(effects);
  assert.ok(points.every(point => Math.hypot(point.x - glitter.x, point.y - glitter.y) > 0.1));
  const ctx = context();
  effects.render(ctx, () => ({ x: 320, y: 180, scale: 100, depth: 3 }));
  assert.deepEqual(new Set(ctx.fills), new Set(RAINBOW));
});

test('particle/trail capacity remains bounded under sustained bursts, then expires', () => {
  const effects = createEffects();
  for (let i = 0; i < 1000; i++) effects.consume([glitter, shot]);
  assert.equal(effects.particleCount, MAX_PARTICLES);
  assert.equal(effects.trailCount, MAX_TRAILS);
  effects.update(0.15);
  assert.equal(effects.trailCount, 0);
  effects.update(1);
  assert.equal(effects.particleCount, 0);
});

test('reduced motion keeps colorful stars and hit feedback with fewer, slower particles', () => {
  const normal = createEffects();
  const reduced = createEffects({ reducedMotion: true });
  normal.consume([glitter]); reduced.consume([glitter]);
  assert.equal(reduced.particleCount, 6);
  normal.update(0.1); reduced.update(0.1);
  const movement = effects => Math.max(...positions(effects).map(point => Math.hypot(point.x - glitter.x, point.y - glitter.y)));
  assert.ok(movement(reduced) < movement(normal) * 0.2);
  const ctx = context();
  reduced.render(ctx, () => null);
  assert.ok(ctx.lines.includes(RAINBOW[0]), 'crosshair hit feedback survives an invisible projection');
  reduced.render(ctx, () => ({ x: 320, y: 180, scale: 100, depth: 3 }));
  assert.deepEqual(new Set(ctx.fills), new Set(RAINBOW));
  for (let i = 0; i < 100; i++) reduced.consume([glitter]);
  assert.equal(reduced.particleCount, REDUCED_PARTICLES);
  for (let i = 0; i < 10; i++) normal.consume([glitter]);
  normal.setReducedMotion(true);
  assert.equal(normal.particleCount, REDUCED_PARTICLES);
});

test('world-space stars cannot move through hedge geometry', () => {
  const effects = createEffects();
  const world = createWorld(1);
  effects.consume([{ type: 'glitter', x: 1.05, y: 12.5 }]);
  for (let i = 0; i < 7; i++) effects.update(0.1, world);
  assert.ok(positions(effects).every(point => !circleCollides(world, point, 0.025)));
});

test('projection controls occlusion, including clipping partial stars; trails have six colors', () => {
  const effects = createEffects();
  effects.consume([glitter, shot]);
  const hidden = context();
  effects.render(hidden, () => null);
  assert.equal(hidden.fills.length, 0);
  const visible = context();
  effects.render(visible, () => ({ x: 320, y: 180, scale: 100, depth: 3, visibleSpans: [{ x: 315, width: 3 }] }));
  assert.equal(visible.points.length, 24 + 48, 'every star and ribbon sample has a wall-span clip');
  assert.ok(visible.points.every(point => point[0] === 315 && point[2] === 3));
  assert.ok(RAINBOW.every(color => visible.lines.includes(color)));
  effects.clear();
  assert.equal(effects.particleCount, 0);
  assert.equal(effects.trailCount, 0);
  assert.throws(() => effects.update(-1), RangeError);
});

test('direct and facade rendering preserve snapshots and future seeded simulation', () => {
  for (const reducedMotion of [false, true]) {
    const effects = createEffects({ seed: 'render-purity', reducedMotion });
    const core = createEffectsState({ seed: 'render-purity', reducedMotion });
    for (const state of [effects, core]) {
      state.consume([glitter, shot, { type: 'damage' }]);
      state.update(0.05);
    }
    const snapshot = effects.snapshot();
    const before = structuredClone(snapshot);
    const project = point => ({ x: point.x * 10, y: point.y * 10, scale: 100, depth: point.x,
      visibleSpans: [{ x: 315, width: 3 }] });
    for (let i = 0; i < 5; i++) {
      renderEffects(context(), project, snapshot);
      effects.render(context(), project);
    }
    assert.deepEqual(snapshot, before, 'rendering leaves the supplied frozen snapshot unchanged');
    assert.deepEqual(effects.snapshot(), before, 'rendering does not advance live state or lifetimes');
    for (const state of [effects, core]) {
      state.consume([glitter, shot]);
      state.update(0.05);
      state.setReducedMotion(true);
    }
    assert.deepEqual(effects.snapshot(), core.snapshot(), 'drawing consumes no seeded RNG values');
    assert.equal(effects.reducedMotion, core.reducedMotion);
    assert.equal(effects.particleCount, core.particleCount);
    assert.equal(effects.trailCount, core.trailCount);
  }
});

test('snapshot stars draw far to near with palette colors and reduced-motion rotation', () => {
  for (const reducedMotion of [false, true]) {
    const effects = createEffectsState({ reducedMotion });
    effects.consume([glitter]);
    effects.update(0.1);
    const snapshot = effects.snapshot();
    const ctx = context();
    renderEffects(ctx, point => ({ x: 320, y: 180, scale: 100, depth: point.x }), snapshot);
    const ordered = [...snapshot.particles].sort((a, b) => b.x - a.x);
    assert.deepEqual(ctx.fills, ordered.map(particle => RAINBOW[particle.colorIndex]));
    assert.deepEqual(ctx.rotations, ordered.map(particle =>
      particle.rotation + (reducedMotion ? 0 : particle.age * 2)));
  }
});

test('hit and damage indicators draw with hidden world effects and clear with state', () => {
  const effects = createEffects();
  effects.consume([glitter, { type: 'damage' }]);
  const ctx = context();
  effects.render(ctx, () => null);
  assert.equal(ctx.fills.length, 0);
  assert.deepEqual(ctx.lines, [RAINBOW[0]]);
  assert.deepEqual(ctx.borders, [{ args: [4, 4, 632, 352], color: RAINBOW[0], width: 8, alpha: 1 }]);
  effects.clear();
  const cleared = context();
  effects.render(cleared, () => null);
  assert.deepEqual(cleared.lines, []);
  assert.deepEqual(cleared.borders, []);
});
