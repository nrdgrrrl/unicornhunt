import { createWorld } from './world.js';
import { createPlayer, updatePlayer } from './player.js';
import { spawnUnicorns, updateUnicorns } from './unicorn.js';
import { updateCombat } from './combat.js';
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
  const waveCounts = [1, 3, 5];
  let session;
  let state = 'title';
  let frame;
  let previous;
  let waveDelay = 0;
  let destroyed = false;
  let bestScore = 0;
  try {
    const saved = Number(window.localStorage.getItem(BEST_SCORE_STORAGE_KEY));
    if (Number.isSafeInteger(saved) && saved >= 0) bestScore = saved;
  } catch { /* Storage is optional; keep the best score for this visit. */ }

  const hud = createHUD(ui, {
    onStart: start, onResume: start, onRestart: restart, onPause: pause, onMute: toggleMute,
  });

  function syncHUD() {
    hud.update({
      state, score: session.score, bestScore: session.bestScore,
      magic: session.player.magic, wave: session.wave,
      remaining: session.unicorns.filter(unicorn => unicorn.alive).length,
      combo: session.combo, muted: audio.muted,
      audioUnavailable: audio.unavailable || !(window.AudioContext || window.webkitAudioContext),
    });
    const tabIndex = state === 'playing' ? 0 : -1;
    if (canvas.tabIndex !== tabIndex) canvas.tabIndex = tabIndex;
  }

  function reset() {
    const world = createWorld(1);
    session = {
      world, player: createPlayer(world.spawn), unicorns: [], wave: 1,
      score: 0, bestScore, combo: 0, elapsed: 0, lastHitAt: null, events: [],
    };
    session.unicorns = spawnUnicorns(world, session.player, waveCounts[0], 1);
    waveDelay = 0;
    effects.clear();
    renderer.reset();
  }
  function toggleMute() {
    if (audio.unavailable || !(window.AudioContext || window.webkitAudioContext)) return;
    audio.setMuted(!audio.muted);
    syncHUD();
  }
  function pause() {
    if (state !== 'playing') return;
    state = 'paused';
    input.setPaused(true);
    audio.pause();
    document.exitPointerLock?.();
    syncHUD();
  }
  const input = createInput(canvas, { onPause: pause, onMute: toggleMute });
  input.setPaused(true);

  function start() {
    if (destroyed || state === 'playing') return;
    // Stay in the button's gesture handler, before any await.
    const activation = audio.activate();
    if (state !== 'paused') { reset(); session.events.push({ type: 'wave', wave: 1 }); }
    state = 'playing';
    input.setPaused(false);
    previous = undefined;
    syncHUD();
    canvas.focus({ preventScroll: true });
    // Gameplay works in silent mode even when activation is unavailable.
    if (session.events.length) {
      effects.consume(session.events);
      const events = session.events.splice(0);
      void activation.then(activated => { if (activated && state === 'playing' && !destroyed) audio.consume(events); });
    }
  }
  function restart() {
    if (destroyed) return;
    // Restart always creates a fresh session, including from the pause menu.
    state = 'title';
    start();
  }
  function finish(result) {
    state = result;
    input.setPaused(true);
    session.events.push({ type: result });
    document.exitPointerLock?.();
    syncHUD();
  }
  function tick(seconds) {
    session.elapsed += seconds;
    effects.update(seconds, session.world);
    const { x, y } = session.player;
    updatePlayer(session.player, session.world, input.sample(), seconds);
    renderer.update(seconds, Math.hypot(session.player.x - x, session.player.y - y));
    updateCombat(session);
    if (session.score > bestScore) {
      bestScore = session.score;
      try { window.localStorage.setItem(BEST_SCORE_STORAGE_KEY, String(bestScore)); } catch { /* Optional persistence. */ }
    }
    session.bestScore = bestScore;
    session.events.push(...updateUnicorns(session.unicorns, session.world, session.player, seconds));
    if (session.player.magic <= 0) finish('defeat');
    else if (!session.unicorns.some(unicorn => unicorn.alive)) {
      waveDelay += seconds;
      if (waveDelay >= 1) {
        waveDelay = 0;
        if (session.wave === waveCounts.length) finish('victory');
        else {
          session.wave++;
          session.unicorns = spawnUnicorns(session.world, session.player, waveCounts[session.wave - 1], session.wave);
          session.events.push({ type: 'wave', wave: session.wave });
        }
      }
    }
    // Feedback consumers see the same queue; simulation calls no graphics/audio.
    effects.consume(session.events);
    renderer.consume(session.events);
    audio.consume(session.events);
    session.events.length = 0;
  }
  function draw(now) {
    if (destroyed) return;
    const seconds = previous === undefined ? 0 : Math.min(0.05, (now - previous) / 1000);
    previous = now;
    if (state === 'playing') tick(seconds);
    else if (state === 'victory' || state === 'defeat') effects.update(seconds, session.world);
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
  reset();
  canvas.setAttribute('aria-label', 'Unicorn Hunt. Move through Glitter Grove and fire rainbows to turn unicorns into glitter.');
  syncHUD();
  frame = window.requestAnimationFrame(draw);

  return {
    get state() { return state; },
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
