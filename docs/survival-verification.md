# Survival verification — issue 92

This record covers the five-health/five-armor game with rear-fired roses and
one-point supplies. The [issue 13 record](verification.md) and its attachments
remain historical; none of those old results are presented as current evidence.

**Human acceptance remains pending.** No person has supplied a review or played
the required keyboard and mouse rounds in this environment. Automated input
controllers, arranged scenarios, and agent screenshot inspection are identified
below; they cannot establish human recognition, reaction time, or balance.

## Executed run — 2026-10-11 UTC

The tested worktree is based on commit
**`14e298abc58405ef8782c7df8aa1f145591a7b79`**, on branch
`92/gpt-6.1-sol-12-document-the-new-rules-20261011-2106-7np` (base branch
`81-epic-unicorn-survival-pkc`). Tests include the uncommitted issue 92 harness
changes; this is not a claim that those changes were already committed.
[Run metadata](evidence/survival-92/run.json) records the parent commit and
SHA-256 hashes of the tested runtime/configuration/test sources and retained
artifacts, plus per-test statuses and remaining human checks. The eventual
automation-created commit is not known at capture time.

Environment: Node **22.23.2**, npm **10.9.8**, TypeScript **7.0.2**, Playwright
**1.64.0**, system Chromium **154.0.8037.92** at `/usr/bin/chromium`. Debian 12,
x86-64, KVM host reporting AMD Ryzen 7 8745HS and nine exposed virtual CPUs.
Headless, one worker, 1280 × 720 viewport and 640 × 360 canvas; narrow HUD case
uses 320 × 720. Gameplay/evidence scenarios use **seed 1**; the full suite also
exercises other URL seed forms. No downloaded-browser or hosted CI success is
claimed for this run.

Commands executed after the evidence harness changes:

```sh
npm ci
npm run typecheck
npm test
PLAYWRIGHT_JSON_OUTPUT_NAME=/tmp/unicorn-issue92-verification/final-browser-results.json npm run test:browser -- --reporter=list,json,html
```

The browser command runs the existing full suite with JSON reporting added to
the normal list/HTML reporters; it starts/stops the normal port-4174 server.
Its final run started at **21:11:59.135 UTC**, lasted **126.784 seconds**, and
completed before the artifacts were retained at **21:14:40 UTC**.

| Executed check | Observed result | Retained evidence |
| --- | --- | --- |
| Install | Five packages installed; audit reported zero vulnerabilities | [Run metadata](evidence/survival-92/run.json) |
| Typecheck | Exit 0; no diagnostics | [Command log](evidence/survival-92/typecheck.txt) |
| Node tests | 256 passed; zero failed/skipped/cancelled | [Command log](evidence/survival-92/node-tests.txt) |
| Chromium browser tests | 75 passed; zero failed/skipped/flaky | [Command log](evidence/survival-92/browser-tests.txt) |
| Browser health | 75 fixture observations; zero uncaught errors, failed local requests, or HTTP errors | [Run metadata](evidence/survival-92/run.json) |

The final suite includes point-projectile sweeps/ties/lifetime/cap, shared
invulnerability and armor-first damage, seeded supplies and collection,
attack boundaries/cancellation, pause/restart/destroy, rendered rear alignment,
occlusion, and narrow HUD bounds. New evidence checks record final armor,
combined stress counts, and a keyboard dodge. No production tuning changed.

## Generated input playthrough results

Both controllers converted 24 distinct unicorns, observed waves 1/2/3, and
reached Victory with generated gameplay state intact.

| Seed 1, automated controls | Score | Final health | Final armor | Simulated elapsed | Roses fired / accepted hits | Supplies collected |
| --- | --- | --- | --- | --- | --- | --- |
| Keyboard | 6300 | 4 / 5 | 0 / 5 | 36.383 s | 1 / 1 rose hit | 0 |
| Captured mouse + keyboard movement | 6300 | 5 / 5 | 0 / 5 | 27.283 s | 0 / 0 | 0 |

Raw observations include conversion IDs, wave events, damage, pickups, browser,
seed, and a `humanPlaytest: false` marker:
[keyboard](evidence/survival-92/keyboard-playthrough.json),
[mouse](evidence/survival-92/mouse-playthrough.json).
These stationary-clearing aim controllers do not assess exploration, human
dodging, or supply placement/usefulness. They justify no balance adjustment.

The arranged collection case restored health **4 → 5** and armor **0 → 1**,
emitting exactly one event per item. The ranged case emitted from **(6.15, 12.5,
z = 0.5)** after a full windup, then consumed armor **1 → 0** before a later
rose reduced health **5 → 4**. A post-emission keyboard strafe moved the player
0.833 tiles off the original line; the rose passed without damage and the
player retained **5 health / 1 armor**. Evidence:
[collections](evidence/survival-92/collection-events.json),
[emissions/impacts](evidence/survival-92/attack-and-impact-events.json),
[dodge](evidence/survival-92/keyboard-dodge.json).

## Combined stress result

| Active roses (min–max) | Cakes / charms (min–max each) | Stars (min–max) | Samples | Median | p95 | p99 | Maximum | >33 ms / longest streak |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 32–32 | 3–3 / 5–5 | 144–144 | 180 | 16.70 ms | 16.80 ms | 16.80 ms | 16.80 ms | 0 / 0 |

[Raw native frame intervals and workload counts](evidence/survival-92/combined-busy-performance.json)
support the rounded observations above. Method and host limits are below.
To repeat this particular workload on a headed browser:

```sh
npm run test:browser -- browser/smoke.spec.js --grep 'combined roses' --headed
```

## Fresh screenshot inspection

The implementation agent opened the actual collection, windup, emission,
in-flight, dodge, combined stress, and narrow HUD screenshots. Observed: a
rainbow-layered cake slice and star-shield charm with dark irregular outlines;
a rear-facing unicorn in windup; a pink petaled rose with green stem at the
exposed rump and then moving forward; eight supplies in the combined scene;
and health/armor badges wrapping within the 320-pixel stage. These are agent
observations of controlled screenshots, not completed human theme, recognition,
telegraph, or readability acceptance.

| Captured state | Screenshot |
| --- | --- |
| Cake and charm before collection | [Supplies](evidence/survival-92/cake-and-armor-charm.png) |
| One-point pickups reflected in HUD | [Collected](evidence/survival-92/collected-supplies-hud.png) |
| Rear exposed before emission | [Windup](evidence/survival-92/rear-windup.png) |
| Rose at the shared rump/socket origin | [Emission](evidence/survival-92/rear-origin-rose.png) |
| Rose five simulation ticks after emission | [In flight](evidence/survival-92/rose-in-flight.png) |
| Player off the fired trajectory, armor intact | [Dodge](evidence/survival-92/dodged-rose.png) |
| Roses, all supplies, maximum glitter | [Combined stress](evidence/survival-92/combined-busy-scene.png) |
| Narrow 320 × 720 health/armor HUD | [Narrow layout](evidence/survival-92/narrow-survival-hud.png) |
| Generated keyboard result | [Keyboard Victory](evidence/survival-92/keyboard-victory.png) |
| Generated mouse result | [Mouse Victory](evidence/survival-92/mouse-victory.png) |

[Narrow-layout observations](evidence/survival-92/narrow-hud-layout.json) establish
badge bounds and primary-action visibility; their human readability field is
still pending. The eight production synthesis graphs also produced non-silent,
unclipped offline samples ([peak/RMS metrics](evidence/survival-92/audio-samples.json)).
Fresh audition clips: [shot](evidence/survival-92/audio/shot.wav),
[glitter](evidence/survival-92/audio/glitter.wav),
[pickup](evidence/survival-92/audio/pickup.wav),
[rose-fired](evidence/survival-92/audio/rose-fired.wav),
[damage](evidence/survival-92/audio/damage.wav),
[wave](evidence/survival-92/audio/wave.wav),
[victory](evidence/survival-92/audio/victory.wav),
[defeat](evidence/survival-92/audio/defeat.wav). Device playback and human audition
remain unperformed.

## Evidence method and limits

Browser tests use the existing smoke attachment mechanism: `testInfo.outputPath`,
PNG screenshots, and `attachJSON` from `browser/fixtures.js`. Every test also
attaches browser health (uncaught errors, failed local requests, HTTP errors).
Selected artifacts are copied into `evidence/survival-92/` only after the full
feature verification passes. The generated `test-results/` and
`playwright-report/` contain the rest; they remain ignored runtime output.

Natural generated rounds use the production simulation and actual keyboard or
captured-pointer mouse inputs. Their automated controllers read enemy positions
to aim, hold fire, and use a controlled 60 Hz animation clock. They do not assign
health/armor, relocate actors, remove enemies, or change scores. Mouse rounds
use keyboard movement. These are automated input playthroughs, **not human
sessions or native-time performance samples**.

Survival integration scenarios deliberately arrange real entities in a cleared
map to isolate cake/charm collection, rear windup/emission, armor/health impacts,
and a keyboard strafe after firing. These checks demonstrate the mechanics;
they do not establish how useful supplies are on a naturally generated map.
Renderer tests check rear/rose pixel alignment at three canvas sizes and three
camera angles, wall occlusion, depth ties, and reduced-motion invariance.

The combined stress scene keeps the seed-1 world, six generated unicorns, the
production fixed-step loop, renderer, HUD, audio lifecycle, and **native
requestAnimationFrame**. It sets unicorn speed to zero and their initial
cooldowns to 600 seconds to avoid defeat during measurement, moves all generated
supplies into the protected spawn corridor, and replenishes moving roses and
glitter after simulation updates, before drawing. It measures 180 intervals
after 30 warmup frames with **32 roses, three cakes, five charms, and 144 stars**.
This is explicitly a synthetic combined workload, not a generated playthrough.
Percentiles use nearest rank; raw intervals and workload min/max counts are
attached. Only workload counts/state are asserted. Median/p95/p99, maximum,
intervals over 33 ms, and longest slow streak are observations, never
host-dependent CI thresholds. A short headless container sample cannot establish
physical desktop/GPU performance or long-session endurance.

## Human review to complete

Use a headed desktop browser, start through the menu, and keep all developer
controllers/state changes disabled for these playthroughs. Begin at seed 1,
then repeat any failed finding at a recorded second seed such as 42. For every
finding record reviewer/date, tested commit, seed, OS/device, browser/version,
viewport, controls, screenshot or video, expected behavior, and observed behavior.

- [ ] **Cake/rose recognition and theme:** identify cakes, star-shield charms,
  and airborne roses without consulting their internal names, both nearby and
  at gameplay distance. Confirm layered cake colors, pink rose petals/stem,
  and irregular ink/pastel outlines fit the hand-drawn scene. Record any
  confusion with flowers, unicorns, or glitter; include reference art if used.
- [ ] **Rear emission and telegraph:** observe an approaching unicorn stopping
  and exposing its rear during the full windup, then a rose visibly leaving
  that rear and continuing along its locked path. Review the emission and
  in-flight screenshots below and a real-time attack. Check whether the
  0.55-second warning can be recognized in a mixed herd before impact.
- [ ] **Dodging:** strafe/run after noticing the telegraph, rather than relying
  on enemy coordinates. Verify roses miss the new position; try hedge cover,
  mixed contact/rose attacks, and the shared grace period. Record attempts,
  successful dodges, damage source, and whether the warning felt readable.
- [ ] **Pickup usefulness:** collect a cake while hurt and a charm while below
  maximum armor. Confirm exactly one point, armor absorbing the next hit,
  full-resource items remaining, and one health restored when a later wave
  starts. Record supplies found/used/missed, travel risk, and any confusing
  feedback. The automated victories below do not use supplies.
- [ ] **Keyboard round:** complete three generated waves using keyboard turning,
  movement/strafe/run, and Space/Ctrl. Record outcome, score, final health,
  final armor, supplies used, and attacks noticed; include a result screenshot.
- [ ] **Mouse round:** complete three generated waves using real pointer capture,
  horizontal aim, primary-button fire, and keyboard movement. Record the same
  result fields, including final health and armor.
- [ ] **Narrow-screen HUD:** review 320 × 720 and a narrow desktop window with
  populated health/armor/score/combo counters. Confirm labels, wrapping, scene
  visibility, Pause/Mute access, and scrollable menu focus remain readable.
  Automated badge bounds alone do not confirm usability; touch remains unsupported.
- [ ] **Headed combined stress:** run the combined smoke case on a representative
  desktop with `--headed`, record hardware/browser and active rose/supply/star
  counts plus frame-time percentiles/streaks, and investigate persistent slow
  frames. Keep timing observations out of CI pass/fail limits.
- [ ] **Audio and lifecycle:** audition all eight clips at comfortable volume;
  check pickup/rose-fire recognition during overlap, pause/focus-loss silence,
  mute persistence, ten restarts, and reduced motion without altered hazards.

Suggested human result entry (leave unobserved fields pending):

| Reviewer/date/commit | Seed/browser/device/viewport | Controls | Outcome/score | Final health/armor | Recognition/telegraph/dodge/pickup/HUD findings | Evidence |
| --- | --- | --- | --- | --- | --- | --- |
| Pending | Pending | Keyboard | Pending | Pending | Pending | Pending |
| Pending | Pending | Mouse + keyboard movement | Pending | Pending | Pending | Pending |

Supply counts and attack tuning remain their starting values. No tuning change
is justified by these automated rounds alone. Record each human finding before
changing tuning, then rerun the relevant checks and append a dated observation.
The five-health/five-armor/one-point rules remain fixed. Do not overwrite this
run or the historical issue 13 artifacts with a later run's numbers.
