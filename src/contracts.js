/**
 * Shared, type-only data vocabulary for simulation and presentation modules.
 * Import types with JSDoc import('./contracts.js').TypeName at module boundaries.
 * These structural contracts do not validate arbitrary JSON or replace runtime
 * checks. Coordinates/distances are in world tiles, angles in radians, and time
 * in seconds unless a field explicitly specifies another unit.
 */

/**
 * Strings and finite numbers are supported, including numeric zero. JSDoc's
 * number type cannot express finiteness; existing runtime checks enforce it.
 * @typedef {string | number} Seed
 */

/**
 * A finite two-component position, displacement, or direction vector.
 * @typedef {Object} Vec2
 * @property {number} x
 * @property {number} y
 */

/**
 * A horizontal pose. Angle zero faces east; positive turns face toward +y in
 * the world's y-down plane. There is no pitch or vertical movement.
 * @typedef {Vec2 & { angle: number }} Spawn
 */

/**
 * Visual decoration with no collision geometry.
 * @typedef {Object} Decoration
 * @property {'mushroom' | 'stone' | 'flower'} type
 * @property {number} x
 * @property {number} y
 * @property {number} size World-space radius (half the rendered height).
 */

/**
 * Shared geometry contract, including synthetic fixtures. Only tile value 0
 * (EMPTY) is walkable; value 1 is HEDGE, and other values are treated as solid.
 * @typedef {Object} World
 * @property {number} width Positive integer tile count.
 * @property {number} height Positive integer tile count.
 * @property {Uint8Array} tiles Row-major cells: tiles[y * width + x].
 * @property {Decoration[]} decorations
 * @property {Seed} [seed] Optional fixture metadata.
 * @property {Spawn} [spawn] Optional fixture metadata; geometry needs no spawn.
 */

/**
 * createWorld always supplies both seed and spawn. Refining World keeps them
 * required for generated worlds without imposing them on geometry fixtures.
 * @typedef {World & { seed: Seed, spawn: Spawn }} GeneratedWorld
 */

/**
 * Authoritative mutable player state.
 * @typedef {Object} Player
 * @property {number} x
 * @property {number} y
 * @property {number} angle Heading wrapped to [0, 2 * PI).
 * @property {number} radius Positive collision radius in tiles.
 * @property {boolean} firing Held fire intent for the current tick.
 * @property {number} magic Remaining magic points, from 0 to 100.
 * @property {number} invulnerableFor Remaining shared contact immunity, seconds.
 * @property {number} fireCooldown Remaining time until the next shot, seconds.
 */

/**
 * Authoritative mutable actor. Conversion sets alive=false immediately, before
 * the session removes the actor; dead actors cannot move, damage, or score.
 * @typedef {Object} Unicorn
 * @property {string} id Generated IDs use "wave:index"; fixtures may use any string.
 * @property {number} x
 * @property {number} y
 * @property {number} radius Positive collision/hit radius in tiles.
 * @property {number} speed Movement rate in tiles per second.
 * @property {number} angle Heading in radians (not necessarily wrapped).
 * @property {boolean} alive
 */

/**
 * Complete sampled input, including idle frames. Positive forward moves ahead;
 * positive strafe/turn move/turn right. Sample once per simulation tick so a
 * consumed mouse delta is not applied again.
 * @typedef {Object} InputFrame
 * @property {number} forward Dimensionless axis in [-1, 1].
 * @property {number} strafe Dimensionless axis in [-1, 1].
 * @property {number} turn Dimensionless axis in [-1, 1], scaled by turn rate/time.
 * @property {number} look Sensitivity-scaled horizontal delta in radians, not a rate.
 * @property {boolean} fire Held fire intent.
 * @property {boolean} run Held run intent.
 */

/**
 * Simulation updates also accept partial input, including {}. Omitted axes and
 * look default to zero; omitted fire/run default to false. Supplied axes/look
 * must be finite; movement/turn axes are clamped to [-1, 1] by updatePlayer.
 * @typedef {Partial<InputFrame>} SimulationInput
 */

/**
 * Authoritative lifecycle; intermission remains playing with a separate timer.
 * @typedef {'ready' | 'playing' | 'paused' | 'won' | 'lost'} SimulationState
 */

/**
 * HUD lifecycle: ready maps to title, won to victory, and lost to defeat.
 * Application initialization failures use a separate error UI, not a HUD state.
 * @typedef {'title' | 'playing' | 'paused' | 'victory' | 'defeat'} PresentationState
 */

/**
 * One instantaneous shot, including misses; distance ends at the target or wall.
 * @typedef {Object} ShotEvent
 * @property {'shot'} type
 * @property {number} x Muzzle world position.
 * @property {number} y Muzzle world position.
 * @property {number} angle Shot heading in radians.
 * @property {number} distance Ray distance in tiles, including zero.
 */

/**
 * Conversion feedback recorded before the dead unicorn leaves the session.
 * @typedef {Object} GlitterEvent
 * @property {'glitter'} type
 * @property {string} source Converted unicorn ID.
 * @property {number} x Unicorn world position.
 * @property {number} y Unicorn world position.
 * @property {number} points Points awarded for this conversion.
 * @property {number} combo Combo multiplier after this hit, from 1 to 5.
 * @property {number} score Total score after this hit.
 */

/**
 * Contact damage after the player's magic has been reduced.
 * @typedef {Object} DamageEvent
 * @property {'damage'} type
 * @property {string} source Contacting unicorn ID.
 * @property {number} amount Magic points lost, capped by available magic.
 * @property {number} magic Remaining magic points after damage.
 * @property {number} x Player world position.
 * @property {number} y Player world position.
 */

/**
 * @typedef {Object} WaveEvent
 * @property {'wave'} type
 * @property {number} wave Wave just started, a positive integer (currently 1–3).
 */

/** @typedef {{ type: 'victory' }} VictoryEvent */
/** @typedef {{ type: 'defeat' }} DefeatEvent */

/**
 * Authoritative events are a discriminated union keyed by type. Full gameplay
 * payloads are required even when a presentation consumer reads only a subset.
 * @typedef {ShotEvent | GlitterEvent | DamageEvent | WaveEvent | VictoryEvent | DefeatEvent} GameEvent
 */

/**
 * Mutable queue owned by the simulation. drainEvents removes queued entries
 * once and returns a fresh array that all feedback consumers can share.
 * @typedef {GameEvent[]} EventBatch
 */

/**
 * Minimal mutable state consumed by updateCombat. No wave lifecycle or session
 * methods are required, so lightweight combat fixtures satisfy this contract.
 * @typedef {Object} CombatState
 * @property {World} world
 * @property {Player} player
 * @property {Unicorn[]} unicorns
 * @property {number} score Total earned points, initially zero.
 * @property {number} combo Active multiplier, from 0 (none) to 5.
 * @property {number} elapsed Simulation time since reset, seconds.
 * @property {number | null} lastHitAt Simulation time of last conversion; null before any hit.
 * @property {EventBatch} events Undrained authoritative gameplay events.
 */

/**
 * Structural authoritative data contract implemented by GameSession, not a
 * second session class or a persistence/JSON format. Lifecycle methods remain
 * on GameSession; this contract describes its data and computed remaining count.
 * @typedef {CombatState & {
 *   seed: Seed,
 *   state: SimulationState,
 *   world: GeneratedWorld,
 *   wave: number,
 *   intermissionRemaining: number
 * } & Readonly<{ remaining: number }>} SessionData
 * wave is a positive integer (currently 1–3); intermissionRemaining is seconds
 * until the next wave, zero otherwise; remaining counts living unicorns.
 */

/**
 * Presentation data supplied by the app to HUD.update. It contains counters
 * and preferences rather than mutable actors, geometry, or session methods.
 * Readonly expresses consumer ownership; the HUD snapshot is not runtime frozen.
 * @typedef {Readonly<{
 *   state: PresentationState,
 *   score: number,
 *   bestScore: number,
 *   magic: number,
 *   wave: number,
 *   remaining: number,
 *   combo: number,
 *   muted: boolean,
 *   audioUnavailable: boolean
 * }>} HudSnapshot
 * score/bestScore are points; magic is 0–100; wave is 1–3; remaining is a
 * nonnegative actor count; combo is 0–5. Audio unavailable selects silent mode.
 */

/**
 * A normalized-direction raycast result. Misses have null tile coordinates;
 * normal is the wall-facing unit axis vector, or {x: 0, y: 0} for no face.
 * @typedef {Object} RaycastResult
 * @property {boolean} hit
 * @property {number} distance Ray length in tiles.
 * @property {number} x World endpoint.
 * @property {number} y World endpoint.
 * @property {number | null} tileX Integer hit cell x, including out-of-map cells.
 * @property {number | null} tileY Integer hit cell y, including out-of-map cells.
 * @property {Vec2} normal
 */

/**
 * Cardinal navigation distances with actor-specific collision clearance.
 * @typedef {Object} DistanceField
 * @property {number} width Integer tile count.
 * @property {number} height Integer tile count.
 * @property {Float64Array} distances Row-major tile steps; Infinity means unreachable.
 * @property {Vec2} target Integer target cell coordinates, not world position.
 * @property {number} radius Collision clearance in tiles.
 */

/**
 * Camera data copied for one viewport; camera never aliases the mutable player.
 * @typedef {Object} CameraFrame
 * @property {number} width Viewport width in pixels.
 * @property {number} height Viewport height in pixels.
 * @property {number} focal Focal length in pixels.
 * @property {Spawn} camera Copied horizontal pose.
 * @property {number} cosine Cosine of camera.angle.
 * @property {number} sine Sine of camera.angle.
 */

/**
 * Input to projection. z is height above ground (default 0.5 tiles); size is the
 * horizontal footprint radius including transparent margins (default 0.1 tiles).
 * @typedef {Vec2 & { z?: number, size?: number }} ProjectionPoint
 */

/**
 * Screen position before wall/viewport clipping; position returns null before
 * the 0.08-tile near plane or when no camera frame exists.
 * @typedef {Object} ProjectedPosition
 * @property {number} x Horizontal pixel coordinate.
 * @property {number} y Vertical pixel coordinate.
 * @property {number} depth Camera-forward distance in tiles, not ray length.
 * @property {number} scale Pixels per world tile.
 */

/**
 * One visible horizontal interval [x, x + width), clipped to the viewport.
 * @typedef {Object} ProjectionSpan
 * @property {number} x Integer starting pixel column.
 * @property {number} width Positive integer number of visible pixel columns.
 */

/**
 * project returns this result or null when no footprint is visible. Spans are
 * ordered, nonoverlapping, and nonempty; equal wall depth is occluded.
 * @typedef {ProjectedPosition & { visibleSpans: ProjectionSpan[] }} ProjectionResult
 */

/**
 * One lower-half floor raster row: first world sample and per-column increments.
 * @typedef {Object} FloorRow
 * @property {number} depth Camera-forward distance in tiles.
 * @property {number} x First sample world position.
 * @property {number} y First sample world position.
 * @property {number} stepX World tiles per raster column.
 * @property {number} stepY World tiles per raster column.
 */

/**
 * Copied, frozen particle record for presentation. colorIndex selects one of
 * six renderer palette colors; no CSS color or browser object enters the state.
 * @typedef {Readonly<{
 *   x: number, y: number, z: number,
 *   vx: number, vy: number, vz: number,
 *   age: number, colorIndex: number, rotation: number
 * }>} ParticleSnapshot
 * x/y/z are world tiles, velocities are tiles per second, age is seconds,
 * rotation is radians, and colorIndex is an integer from 0 to 5.
 */

/**
 * Copied, frozen shot ribbon; retains scalar shot data with a visual age.
 * @typedef {Readonly<ShotEvent & { age: number }>} TrailSnapshot
 * age is seconds since consumption; distance is the shot's ray length in tiles.
 */

/**
 * Immutable presentation snapshot: outer record, copied arrays, and every
 * copied particle/trail are frozen. Later effects updates cannot change it.
 * @typedef {Readonly<{
 *   particles: ReadonlyArray<ParticleSnapshot>,
 *   trails: ReadonlyArray<TrailSnapshot>,
 *   hitFor: number,
 *   damageFor: number,
 *   reducedMotion: boolean
 * }>} EffectsSnapshot
 * hitFor/damageFor are remaining indicator durations in seconds. reducedMotion
 * is the presentation preference captured when the snapshot was made.
 */

export {};
