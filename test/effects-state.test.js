import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createEffectsState, MAX_PARTICLES, REDUCED_PARTICLES, MAX_TRAILS,
  STAR_LIFETIME, TRAIL_LIFETIME,
} from '../src/effects-state.js';
import { circleCollides } from '../src/world.js';
import { EFFECT_PARTICLE_RADIUS } from '../src/config.js';
import { fixture } from './helpers/world.js';

const glitter = { type: 'glitter', x: 6.5, y: 12.5 };
const shot = { type: 'shot', x: 3.5, y: 12.5, angle: 0, distance: 2.75 };
const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-12,
  `${actual} should be near ${expected}`);

test('core runs headlessly and produces 24 seeded stars with six color indices', () => {
  assert.equal(typeof document, 'undefined');
  assert.equal(typeof window, 'undefined');
  const effects = createEffectsState();
  effects.consume([{ type: 'wave' }, glitter]);
  const { particles, hitFor, damageFor } = effects.snapshot();
  assert.equal(effects.particleCount, 24);
  assert.equal(hitFor, 0.2);
  assert.equal(damageFor, 0);
  assert.ok(particles.every(particle => particle.x === glitter.x && particle.y === glitter.y
    && particle.z === 0.55 && particle.age === 0 && !('color' in particle)));
  assert.deepEqual(particles.map(particle => particle.colorIndex),
    Array.from({ length: 24 }, (_, i) => i % 6));
  // Fixed seed-7 values protect the original angle/speed/vertical RNG order.
  near(particles[0].rotation, 0.11833857959136368);
  near(particles[0].vx, 1.1004816472264354);
  near(particles[0].vy, 0.13084077154074797);
  near(particles[0].vz, 0.2164144658483565);
  effects.update(0.2);
  for (const [i, particle] of effects.snapshot().particles.entries()) {
    near(particle.x, glitter.x + particles[i].vx * 0.2);
    near(particle.y, glitter.y + particles[i].vy * 0.2);
    near(particle.z, 0.55 + particles[i].vz * 0.2);
    assert.equal(particle.age, 0.2);
  }
});

test('equal seeds and event histories reproduce particles in both motion modes', () => {
  for (const seed of [0, 7, 'rainbow']) for (const reducedMotion of [false, true]) {
    const first = createEffectsState({ seed, reducedMotion });
    const second = createEffectsState({ seed, reducedMotion });
    for (let i = 0; i < 4; i++) {
      first.consume([glitter, shot]); second.consume([glitter, shot]);
      first.update(0.05); second.update(0.05);
    }
    assert.deepEqual(first.snapshot(), second.snapshot());
  }
  const first = createEffectsState({ seed: 1 });
  const second = createEffectsState({ seed: 2 });
  first.consume([glitter]); second.consume([glitter]);
  assert.notDeepEqual(first.snapshot().particles, second.snapshot().particles);
});

test('reduced motion produces six slower stars and keeps all color indices and indicators', () => {
  const normal = createEffectsState();
  const reduced = createEffectsState({ reducedMotion: true });
  normal.consume([glitter]); reduced.consume([glitter, { type: 'damage' }]);
  const before = reduced.snapshot();
  assert.equal(reduced.particleCount, 6);
  assert.equal(before.reducedMotion, true);
  assert.equal(before.hitFor, 0.2);
  assert.equal(before.damageFor, 0.25);
  assert.deepEqual(before.particles.map(particle => particle.colorIndex), [0, 1, 2, 3, 4, 5]);
  for (const axis of ['vx', 'vy', 'vz']) {
    near(before.particles[0][axis], normal.snapshot().particles[0][axis] * 0.12);
  }
  normal.update(0.1); reduced.update(0.1);
  const movement = effects => Math.max(...effects.snapshot().particles
    .map(particle => Math.hypot(particle.x - glitter.x, particle.y - glitter.y)));
  assert.ok(movement(reduced) < movement(normal) * 0.2);
});

test('sustained bursts keep the newest particles and trails at the 144/24/8 caps', () => {
  assert.equal(MAX_PARTICLES, 144);
  assert.equal(REDUCED_PARTICLES, 24);
  assert.equal(MAX_TRAILS, 8);
  for (const reducedMotion of [false, true]) {
    const effects = createEffectsState({ reducedMotion });
    for (let i = 0; i < 1000; i++) effects.consume([
      { ...glitter, x: i }, { ...shot, distance: i },
    ]);
    const { particles, trails } = effects.snapshot();
    const burstSize = reducedMotion ? 6 : 24;
    assert.equal(effects.particleCount, reducedMotion ? 24 : 144);
    assert.equal(effects.trailCount, 8);
    assert.deepEqual(particles.map(particle => particle.x),
      Array.from({ length: particles.length }, (_, i) => 1000 - particles.length / burstSize + Math.floor(i / burstSize)));
    assert.deepEqual(trails.map(trail => trail.distance), [992, 993, 994, 995, 996, 997, 998, 999]);
  }
});

test('enabling reduced motion trims old stars and scales retained velocity only once', () => {
  const effects = createEffectsState();
  for (let i = 0; i < 8; i++) effects.consume([{ ...glitter, x: i }]);
  effects.consume([shot, { type: 'damage' }]);
  const before = effects.snapshot();
  effects.setReducedMotion(true);
  const reduced = effects.snapshot();
  assert.equal(reduced.particles.length, 24);
  assert.deepEqual(reduced.trails, before.trails);
  assert.equal(reduced.hitFor, before.hitFor);
  assert.equal(reduced.damageFor, before.damageFor);
  assert.deepEqual(reduced.particles, before.particles.slice(-24).map(particle => ({
    ...particle, vx: particle.vx * 0.12, vy: particle.vy * 0.12, vz: particle.vz * 0.12,
  })));
  effects.setReducedMotion(1);
  assert.deepEqual(effects.snapshot(), reduced);
  effects.setReducedMotion(false);
  assert.equal(effects.reducedMotion, false);
  assert.deepEqual(effects.snapshot().particles, reduced.particles);
  effects.consume([glitter]);
  assert.equal(effects.particleCount, 48);
  const small = createEffectsState();
  small.consume([glitter]);
  small.setReducedMotion(true);
  assert.equal(small.particleCount, 24);
});

test('particles and trails expire at the inclusive 0.8/0.14-second boundaries', () => {
  assert.equal(STAR_LIFETIME, 0.8);
  assert.equal(TRAIL_LIFETIME, 0.14);
  for (const [lifetime, field, event, count] of [
    [0.8, 'particles', glitter, 24], [0.14, 'trails', shot, 1],
  ]) {
    for (const elapsed of [lifetime - 1e-6, lifetime, lifetime + 1e-6]) {
      const effects = createEffectsState();
      effects.consume([event]);
      effects.update(elapsed);
      assert.equal(effects.snapshot()[field].length, elapsed < lifetime ? count : 0);
    }
    const effects = createEffectsState();
    effects.consume([event]);
    effects.update(lifetime / 2);
    effects.consume([event]);
    effects.update(lifetime / 2);
    assert.equal(effects.snapshot()[field].length, count, 'only the older batch expires');
    assert.ok(effects.snapshot()[field].every(item => item.age === lifetime / 2));
  }
});

test('hit and damage indicators decay independently, refresh on events, and clamp at zero', () => {
  const effects = createEffectsState();
  effects.consume([glitter, { type: 'damage' }]);
  effects.update(0.1);
  near(effects.snapshot().hitFor, 0.1);
  near(effects.snapshot().damageFor, 0.15);
  effects.consume([shot, { type: 'victory' }]);
  near(effects.snapshot().hitFor, 0.1);
  effects.consume([glitter]);
  assert.equal(effects.snapshot().hitFor, 0.2);
  near(effects.snapshot().damageFor, 0.15);
  effects.consume([{ type: 'damage' }]);
  assert.equal(effects.snapshot().damageFor, 0.25);
  effects.update(0.2);
  assert.equal(effects.snapshot().hitFor, 0);
  near(effects.snapshot().damageFor, 0.05);
  effects.update(1);
  assert.equal(effects.snapshot().damageFor, 0);
  effects.consume([{ type: 'damage' }]);
  effects.update(0.25);
  assert.equal(effects.snapshot().damageFor, 0);
});

test('invalid elapsed time throws before changing state and zero time is allowed', () => {
  const effects = createEffectsState();
  effects.consume([glitter, shot, { type: 'damage' }]);
  const before = effects.snapshot();
  for (const seconds of [-1, NaN, Infinity, -Infinity, undefined, null, '0.1']) {
    assert.throws(() => effects.update(seconds), RangeError);
    assert.deepEqual(effects.snapshot(), before);
  }
  effects.update(0);
  assert.deepEqual(effects.snapshot(), before);
});

test('snapshots copy and freeze all records and arrays and survive subsequent state changes', () => {
  const effects = createEffectsState();
  effects.consume([glitter, shot, { type: 'damage' }]);
  const before = effects.snapshot();
  const expected = structuredClone(before);
  const again = effects.snapshot();
  for (const item of [before, before.particles, before.trails, ...before.particles, ...before.trails]) {
    assert.ok(Object.isFrozen(item));
  }
  assert.notEqual(before, again);
  for (const field of ['particles', 'trails']) {
    assert.notEqual(before[field], again[field]);
    assert.notEqual(before[field][0], again[field][0]);
  }
  assert.throws(() => { before.hitFor = 100; }, TypeError);
  assert.throws(() => { before.particles[0].x = 100; }, TypeError);
  assert.throws(() => { before.trails[0].age = 100; }, TypeError);
  assert.throws(() => before.particles.pop(), TypeError);
  assert.throws(() => before.trails.push(shot), TypeError);
  assert.deepEqual(effects.snapshot(), expected);
  effects.update(0.1);
  effects.setReducedMotion(true);
  effects.consume([glitter, shot]);
  effects.clear();
  assert.deepEqual(before, expected);
});

test('consumption copies event data without freezing or retaining caller objects', () => {
  const effects = createEffectsState();
  const event = { ...shot, metadata: { name: 'caller-owned' } };
  const conversion = { ...glitter };
  effects.consume([event, conversion]);
  const before = effects.snapshot();
  event.x = 100;
  event.metadata.name = 'changed';
  conversion.x = 100;
  assert.equal(Object.isFrozen(event), false);
  assert.equal(Object.isFrozen(event.metadata), false);
  assert.deepEqual(effects.snapshot(), before);
});

test('clear empties feedback while retaining reduced motion and continuing the RNG stream', () => {
  for (const reducedMotion of [false, true]) {
    const effects = createEffectsState({ reducedMotion });
    const reference = createEffectsState({ reducedMotion });
    effects.consume([glitter, shot, { type: 'damage' }]);
    reference.consume([glitter]);
    const firstBurst = effects.snapshot().particles;
    effects.clear();
    assert.equal(effects.particleCount, 0);
    assert.equal(effects.trailCount, 0);
    assert.deepEqual(effects.snapshot(), {
      particles: [], trails: [], hitFor: 0, damageFor: 0, reducedMotion,
    });
    effects.clear();
    effects.consume([glitter]);
    reference.consume([glitter]);
    const secondBurst = effects.snapshot().particles;
    assert.deepEqual(secondBurst, reference.snapshot().particles.slice(-firstBurst.length));
    assert.notDeepEqual(secondBurst, firstBurst);
  }
});

test('snapshots expose hedge-aware movement, including wall contact and sliding', () => {
  const world = fixture(8, 8, [[5, 4], [5, 5], [5, 6]]);
  const blocked = createEffectsState();
  const free = createEffectsState();
  const event = { type: 'glitter', x: 4.95, y: 5.5 };
  blocked.consume([event]); free.consume([event]);
  for (let i = 0; i < 7; i++) {
    blocked.update(0.1, world);
    free.update(0.1);
    assert.ok(blocked.snapshot().particles.every(particle =>
      !circleCollides(world, particle, EFFECT_PARTICLE_RADIUS)));
  }
  const particle = blocked.snapshot().particles[0];
  assert.ok(free.snapshot().particles[0].x > 5, 'unobstructed particle crosses the hedge position');
  assert.ok(particle.x <= 5 - EFFECT_PARTICLE_RADIUS);
  assert.ok(particle.x > event.x, 'particle advances up to contact');
  assert.ok(particle.y > event.y, 'particle slides along the hedge');
  near(particle.y, free.snapshot().particles[0].y);
});
