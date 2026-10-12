# Artwork resolution and unicorn movement

The live renderer uses `createVectorArt()` from `src/vector-art.js`. Its editable
SVG path strings are parsed into local `Path2D` geometry and painted with rounded
strokes, ellipses, and broad rainbow bands. There are no downloaded SVGs, image
requests, runtime dependencies, or random changes between renders.

The factory paints geometry at four times its logical design resolution, then
caches a frozen atlas. Unicorns, rear poses, cakes, armor charms, roses, decorative
props, trees, and the crayon have **512 × 640 physical pixels**, representing a
**128 × 160 logical design**. The vector hedge is 256 × 256. Paper and grass retain
their cached 64 × 64 procedural textures from the legacy factory; `stone` aliases
`rock`. Retaining `createArt()` for compatibility does not make its lower-resolution
sprites the production renderer's artwork.

This is a finite raster cache of vector sources, not vector drawing on every
frame. Normal and close distances benefit from the larger source surfaces, but
a billboard enlarged beyond the atlas resolution can still soften near the
camera plane. High-quality image interpolation smooths resizing; it cannot
create missing source detail. Screenshot captures expose this limitation for
review and do not establish human aesthetic approval.

The exposed cream rump socket remains at logical **(64, 100)**. Presentation
converts it using denominators **128 and 160**, regardless of physical atlas
size. It is drawn at the actual rear socket, 0.35 tiles opposite the unicorn's
facing, at height 0.5. A freshly emitted rose is drawn afterward at the same
point. Tests retain independently derived projection and socket expectations,
check physical atlas pixels around the anchor, and verify visible cream and
petals in rendered frames. The 70° horizontal FOV, 0.65-tile eye height, hedge
clipping, transparent margins, stable painter ordering, four legs, and horn
recognition remain enforced.

## Display resolution

The application opts into responsive canvas buffers. Each render reads the
canvas's CSS bounds and current device pixel ratio. `backingSize()` caps DPR at
**2** and uses one proportional scale to fit within **1920 × 1080** physical
pixels. It rounds to whole pixels, with a minimum of one pixel per axis.
Hidden or unchanged dimensions do not reset the buffer. Changing dimensions
resets context state, so the renderer reapplies smoothing afterward.

At CSS 640 × 360, DPR 1 produces a 640 × 360 buffer and DPR 2 produces
1280 × 720. At CSS 1100 × 618.75, DPR 2 reaches the 1920 × 1080 cap. The
floor-casting raster remains bounded at 320 × 180; it is scaled into the lower
half of the display. The canvas buffer and source atlas have separate caps.

An isolated `createRenderer(canvas)` keeps explicit dimensions unless passed
`{ responsive: true }`. Browser fixtures destroy the application and restore
640 × 360 before constructing fixed-size renderers, so literal pixel regions
continue to mean what their assertions describe. Resolution and atlas changes
do not change collision shapes, hit tests, camera angles, or simulation time.

## Seeded movement

Every production-spawn unicorn receives fresh movement state from a private
stream keyed by seed, actor ID, and `movement`. This stream does not consume the
spawn shuffle or attack stream. Typed seeds and IDs determine staggered phase
offsets, weave amplitude (0.25–0.5), frequency (0.6–1 cycles/second), and phase.
Movement updates consume no random numbers.

The cycle lasts **6.6 seconds**: pursuit for 2.4 seconds, weaving for 2.4 seconds,
and burst for 1.8 seconds. Pursuit runs at 85% of the wave speed ceiling; weaving
adds bounded lateral motion at 80%. Burst begins at 55% for 45% of its phase,
then accelerates to 100%. The ceiling is `1.2 + (wave - 1) × 0.08` tiles/second.
Neighbor separation adds a bounded nudge within 1.1 tiles. Directions are
normalized before applying speed, so lateral steering does not multiply pace.

Each tick copies the living herd before moving any actor and sorts that copy by
ID. Frozen attack actors still occupy space, and dead actors do not. Summing
separation in this stable order keeps each actor's movement independent of the
mutable array's traversal order. This contract applies to movement; projectile
IDs and simultaneous damage event priority retain their existing session order.

Blocked sight, near-contact pursuit, or a swept-body collision falls back to
the shared distance field on the same tick. Rejected steering does not partially
change position or facing. A navigation hold of `2 / max(0.01, speed)` seconds
allows centerline alignment and cardinal progress before trying steering again.
Movement clocks continue during idle fallback, but freeze during windup,
recovery, pause, and terminal states. Recovery's final tick stays frozen because
navigation runs before attack transitions. Profile-less legacy consumers keep
their existing field navigation.

## Replay and verification

Exact replay requires the same seed, tick duration, and input on every tick.
Restart rebuilds the map, spawn profiles, attack state, supplies, and clocks;
the integration suite replays complete generated victories and natural defeats,
including each state and event batch. Separate tests move players through
generated mazes, repeatedly reorder actors, and check collision and speed bounds.

Changing step sizes is different numerical integration. Midpoint sampling
reduces weaving bias but does not guarantee identical coordinates at 30, 60,
and 120 Hz. The controlled five-second open-arena comparison allows 0.12 tiles
of difference; it is not a bound for arbitrary mazes, contact, or long frames.
The production clock still uses fixed 60 Hz ticks with bounded catch-up.

Run `npm run typecheck`, `npm test`, and `npm run test:browser` for the complete
contracts. `browser/vector-art.spec.js` attaches normal (3 tiles) and close
(1.8 tiles) production artwork at actual DPR 1 and 2, with per-scene CSS/backing
sizes and browser metadata. `browser/smoke.spec.js` records combined active
entities, frame-time percentiles, and slow streaks using native animation frames.
Host timing is observational and has no CI performance threshold.

See the [fresh verification record](artwork-movement-verification-2026-10-12.md)
for results and human review status. The [survival-92 verification](survival-verification.md)
and its evidence are historical; their timing observations do not describe this
renderer.
