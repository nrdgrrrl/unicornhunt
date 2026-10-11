# unicornhunt

Run the local game shell with `npm start`. The bootstrap currently draws the
placeholder; world, art, player, and input modules are ready for game integration.

The focusable game canvas supports these controls through `src/input.js`:

- Up/Down or W/S: forward/backward. Left/Right: turn.
- Alt + Left/Right, comma/period, or A/D: strafe.
- Ctrl, Space, or primary mouse button: fire. Shift: run at twice walking speed.
- Escape: request pause. M: toggle sound through the supplied callback.
- With optional pointer lock: horizontal mouse movement turns; vertical movement is ignored.

Create the adapter with `createInput(canvas, { onPause, onMute })` and a player
with `createPlayer(world.spawn)`. Each simulation tick calls
`updatePlayer(player, world, input.sample(), elapsedSeconds)`. The player exposes
`x`, `y`, `angle` (radians), `radius`, and `firing`. Movement uses world collision
and normalizes diagonals. Walking speed is 2.5 tiles/second and keyboard turning
is π radians/second.

`onPause` runs after input has been cleared and suspended. The UI can also call
`input.setPaused(true)` when opening a menu, then `input.setPaused(false)` when
resuming. Sample fresh input each tick; do not cache held-input frames across
pause or focus transitions. Blur, visibility changes, and loss of the canvas's
pointer lock clear keys, firing, and pending mouse motion. Auto-repeat cannot
reactivate a cleared key until it is pressed again.

Primary mouse presses request pointer lock when available. The adapter also
exposes `requestPointerLock()` (a Promise resolving to a boolean) for a UI button;
refusal is handled internally, and keyboard controls remain available. Call
`input.destroy()` when removing the game to detach its listeners.

Install dependencies with `npm ci`. Run logic and lifecycle tests with `npm test`,
and browser tests with `npx playwright test browser`. Browser tests use system
Chromium if available, or Playwright's installed Chromium (`npx playwright install
chromium`); `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` can override the executable.
