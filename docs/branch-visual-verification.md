# Branch visual verification

This record covers the illustrated adult women’s faces and cartoon penis-shaped
player shots on the adult visual variant of **Unicorn Hunt**. Player hits still
resolve immediately; the visible shot animation is cosmetic. The changed attack
expression warns before rose emission. Controls, focus behavior, resource rules,
combat, geometry, timing, and meaningful live announcements retain their existing
behavior. Internal unicorn/rear/trail names remain compatibility identifiers.

Existing verification documents and files under `docs/evidence/` remain
historical records and are not evidence for this visual variant.

## Tested revision and environment

- Date: 2026-10-12 (UTC).
- Branch: `115/gpt-6.1-sol-update-branch-instruction-20261012-0306-hwp`.
- Base branch: `113-epic-adult-game-qwz`.
- Checked-out commit: `ad07953424ce3aeaf1fdf3a1bef7902ea2c11967`.
  This commit already contains both presentation implementations. Checks ran
  against that commit **plus the uncommitted issue 115 changes** to `README.md`,
  `src/hud.js`, `browser/hud.spec.js`, and `browser/effects.spec.js`. This new
  record documents that working tree; no claim is made about a later system commit.
- Platform: Linux x64, Debian 12; Node `v22.23.2`, npm `10.9.8`.
- Browser: headless Chromium `154.0.8037.92`, using `/usr/bin/chromium` through
  the repository's existing Playwright configuration; one worker, no retries.
- Suite viewport: 1280 × 720 (the narrow HUD test also uses 320 × 720).
  Additional visual inspection: 1280 × 900, with a native 640 × 360 game canvas.

The tested code/assertion files have these SHA-256 hashes so that the working-tree
qualification can be checked after the automatic commit:

| File | SHA-256 |
| --- | --- |
| `src/hud.js` | `326fd417aaa5a39b60cf49ab513532379dbbe0d11f4cd2741c4b806a4fc561f3` |
| `browser/hud.spec.js` | `f48e319d0b8bbd2a5410c055a68e772fe03baca1bbac1e9aef7a3c4263b3fe7a` |
| `browser/effects.spec.js` | `9360ef3695a6049401d783a7430624e202afc70e8e68585a775813da5728be4e` |

## Automated checks

| Command | Actual outcome |
| --- | --- |
| `npm ci` | Exit 0; 5 packages installed, 6 audited, 0 vulnerabilities |
| `npm run typecheck` | Exit 0; no diagnostics |
| `npm test` | Exit 0; 258 passed, 0 failed, 0 skipped, 0 cancelled |
| `npm run test:browser` with reporting arguments below | Exit 0; 80 passed, 0 failed, 0 skipped, 0 flaky; 133.844 seconds |

Exact commands used (no browser installation was needed because Chromium was
already installed):

```sh
npm ci
npm run typecheck
npm test > /tmp/issue115-node-tests.log 2>&1
PLAYWRIGHT_JSON_OUTPUT_NAME=/tmp/issue115-browser-results.json npm run test:browser -- --reporter=list,json,html > /tmp/issue115-browser-tests.log 2>&1
```

The browser run started at `2026-10-12T03:08:26.524Z`. All **80** generated
`browser-health.json` records contain empty failure lists: no uncaught errors,
unhandled rejections, failed local requests, or local HTTP errors were recorded.
The existing geometry, combat, timing, renderer, survival, and browser-health
assertions were retained. Only matching wording assertions changed, with added
checks for the branch description, immediate hits, initial wave announcement,
remaining-face label, unchanged product title, and complete victory announcement.
The HUD's DOM structure, listeners, focus rules, and lifecycle logic are unchanged.

### Generated playthroughs

Both existing smoke controllers used seed 1, controlled 60 Hz scheduling, and
real supported input without assigning game state. Mouse play obtained real
pointer capture. Both converted 24 distinct enemies over waves 1/2/3, with
conversion IDs confirming counts of **6, 8, and 10**:

| Controls | Final state | Score | Health | Armor | Roses fired | Simulation seconds |
| --- | --- | --- | --- | --- | --- | --- |
| Keyboard | Victory | 6300 | 4 | 0 | 1 | 36.3833 |
| Captured mouse | Victory | 6300 | 5 | 0 | 0 | 27.2833 |

These are automated playthroughs, not unassisted human rounds. The existing HUD
tests passed for Start game, Resume game, Restart game, Play again, Pause, sound
controls, Tab/Enter/Space activation, focus preservation, and meaningful live
announcements. Wave announcements use `faces remaining`, and victory announces
`All faces cleared!` with the final and best scores.

Fresh suite screenshots, health records, playthrough JSON, and WAV attachments
are in the generated `test-results/` directory; the report is in
`playwright-report/`. The JSON summary and text logs above are transient runtime
artifacts, not new historical evidence under `docs/evidence/`.

## Visual inspection

The implementation agent opened the current browser PNGs for every state below,
including the native canvas capture for small faces. This is screenshot inspection,
not a claim of human playtesting or continuous real-time visual review.

| State | Outcome |
| --- | --- |
| Startup and instructions | Inspected: Unicorn Hunt title, focused Start game, face/shot description, immediate-hit explanation, and attack-expression warning are visible. The panel remains scrollable. |
| Missed shot | Inspected after keyboard turning and firing in the generated world: a single outlined cartoon penis-shaped shot is visible; score stays 0, six enemies remain, and no glitter is emitted. |
| Successful hit | Inspected on the first firing tick: the initial face disappears, score becomes 100, remaining count becomes five, and the cosmetic shot, glitter, and hit indicator are visible together. |
| Attack windup | Inspected in the arranged scenario below: angled brows, narrowed eyes, and open mouth appear during the full 0.55-second warning; no rose is present yet. |
| Rose emission | Inspected after 33 more 60 Hz ticks: a pink rose with green stem appears at the attack mouth, then advances toward the player in the five-tick in-flight capture. |
| Pause and resume | Inspected: Resume game is focused and Restart game is visible alongside the updated instructions. Sixty paused frames leave elapsed time and the entire effects snapshot identical; Enter resumes with canvas focus. |
| Reduced motion | Inspected after applying the preference during play: the attack face and rose remain visible; a hit retains the indicator and cosmetic shot with six glitter stars. The existing suite also passes unchanged rose-trajectory and impact-tick comparisons and weapon-motion checks. |
| Faces at small projected sizes | Inspected at native canvas size: normal and attack faces project at approximately 31 × 39 and 32 × 40 pixels. Hair, eyes, lips, and the open attack mouth remain distinguishable to the agent; human recognition review remains pending. |
| No unicorn pose or rainbow shot ribbon | No unicorn body/rear pose or rainbow shot ribbon appears in the inspected normal, attack, miss, hit, or reduced-motion states. Rainbow glitter, cakes, and the existing foreground weapon remain intentional. |

Additional captures used `PORT=4175 npm start` and a temporary Playwright script,
`node /tmp/issue115-visual/capture.mjs`, with the existing browser and production
app/renderers. Startup, hit, miss, and pause use the generated seed-1 world.
The emission fixture follows the existing survival test: clear interior hedges
and decoration, retain one real enemy at `(6.5, 12.5)`, freeze its navigation,
and set its initial attack cooldown to zero. Production attack updates perform
the warning and emission. Small-face inspection arranges two real enemies at
`(14.35, 10.5)` and `(14.35, 14.5)` with idle/windup states, then renders them
through the production projector. These arranged fixtures support presentation
inspection only; the generated playthrough results above do not use them.

The temporary script's final run passed its hit, miss, pause, reduced-motion,
and browser-health assertions. PNGs and `observations.json` are in
`/tmp/issue115-visual/`; these captures and their helper are transient and are
not committed evidence. Focused startup and generated keyboard-victory previews
are staged for the preview publisher. Existing `docs/evidence/` files were neither
edited nor relabeled.

## Known follow-up outside the listed files

The canvas accessible description assigned in `src/app.js` still mentions
rainbows and unicorns. This issue's edits are limited to the specified README,
HUD text, two assertion files, and this record, so that separate description is
unchanged. A follow-up should align it with the branch artwork while retaining
the product title and focus behavior.

## Pending human checks

- Unassisted keyboard and mouse rounds, including attack-warning readability.
- Adult-face and attack-expression recognition at small projected sizes.
- Comfort and readability with reduced motion during live play.
