import test from 'node:test';
import assert from 'node:assert/strict';
import { createAudio, MAX_AUDIO_SOURCES, MUTE_STORAGE_KEY } from '../src/audio.js';
import { collectPickups } from '../src/pickups.js';
import { createRangedAttackState, updateRangedAttacks } from '../src/ranged-attacks.js';
import { applyDamage } from '../src/survival.js';
import { createEffectsState } from '../src/effects-state.js';
import { MAX_HEALTH, MAX_ARMOR, ROSE_WINDUP } from '../src/config.js';
import { arena } from './helpers/world.js';
import { enemy } from './helpers/simulation.js';

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

test('all eight event sounds use distinct local synthesis and expire/disconnect', async () => {
  const { audio, context } = harness();
  await audio.activate();
  audio.consume(['shot', 'glitter', 'damage', 'wave', 'victory', 'defeat', 'pickup', 'rose-fired', 'unknown'].map(type => ({ type })));
  assert.equal(audio.activeSourceCount, 8);
  const signatures = context.oscillators.map(source => JSON.stringify([source.type, source.frequency.changes, source.stops]));
  assert.equal(new Set(signatures).size, 8);
  for (const source of context.oscillators.slice(6)) {
    const pitches = source.frequency.changes.map(change => change[1]);
    assert.ok(pitches.every((pitch, i) => i === 0 || pitch > pitches[i - 1]), 'new cues rise in pitch');
    assert.ok(source.stops[0] - context.currentTime < 0.3, 'new cues are short');
  }
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

test('sustained firing and collection bound sources and muting immediately stops all of them', async () => {
  const { audio, context, settings, values } = harness();
  await audio.activate();
  audio.consume(Array.from({ length: 1000 }, (_, i) => ({ type: ['shot', 'pickup', 'rose-fired'][i % 3] })));
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

test('pickup and rose-fired events vanish before activation, during resume, while paused, and while muted', async () => {
  const h = harness({ deferred: true });
  const events = [{ type: 'pickup' }, { type: 'rose-fired' }];
  h.audio.consume(events);
  assert.equal(h.constructions, 0);
  const activation = h.audio.activate();
  h.audio.consume(events);
  h.context.resumes[0]();
  await activation;
  assert.equal(h.context.oscillators.length, 0);
  h.audio.consume(events);
  assert.equal(h.audio.activeSourceCount, 2);
  h.audio.pause();
  h.audio.consume(events);
  const resumed = h.audio.activate();
  h.context.resumes[1]();
  await resumed;
  assert.equal(h.context.oscillators.length, 2, 'paused events are not replayed');
  h.audio.setMuted(true);
  h.audio.consume(events);
  h.audio.setMuted(false);
  assert.equal(h.context.oscillators.length, 2, 'muted events are not replayed');
  h.audio.consume(events);
  assert.equal(h.context.oscillators.length, 4);
  assert.equal(h.audio.activeSourceCount, 2);
});

test('only successful health and armor collections play one pickup cue each', async () => {
  for (const kind of ['health', 'armor']) {
    const { audio, context } = harness();
    await audio.activate();
    const player = { x: 4.5, y: 4.5, radius: 0.2 };
    const items = [{ id: kind, kind, ...player }];
    const full = { health: MAX_HEALTH, armor: MAX_ARMOR, invulnerableFor: 0 };
    const world = arena();
    audio.consume(collectPickups(items, world, player, full).events);
    assert.equal(context.oscillators.length, 0);
    const collected = collectPickups(items, world, player, { ...full, [kind]: full[kind] - 1 });
    audio.consume(collected.events);
    assert.equal(context.oscillators.length, 1);
    audio.consume(collectPickups(collected.pickups, world, player, collected.state).events);
    assert.equal(context.oscillators.length, 1);
  }
});

test('actual rose emissions play once without player shot effects; both damage resources retain feedback', async () => {
  const { audio, context } = harness();
  const effects = createEffectsState();
  await audio.activate();
  const unicorn = enemy('source', 4.5, 5.5, {
    attack: { ...createRangedAttackState(42, 'source'), cooldownFor: 0 },
  });
  const session = { roses: [], nextRoseId: 0 };
  const world = arena();
  const target = { x: 7.5, y: 5.5 };
  const consume = events => { audio.consume(events); effects.consume(events); };
  consume(updateRangedAttacks([unicorn], world, target, session, 0));
  assert.equal(context.oscillators.length, 0, 'windup is silent');
  const events = updateRangedAttacks([unicorn], world, target, session, ROSE_WINDUP);
  assert.deepEqual(events.map(event => event.type), ['rose-fired']);
  consume(events);
  assert.equal(context.oscillators.length, session.roses.length);
  consume(updateRangedAttacks([unicorn], world, target, session, 0));
  assert.equal(context.oscillators.length, 1, 'recovery is silent');
  assert.equal(effects.trailCount, 0);
  assert.equal(effects.particleCount, 0);
  assert.equal(effects.snapshot().hitFor, 0);
  for (const armor of [0, 1]) {
    effects.clear();
    const { event } = applyDamage({ health: MAX_HEALTH, armor, invulnerableFor: 0 }, {
      cause: 'rose', source: session.roses[0].id,
    });
    assert.equal(event.resource, armor ? 'armor' : 'health');
    consume([event]);
    assert.ok(effects.snapshot().damageFor > 0);
  }
  assert.equal(context.oscillators.length, 3);
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

test('a synchronous void resume runs before activate returns its promise', async () => {
  const { audio, context } = harness();
  let resumed = false;
  context.resume = function () { resumed = true; this.state = 'running'; };
  const activation = audio.activate();
  assert.equal(resumed, true);
  assert.ok(activation instanceof Promise);
  // Events during activation still vanish, even with a synchronous resume.
  audio.consume([{ type: 'shot' }]);
  assert.equal(context.oscillators.length, 0);
  assert.equal(await activation, true);
  audio.consume([{ type: 'shot' }]);
  assert.equal(audio.activeSourceCount, 1);
});

test('blocked storage access or methods preserve activation and mute behavior', async () => {
  const denied = () => { throw new Error('Storage denied'); };
  for (const storage of [denied, () => ({ getItem: denied, setItem: denied })]) {
    const h = harness();
    const audio = createAudio({ contextFactory: () => h.context, storage });
    assert.equal(audio.muted, false);
    assert.equal(audio.setMuted(true), true);
    assert.equal(await audio.activate(), true);
    assert.equal(h.context.gains[0].gain.value, 0);
    audio.consume([{ type: 'shot' }]);
    assert.equal(audio.activeSourceCount, 0);
    assert.equal(audio.setMuted(false), false);
    assert.equal(h.context.gains[0].gain.value, 0.18);
    audio.consume([{ type: 'shot' }]);
    assert.equal(audio.activeSourceCount, 1);
    assert.equal(audio.unavailable, false);
    audio.destroy();
  }
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

test('a synchronous throwing resume enters silent mode even when close fails', async () => {
  for (const close of [() => {}, () => { throw new Error('Close failed'); }, () => Promise.reject(new Error('Close failed'))]) {
    const { audio, context } = harness();
    let resumed = false;
    let closes = 0;
    context.resume = () => { resumed = true; throw new Error('Resume failed'); };
    context.close = () => { closes++; return close(); };
    const activation = audio.activate();
    assert.equal(resumed, true);
    assert.ok(activation instanceof Promise);
    assert.equal(await activation, false);
    assert.equal(audio.unavailable, true);
    assert.equal(context.gains[0].gain.value, 0);
    assert.equal(closes, 1);
    assert.equal(await audio.activate(), false);
    audio.consume([{ type: 'shot' }]);
    assert.equal(context.oscillators.length, 0);
    // Allow unhandled rejections to surface in the test runner.
    await new Promise(resolve => setImmediate(resolve));
  }
});

test('throwing or rejected suspend enters silent mode and attempts close', async () => {
  for (const suspend of [() => { throw new Error('Suspend failed'); }, () => Promise.reject(new Error('Suspend failed'))]) {
    const { audio, context } = harness();
    await audio.activate();
    audio.consume([{ type: 'shot' }]);
    context.suspend = suspend;
    audio.pause();
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(audio.unavailable, true);
    assert.equal(audio.activeSourceCount, 0);
    assert.equal(context.state, 'closed');
  }
});

test('partial synthesis allocation failure releases the oscillator and enters silent mode', async () => {
  const { audio, context } = harness();
  await audio.activate();
  context.createGain = () => { throw new Error('Allocation failed'); };
  audio.consume([{ type: 'shot' }]);
  assert.equal(audio.unavailable, true);
  assert.equal(audio.activeSourceCount, 0);
  assert.deepEqual(context.oscillators[0].stops, [undefined]);
  assert.equal(context.oscillators[0].onended, null);
  assert.equal(context.oscillators[0].connected, false);
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

test('destroy attempts every cleanup and close despite throwing disconnects', async () => {
  for (const close of [() => {}, () => { throw new Error('Close failed'); }, () => Promise.reject(new Error('Close failed'))]) {
    const { audio, context } = harness();
    await audio.activate();
    audio.consume([{ type: 'victory' }, { type: 'shot' }]);
    const [first, second] = context.oscillators;
    first.stop = () => { throw new Error('Stop failed'); };
    let sourceDisconnects = 0;
    first.disconnect = () => { sourceDisconnects++; throw new Error('Disconnect failed'); };
    let masterDisconnects = 0;
    context.gains[0].disconnect = () => { masterDisconnects++; throw new Error('Disconnect failed'); };
    let closes = 0;
    context.close = () => { closes++; return close(); };
    audio.destroy();
    assert.equal(audio.activeSourceCount, 0);
    assert.equal(first.onended, null);
    assert.equal(sourceDisconnects, 1);
    assert.equal(context.gains[1].connected, false);
    assert.equal(second.stops.at(-1), undefined);
    assert.equal(second.connected, false);
    assert.equal(context.gains[2].connected, false);
    assert.equal(masterDisconnects, 1);
    assert.equal(closes, 1);
    assert.equal(await audio.activate(), false);
    audio.destroy();
    assert.equal(closes, 1);
    await new Promise(resolve => setImmediate(resolve));
  }
});
