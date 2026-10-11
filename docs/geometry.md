# Geometry contracts

Production collision, visibility, and navigation consumers import queries from
`src/geometry.js`. World generation and tile constants belong to `src/world.js`.
The facade directly re-exports the hedge primitives from `world.js`, preserving
their algorithms and function identities for compatibility. `world.js` does not
import the facade. The only production ray-circle intersection implementation
is `geometry.rayCircleDistance`.

## Coordinates and inputs

Positions, radii, ray distances, and movement deltas use world tile units. The
world's positive y axis points down. Tile queries take integer cell coordinates;
convert continuous positions with `Math.floor`. Only `EMPTY` tiles are walkable,
and decorations have no collision geometry. `isSolid` treats invalid cell
coordinates and cells outside the map as solid.

Position and direction components must be finite. Geometry radii must be finite
and nonnegative; omitted clearance, movement, and field radii use
`DEFAULT_RADIUS`. Invalid position components throw `TypeError`, and invalid
radii throw `RangeError`.

## Visibility and ray intersections

`raycast(world, origin, direction, maxDistance)` normalizes its direction once,
so the returned distance is along the ray in tiles regardless of direction
magnitude. `maxDistance` is nonnegative and finite or `Infinity` (the default).
The result includes `hit`, `distance`, the endpoint `x`/`y`, hit cell coordinates,
and a surface `normal`. A miss ends at the limit and has null cell coordinates.
A ray starting in solid geometry hits at distance zero; otherwise a zero
direction misses at the origin. At an exact grid corner, either adjacent hedge
blocks the ray. A hedge at the segment endpoint also blocks it, allowing for
floating-point roundoff.

`hasLineOfSight(world, from, to)` uses that same hedge ray geometry over the
segment between the positions. It tests a centerline with no actor radius.
Navigation needs clearance for a moving circle's swept radius; a clear line of
sight does not establish enough space to move that circle along it.

`rayCircleDistance(origin, direction, circle)` normalizes its direction once and
returns the first forward intersection in tiles, or `Infinity` on a miss. Ray
tangency counts as a hit, including tiny floating-point differences at the
tangent surface. A circle containing or touching the muzzle is hit at zero;
rear circles are ignored unless they overlap the muzzle. A zero direction
returns `Infinity`, even for an overlapping circle.

Combat passes the raw cosine/sine direction to both primitives. It chooses the
nearest living unicorn by intersection distance, with the first unicorn winning
an equal unicorn tie. Hedges win equal or roundoff-close wall/unicorn ties. This
tie policy belongs to combat, rather than to the individual intersection queries.

## Circle clearance and movement

`circleCollides(world, position, radius)` checks the circle at its exact world
position against full hedge tiles and map boundaries. Overlap is blocked; exact
wall tangency is allowed. A zero-radius point uses its floored cell's solidity.
Actor-to-actor tangency instead counts as contact in unicorn gameplay, which
also requires line of sight to prevent damage through hedges.

`moveCircle(world, position, delta, radius)` returns a new position without
mutating its inputs. It uses bounded, axis-separated substeps and contact search
to slide along walls without tunneling through hedge tiles. Each call caps
displacement at 64 tiles and performs at most 512 substeps. An initially
overlapping circle stays put; movement does not repair an invalid spawn.

## Distance fields and navigation

`buildDistanceField(world, target, radius)` builds cardinal BFS distances to the
center of the target's floored tile using the actor's radius for clearance.
It returns `width`, `height`, `radius`, integer `target` cell coordinates, and a
row-major `Float64Array` named `distances`. Distances count tile steps, rather
than straight-line distance. Solid, unreachable, and insufficiently clear cells
contain `Infinity`; a blocked or out-of-bounds target produces an entirely
unreachable field.

`distanceAt(field, tileX, tileY)` provides bounds-safe access. Invalid,
fractional, and out-of-bounds cells return `Infinity`, so x coordinates cannot
wrap into another row. `nextDistanceCell(field, tileX, tileY)` returns the first
lower-distance cardinal cell in deterministic **right, left, down, up** order.
It returns integer coordinates or `null` at the target, at invalid/unreachable
cells, or when no descending neighbor exists. Neither query mutates the field.

The field describes radius-aware routes between cell centers. Steering remains
the actor's responsibility: unicorns align with the current cell's centerline
before turning, then use `moveCircle` to enforce clearance while moving. Within
the target cell they steer toward the player's exact position.

Spawn safety requires both field reachability and `circleCollides` clearance at
the exact candidate position. These checks are complementary: the introductory
unicorn can be off-center, and a reachable cell center does not guarantee that
this off-center circle clears a nearby hedge. Spawn separation and the
introductory unicorn's visibility remain gameplay rules.

## Field freshness

`assertDistanceField(field, world, target, radius)` validates trusted fields
against world dimensions, the target's floored tile, and the exact actor radius.
Mismatches throw `RangeError`. Moving the target within the same tile is valid;
an entirely unreachable field for a blocked target is also valid.

Fields are snapshots. Validation does not check world identity, compare tile
contents, track mutation versions, or validate arbitrary field storage. A field
from another world of the same dimensions can pass validation. Rebuild after
any tile change, target tile change, or actor radius change; matching metadata
alone cannot establish freshness. `updateUnicorns` builds one field for the group
when none is supplied. A caller sharing a field must rebuild it when needed.

## Rendering and independent expectations

The renderer queries hedges with `geometry.raycast`, then converts each ray's
along-ray distance to perpendicular camera depth with `perpendicularDepth`.
Wall projection, billboard spans, and effects use the resulting per-column
depth buffer for clipping. Retaining that conversion avoids fisheye distortion
and keeps presentation occlusion consistent with combat's hedge geometry.
Effects particles also use `geometry.moveCircle` for wall clearance.

Tests retain independently derived geometry oracles and hard-coded gameplay and
pixel expectations. Consumer migration must preserve hedge ties, corner
occlusion, tangency, anti-tunneling, spawn safety, and seeded replay behavior;
changed expectations require investigation rather than replacement.
