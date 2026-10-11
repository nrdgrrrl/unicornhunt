# Historical verification record — issue 13

**Historical evidence only.** The record and original attachments below describe
the earlier magic/contact-only game. Its observed numbers have been preserved,
not rerun or relabeled as current survival results. See
[issue 92 survival verification](survival-verification.md) for current rules,
fresh evidence, and the outstanding human acceptance checks.

Verification date: **2026-10-11 (UTC)**. This record distinguishes executed
browser/simulation checks from human review. **Human acceptance is incomplete**:
no person has performed the two required playthroughs or listened to the sounds
in this environment. The supplied reference artwork was not included in the
checkout or issue text, so comparison against that reference is also pending.

## Environment and commands

- Node.js **22.23.2**, npm lockfile version 3, Playwright **1.64.0**.
- System Chromium **154.0.8037.92**, Debian 12, x86-64 Linux container.
- Playwright Chromium **156.0.8078.4** downloaded and tested with the same browser
  selection used by CI.
- Host reports AMD Ryzen 7 8745HS, nine exposed virtual CPUs (KVM).
- Browser runs are **headless**, one worker, 1280 × 720 viewport, 640 × 360 canvas.
  They establish an engine baseline, not representative physical desktop,
  GPU/display, speaker, or headphone verification.

`npm install --package-lock-only` regenerated the lockfile from the existing
manifest; `npm ci` installed it successfully. `npx playwright install chromium`
installed Playwright's Chromium, headless shell, and FFmpeg successfully.
`npx playwright install --with-deps chromium` was attempted but failed with
`su: Authentication failure` after requesting an administrator password. The
existing system libraries support the browser tests. CI runs the full dependency
installation on its Ubuntu runner.

| Command / environment | Observed result |
| --- | --- |
| `npm test` | 99 tests passed; zero failures |
| `npm run test:browser`, system Chromium 154.0.8037.92 | 53 tests passed; zero failures (1.7 minutes) |
| Same full suite with Playwright Chromium 156.0.8078.4 | 53 tests passed; zero failures (1.5 minutes) |
| Static host at `/sketchbook/unicorn/?seed=42` | Startup and first conversion passed using only the documented runtime files; all resources loaded within the subdirectory |
| GitHub Actions | Workflow added; no hosted CI run observed in this session |

No CI success is claimed until the hosted workflow actually runs. The workflow
uses Node 22, `npm ci`, the downloaded Chromium matching the lockfile, and both
test commands. Screenshots, JSON observations, and failure traces upload even
when a test fails.

Both final browser runs recorded zero uncaught errors, failed local requests,
or HTTP errors. Raw summaries: [system Chromium](evidence/system-browser-run.json),
[Playwright Chromium](evidence/playwright-browser-run.json), and
[static hosting](evidence/static-hosting.json). The second browser run used:

```sh
PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH="$(node --input-type=module -e "import { chromium } from '@playwright/test'; process.stdout.write(chromium.executablePath())")" npm run test:browser
```

## Executed coverage

The original 46 browser tests passed with the shared fixture. The smoke suite
also completed generated three-wave victories with keyboard events and actual
captured-pointer mouse events. Its controller reads positions to decide inputs;
it does not set player angles/health, relocate actors, remove enemies, change
scores, or bypass combat. Frame timing is controlled for these rounds and natural
defeat, so these are **automated playthroughs**, not human sessions or real-time
performance measurements.

| Check | Observed outcome / evidence |
| --- | --- |
| Startup and rendering | Start is focused; Enter starts play and focuses the canvas. Canvas pixel checks detect a blank/transparent scene. Actual screenshots captured. |
| First conversion | Space converts the introductory unicorn; score becomes 100, five remain, feedback queue drains, 24 normal stars appear. |
| Pause/resume | Escape focuses Resume, elapsed time and actors freeze, held controls clear, and Resume starts a fresh clock. |
| Mute persistence | Sources stop immediately; mute survives restart and reload. Storage failure still permits play. |
| Restart endurance | Existing app test exercises ten-plus restarts, one animation loop and audio context, cleared effects/timers/score/magic, unchanged five-shots-per-second sampled rate, and destroy cleanup. |
| Pointer-lock fallback | Promise rejection and absent capture API leave keyboard play usable; mouse firing works despite denied capture. Actual capture and Escape release are also tested. |
| Blocked shots | Simulation tests verify a unicorn behind a hedge cannot score. Browser test confirms a rainbow terminates at the north hedge without increasing score. |
| Along-hedge movement | Browser keys reach the west hedge at x ≈ 1.2, retain that x while sliding south more than one tile, and never overlap the hedge. |
| Obstacle navigation | Browser keyboard detour travels east around row 10's hedge to its north side; final collision query is false. Enemy pathfinding detours are also covered by simulation tests. |
| Loss of focus while firing | Browser tests inject blur/visibility/pointer-loss events while movement/fire are held; they verify freeze, input clearing, and explicit Resume. Real OS window/tab switching remains a human check. |
| Victory | Both automated controllers clear all 24 distinct unicorns across waves 1, 2, 3 and show Victory. Result panels support keyboard Play again. |
| Defeat | Generated enemies drain magic naturally without firing; Defeat focuses Play again, which resets the round. Additional result-state fixture tests verify frozen simulation. |
| Reduced motion | Live media preference reduces a conversion to six stars, caps particles at 24, removes rotation and weapon motion, and retains the hit indicator. Screenshot captured. |
| Seed reproduction | Browser query seeds (zero, negative/fractional, exponent, invalid/empty/Infinity) and restart/reload maps tested; simulation replays identical inputs exactly. |
| Audio | Gesture activation, source cap, pause/mute cleanup and unavailable audio tested. Offline production synthesis produces six non-silent, unclipped PCM clips; this does not establish perceived sound quality. |

## Failure detection and fixes during verification

Temporary negative probes were executed separately from the passing suite:

- Throw an uncaught error from an initialization script.
- Fetch a missing local resource (HTTP 404).
- Abort a local resource request.

All three deliberately failed with the shared browser-health assertion and exit
code 1. [Recorded probe outcomes](evidence/health-probes.json) retain those actual
results; the temporary failing spec was then removed. Every normal test attaches
its browser version and health failures as JSON. The startup smoke test also
checks the game state and error panel, detecting failures caught by the app itself.

Early harness attempts were corrected before the final run: optional video
capture required an uninstalled FFmpeg binary, so the configuration now captures
screenshots and traces without that dependency; a short mouse click could occur
between simulation frames, so the smoke test holds fire as documented; after
reload, the test now reacquires the exported game. An experiment with
`bringToFront()` did not generate real focus loss in headless Chromium and was
removed. Injected focus-transition tests remain, with their limitation stated
above. No product failure was established by those harness failures.

## Playthrough and performance evidence

Selected screenshots and raw observations are retained in `docs/evidence/`.
The final system-browser run observed the following generated rounds. The
Playwright browser run reproduced the same scores, magic, and simulated elapsed:

| Automated controls, seed 1 | Score | Remaining magic | Simulated elapsed | Conversions |
| --- | --- | --- | --- | --- |
| Keyboard | 5900 | 100 | 36.383 seconds | 24 |
| Captured mouse aim/fire with keyboard movement | 6300 | 100 | 27.283 seconds | 24 |

Raw playthroughs: [keyboard](evidence/keyboard-playthrough.json),
[mouse](evidence/mouse-playthrough.json). Both include the 24 conversion IDs and
three wave events.

The busy-burst test uses **native requestAnimationFrame timing**, continuously
replenishing **144 stars** for 180 intervals:

| Final browser run | Median | p95 | Maximum | Intervals >33 ms | Longest slow streak |
| --- | --- | --- | --- | --- | --- |
| System Chromium | 16.70 ms | 16.70 ms | 16.80 ms | 0 | 0 |
| Playwright Chromium | 16.70 ms | 16.80 ms | 16.80 ms | 0 | 0 |

Raw measurements: [system](evidence/system-busy-burst.json),
[Playwright](evidence/playwright-busy-burst.json). An earlier system run had two
isolated spikes (maximum 49.90 ms, longest streak one interval); neither final
run showed sustained slow frames. This is a container/headless baseline;
physical desktop performance is still pending.

The performance measurement reports slow intervals without a timing-dependent
CI assertion. For a representative desktop review, run the smoke performance
case with `--headed`, open the Performance panel, and record hardware/browser,
median/p95 and sustained >33 ms streaks. If slow frames persist, inspect the
renderer/effect update/draw costs and allocations, fix the bottleneck, and rerun.

## Screenshot inspection and audition artifacts

The implementation agent opened and visually inspected the actual
[playable scene](evidence/playable.png), [first conversion](evidence/conversion.png),
[busy burst](evidence/busy-burst.png), and
[reduced-motion conversion](evidence/reduced-motion-scene.png). Observed: cream
paper grain, irregular dark sprite outlines, a four-legged unicorn with rainbow
mane/tail, a rainbow crayon, rainbow firing trail, multicolored star glitter,
and readable HUD/buttons. The reduced-motion frame visibly contains a smaller
glitter cluster. This is agent screenshot inspection; **human review against
the supplied reference has not happened**.

Additional captured evidence: [title/menu](evidence/title.png),
[keyboard victory](evidence/keyboard-victory.png),
[mouse victory](evidence/mouse-victory.png), [defeat](evidence/defeat.png),
and [hedge detour](evidence/hedge-detour.png). Every browser test also produces
a screenshot in the generated report for further review.

Individual production-synthesis audition clips: [shot](evidence/audio/shot.wav),
[glitter](evidence/audio/glitter.wav), [damage](evidence/audio/damage.wav),
[new wave](evidence/audio/wave.wav), [victory](evidence/audio/victory.wav),
[defeat](evidence/audio/defeat.wav). These are mono 24 kHz, 1.2-second PCM WAVs
rendered by the browser's OfflineAudioContext using the production graph.
[Measured peak/RMS levels](evidence/audio-samples.json) establish non-silent
samples without digital clipping; neither device playback nor human listening
quality is asserted. The normal browser suite separately exercises real-time
AudioContext gesture activation and event delivery.

## Human review still required

Record reviewer name, date, OS/hardware, browser/version, seed, control approach,
score, remaining magic, and screenshots for each review. Leave every check below
unchecked until someone performs it. Failed checks require a fix and repeat run.

- [ ] Compare the playable scene and conversion frames with the supplied reference:
  sketchbook paper, hand-drawn irregular outlines, colorful rainbow-maned
  unicorns, rainbow firing and multicolored star glitter. Record the reference URL.
- [ ] Listen to **shot, glitter, damage, wave, victory, and defeat** individually,
  then in gameplay. Check distinctness, volume, harshness/clipping, and overlapping
  fire/glitter cues at a comfortable device volume. Digital sample checks alone
  are insufficient.
- [ ] Complete a fresh **keyboard-only** three-wave round using Enter to start,
  arrow turning, movement/strafe/run, Space/Ctrl firing, and Tab/Enter menus.
  Record Victory and final score; do not use developer state changes or controllers.
- [ ] Complete a fresh **mouse-assisted** three-wave round using real pointer
  capture for aim, primary-button fire, and keyboard movement. Record Victory.
- [ ] Aim at a unicorn behind a hedge and confirm no conversion through the hedge.
  Press into a hedge while strafing and navigate around an interior obstacle.
- [ ] Hold fire while switching to another application/tab; verify automatic pause,
  silence and no latched firing after returning and explicitly resuming.
- [ ] Restart **ten times**, then play normally; verify no doubled controls,
  extra shots/sounds, stale glitter, stuck mouse capture, or accumulating slowdown.
- [ ] Allow contact to exhaust magic and check Defeat/Play again. Confirm both result
  panels and Pause/Resume/Restart/Mute remain reachable by keyboard.
- [ ] Mute, restart, reload, resume, and verify silence persists; unmute and verify
  effects return. Test denied pointer capture and keyboard fallback.
- [ ] Enable reduced motion in OS/browser settings, repeat a conversion, and confirm
  fewer/slower nonrotating stars with a still weapon and visible hit feedback.
- [ ] Review a busy glitter burst on a representative **headed desktop browser**.
  Investigate sustained frame times above 33 ms and record before/after evidence.

For individual sound review, start the game and use the browser console to invoke
each production cue (one at a time, leaving at least 1.2 seconds between sounds):

```js
const { game } = await import('./main.js');
game.audio.consume([{ type: 'shot' }]);
// Repeat with glitter, damage, wave, victory, defeat.
```

Start through the actual menu first and unmute; synthesized sounds are discarded
before activation or while paused/muted. These console calls are for audition,
not for the human gameplay results. The saved WAV clips above can also be used
for audition. Headphone/speaker playback has not been observed in this environment.
