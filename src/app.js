import { GameSession } from './session.js';
import { createInput } from './input.js';
import { createRenderer } from './renderer.js';
import { createEffects } from './effects.js';
import { createAudio } from './audio.js';
import { createHUD } from './hud.js';
import { createClock } from './clock.js';

const BEST_SCORE_STORAGE_KEY = 'unicornhunt:bestScore';

function querySeed(search) {
  const value = new URLSearchParams(search).get('seed');
  const seed = value === null || value.trim() === '' ? NaN : Number(value);
  return Number.isFinite(seed) ? seed : 1;
}

/** One application owns every subsystem, listener, and animation frame. */
export function boot(canvas) {
  const document = canvas?.ownerDocument ?? globalThis.document;
  const window = document.defaultView;
  const ui = document.querySelector('#ui');
  const cleanup = [];
  let destroyed = false;
  let failure = null;
  let failurePanel;

  function dispose() {
    if (destroyed) return;
    destroyed = true;
    // Partial initialization must also release everything already acquired.
    for (const remove of cleanup.reverse()) {
      try { remove(); } catch { /* Continue releasing the other resources. */ }
    }
  }

  function fail(error, startup = false) {
    failure = error;
    dispose();
    failurePanel = document.createElement('section');
    failurePanel.className = 'panel';
    failurePanel.setAttribute('role', 'alert');
    const title = document.createElement('h1');
    title.textContent = startup ? 'Unable to start Unicorn Hunt' : 'Unicorn Hunt stopped';
    const message = document.createElement('p');
    message.textContent = `${error.message || String(error)}. Reload to try again. If the problem continues, try a browser with Canvas 2D support.`;
    failurePanel.append(title, message);
    (ui ?? document.querySelector('#stage') ?? document.body).append(failurePanel);
    if (canvas) canvas.tabIndex = -1;
  }

  function destroy() {
    dispose();
    failurePanel?.remove();
  }

  try {
    if (!canvas || !ui) throw new Error('The game canvas or menu container is missing');
    if (!canvas.getContext('2d')) throw new Error('Canvas 2D graphics are unavailable');
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const renderer = createRenderer(canvas, { reducedMotion: motion.matches });
    const effects = createEffects({ reducedMotion: motion.matches });
    cleanup.push(() => effects.clear());
    const audio = createAudio();
    cleanup.push(() => audio.destroy());
    const session = new GameSession(querySeed(window.location.search));
    const clock = createClock();
    let frame;
    let playGeneration = 0;
    let bestScore = 0;
    try {
      const saved = Number(window.localStorage.getItem(BEST_SCORE_STORAGE_KEY));
      if (Number.isSafeInteger(saved) && saved >= 0) bestScore = saved;
    } catch { /* Storage is optional; keep records for this visit. */ }

    const hud = createHUD(ui, {
      onStart: start, onResume: start, onRestart: restart, onPause: pause, onMute: toggleMute,
    });
    cleanup.push(() => hud.destroy());
    const input = createInput(canvas, { onPause: pause, onMute: toggleMute });
    cleanup.push(() => input.destroy());
    input.setPaused(true);

    const presentationState = () => ({ ready: 'title', won: 'victory', lost: 'defeat' })[session.state] ?? session.state;

    function syncHUD() {
      const state = presentationState();
      hud.update({
        state, score: session.score, bestScore,
        magic: session.player.magic, wave: session.wave,
        remaining: session.remaining, combo: session.combo,
        muted: audio.muted,
        audioUnavailable: audio.unavailable || !(window.AudioContext || window.webkitAudioContext),
      });
      const tabIndex = state === 'playing' ? 0 : -1;
      if (canvas.tabIndex !== tabIndex) canvas.tabIndex = tabIndex;
    }

    function resetClock() {
      clock.reset();
    }

    function releasePointer() {
      if (document.pointerLockElement !== canvas) return;
      try {
        Promise.resolve(document.exitPointerLock?.()).catch(() => {});
      } catch { /* Pointer capture is optional. */ }
    }
    cleanup.push(releasePointer);

    function toggleMute() {
      if (destroyed || audio.unavailable || !(window.AudioContext || window.webkitAudioContext)) return;
      audio.setMuted(!audio.muted);
      syncHUD();
    }

    function pause() {
      if (destroyed || session.state !== 'playing') return;
      session.pause();
      playGeneration++;
      resetClock();
      input.setPaused(true);
      audio.pause();
      releasePointer();
      syncHUD();
    }

    function start() {
      if (destroyed || document.hidden || !['ready', 'paused'].includes(session.state)) return;
      // Activate synchronously inside the menu's click/keyboard gesture.
      const activation = audio.activate();
      if (session.state === 'paused') session.resume();
      else session.start();
      beginPlay(activation);
    }

    function beginPlay(activation) {
      const generation = ++playGeneration;
      input.setPaused(false);
      resetClock();
      syncHUD();
      canvas.focus({ preventScroll: true });
      const events = session.drainEvents();
      effects.consume(events);
      renderer.consume(events);
      // A delayed activation may not replay events from a paused/previous run.
      void activation.then(activated => {
        if (activated && !destroyed && session.state === 'playing' && generation === playGeneration) audio.consume(events);
      });
    }

    function restart() {
      if (destroyed || document.hidden || !['paused', 'won', 'lost'].includes(session.state)) return;
      // Stop old cues and clear held input before resetting the same subsystems.
      input.setPaused(true);
      audio.pause();
      const activation = audio.activate();
      session.restart();
      effects.clear();
      renderer.reset();
      beginPlay(activation);
    }

    function tick(seconds) {
      effects.update(seconds, session.world);
      const { x, y } = session.player;
      session.update(seconds, input.sample());
      renderer.update(seconds, Math.hypot(session.player.x - x, session.player.y - y));
      if (session.score > bestScore) {
        // Write only a newly improved record, never every frame/result render.
        bestScore = session.score;
        try { window.localStorage.setItem(BEST_SCORE_STORAGE_KEY, String(bestScore)); } catch { /* Optional persistence. */ }
      }
      const events = session.drainEvents();
      effects.consume(events);
      renderer.consume(events);
      audio.consume(events);
      if (session.state === 'won' || session.state === 'lost') {
        resetClock();
        input.setPaused(true);
        releasePointer();
        syncHUD();
      }
    }

    function draw(now) {
      if (destroyed) return;
      try {
        // Guard against missing focus events as well as delayed hidden frames.
        if (document.hidden || !document.hasFocus()) pause();
        // A result reached during this frame already advanced effects in tick.
        const animateResult = !document.hidden && (session.state === 'won' || session.state === 'lost');
        const seconds = clock.advance(now, tick, () => session.state === 'playing');
        if (animateResult) effects.update(seconds, session.world);
        renderer.render(session, { effects });
        syncHUD();
        frame = window.requestAnimationFrame(draw);
      } catch (error) { fail(error); }
    }

    function listen(target, type, handler) {
      target.addEventListener(type, handler);
      cleanup.push(() => target.removeEventListener(type, handler));
    }
    const suspend = () => { pause(); audio.pause(); resetClock(); };
    listen(motion, 'change', () => {
      effects.setReducedMotion(motion.matches);
      renderer.setReducedMotion(motion.matches);
    });
    listen(document, 'visibilitychange', () => { if (document.hidden) suspend(); });
    listen(window, 'blur', suspend);
    listen(window, 'pagehide', suspend);
    cleanup.push(() => window.cancelAnimationFrame(frame));
    renderer.reset();
    canvas.setAttribute('aria-label', 'Unicorn Hunt. Move through Glitter Grove and fire rainbows to turn unicorns into glitter.');
    syncHUD();
    // Render once here so graphics initialization failures get a startup message.
    renderer.render(session, { effects });
    frame = window.requestAnimationFrame(draw);

    return {
      get state() { return failure ? 'error' : presentationState(); },
      get error() { return failure; },
      get session() { return session; },
      effects, audio, destroy,
    };
  } catch (error) {
    fail(error, true);
    return { state: 'error', error, destroy };
  }
}
