import test from 'node:test';
import assert from 'node:assert/strict';
import { presentSprites } from '../src/sprite-presentation.js';
import { createCameraFrame, project, position } from '../src/projection.js';
import { rearSocket } from '../src/ranged-attacks.js';
import { UNICORN_REAR_RUMP_ANCHOR } from '../src/art.js';

const art = Object.fromEntries(['unicorn', 'unicornRear', 'healthCake', 'armorCharm', 'rose', 'flower', 'rock']
  .map(name => [name, Object.freeze({ name, width: 128, height: 160 })]));
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} should equal ${b}`);
const camera = { x: 3.5, y: 12.5, angle: 0 };
const view = createCameraFrame(640, 360, camera);
const depths = new Float64Array(640).fill(Infinity);
const present = session => presentSprites(session, art, point => project(view, point, depths));
const scene = () => ({ world: { decorations: [] }, unicorns: [], pickups: [], roses: [] });

function freeze(value) {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}

test('legacy normal unicorns keep their literal 0.95 height and ground-centered projection', () => {
  for (const [width, height] of [[640, 360], [1001, 563], [401, 601]]) {
    const frame = createCameraFrame(width, height, camera);
    const buffer = new Float64Array(width).fill(Infinity);
    const [sprite] = presentSprites({ world: {}, unicorns: [{ x: 5.5, y: 12.5, alive: true }] },
      art, point => project(frame, point, buffer));
    const scale = width / (4 * Math.tan(35 * Math.PI / 180));
    assert.equal(sprite.sprite, art.unicorn);
    near(sprite.height, 0.95 * scale);
    near(sprite.width, 0.76 * scale);
    near(sprite.left + sprite.width / 2, width / 2);
    near(sprite.top + sprite.height / 2, height / 2 + (0.65 - 0.475) * scale);
    near(sprite.top + sprite.height, height / 2 + 0.65 * scale);
  }
});

test('cakes and charms are distinct ground billboards; roses use simulated height and position', () => {
  const session = scene();
  session.pickups = ['health', 'armor'].map((kind, index) => ({ kind, x: 6.5, y: 12 + index }));
  session.roses = [{ id: 'rose:1', x: 7.5, y: 12.5, z: 0.87, remaining: 1 }];
  const sprites = present(session);
  assert.deepEqual(sprites.map(item => item.sprite.name).sort(), ['armorCharm', 'healthCake', 'rose']);
  for (const sprite of sprites.filter(item => item.sprite !== art.rose)) {
    near(sprite.top + sprite.height, position(view, { x: 6.5, y: 12.5, z: 0 }).y);
  }
  const rose = sprites.find(item => item.sprite === art.rose);
  const expected = position(view, session.roses[0]);
  near(rose.left + rose.width / 2, expected.x);
  near(rose.top + rose.height / 2, expected.y);
});

test('rear artwork and emitted rose share a pixel and depth at oblique camera angles and viewport sizes', () => {
  for (const scale of [1, 4]) {
    const atlas = Object.fromEntries(Object.entries(art).map(([name, sprite]) =>
      [name, { ...sprite, width: sprite.width * scale, height: sprite.height * scale }]));
    for (const [width, height] of [[640, 360], [1001, 563], [401, 601], [1920, 1080]]) {
      for (const angle of [0, 0.25, -0.25]) {
        for (const phase of ['windup', 'recovery']) {
          const frame = createCameraFrame(width, height, { ...camera, angle });
          const buffer = new Float64Array(width).fill(Infinity);
          const unicorn = { id: 'z-source', x: 6.5, y: 12.9, angle: 0.6, alive: true, attack: { phase } };
          const rose = { ...rearSocket(unicorn), id: 'a-rose', source: unicorn.id, z: 0.5, remaining: 3 };
          const session = { ...scene(), unicorns: [unicorn], roses: [rose] };
          const [rear, emitted] = presentSprites(session, atlas, point => project(frame, point, buffer));
          assert.equal(rear.sprite, atlas.unicornRear);
          assert.equal(emitted.sprite, atlas.rose);
          const rumpX = rear.left + UNICORN_REAR_RUMP_ANCHOR.x / 128 * rear.width;
          const rumpY = rear.top + UNICORN_REAR_RUMP_ANCHOR.y / 160 * rear.height;
          near(rumpX, emitted.left + emitted.width / 2);
          near(rumpY, emitted.top + emitted.height / 2);
          assert.equal(rear.screen.depth, emitted.screen.depth);
        }
      }
    }
  }
});

test('one depth list orders every kind and deterministically breaks coincident ties', () => {
  const session = scene();
  session.world.decorations = ['flower', 'rock'].map(type => ({ type, x: 7.5, y: 12.5, size: 0.3 }));
  session.unicorns = ['b', 'a'].map(id => ({ id, x: 6.5, y: 12.5, alive: true }));
  session.pickups = ['health', 'armor'].map(kind => ({ id: kind, kind, x: 5.5, y: 12.5 }));
  session.roses = ['b', 'a'].map(id => ({ id, x: 6.5, y: 12.5, z: 0.5, remaining: 1 }));
  const original = present(session);
  assert.deepEqual(original.map(item => item.screen.depth), [4, 4, 3, 3, 3, 3, 2, 2]);
  session.world.decorations.reverse();
  session.unicorns.reverse();
  session.pickups.reverse();
  session.roses.reverse();
  assert.deepEqual(present(session), original);
});

test('presentation accepts frozen state and never initializes or advances attacks', () => {
  const session = freeze({ ...scene(),
    unicorns: [{ id: 'idle', x: 6.5, y: 12.5, alive: true },
      { id: 'attacking', x: 7.5, y: 12.5, angle: 0, alive: true,
        attack: { phase: 'recovery', remaining: 0.25, cooldownFor: 2.6, facing: 0, target: camera } }],
    pickups: [{ id: 'cake', kind: 'health', x: 6.5, y: 12.5 }],
    roses: [{ id: 'rose:0', x: 7.15, y: 12.5, z: 0.5, remaining: 3 }],
  });
  const snapshot = structuredClone(session);
  const originalRandom = Math.random;
  Math.random = () => { throw new Error('Presentation consumed randomness'); };
  try {
    const first = present(session);
    assert.deepEqual(present(session), first);
    assert.deepEqual(session, snapshot);
    assert.equal(Object.hasOwn(session.unicorns[0], 'attack'), false);
  } finally {
    Math.random = originalRandom;
  }
});

test('dead unicorns, expired roses, and unknown decoration art do not participate', () => {
  const session = { ...scene(), unicorns: [{ alive: false }],
    roses: [{ remaining: 0 }, { remaining: -1 }],
    world: { decorations: [{ type: 'missing', x: 6.5, y: 12.5, size: 0.3 }] } };
  assert.deepEqual(present(session), []);
});
