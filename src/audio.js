import { safeCreateContext, readStorage, writeStorage, attempt, invokePromise } from './audio-platform.js';

export const MAX_AUDIO_SOURCES = 12;
export const MUTE_STORAGE_KEY = 'unicornhunt:muted';

// One oscillator per effect, with local pitch/envelope synthesis only.
const SOUNDS = Object.freeze({
  shot: { wave: 'sine', notes: [420, 1100], duration: 0.12, slide: true },
  glitter: { wave: 'sine', notes: [880, 1175, 1480, 1760], duration: 0.4 },
  damage: { wave: 'sawtooth', notes: [180, 65], duration: 0.25, slide: true },
  wave: { wave: 'triangle', notes: [392, 523, 784], duration: 0.55 },
  victory: { wave: 'sine', notes: [523, 659, 784, 1047, 784, 1047], duration: 1 },
  defeat: { wave: 'triangle', notes: [330, 294, 220, 110], duration: 0.8 },
});

/** Lazy Web Audio. Call activate() directly from a Start/Resume user gesture.
 * No queued sounds: events arriving before activation or while paused vanish.
 */
export function createAudio({
  contextFactory = () => {
    const Context = globalThis.AudioContext ?? globalThis.webkitAudioContext;
    return Context ? new Context() : null;
  },
  storage = () => globalThis.localStorage,
} = {}) {
  let context = null;
  let master = null;
  let muted = false;
  let paused = true;
  let ready = false;
  let unavailable = false;
  let destroyed = false;
  let generation = 0;
  const sources = new Set();
  muted = readStorage(storage, MUTE_STORAGE_KEY) === 'true';

  function release(voice, stop = false) {
    if (!sources.delete(voice)) return;
    voice.source.onended = null;
    if (stop) attempt(() => voice.source.stop());
    attempt(() => voice.source.disconnect());
    attempt(() => voice.gain?.disconnect());
  }
  function silence() {
    if (master) attempt(() => { master.gain.value = 0; });
    for (const voice of sources) release(voice, true);
  }
  function fail() {
    unavailable = true;
    ready = false;
    silence();
    invokePromise(() => context?.close()).catch(() => { /* Remain in silent mode. */ });
  }
  function suspend() {
    invokePromise(() => context?.suspend()).catch(fail);
  }

  return {
    get muted() { return muted; },
    get paused() { return paused; },
    get unavailable() { return unavailable; },
    get activeSourceCount() { return sources.size; },
    activate() {
      if (destroyed || unavailable) return Promise.resolve(false);
      paused = false;
      ready = false;
      const activation = ++generation;
      try {
        if (!context) {
          context = safeCreateContext(contextFactory);
          if (!context) { fail(); return Promise.resolve(false); }
          master = context.createGain();
          master.gain.value = 0;
          master.connect(context.destination);
        }
        // Invoke synchronously here, while the browser's user activation lives.
        return invokePromise(() => context.resume()).then(() => {
          if (destroyed || unavailable || activation !== generation || paused) {
            if (paused && !destroyed) suspend();
            return false;
          }
          ready = context.state === 'running';
          master.gain.value = muted ? 0 : 0.18;
          return ready;
        }).catch(() => { fail(); return false; });
      } catch { fail(); return Promise.resolve(false); }
    },
    pause() {
      paused = true;
      ready = false;
      generation++;
      silence();
      if (context && !unavailable && !destroyed) suspend();
    },
    setMuted(value) {
      muted = Boolean(value);
      writeStorage(storage, MUTE_STORAGE_KEY, String(muted));
      if (muted) silence();
      else if (master && ready && !paused && !unavailable) master.gain.value = 0.18;
      return muted;
    },
    consume(events) {
      if (destroyed || unavailable || paused || muted || !ready || context?.state !== 'running') return;
      for (const event of events) {
        const sound = SOUNDS[event.type];
        if (!sound) continue;
        if (sources.size >= MAX_AUDIO_SOURCES) release(sources.values().next().value, true);
        let voice;
        try {
          voice = { source: context.createOscillator() };
          sources.add(voice);
          voice.gain = context.createGain();
          const now = context.currentTime;
          voice.source.type = sound.wave;
          sound.notes.forEach((frequency, i) => {
            const time = now + i * sound.duration / sound.notes.length;
            if (sound.slide && i > 0) voice.source.frequency.exponentialRampToValueAtTime(frequency, time);
            else voice.source.frequency.setValueAtTime(frequency, time);
          });
          voice.gain.gain.setValueAtTime(0, now);
          voice.gain.gain.linearRampToValueAtTime(0.5, now + 0.008);
          voice.gain.gain.exponentialRampToValueAtTime(0.001, now + sound.duration);
          voice.source.connect(voice.gain);
          voice.gain.connect(master);
          voice.source.onended = () => release(voice);
          voice.source.start(now);
          voice.source.stop(now + sound.duration + 0.01);
        } catch {
          // Include partially created nodes in cleanup if allocation failed.
          if (voice) release(voice, true);
          fail();
          break;
        }
      }
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      paused = true;
      ready = false;
      generation++;
      silence();
      attempt(() => master?.disconnect());
      invokePromise(() => context?.close()).catch(() => { /* Already destroyed. */ });
    },
  };
}
