# unicornhunt

Run the local game shell with `npm start`. The bootstrap currently draws the
placeholder; world, art, player, input, and unicorn modules are ready for game integration.

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

`src/unicorn.js` exposes `spawnUnicorns(world, player, count, wave = 1, seed)`
for each new wave. Spawning uses a finite, seeded selection of reachable open
cells, at least three tiles from the player and one tile apart. Wave one puts
its first unicorn three tiles ahead in the generated introduction corridor.
Requests exceeding the available safe positions throw a `RangeError`.

After updating the player, call
`updateUnicorns(unicorns, world, player, elapsedSeconds)` once per simulation
tick, including ticks with an empty group. Unicorns follow one shared distance
field around hedges, moving at 1.2 tiles/second plus 0.08 per subsequent wave.
The optional fifth argument accepts a field built with
`buildDistanceField(world, player, UNICORN_RADIUS)` for the current player tile.
Unicorns expose position, radius, speed, angle, and a single `alive` flag; setting
`alive = false` immediately prevents movement and contact damage.

Players start with 100 `magic` and zero `invulnerableFor` seconds. Contact costs
20 magic and grants 0.75 seconds of shared invulnerability, limiting the entire
group to one hit per tick. The unicorn update advances this cooldown and returns
an array of `{ type: 'damage', source, amount, magic, x, y }` events for future
audio and visual feedback; `source` is the contacting unicorn's ID, and `magic`
is the player's remaining magic. Walking bob and sprite facing belong to the
renderer.

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
