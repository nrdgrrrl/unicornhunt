import test from 'node:test';
import assert from 'node:assert/strict';
import { createAudio } from '../src/audio.js';

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

function harness() {
  const resumes = [];
  const suspensions = [];
  const param = () => ({
    value: 0,
    setValueAtTime() {},
    linearRampToValueAtTime() {},
    exponentialRampToValueAtTime() {},
  });
  const node = () => ({ connected: false, connect() { this.connected = true; }, disconnect() { this.connected = false; } });
  let closes = 0;
  const context = {
    state: 'suspended',
    currentTime: 1,
    destination: {},
    oscillators: [],
    createGain() { return { ...node(), gain: param() }; },
    createOscillator() {
      const oscillator = { ...node(), frequency: param(), start() {}, stop() {} };
      this.oscillators.push(oscillator);
      return oscillator;
    },
    resume() {
      const request = deferred();
      resumes.push({
        resolve: () => { this.state = 'running'; request.resolve(); },
        reject: request.reject,
      });
      return request.promise;
    },
    suspend() {
      const request = deferred();
      suspensions.push({
        resolve: () => { this.state = 'suspended'; request.resolve(); },
        reject: request.reject,
      });
      return request.promise;
    },
    close() { closes++; this.state = 'closed'; return Promise.resolve(); },
  };
  const audio = createAudio({ contextFactory: () => context, storage: () => null });
  return { audio, context, resumes, suspensions, get closes() { return closes; } };
}

const flush = () => new Promise(resolve => setImmediate(resolve));
const rejection = () => new Error('Audio operation rejected');

test('a stale resume rejection does not silence a newer activation', async () => {
  const h = harness();
  const earlier = h.audio.activate();
  h.audio.pause();
  const current = h.audio.activate();

  h.resumes[1].resolve();
  assert.equal(await current, true);
  h.audio.consume([{ type: 'shot' }]);
  const source = h.context.oscillators[0];

  h.resumes[0].reject(rejection());
  assert.equal(await earlier, false);
  assert.equal(h.audio.unavailable, false);
  assert.equal(h.audio.activeSourceCount, 1);
  assert.equal(source.connected, true);
  assert.equal(h.context.state, 'running');
  assert.equal(h.closes, 0);
});

test('a stale suspension rejection does not silence a newer activation', async () => {
  const h = harness();
  const initial = h.audio.activate();
  h.resumes[0].resolve();
  assert.equal(await initial, true);

  h.audio.pause();
  const resumed = h.audio.activate();
  h.resumes[1].resolve();
  assert.equal(await resumed, true);
  h.audio.consume([{ type: 'shot' }]);
  const source = h.context.oscillators[0];

  h.suspensions[0].reject(rejection());
  await flush();
  assert.equal(h.audio.unavailable, false);
  assert.equal(h.audio.activeSourceCount, 1);
  assert.equal(source.connected, true);
  assert.equal(h.context.state, 'running');
  assert.equal(h.closes, 0);
});

test('an activation rejection after destroy is ignored', async () => {
  const h = harness();
  const activation = h.audio.activate();
  h.audio.destroy();
  assert.equal(h.closes, 1);

  h.resumes[0].reject(rejection());
  assert.equal(await activation, false);
  assert.equal(h.audio.unavailable, false);
  assert.equal(h.closes, 1);
  assert.equal(h.context.state, 'closed');
});

test('a current activation rejection still enters silent mode and closes the context', async () => {
  const h = harness();
  const activation = h.audio.activate();
  h.resumes[0].reject(rejection());

  assert.equal(await activation, false);
  assert.equal(h.audio.unavailable, true);
  assert.equal(h.context.state, 'closed');
  assert.equal(h.closes, 1);
});

test('a current suspension rejection still enters silent mode and closes the context', async () => {
  const h = harness();
  const activation = h.audio.activate();
  h.resumes[0].resolve();
  assert.equal(await activation, true);
  h.audio.consume([{ type: 'shot' }]);
  h.audio.pause();

  h.suspensions[0].reject(rejection());
  await flush();
  assert.equal(h.audio.unavailable, true);
  assert.equal(h.audio.activeSourceCount, 0);
  assert.equal(h.context.state, 'closed');
  assert.equal(h.closes, 1);
});
