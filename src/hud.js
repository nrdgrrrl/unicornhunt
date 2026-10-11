/** Stable, presentation-only overlay. The app supplies snapshots and actions;
 * updating counters never replaces controls, moves focus, or announces scores.
 */
export function createHUD(root, { onStart, onResume, onRestart, onPause, onMute }) {
  root.innerHTML = `
    <dl class="hud" aria-label="Game statistics">
      <div class="badge"><dt>Score</dt><dd id="score">0</dd></div>
      <div class="badge"><dt>Best score</dt><dd id="best-score">0</dd></div>
      <div class="badge"><dt>Magic</dt><dd id="magic">100 / 100</dd></div>
      <div class="badge"><dt>Wave</dt><dd id="wave">1 / 3</dd></div>
      <div class="badge"><dt>Unicorns remaining</dt><dd id="remaining">6</dd></div>
      <div class="badge"><dt>Combo</dt><dd id="combo">None</dd></div>
    </dl>
    <section class="panel" aria-labelledby="panel-title" aria-describedby="message">
      <h1 id="panel-title">Unicorn Hunt</h1>
      <p id="message">Turn every unicorn into rainbow glitter to win!</p>
      <div class="panel-actions">
        <button id="start" type="button">Start game</button>
        <button id="restart" type="button" hidden>Restart game</button>
      </div>
      <div id="instructions">
        <h2>How to play</h2>
        <p>Clear three waves: 6, 8, then 10 unicorns. Fire unlimited rainbows;
          there is no ammunition limit. Each hit earns 100 points × your combo.
          Hits within two seconds build a combo up to ×5.</p>
        <p>You start with 100 magic. Contact with a unicorn costs 20 magic,
          with a brief grace period between hits. Zero magic ends the game.
          Cleared waves give you a two-second break; the next wave restores
          20 magic, up to 100.</p>
        <h2>Keyboard and mouse controls</h2>
        <dl class="controls">
          <dt>Move forward / backward</dt><dd>W / S or ↑ / ↓</dd>
          <dt>Turn left / right</dt><dd>← / →</dd>
          <dt>Strafe left / right</dt><dd>A / D, comma / period, or Alt + ← / →</dd>
          <dt>Fire rainbows</dt><dd>Space, Ctrl, or primary mouse button (hold to repeat)</dd>
          <dt>Run</dt><dd>Hold Shift</dd>
          <dt>Pause</dt><dd>Escape or the Pause button</dd>
          <dt>Toggle sound</dt><dd>M during play or the sound button</dd>
          <dt>Mouse turning</dt><dd>Click the game to capture the pointer, then move horizontally.
            Escape releases it. Keyboard play needs no pointer capture.</dd>
        </dl>
        <p>Tab moves between buttons; Enter or Space activates them.
          Start and Resume return keyboard focus to the game.</p>
      </div>
    </section>
    <div class="utility">
      <button id="pause" type="button" hidden>Pause</button>
      <button id="mute" type="button" aria-pressed="false" aria-describedby="audio-status">Mute sound</button>
      <span id="audio-status" role="status" aria-live="polite" aria-atomic="true"></span>
    </div>
    <span class="sr-only" id="announcement" role="status" aria-live="polite" aria-atomic="true"></span>`;

  const find = selector => root.querySelector(selector);
  const panel = find('.panel');
  const primary = find('#start');
  const restart = find('#restart');
  const pause = find('#pause');
  const mute = find('#mute');
  const title = find('#panel-title');
  const message = find('#message');
  const instructions = find('#instructions');
  const announcement = find('#announcement');
  const audioStatus = find('#audio-status');
  const counters = Object.fromEntries(['score', 'best-score', 'magic', 'wave', 'remaining', 'combo']
    .map(id => [id, find(`#${id}`)]));
  let state;
  let wave;
  let destroyed = false;
  const setText = (element, value) => {
    const text = String(value);
    if (element.textContent !== text) element.textContent = text;
  };
  const activatePrimary = () => {
    if (state === 'title') onStart();
    else if (state === 'paused') onResume();
    else if (state === 'victory' || state === 'defeat') onRestart();
  };
  const listeners = [[primary, activatePrimary], [restart, onRestart], [pause, onPause], [mute, onMute]];
  for (const [button, callback] of listeners) button.addEventListener('click', callback);

  return {
    update(snapshot) {
      if (destroyed) return;
      const changed = state !== snapshot.state;
      const previousState = state;
      state = snapshot.state;
      setText(counters.score, snapshot.score);
      setText(counters['best-score'], snapshot.bestScore);
      setText(counters.magic, `${snapshot.magic} / 100`);
      setText(counters.wave, `${snapshot.wave} / 3`);
      setText(counters.remaining, snapshot.remaining);
      setText(counters.combo, snapshot.combo > 0 ? `×${snapshot.combo}` : 'None');
      setText(mute, snapshot.audioUnavailable ? 'Silent mode — audio unavailable'
        : snapshot.muted ? 'Unmute sound' : 'Mute sound');
      if (mute.getAttribute('aria-pressed') !== String(snapshot.muted)) {
        mute.setAttribute('aria-pressed', String(snapshot.muted));
      }
      if (mute.disabled !== Boolean(snapshot.audioUnavailable)) mute.disabled = Boolean(snapshot.audioUnavailable);
      setText(audioStatus, snapshot.audioUnavailable ? 'Silent mode: audio is unavailable.'
        : snapshot.muted ? 'Sound muted.' : 'Sound enabled.');

      if (changed) {
        panel.scrollTop = 0;
        panel.hidden = state === 'playing';
        pause.hidden = state !== 'playing';
        restart.hidden = state !== 'paused';
        instructions.hidden = state === 'victory' || state === 'defeat';
        if (state === 'title') {
          setText(title, 'Unicorn Hunt');
          setText(message, 'Turn every unicorn into rainbow glitter to win!');
          setText(primary, 'Start game');
        } else if (state === 'paused') {
          setText(title, 'Game paused');
          setText(message, 'Paused. Take a breath of rainbow air.');
          setText(primary, 'Resume game');
          setText(announcement, 'Game paused');
        } else if (state === 'victory' || state === 'defeat') {
          setText(title, state === 'victory' ? 'Victory!' : 'Defeat');
          setText(message, `${state === 'victory' ? 'All unicorns glittered!' : 'Your magic ran out.'} Final score: ${snapshot.score}. Best score: ${snapshot.bestScore}.`);
          setText(primary, 'Play again');
          setText(announcement, `${title.textContent} ${message.textContent}`);
        }
        // Let the panel scroll the action into view on short/narrow screens.
        if (state !== 'playing') primary.focus();
      }
      if (state === 'playing' && (changed || wave !== snapshot.wave)) {
        setText(announcement, previousState === 'paused' && wave === snapshot.wave
          ? 'Game resumed' : `Wave ${snapshot.wave} of 3. ${snapshot.remaining} unicorns remaining.`);
      }
      wave = snapshot.wave;
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      for (const [button, callback] of listeners) button.removeEventListener('click', callback);
      root.replaceChildren();
    },
  };
}
