import { GameSession } from './session.js';
import { createInput } from './input.js';
import { createRenderer } from './renderer.js';
import { createEffects } from './effects.js';
import { createAudio } from './audio.js';
import { createHUD } from './hud.js';

const BEST_SCORE_STORAGE_KEY = 'unicornhunt:bestScore';

export function boot(canvas) {
  const document = canvas.ownerDocument;
  const window = document.defaultView;
  const ui = document.querySelector('#ui');
  const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const renderer = createRenderer(canvas, { reducedMotion: motion.matches });
  const effects = createEffects({ reducedMotion: motion.matches });
  const audio = createAudio();
  const session = new GameSession(1);
  let frame;
  let previous;
  let destroyed = false;
  let bestScore = 0;
  try {
    const saved = Number(window.localStorage.getItem(BEST_SCORE_STORAGE_KEY));
    if (Number.isSafeInteger(saved) && saved >= 0) bestScore = saved;
  } catch { /* Storage is optional; keep the best score for this visit. */ }

  const hud = createHUD(ui, {
    onStart: start, onResume: start, onRestart: restart, onPause: pause, onMute: toggleMute,
  });

  // Preserve presentation vocabulary without maintaining a second lifecycle.
  function presentationState() {
    return ({ ready: 'title', won: 'victory', lost: 'defeat' })[session.state] ?? session.state;
  }

  function syncHUD() {
    const state = presentationState();
    hud.update({
      state, score: session.score, bestScore,
      magic: session.player.magic, wave: session.wave,
      remaining: session.remaining,
      combo: session.combo, muted: audio.muted,
      audioUnavailable: audio.unavailable || !(window.AudioContext || window.webkitAudioContext),
    });
    const tabIndex = state === 'playing' ? 0 : -1;
    if (canvas.tabIndex !== tabIndex) canvas.tabIndex = tabIndex;
  }

  function resetFeedback() {
    effects.clear();
    renderer.reset();
  }
  function toggleMute() {
    if (audio.unavailable || !(window.AudioContext || window.webkitAudioContext)) return;
    audio.setMuted(!audio.muted);
    syncHUD();
  }
  function pause() {
    if (session.state !== 'playing') return;
    session.pause();
    input.setPaused(true);
    audio.pause();
    document.exitPointerLock?.();
    syncHUD();
  }
  const input = createInput(canvas, { onPause: pause, onMute: toggleMute });
  input.setPaused(true);

  function start() {
    if (destroyed || !['ready', 'paused'].includes(session.state)) return;
    // Stay in the button's gesture handler, before any await.
    const activation = audio.activate();
    if (session.state === 'paused') session.resume();
    else session.start();
    beginPlay(activation);
  }
  function beginPlay(activation) {
    input.setPaused(false);
    previous = undefined;
    syncHUD();
    canvas.focus({ preventScroll: true });
    // Gameplay works in silent mode even when activation is unavailable.
    const events = session.drainEvents();
    if (events.length) {
      effects.consume(events);
      renderer.consume(events);
      const world = session.world;
      void activation.then(activated => {
        if (activated && session.state === 'playing' && session.world === world && !destroyed) audio.consume(events);
      });
    }
  }
  function restart() {
    if (destroyed) return;
    const activation = audio.activate();
    session.restart();
    resetFeedback();
    input.setPaused(true);
    beginPlay(activation);
  }
  function finish() {
    input.setPaused(true);
    document.exitPointerLock?.();
    syncHUD();
  }
  function tick(seconds) {
    effects.update(seconds, session.world);
    const { x, y } = session.player;
    session.update(seconds, input.sample());
    renderer.update(seconds, Math.hypot(session.player.x - x, session.player.y - y));
    if (session.score > bestScore) {
      bestScore = session.score;
      try { window.localStorage.setItem(BEST_SCORE_STORAGE_KEY, String(bestScore)); } catch { /* Optional persistence. */ }
    }
    if (session.state === 'won' || session.state === 'lost') finish();
    // Feedback consumers see the same queue; simulation calls no graphics/audio.
    const events = session.drainEvents();
    effects.consume(events);
    renderer.consume(events);
    audio.consume(events);
  }
  function draw(now) {
    if (destroyed) return;
    const seconds = previous === undefined ? 0 : Math.min(0.05, (now - previous) / 1000);
    previous = now;
    if (session.state === 'playing') tick(seconds);
    else if (session.state === 'won' || session.state === 'lost') effects.update(seconds, session.world);
    renderer.render(session, { effects });
    syncHUD();
    frame = window.requestAnimationFrame(draw);
  }
  const onMotion = () => {
    effects.setReducedMotion(motion.matches);
    renderer.setReducedMotion(motion.matches);
  };
  const onVisibility = () => { if (document.hidden) { pause(); audio.pause(); } };
  const onBlur = () => { pause(); audio.pause(); };
  motion.addEventListener('change', onMotion);
  document.addEventListener('visibilitychange', onVisibility);
  window.addEventListener('blur', onBlur);
  resetFeedback();
  canvas.setAttribute('aria-label', 'Unicorn Hunt. Move through Glitter Grove and fire rainbows to turn unicorns into glitter.');
  syncHUD();
  frame = window.requestAnimationFrame(draw);

  return {
    get state() { return presentationState(); },
    get session() { return session; },
    effects, audio,
    destroy() {
      if (destroyed) return;
      destroyed = true;
      window.cancelAnimationFrame(frame);
      input.destroy();
      audio.destroy();
      effects.clear();
      motion.removeEventListener('change', onMotion);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('blur', onBlur);
      hud.destroy();
    },
  };
}
