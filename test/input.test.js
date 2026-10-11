import test from 'node:test';
import assert from 'node:assert/strict';
import { createInput } from '../src/input.js';
import { createPlayer, updatePlayer } from '../src/player.js';
import { createWorld } from '../src/world.js';

const idle = { forward: 0, strafe: 0, turn: 0, look: 0, fire: false, run: false };

function fixture(options) {
  const window = new EventTarget();
  const document = new EventTarget();
  const canvas = new EventTarget();
  Object.assign(document, { defaultView: window, activeElement: canvas, hidden: false, pointerLockElement: null, hasFocus: () => true });
  Object.assign(canvas, { ownerDocument: document, focus: () => { document.activeElement = canvas; } });
  const input = createInput(canvas, options);
  function emit(target, type, properties = {}) {
    const event = new Event(type, { cancelable: true });
    Object.assign(event, properties);
    target.dispatchEvent(event);
    return event;
  }
  const key = (code, type = 'keydown', properties = {}) => emit(window, type, { code, repeat: false, ...properties });
  return { window, document, canvas, input, emit, key };
}

test('all classic controls and alternatives work without pointer lock', () => {
  const { input, key, canvas, window, emit } = fixture();
  for (const [code, axis, value] of [
    ['ArrowUp', 'forward', 1], ['KeyW', 'forward', 1],
    ['ArrowDown', 'forward', -1], ['KeyS', 'forward', -1],
    ['ArrowLeft', 'turn', -1], ['ArrowRight', 'turn', 1],
    ['KeyA', 'strafe', -1], ['Comma', 'strafe', -1],
    ['KeyD', 'strafe', 1], ['Period', 'strafe', 1],
    ['ControlLeft', 'fire', true], ['ControlRight', 'fire', true], ['Space', 'fire', true],
    ['ShiftLeft', 'run', true], ['ShiftRight', 'run', true],
  ]) {
    assert.equal(key(code).defaultPrevented, true);
    assert.deepEqual(input.sample(), { ...idle, [axis]: value });
    key(code, 'keyup');
    assert.deepEqual(input.sample(), idle);
  }
  emit(canvas, 'mousedown', { button: 2 });
  assert.equal(input.sample().fire, false);
  emit(canvas, 'mousedown', { button: 0 });
  assert.equal(input.sample().fire, true);
  emit(window, 'mouseup', { button: 0 });
  assert.deepEqual(input.sample(), idle);
  input.destroy();
});

test('Alt switches held arrows from turn to strafe and back', () => {
  const { input, key } = fixture();
  for (const alt of ['AltLeft', 'AltRight']) {
    key('ArrowLeft');
    assert.equal(input.sample().turn, -1);
    key(alt);
    assert.deepEqual(input.sample(), { ...idle, strafe: -1 });
    key(alt, 'keyup');
    assert.deepEqual(input.sample(), { ...idle, turn: -1 });
    key('ArrowLeft', 'keyup');
    key(alt);
    key('ArrowRight');
    assert.deepEqual(input.sample(), { ...idle, strafe: 1 });
    input.clear();
  }
  input.destroy();
});

test('aliases do not add speed and releasing one held binding preserves the other', () => {
  const { input, key } = fixture();
  key('KeyW'); key('ArrowUp'); key('KeyD'); key('Period'); key('Space'); key('ControlRight');
  assert.deepEqual(input.sample(), { ...idle, forward: 1, strafe: 1, fire: true });
  key('KeyW', 'keyup'); key('Period', 'keyup'); key('Space', 'keyup');
  assert.deepEqual(input.sample(), { ...idle, forward: 1, strafe: 1, fire: true });
  key('ArrowDown'); key('KeyA');
  assert.deepEqual(input.sample(), { ...idle, fire: true });
  input.destroy();
});

test('mouse only turns horizontally under this canvas lock, and is consumed once', () => {
  const { input, document, canvas, emit } = fixture({ mouseSensitivity: 0.01 });
  emit(document, 'mousemove', { movementX: 20, movementY: 999 });
  assert.deepEqual(input.sample(), idle);
  document.pointerLockElement = {};
  emit(document, 'mousemove', { movementX: 20 });
  assert.deepEqual(input.sample(), idle);
  document.pointerLockElement = canvas;
  emit(document, 'pointerlockchange');
  emit(document, 'mousemove', { movementX: 20, movementY: 999 });
  emit(document, 'mousemove', { movementX: -5 });
  const frame = input.sample();
  assert.ok(Math.abs(frame.look - 0.15) < 1e-12);
  assert.deepEqual({ ...frame, look: 0 }, idle);
  assert.deepEqual(input.sample(), idle);
  input.destroy();
});

test('blur, canvas blur, hidden page, pause, and lock loss clear every held input', () => {
  for (const transition of ['blur', 'canvas blur', 'hidden', 'pause', 'lock loss']) {
    const { input, window, document, canvas, emit, key } = fixture();
    document.pointerLockElement = canvas;
    emit(document, 'pointerlockchange');
    key('KeyW'); key('KeyD'); key('ShiftLeft'); key('Space');
    emit(canvas, 'mousedown', { button: 0 });
    emit(document, 'mousemove', { movementX: 30 });
    if (transition === 'blur') emit(window, 'blur');
    if (transition === 'canvas blur') emit(canvas, 'blur');
    if (transition === 'hidden') { document.hidden = true; emit(document, 'visibilitychange'); }
    if (transition === 'pause') input.setPaused(true);
    if (transition === 'lock loss') { document.pointerLockElement = null; emit(document, 'pointerlockchange'); }
    assert.deepEqual(input.sample(), idle, transition);
    emit(window, 'focus');
    document.hidden = false;
    if (transition === 'pause' || transition === 'lock loss') input.setPaused(false);
    // Auto-repeat from a previously held key must never restore movement/fire.
    key('KeyW', 'keydown', { repeat: true });
    key('Space', 'keydown', { repeat: true });
    assert.deepEqual(input.sample(), idle, transition);
    key('KeyW');
    assert.equal(input.sample().forward, 1);
    input.destroy();
  }
});

test('pause clears before the callback and mute is a single command per press', () => {
  let pauses = 0;
  let mutes = 0;
  let input;
  const context = fixture({ onPause: () => { pauses++; assert.deepEqual(input.sample(), idle); }, onMute: () => mutes++ });
  input = context.input;
  const { key } = context;
  key('KeyW'); key('Space'); key('Escape');
  assert.equal(pauses, 1);
  key('Escape', 'keydown', { repeat: true });
  key('KeyW');
  assert.deepEqual(input.sample(), idle);
  key('KeyM'); key('KeyM'); key('KeyM', 'keydown', { repeat: true });
  assert.equal(mutes, 1);
  key('KeyM', 'keyup'); key('KeyM');
  assert.equal(mutes, 2);
  input.setPaused(false);
  assert.deepEqual(input.sample(), idle);
  key('ArrowUp');
  assert.equal(input.sample().forward, 1);
  input.destroy();
});

test('canvas lock loss pauses without Escape keydown and stays suspended until resumed', () => {
  let pauses = 0;
  const { input, document, canvas, emit, key } = fixture({ onPause: () => {
    pauses++;
    assert.deepEqual(input.sample(), idle);
    key('ArrowUp');
    assert.deepEqual(input.sample(), idle);
  } });
  // Unrelated lock changes must not pause keyboard-only play.
  document.pointerLockElement = {};
  emit(document, 'pointerlockchange');
  document.pointerLockElement = null;
  emit(document, 'pointerlockchange');
  assert.equal(pauses, 0);
  document.pointerLockElement = canvas;
  emit(document, 'pointerlockchange');
  key('KeyW'); key('Space'); key('ShiftLeft');
  emit(canvas, 'mousedown', { button: 0 });
  emit(document, 'mousemove', { movementX: 30 });
  // Native Escape can unlock without delivering a keydown to the page.
  document.pointerLockElement = null;
  emit(document, 'pointerlockchange');
  assert.equal(pauses, 1);
  emit(document, 'pointerlockchange');
  key('KeyD'); key('Space');
  emit(canvas, 'mousedown', { button: 0 });
  assert.equal(pauses, 1);
  assert.deepEqual(input.sample(), idle);
  input.setPaused(false);
  assert.deepEqual(input.sample(), idle);
  key('KeyW');
  assert.equal(input.sample().forward, 1);
  document.pointerLockElement = canvas;
  emit(document, 'pointerlockchange');
  document.pointerLockElement = null;
  emit(document, 'pointerlockchange');
  assert.equal(pauses, 2);
  input.destroy();
});

test('Escape and canvas lock loss request pause once in either event order', () => {
  for (const escapeFirst of [true, false]) {
    let pauses = 0;
    const { input, document, canvas, emit, key } = fixture({ onPause: () => pauses++ });
    document.pointerLockElement = canvas;
    emit(document, 'pointerlockchange');
    if (escapeFirst) key('Escape');
    document.pointerLockElement = null;
    emit(document, 'pointerlockchange');
    if (!escapeFirst) key('Escape');
    assert.equal(pauses, 1);
    key('KeyW'); key('Space');
    assert.deepEqual(input.sample(), idle);
    input.destroy();
  }
});

test('unfocused game and editable/menu elements keep browser key behavior', () => {
  const { input, document, window, emit, key } = fixture();
  document.activeElement = {};
  assert.equal(key('ArrowUp').defaultPrevented, false);
  document.pointerLockElement = {};
  assert.equal(key('Space').defaultPrevented, false);
  assert.deepEqual(input.sample(), idle);
  const button = new EventTarget();
  button.closest = () => button;
  // Use a separate target to mimic bubbling from an editable element.
  const event = new Event('keydown', { cancelable: true });
  Object.defineProperty(event, 'target', { value: button });
  Object.assign(event, { code: 'Space' });
  window.dispatchEvent(event);
  assert.equal(event.defaultPrevented, false);
  assert.equal(key('KeyZ').defaultPrevented, false);
  emit(window, 'blur');
  assert.equal(key('KeyW').defaultPrevented, false);
  input.destroy();
});

test('pointer lock absence, synchronous refusal, promise rejection, and legacy APIs are safe', async () => {
  const { input, canvas, document, emit, key } = fixture();
  assert.equal(await input.requestPointerLock(), false);
  for (const implementation of [
    () => { throw new Error('Denied'); },
    () => Promise.reject(new Error('Denied')),
    () => { emit(document, 'pointerlockerror'); },
  ]) {
    canvas.requestPointerLock = implementation;
    assert.equal(await input.requestPointerLock(), false);
    // Automatic mouse requests must also handle rejection internally.
    emit(canvas, 'mousedown', { button: 0 });
    await new Promise(resolve => setImmediate(resolve));
    key('ArrowUp');
    assert.equal(input.sample().forward, 1);
    input.clear();
  }
  canvas.requestPointerLock = () => { document.pointerLockElement = canvas; emit(document, 'pointerlockchange'); };
  assert.equal(await input.requestPointerLock(), true);
  input.destroy();
});

test('pause and destroy suppress requests, and concurrent pointer lock requests are coalesced', async () => {
  const { input, canvas, document, key } = fixture();
  let calls = 0;
  let resolve;
  canvas.requestPointerLock = () => { calls++; return new Promise(done => { resolve = done; }); };
  const first = input.requestPointerLock();
  const second = input.requestPointerLock();
  assert.equal(calls, 1);
  document.pointerLockElement = canvas;
  resolve();
  assert.equal(await first, true);
  assert.equal(await second, true);
  input.setPaused(true);
  assert.equal(await input.requestPointerLock(), false);
  input.destroy(); input.destroy();
  assert.equal(key('ArrowUp').defaultPrevented, false);
  assert.deepEqual(input.sample(), idle);
  assert.equal(await input.requestPointerLock(), false);
});

test('legacy lock requests wait for browser events and can be cancelled by lifecycle cleanup', async () => {
  const { input, canvas, document, emit } = fixture();
  canvas.requestPointerLock = () => {};
  const success = input.requestPointerLock();
  let settled = false;
  success.then(() => { settled = true; });
  await Promise.resolve();
  assert.equal(settled, false);
  document.pointerLockElement = canvas;
  emit(document, 'pointerlockchange');
  assert.equal(await success, true);
  document.pointerLockElement = null;
  emit(document, 'pointerlockchange');
  input.setPaused(false);
  const refusal = input.requestPointerLock();
  emit(document, 'pointerlockerror');
  assert.equal(await refusal, false);
  const paused = input.requestPointerLock();
  input.setPaused(true);
  assert.equal(await paused, false);
  input.setPaused(false);
  const removed = input.requestPointerLock();
  input.destroy();
  assert.equal(await removed, false);
});

test('keyboard-only input drives the player; tab/pause transitions stop movement and fire', () => {
  const { input, key, document, emit } = fixture();
  const world = createWorld(1);
  const player = createPlayer(world.spawn);
  key('ArrowUp'); key('Space');
  updatePlayer(player, world, input.sample(), 0.1);
  assert.ok(player.x > world.spawn.x);
  assert.equal(player.firing, true);
  document.hidden = true;
  emit(document, 'visibilitychange');
  const position = { x: player.x, y: player.y };
  updatePlayer(player, world, input.sample(), 1);
  assert.deepEqual({ x: player.x, y: player.y }, position);
  assert.equal(player.firing, false);
  document.hidden = false;
  emit(document, 'visibilitychange');
  key('ArrowUp'); key('ControlLeft'); key('Escape');
  updatePlayer(player, world, input.sample(), 1);
  assert.deepEqual({ x: player.x, y: player.y }, position);
  assert.equal(player.firing, false);
  input.destroy();
});
