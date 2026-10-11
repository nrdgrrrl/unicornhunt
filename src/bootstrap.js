import { createWorld } from './world.js';
import { createPlayer, updatePlayer } from './player.js';
import { spawnUnicorns, updateUnicorns } from './unicorn.js';
import { updateCombat } from './combat.js';
import { createInput } from './input.js';
import { createRenderer } from './renderer.js';
import { createEffects } from './effects.js';
import { createAudio } from './audio.js';

export function boot(canvas) {
  const document = canvas.ownerDocument;
  const window = document.defaultView;
  const ui = document.querySelector('#ui');
  const renderer = createRenderer(canvas);
  const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const effects = createEffects({ reducedMotion: motion.matches });
  const audio = createAudio();
  const waveCounts = [1, 3, 5];
  let session;
  let state = 'title';
  let frame;
  let previous;
  let waveDelay = 0;
  let destroyed = false;

  ui.innerHTML = `
    <div class="hud"><span class="badge" id="stats"></span><span class="badge" id="wave"></span></div>
    <div class="panel"><h1>Unicorn Hunt</h1><p id="message">Turn unicorns into rainbow glitter!</p>
      <p class="controls">W/S or ↑/↓ move · ←/→ turn · A/D strafe<br>Space / Ctrl / click fire · Shift run · Esc pause · M mute</p>
      <button id="start" type="button">Start game</button>
    </div>
    <div class="utility"><button id="mute" type="button" aria-pressed="false">Mute sound</button>
      <button id="pause" type="button" hidden>Pause</button></div>
    <span class="sr-only" id="announcement" role="status" aria-live="polite"></span>`;
  const panel = ui.querySelector('.panel');
  const startButton = ui.querySelector('#start');
  const muteButton = ui.querySelector('#mute');
  const pauseButton = ui.querySelector('#pause');
  const stats = ui.querySelector('#stats');
  const wave = ui.querySelector('#wave');
  const message = ui.querySelector('#message');
  const announcement = ui.querySelector('#announcement');

  function reset() {
    const world = createWorld(1);
    session = {
      world, player: createPlayer(world.spawn), unicorns: [], wave: 1,
      score: 0, combo: 0, elapsed: 0, lastHitAt: null, events: [],
    };
    session.unicorns = spawnUnicorns(world, session.player, waveCounts[0], 1);
    waveDelay = 0;
    effects.clear();
  }
  function syncMute() {
    muteButton.textContent = audio.muted ? 'Unmute sound' : 'Mute sound';
    muteButton.setAttribute('aria-pressed', String(audio.muted));
  }
  function toggleMute() {
    audio.setMuted(!audio.muted);
    syncMute();
    if (state === 'playing') canvas.focus({ preventScroll: true });
  }
  function pause() {
    if (state !== 'playing') return;
    state = 'paused';
    input.setPaused(true);
    audio.pause();
    panel.hidden = false;
    pauseButton.hidden = true;
    message.textContent = 'Paused. Take a breath of rainbow air.';
    startButton.textContent = 'Resume game';
    announcement.textContent = 'Game paused';
    document.exitPointerLock?.();
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
    panel.hidden = true;
    pauseButton.hidden = false;
    previous = undefined;
    canvas.focus({ preventScroll: true });
    announcement.textContent = `Wave ${session.wave}`;
    // Gameplay works in silent mode even when activation is unavailable.
    if (session.events.length) {
      effects.consume(session.events);
      const events = session.events.splice(0);
      void activation.then(activated => { if (activated && state === 'playing' && !destroyed) audio.consume(events); });
    }
  }
  function finish(result) {
    state = result;
    input.setPaused(true);
    panel.hidden = false;
    pauseButton.hidden = true;
    message.textContent = result === 'victory' ? `All unicorns glittered! Score: ${session.score}` : `Your magic ran out. Score: ${session.score}`;
    startButton.textContent = 'Play again';
    announcement.textContent = message.textContent;
    session.events.push({ type: result });
    document.exitPointerLock?.();
  }
  function tick(seconds) {
    session.elapsed += seconds;
    effects.update(seconds, session.world);
    updatePlayer(session.player, session.world, input.sample(), seconds);
    updateCombat(session);
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
          announcement.textContent = `Wave ${session.wave}`;
        }
      }
    }
    // Both consumers see the same queue; simulation calls no graphics/audio.
    effects.consume(session.events);
    audio.consume(session.events);
    session.events.length = 0;
  }
  function draw(now) {
    if (destroyed) return;
    const seconds = previous === undefined ? 0 : Math.min(0.05, (now - previous) / 1000);
    previous = now;
    if (state === 'playing') tick(seconds);
    else if (state === 'victory' || state === 'defeat') effects.update(seconds, session.world);
    renderer.render(session);
    effects.render(renderer.ctx, renderer.project);
    stats.textContent = `Magic ${session.player.magic} · Score ${session.score} · Combo ${session.combo}`;
    wave.textContent = `Wave ${session.wave} · ${session.unicorns.filter(unicorn => unicorn.alive).length} unicorns`;
    frame = window.requestAnimationFrame(draw);
  }
  const onMotion = () => effects.setReducedMotion(motion.matches);
  const onVisibility = () => { if (document.hidden) { pause(); audio.pause(); } };
  const onBlur = () => { pause(); audio.pause(); };
  startButton.addEventListener('click', start);
  muteButton.addEventListener('click', toggleMute);
  pauseButton.addEventListener('click', pause);
  motion.addEventListener('change', onMotion);
  document.addEventListener('visibilitychange', onVisibility);
  window.addEventListener('blur', onBlur);
  syncMute();
  reset();
  canvas.setAttribute('aria-label', 'Unicorn Hunt. Move through Glitter Grove and fire rainbows to turn unicorns into glitter.');
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
      startButton.removeEventListener('click', start);
      muteButton.removeEventListener('click', toggleMute);
      pauseButton.removeEventListener('click', pause);
      ui.replaceChildren();
    },
  };
}
