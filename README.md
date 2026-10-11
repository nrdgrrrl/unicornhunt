# unicornhunt

Run the game with `npm start`, then choose **Start game**. Three waves of unicorns
turn into rainbow glitter when hit. Escape or the Pause button suspends play;
the Resume button continues it. Losing focus also pauses the game.

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

`src/combat.js` exposes `updateCombat(session)`. Initialize the session with
`world`, `player`, `unicorns`, `score: 0`, `combo: 0`, `elapsed: 0`,
`lastHitAt: null`, and `events: []`. Each tick advances `session.elapsed` in
seconds, calls `updatePlayer`, then `updateCombat`, then `updateUnicorns` (append
its returned damage events to `session.events`). Firing before unicorn movement
makes a hit immediate and prevents a converted unicorn from dealing damage.

Held fire shoots immediately when ready and repeats with a 0.22-second cooldown;
`updatePlayer` decrements `player.fireCooldown` even when fire is released.
There is no ammunition limit. Each shot hits only the nearest living unicorn's
circle along the aim ray before the first hedge. A hit sets `alive = false` and
awards 100 points times the combo. Successful hits within two seconds (inclusive)
continue the combo up to five; misses neither score nor refresh its timer, and
idle combat ticks expire it after two seconds.

Combat appends `{ type: 'shot', x, y, angle, distance }` for every shot, including
misses. The rainbow starts at `(x, y)` and ends `distance` tiles along `angle`,
at the target's surface or the first hedge. A hit also appends
`{ type: 'glitter', source, x, y, points, combo, score }`, where `source` is the
converted unicorn's ID. The app sends the queue to separate effects and audio
consumers, then drains it; combat calls no graphics or sound APIs. The app adds
`wave`, `victory`, and `defeat` events when those transitions occur.

`createEffects()` in `src/effects.js` consumes events, advances with
`update(seconds, world)`, and draws with `render(ctx, project)`. Stars expand from
the conversion's world position and collide with hedges. The renderer supplies
`project({ x, y, z, size })`, returning `{ x, y, depth, scale, visibleSpans }` or
null; visible column spans clip stars and rainbow trails against walls. Effects
never import the renderer. Limits are 144 stars and eight 0.14-second trails;
stars expire after 0.8 seconds. Reduced-motion preferences are observed live:
six stars per hit instead of 24, a 24-star cap, reduced movement, and no rotation.
The brief crosshair hit indicator remains available in either mode.

`createAudio()` in `src/audio.js` synthesizes six distinct effects locally with
Web Audio, without audio assets. Invoke `activate()` directly in Start/Resume
gesture handlers; constructing the module creates no audio context. Inactive,
paused, and muted events are discarded. At most 12 oscillator sources (including
scheduled ones) exist at once, with the oldest stopped at capacity and completed
nodes disconnected. `pause()` stops sources immediately and suspends the context;
`setMuted(true)` stops sources immediately and stores the preference under
`unicornhunt:muted`. Unsupported or failing audio becomes silent mode, and blocked
local storage does not prevent play. Dispose audio, effects, and input when
removing the app with the bootstrap's `destroy()` method.

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
