import test from 'node:test';
import assert from 'node:assert/strict';
import { createAudio, MAX_AUDIO_SOURCES, MUTE_STORAGE_KEY } from '../src/audio.js';

function harness({ deferred = false, storage } = {}) {
  const param = () => ({
    value: 0, changes: [],
    setValueAtTime(...args) { this.changes.push(['set', ...args]); },
    linearRampToValueAtTime(...args) { this.changes.push(['linear', ...args]); },
    exponentialRampToValueAtTime(...args) { this.changes.push(['exp', ...args]); },
  });
  const node = () => ({ connected: false, connect() { this.connected = true; }, disconnect() { this.connected = false; } });
  const context = {
    state: 'suspended', currentTime: 1, destination: {}, oscillators: [], gains: [], resumes: [], suspends: 0,
    createGain() { const gain = { ...node(), gain: param() }; this.gains.push(gain); return gain; },
    createOscillator() {
      const oscillator = { ...node(), frequency: param(), stops: [], started: false,
        start() { this.started = true; }, stop(time) { this.stops.push(time); } };
      this.oscillators.push(oscillator);
      return oscillator;
    },
    resume() {
      if (!deferred) { this.state = 'running'; return Promise.resolve(); }
      return new Promise(resolve => this.resumes.push(() => { this.state = 'running'; resolve(); }));
    },
    suspend() { this.suspends++; this.state = 'suspended'; return Promise.resolve(); },
    close() { this.state = 'closed'; return Promise.resolve(); },
  };
  const values = new Map();
  let constructions = 0;
  const settings = storage ?? { getItem: key => values.get(key), setItem: (key, value) => values.set(key, value) };
  const audio = createAudio({ contextFactory: () => { constructions++; return context; }, storage: () => settings });
  return { audio, context, values, settings, get constructions() { return constructions; } };
}

test('audio is lazy and discards events before Start/Resume and while paused', async () => {
  const h = harness();
  h.audio.consume([{ type: 'shot' }]);
  assert.equal(h.constructions, 0);
  await h.audio.activate();
  assert.equal(h.constructions, 1);
  assert.equal(h.context.oscillators.length, 0);
  h.audio.consume([{ type: 'shot' }]);
  assert.equal(h.audio.activeSourceCount, 1);
  h.audio.pause();
  h.audio.consume([{ type: 'shot' }]);
  assert.equal(h.context.oscillators.length, 1);
  assert.equal(h.audio.activeSourceCount, 0);
  assert.equal(h.context.state, 'suspended');
  assert.equal(h.context.oscillators[0].stops.at(-1), undefined);
  assert.equal(h.context.oscillators[0].connected, false);
  await h.audio.activate();
  assert.equal(h.constructions, 1);
  h.audio.consume([{ type: 'glitter' }]);
  assert.equal(h.audio.activeSourceCount, 1);
});

test('all six event sounds use distinct local synthesis and expire/disconnect', async () => {
  const { audio, context } = harness();
  await audio.activate();
  audio.consume(['shot', 'glitter', 'damage', 'wave', 'victory', 'defeat', 'unknown'].map(type => ({ type })));
  assert.equal(audio.activeSourceCount, 6);
  const signatures = context.oscillators.map(source => JSON.stringify([source.type, source.frequency.changes, source.stops]));
  assert.equal(new Set(signatures).size, 6);
  for (const source of context.oscillators) {
    assert.equal(source.started, true);
    assert.ok(source.stops[0] > context.currentTime && source.stops[0] <= context.currentTime + 1.01);
    source.onended();
    assert.equal(source.connected, false);
    assert.equal(source.onended, null);
  }
  assert.equal(audio.activeSourceCount, 0);
  assert.ok(context.gains.slice(1).every(gain => !gain.connected));
});

test('repeated firing bounds scheduled sources and muting immediately stops all of them', async () => {
  const { audio, context, settings, values } = harness();
  await audio.activate();
  audio.consume(Array.from({ length: 1000 }, () => ({ type: 'shot' })));
  assert.equal(audio.activeSourceCount, MAX_AUDIO_SOURCES);
  assert.equal(context.oscillators.filter(source => source.connected).length, MAX_AUDIO_SOURCES);
  audio.setMuted(true);
  assert.equal(audio.activeSourceCount, 0);
  assert.ok(context.oscillators.every(source => !source.connected && source.stops.at(-1) === undefined));
  assert.equal(context.gains[0].gain.value, 0);
  assert.equal(values.get(MUTE_STORAGE_KEY), 'true');
  const next = harness({ storage: settings });
  assert.equal(next.audio.muted, true);
  await next.audio.activate();
  next.audio.consume([{ type: 'shot' }]);
  assert.equal(next.audio.activeSourceCount, 0);
  next.audio.setMuted(false);
  next.audio.consume([{ type: 'shot' }]);
  assert.equal(next.audio.activeSourceCount, 1);
});

test('a pending resume cannot reactivate audio after pause or destroy', async () => {
  for (const action of ['pause', 'destroy']) {
    const { audio, context } = harness({ deferred: true });
    const activation = audio.activate();
    audio[action]();
    context.resumes[0]();
    assert.equal(await activation, false);
    audio.consume([{ type: 'shot' }]);
    assert.equal(audio.activeSourceCount, 0);
    if (action === 'pause') assert.equal(context.state, 'suspended');
  }
});

test('the latest resume wins when earlier activation promises resolve out of order', async () => {
  const { audio, context } = harness({ deferred: true });
  const first = audio.activate();
  audio.pause();
  const second = audio.activate();
  context.resumes[1]();
  assert.equal(await second, true);
  context.resumes[0]();
  assert.equal(await first, false);
  audio.consume([{ type: 'shot' }]);
  assert.equal(audio.activeSourceCount, 1);
});

test('unavailable context, rejected resume, and inaccessible storage fail silently', async () => {
  const inaccessible = () => { throw new Error('Storage denied'); };
  for (const contextFactory of [() => null, () => { throw new Error('Unavailable'); },
    () => ({ createGain: () => ({ gain: {}, connect() {} }), resume: () => Promise.reject(new Error('Denied')), close() {} })]) {
    const audio = createAudio({ contextFactory, storage: inaccessible });
    assert.equal(await audio.activate(), false);
    assert.equal(audio.unavailable, true);
    audio.setMuted(true);
    audio.pause();
    audio.consume([{ type: 'shot' }]);
    audio.destroy();
    assert.equal(audio.activeSourceCount, 0);
  }
});

test('partial synthesis allocation failure releases the oscillator and enters silent mode', async () => {
  const { audio, context } = harness();
  await audio.activate();
  context.createGain = () => { throw new Error('Allocation failed'); };
  audio.consume([{ type: 'shot' }]);
  assert.equal(audio.unavailable, true);
  assert.equal(audio.activeSourceCount, 0);
  assert.equal(context.oscillators[0].stops.at(-1), undefined);
});

test('destroy stops and disconnects active audio and prevents reactivation', async () => {
  const { audio, context } = harness();
  await audio.activate();
  audio.consume([{ type: 'victory' }]);
  audio.destroy();
  assert.equal(audio.activeSourceCount, 0);
  assert.equal(context.state, 'closed');
  assert.ok(context.gains.every(gain => !gain.connected));
  assert.equal(await audio.activate(), false);
  audio.destroy();
});
