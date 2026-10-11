# Unicorn Hunt

Turn unicorns into rainbow glitter in a hand-drawn forest. Clear three waves
before your magic runs out. The game runs locally in a desktop browser; artwork
is generated on canvas and all six sound effects are synthesized with Web Audio.

## Install and play

Install **Node.js 22 or newer**, which includes npm, then open a terminal in
this repository:

```sh
npm ci
npm start
```

Open **http://127.0.0.1:4173** and select **Start game**, or press Enter on the
focused Start button. Leave the terminal running. Stop the server with Ctrl+C.
To choose another port, use `PORT=8080 npm start` on macOS/Linux or set the `PORT`
environment variable in your shell. No build step or account is required.

Use a desktop browser with Canvas 2D support. Audio and pointer capture are
optional: keyboard play works when capture is denied, and unavailable audio is
reported as **Silent mode**. Audio begins only after Start/Resume. Touch controls
are not implemented.

## Controls

| Action | Keyboard | Mouse |
| --- | --- | --- |
| Forward / backward | W / S or ↑ / ↓ | — |
| Turn left / right | ← / → | Move horizontally while the pointer is captured |
| Strafe left / right | A / D, comma / period, or Alt + ← / → | — |
| Fire (hold to repeat) | Space or Ctrl | Hold the primary button on the game |
| Run | Hold Shift while moving | — |
| Pause | Escape | Pause button |
| Toggle sound | M while the game has focus | Sound button |

Click the canvas to request pointer capture. Escape releases it and pauses.
If capture is refused, continue with keyboard turning; mouse firing still works.
There is no vertical aim or jumping. Tab moves through menu buttons; Enter or
Space activates them. Start/Resume return focus to the canvas. Switching tabs or
losing window focus pauses and clears held controls: resume explicitly and press
movement/fire again. Restart is in the pause menu; Play again follows either result.

Your browser/OS reduced-motion preference reduces glitter count and movement,
removes star rotation, and disables weapon bob/recoil. Changes apply during play.
The hit indicator remains visible.

## Rules and tips

- Clear **6, 8, then 10 unicorns**. Clearing wave three wins immediately.
- Fire unlimited rainbows. Held fire repeats every 0.22 seconds, rounded to the
  next simulation tick. A shot converts the nearest unicorn along your aim.
  Hedges block shots and movement; flowers, rocks, and mushrooms are decoration.
- A conversion earns **100 × combo** points. Hits within two seconds build the
  combo up to ×5. Misses give no points and do not extend the combo timer.
- Start with **100 magic**. Unicorn contact costs 20, with 0.75 seconds of shared
  invulnerability between hits. At zero magic you lose, even on a cleared wave.
- Between waves you get a two-second break. You can still move/fire; the next
  wave restores 20 magic, capped at 100. Later unicorns move slightly faster.
- The HUD shows score, best score, magic, wave, remaining unicorns, and combo.
  Best score and mute preference survive reloads when local storage is available.

The first unicorn is straight ahead: fire before moving to see a conversion.
Keep space between yourself and the herd, strafe around hedges, and turn toward
unicorns as they enter the clearing. Running helps you escape contact. Listen
for the shot, glitter, damage, new-wave, victory, and defeat cues.

## Reproduce a seed

Open **http://127.0.0.1:4173/?seed=42** to generate seed 42. The default is 1.
Any finite numeric seed is accepted (including zero); absent, empty, or invalid
values use 1. Restart/Play again preserves the seed and resets the round.
Share the full URL, browser version, control approach, and steps when reporting
an issue. The simulation uses 60 Hz steps; exact replay requires identical input
on identical ticks. A seed alone does not reproduce human timing or final scores.

## Tests and screenshots

From a clean checkout:

```sh
npm ci
npx playwright install --with-deps chromium
npm test
npm run test:browser
```

`npm test` runs the browser-independent simulation/input/audio tests.
`npm run test:browser` starts its own server on port 4174, runs Chromium tests,
and shuts the server down. Keep that port free. The configuration prefers
`/usr/bin/chromium` when available, otherwise Playwright's downloaded Chromium.
Set `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` to use another Chromium executable.
Linux browser installation may require permission to install system libraries;
on an already configured machine, `npx playwright install chromium` suffices.

To inspect a live browser or the generated evidence:

```sh
npm run test:browser -- --headed
npm run test:browser -- browser/smoke.spec.js
npx playwright show-report
```

Every suite fails on uncaught page errors, failed local requests, and local HTTP
errors. The smoke suite also checks the startup state, menus, nonblank canvas,
first conversion, pause/resume, mute persistence, restart, denied capture, real
keyboard and captured-mouse three-wave automated victories, natural defeat,
reduced motion, and a sustained 144-star performance sample. Automated round
controllers read positions to aim; they do not replace human usability testing.
The audio test also renders all six production cues to WAV clips for audition.

Screenshots and JSON evidence are in `test-results/`; the browsable report is in
`playwright-report/`. Failure traces can be opened with `npx playwright show-trace
<path-to-trace.zip>`. These generated directories are ignored by version control.
CI runs both commands on pushes and pull requests targeting
`1-epic-sketchbook-rainbow-lsd`, and uploads the report/screenshots even on failure.
See [observed verification and remaining human checks](docs/verification.md)
for the actual browser versions, results, selected screenshots, and review steps.

## Static hosting

Upload **index.html**, **styles.css**, **main.js**, and the entire **src/** directory
to any static HTTP(S) host, preserving their relative paths. The entry page and
module imports work at either the site root or a subdirectory. Serve `.js` as
JavaScript and `.css` as CSS. There is no backend, external asset request, build,
or production dependency; omit `node_modules/`, tests, and development tools.
Use HTTP(S), rather than opening `index.html` with a `file://` URL, so ES modules
load correctly. Best score and mute settings are stored per browser origin.

The local `npm start` server binds to loopback for development. A public host
serves the static files itself; it does not need to run Node.js.
