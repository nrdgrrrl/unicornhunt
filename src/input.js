// @ts-check

const CONTROL_CODES = new Set([
  'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
  'KeyW', 'KeyS', 'KeyA', 'KeyD', 'Comma', 'Period',
  'AltLeft', 'AltRight', 'ControlLeft', 'ControlRight',
  'ShiftLeft', 'ShiftRight', 'Space', 'Escape', 'KeyM',
]);

/** @returns {import('./contracts.js').InputFrame} */
const idleFrame = () => ({ forward: 0, strafe: 0, turn: 0, look: 0, fire: false, run: false });

/**
 * Browser input adapter for a focusable game canvas. No pointer lock is needed
 * for keyboard play. sample() consumes mouse turning, but retains held keys.
 * The UI supplies onPause/onMute; onPause runs after clearing and suspending
 * input. Resume with setPaused(false). Dispose listeners with destroy().
 * @param {HTMLCanvasElement} canvas
 * @param {import('./contracts.js').InputOptions} [options]
 * @returns {import('./contracts.js').InputAdapter}
 */
export function createInput(canvas, {
  onPause = () => {},
  onMute = () => {},
  mouseSensitivity = 0.0025,
} = {}) {
  if (!Number.isFinite(mouseSensitivity) || mouseSensitivity < 0) {
    throw new RangeError('Mouse sensitivity must be finite and nonnegative.');
  }
  const document = canvas.ownerDocument;
  const window = /** @type {Window} */ (document.defaultView);
  /** @type {Set<string>} */
  const keys = new Set();
  /** @type {Array<() => void>} */
  const listeners = [];
  let paused = false;
  let focused = document.hasFocus();
  let destroyed = false;
  let mouseFire = false;
  let look = 0;
  let locked = document.pointerLockElement === canvas;
  /** @type {Promise<boolean> | null} */
  let lockRequest = null;
  /** @type {((success: boolean) => void) | null} */
  let finishLockRequest = null;

  /**
   * @template {keyof (WindowEventMap & DocumentEventMap)} K
   * @param {EventTarget} target
   * @param {K} type
   * @param {(event: (WindowEventMap & DocumentEventMap)[K]) => void} handler
   */
  const listen = (target, type, handler) => {
    // The event name above determines the callback type. EventTarget's generic
    // registration API erases it, so retain the same listener for removal.
    const listener = /** @type {EventListener} */ (handler);
    target.addEventListener(type, listener);
    listeners.push(() => target.removeEventListener(type, listener));
  };
  const clear = () => {
    keys.clear();
    mouseFire = false;
    look = 0;
    finishLockRequest?.(false);
  };
  const active = () => !destroyed && focused && !document.hidden && !paused;
  /** @param {KeyboardEvent} event */
  const ownsKeyboard = event => {
    const target = /** @type {(EventTarget & Partial<Pick<Element, 'closest'>>) | null} */ (event.target);
    if (target?.closest?.('input, textarea, select, button, [contenteditable]:not([contenteditable="false"])')) return false;
    return document.activeElement === canvas || document.pointerLockElement === canvas;
  };
  /** @param {...string} codes */
  const down = (...codes) => codes.some(code => keys.has(code));

  /** @param {boolean} value */
  function setPaused(value) {
    const nextPaused = Boolean(value);
    if (nextPaused || nextPaused !== paused) clear();
    paused = nextPaused;
  }

  function requestPause() {
    if (paused) return;
    setPaused(true);
    onPause();
  }

  // Both the legacy void-returning API and the newer rejecting Promise API
  // are supported. Failure leaves keyboard input available to the game.
  /** @returns {Promise<boolean>} */
  function requestPointerLock() {
    if (!active() || typeof canvas.requestPointerLock !== 'function') return Promise.resolve(false);
    if (document.pointerLockElement === canvas) return Promise.resolve(true);
    if (lockRequest) return lockRequest;
    /** @type {(success: boolean) => void} */
    let finish = () => {};
    /** @type {Promise<boolean>} */
    const request = new Promise(resolve => {
      finish = success => {
        if (finishLockRequest !== finish) return;
        finishLockRequest = null;
        lockRequest = null;
        resolve(success);
      };
    });
    finishLockRequest = finish;
    lockRequest = request;
    try {
      // Older browsers return void despite the current DOM declaration.
      const result = /** @type {Promise<void> | undefined} */ (canvas.requestPointerLock());
      if (result?.then) {
        Promise.resolve(result).then(
          () => finish(document.pointerLockElement === canvas),
          () => finish(false),
        );
      }
      // Void-returning browsers complete through pointerlockchange/error.
      if (document.pointerLockElement === canvas) finish(true);
    } catch {
      finish(false);
    }
    return request;
  }

  listen(window, 'keydown', event => {
    if (destroyed || !focused || document.hidden || !ownsKeyboard(event) || !CONTROL_CODES.has(event.code)) return;
    // Commands remain available to the focused game while paused. Other keys
    // retain their browser behavior in menus (including Space on buttons).
    if (paused && event.code !== 'Escape' && event.code !== 'KeyM') return;
    event.preventDefault();
    if (event.repeat || keys.has(event.code)) return;
    if (event.code === 'Escape') {
      requestPause();
    } else if (event.code === 'KeyM') {
      keys.add(event.code);
      onMute();
    } else {
      keys.add(event.code);
    }
  });
  // Release globally, even if focus moved since the key/button was pressed.
  listen(window, 'keyup', event => { keys.delete(event.code); });
  listen(canvas, 'mousedown', event => {
    if (event.button !== 0 || !active()) return;
    canvas.focus({ preventScroll: true });
    event.preventDefault();
    mouseFire = true;
    void requestPointerLock();
  });
  listen(window, 'mouseup', event => {
    if (event.button === 0) mouseFire = false;
  });
  listen(document, 'mousemove', event => {
    if (!active() || document.pointerLockElement !== canvas || !Number.isFinite(event.movementX)) return;
    // There is intentionally no vertical aim, pitch, or jump input.
    look += event.movementX * mouseSensitivity;
  });
  listen(window, 'blur', () => { focused = false; clear(); });
  listen(window, 'focus', () => { focused = true; });
  listen(canvas, 'blur', clear);
  listen(document, 'visibilitychange', clear);
  listen(document, 'pointerlockchange', () => {
    const nextLocked = document.pointerLockElement === canvas;
    const lostLock = locked && !nextLocked;
    locked = nextLocked;
    // Browsers may consume Escape to unlock without delivering its keydown.
    if (lostLock) requestPause();
    finishLockRequest?.(nextLocked);
  });
  // Legacy implementations report refusal as an event, not a rejected promise.
  listen(document, 'pointerlockerror', () => { finishLockRequest?.(false); });

  return {
    clear,
    setPaused,
    requestPointerLock,
    /** @returns {import('./contracts.js').InputFrame} */
    sample() {
      if (!active()) return idleFrame();
      const arrows = Number(down('ArrowRight')) - Number(down('ArrowLeft'));
      const alt = down('AltLeft', 'AltRight');
      const frame = {
        forward: Number(down('ArrowUp', 'KeyW')) - Number(down('ArrowDown', 'KeyS')),
        strafe: Math.max(-1, Math.min(1,
          Number(down('KeyD', 'Period')) - Number(down('KeyA', 'Comma')) + (alt ? arrows : 0))),
        turn: alt ? 0 : arrows,
        look,
        fire: mouseFire || down('ControlLeft', 'ControlRight', 'Space'),
        run: down('ShiftLeft', 'ShiftRight'),
      };
      look = 0;
      return frame;
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      clear();
      for (const remove of listeners) remove();
    },
  };
}
