import test from 'node:test';
import assert from 'node:assert/strict';
import { createEffects, MAX_PARTICLES, MAX_TRAILS, REDUCED_PARTICLES } from '../src/effects.js';
import { renderEffects } from '../src/branch-effects-renderer.js';
import { createEffectsState, TRAIL_LIFETIME } from '../src/effects-state.js';
import { enemy, combatSession, combatStep } from './helpers/simulation.js';
import { RAINBOW, INK } from '../src/art.js';
import { createWorld, circleCollides } from '../src/world.js';

const glitter = { type: 'glitter', x: 6.5, y: 12.5 };
const shot = { type: 'shot', x: 3.5, y: 12.5, angle: 0, distance: 2.75 };
function context() {
  const fills = [];
  const lines = [];
  const points = [];
  const rotations = [];
  const borders = [];
  const alphas = [];
  const ctx = { canvas: { width: 640, height: 360 }, fills, lines, points, rotations, borders, alphas,
    save() {}, restore() {}, beginPath() {}, closePath() {}, clip() {}, translate() {},
    rotate(angle) { rotations.push(angle); },
    rect(...args) { points.push(args); }, moveTo() {}, lineTo() {}, quadraticCurveTo() {},
    fill() { fills.push(this.fillStyle); alphas.push(this.globalAlpha); }, stroke() { lines.push(this.strokeStyle); },
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

test('projection clips partial stars and one flat outlined silhouette per shot trail', () => {
  const effects = createEffects();
  effects.consume([glitter, shot, { ...shot, angle: 0.2 }]);
  const hidden = context();
  effects.render(hidden, () => null);
  assert.equal(hidden.fills.length, 0);
  const visible = context();
  effects.render(visible, () => ({ x: 320, y: 180, scale: 100, depth: 3, visibleSpans: [{ x: 315, width: 3 }] }));
  assert.equal(visible.points.length, 24 + 2, 'every star and shot silhouette has a wall-span clip');
  assert.deepEqual(visible.fills.slice(0, 2), ['#e9ad8d', '#e9ad8d']);
  assert.deepEqual(visible.lines.slice(0, 2), [INK, INK]);
  assert.equal(visible.fills.length, 26, 'each trail draws exactly one silhouette');
  assert.ok(visible.points.every(point => point[0] === 315 && point[2] === 3));
  assert.deepEqual(new Set(visible.fills.slice(2)), new Set(RAINBOW));
  assert.ok(visible.lines.every(color => color === INK || color === RAINBOW[0]));
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


test('shot centers advance within their recorded segments while reduced-motion shots only fade', () => {
  for (const reducedMotion of [false, true]) {
    for (const distance of [0.0001, 0.01, 0.1, 2.75]) {
      const effects = createEffects({ reducedMotion });
      const event = { ...shot, angle: Math.PI / 4, distance };
      effects.consume([event]);
      const projected = [];
      const opacity = [];
      for (const age of [0, 0.03, 0.07, 0.13]) {
        effects.update(age - effects.snapshot().trails[0].age);
        const direct = context();
        const facade = context();
        const points = [];
        const project = point => {
          points.push(point);
          return { x: 320, y: 180, scale: 100, depth: 3 };
        };
        renderEffects(direct, project, effects.snapshot());
        effects.render(facade, project);
        assert.deepEqual(points[0], points[1], 'direct and facade use the same shot center');
        assert.deepEqual(direct.fills, ['#e9ad8d']);
        assert.deepEqual(facade.fills, direct.fills);
        assert.deepEqual(direct.lines, [INK], 'shots never stroke rainbow ribbons');
        assert.deepEqual(facade.alphas, direct.alphas);
        projected.push(points[0]);
        opacity.push(direct.alphas[0]);
      }
      const traveled = projected.map(point => Math.hypot(point.x - event.x, point.y - event.y));
      assert.ok(traveled.every(value => value > 0 && value <= distance));
      assert.ok(projected.every(point => Math.abs((point.x - event.x) - (point.y - event.y)) < 1e-12));
      if (reducedMotion) assert.ok(projected.every(point => point.x === projected[0].x && point.y === projected[0].y));
      else assert.ok(traveled.every((value, index) => index === 0 || value > traveled[index - 1]));
      assert.ok(opacity.every((value, index) => index === 0 || value < opacity[index - 1]));
      effects.update(TRAIL_LIFETIME);
      const expired = context();
      effects.render(expired, () => { assert.fail('expired shots are not projected'); });
      assert.deepEqual(expired.fills, []);
    }
  }
});

test('short and muzzle-overlap hits still convert immediately and render safely', () => {
  for (const distance of [0, 0.0001, 0.01, 0.1]) {
    const state = combatSession([enemy('close', 2.75 + distance)]);
    combatStep(state);
    assert.equal(state.score, 100);
    assert.equal(state.unicorns[0].alive, false);
    const event = state.events.find(event => event.type === 'shot');
    assert.ok(Math.abs(event.distance - distance) < 1e-12);
    const effects = createEffects();
    effects.consume(state.events);
    assert.equal(effects.trailCount, 1);
    const ctx = context();
    effects.render(ctx, point => {
      assert.ok(Number.isFinite(point.x) && Number.isFinite(point.y));
      return { x: 320, y: 180, scale: 100, depth: 3 };
    });
    assert.equal(ctx.fills.filter(color => color === '#e9ad8d').length, distance === 0 ? 0 : 1);
    assert.equal(ctx.fills.filter(color => RAINBOW.includes(color)).length, 24);
    assert.equal(ctx.lines.at(-1), RAINBOW[0], 'even a zero-length shot retains the hit indicator');
  }
});
