# Artwork and movement verification — 2026-10-12

This run tests HEAD **`1cf6b5b56cf38fec61368df4d4988812e1e23c8a` plus the uncommitted issue 108
implementation** on branch `108/gpt-6.1-sol-verify-artwork-sharpness--20261011-2356-8xy`.
The commit made afterward by workflow automation is not claimed as the tested
commit. [Run metadata and SHA-256 source manifest](evidence/artwork-movement-2026-10-12/verification-run.json)
identify the actual tested source files, environment, seeds, and observations.

Environment: Node v22.23.2, Playwright 1.64.0, headless Chromium
154.0.8037.92, Linux x64 (7.0.0-38-generic). The host reports
AMD Ryzen 7 8745HS w/ Radeon 780M Graphics, 9 logical CPUs and
4 available to this process. These are host
observations, not a representative headed desktop benchmark. The final browser
run began at 2026-10-12T00:06:53.969Z; evidence was collected at
2026-10-12T00:14:57.775371+00:00.

## Commands and results

```sh
npm ci
npm run typecheck
npm test
PLAYWRIGHT_JSON_OUTPUT_FILE=docs/evidence/artwork-movement-2026-10-12/browser-report.json npm run test:browser -- --reporter=list,html,json
```

| Check | Actual result | Evidence |
| --- | --- | --- |
| Typecheck | Exit 0 | [Log](evidence/artwork-movement-2026-10-12/typecheck.txt) |
| Complete Node suite | 269 passed, 0 failed; 4.61 s | [Log](evidence/artwork-movement-2026-10-12/node-tests.txt) |
| Complete browser suite | 87 passed, 0 failed, 0 skipped, 0 retries; 480.65 s | [Log](evidence/artwork-movement-2026-10-12/browser-tests.txt), [report](evidence/artwork-movement-2026-10-12/browser-report.json) |
| Browser health | 87 checks; no uncaught errors, unhandled rejections, failed local requests, or HTTP errors | [Checks](evidence/artwork-movement-2026-10-12/browser-health.json) |

An earlier full-suite attempt exceeded the old 30-second deadline in the
existing ten-restart lifecycle test. It was stopped after 37 passes, one timeout,
and one interruption, with 48 tests not run. Its [log](evidence/artwork-movement-2026-10-12/browser-attempt-1.txt)
and [report](evidence/artwork-movement-2026-10-12/browser-attempt-1.json) are retained. The same lifecycle
assertions now have 90 seconds for 660 responsive renders, and pass in the final
run. Generated playthroughs have 240 seconds and combined stress has 90 seconds;
these deadlines allow functional verification on software-rendered hosts and
are not frame-time performance thresholds.

## Production artwork captures

Each image contains four production-renderer panels: front unicorn, rear pose
with a newly emitted rose, health cake plus armor charm, and an airborne rose.
The foreground crayon appears in every panel. Seed is **1**; viewport is
1320 × 900 CSS pixels. Only the clearing and camera distances are arranged;
renderer drawing uses the actual cached vector surfaces. Rear emission and
in-flight advancement use the production attack/projectile code. Metadata
includes browser version, actual DPR, scene contents, CSS bounds, backing sizes,
and the finite 512 × 640 sprite atlas.

| Distance | Actual DPR | CSS per panel | Backing per panel | Evidence |
| --- | --- | --- | --- | --- |
| Normal, 3 tiles | 1 | 640 × 360 | 640 × 360 | [Screenshot](evidence/artwork-movement-2026-10-12/artwork-normal-dpr-1.png), [metadata](evidence/artwork-movement-2026-10-12/artwork-normal-dpr-1.json) |
| Normal, 3 tiles | 2 | 640 × 360 | 1280 × 720 | [Screenshot](evidence/artwork-movement-2026-10-12/artwork-normal-dpr-2.png), [metadata](evidence/artwork-movement-2026-10-12/artwork-normal-dpr-2.json) |
| Close, 1.8 tiles | 1 | 640 × 360 | 640 × 360 | [Screenshot](evidence/artwork-movement-2026-10-12/artwork-close-dpr-1.png), [metadata](evidence/artwork-movement-2026-10-12/artwork-close-dpr-1.json) |
| Close, 1.8 tiles | 2 | 640 × 360 | 1280 × 720 | [Screenshot](evidence/artwork-movement-2026-10-12/artwork-close-dpr-2.png), [metadata](evidence/artwork-movement-2026-10-12/artwork-close-dpr-2.json) |

The close distance of 1.8 tiles keeps ground-level supplies inside the horizontal
camera view. More extreme near-plane enlargement can still soften finite raster
edges or crop artwork at the screen boundary. These are inspectable screenshots,
not automated human aesthetic approval. Pixel tests enforce transparent margins,
repeatable surfaces, colors, four separate legs, a visible horn, and a 4 × 4
physical-pixel cream region at the logical rump socket. Existing independent
128/160 socket calculations, hedge occlusion, painter ordering, FOV, and eye
height assertions remain in force.

## Combined stress observations

Both native-animation-frame samples use seed **1**, a 1280 × 720 CSS viewport,
30 warmup frames, and 180 measured intervals. Every measured sample reports
**6 living unicorns, 32 active roses, 3 health supplies, 5 armor supplies, and
144 glitter particles** (identical minimum and maximum counts). The unicorns
are held stationary with deferred attacks to keep the synthetic sample playing;
roses and glitter are replenished through the existing feedback helper. This
fixture is not a balance test or a natural playthrough.

| DPR | CSS client dimensions¹ | Backing | Median ms | p95 ms | p99 ms | Maximum ms | >33 ms count / longest streak |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 1100 × 619 | 1100 × 619 | 50.00 | 66.60 | 66.70 | 66.80 | 180 / 180 |
| 2 | 1100 × 619 | 1920 × 1080 | 116.70 | 133.40 | 133.40 | 150.00 | 180 / 180 |

Both samples show persistent slow frames on this headless host: all 180
intervals exceeded 33 ms, forming uninterrupted slow streaks. The larger DPR 2
buffer increased the observed median from 50 ms to 116.7 ms. Representative
headed profiling remains pending before drawing desktop performance conclusions.

¹ The stress helper records integer `clientWidth`/`clientHeight`; the stage's
16:9 content bounds are 1100 × 618.75 CSS pixels. Artwork metadata uses precise
`getBoundingClientRect()` bounds instead.

See [DPR 1 raw intervals and active counts](evidence/artwork-movement-2026-10-12/combined-busy-performance-dpr-1.json),
[DPR 2 raw intervals and active counts](evidence/artwork-movement-2026-10-12/combined-busy-performance-dpr-2.json),
and their [DPR 1](evidence/artwork-movement-2026-10-12/combined-busy-scene-dpr-1.png) /
[DPR 2](evidence/artwork-movement-2026-10-12/combined-busy-scene-dpr-2.png) screenshots. These elapsed frame
intervals include browser scheduling and the whole application; they are not
isolated renderer CPU timings. Slow frames and streaks are observations for
headed investigation, with no host-dependent CI pass/fail limits. No timing from
`docs/evidence/survival-92/` is reused as an upgraded-renderer result.

## Gameplay integration

Production movement tests cover seed/ID-derived profiles, all three movement
phases, speed bounds, swept collision fallback, maze navigation, moving targets,
and per-ID state when traversal order changes every tick. Session tests use
seed **0** for naturally occurring windup/recovery clock freezing and pause,
and seed **42** for full generated victory and natural-defeat restart replay.
They compare every fixed-tick state and event batch without replacing generated
entities. Exact replay applies to equal input ticks; the separate five-second
30/60/120 Hz steering check is a bounded numerical approximation, not exact
replay at different step sizes.

The complete browser suite also retains real keyboard and captured-mouse
three-wave victories, attacks, dodging, supply collection, pause/resume,
restart, natural defeat, audio, input, lifecycle, and reduced-motion coverage.
The automated round controllers read positions to aim and do not represent
human playtesting. Both browser victories use seed **1** and convert all
24 generated actors:

| Controls | Result | Score | Health / armor | Simulation time | Roses fired | Evidence |
| --- | --- | --- | --- | --- | --- | --- |
| Keyboard | victory | 5900 | 4 / 0 | 36.38 s | 1 | [JSON](evidence/artwork-movement-2026-10-12/keyboard-playthrough.json), [result](evidence/artwork-movement-2026-10-12/keyboard-victory.png) |
| Mouse | victory | 6300 | 5 / 0 | 27.28 s | 0 | [JSON](evidence/artwork-movement-2026-10-12/mouse-playthrough.json), [result](evidence/artwork-movement-2026-10-12/mouse-victory.png) |

The [natural defeat screenshot](evidence/artwork-movement-2026-10-12/defeat.png) comes from the existing
unmodified survival progression, rather than assigned zero health.

## Separate human review

| Review | Status | Needed evidence |
| --- | --- | --- |
| Illustrated theme and normal/close aesthetic sharpness at DPR 1/2 | Pending | Human reviewer, date, browser/device, and findings on the four images |
| Unicorn, cake, charm, rose, crayon, and rear telegraph recognition during play | Pending | Human keyboard/mouse round and recognition findings |
| Representative headed combined stress | Pending | Desktop hardware/browser, active counts, frame percentiles, and slow streak investigation |
| Controls, dodge timing, audio, and narrow-screen usability | Pending | Human round outcome and observations from the survival review checklist |

Automated recognition/pixel checks passing does not mark any human review
complete. [Artwork and movement contracts](artwork-movement.md) describe the
implemented sources, resolution caps, fallback, clock order, and raster limits.
The [survival-92 record](survival-verification.md) and all historical evidence
remain unchanged.
