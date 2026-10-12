/**
 * Shared structural contracts, used through JSDoc type imports only. These
 * describe trusted in-process data, not validation of arbitrary JSON. World
 * positions/radii are in tiles, angles in radians, and durations in seconds.
 * Numeric seeds must be finite; runtime entry points enforce that constraint.
 *
 * @typedef {string | number} Seed
 * @typedef {{ x: number, y: number }} Position
 * @typedef {Position & { angle: number }} Spawn
 * @typedef {{ type: string, x: number, y: number, size: number }} Decoration
 *
 * Geometry fixtures may omit seed, spawn, and presentation decorations.
 * @typedef {{ width: number, height: number, tiles: Uint8Array,
 *   seed?: Seed, spawn?: Spawn, decorations?: Decoration[] }} World
 * @typedef {World & { seed: Seed, spawn: Spawn, decorations: Decoration[] }} GeneratedWorld
 *
 * @typedef {Spawn & SurvivalState & { radius: number, firing: boolean,
 *   fireCooldown: number }} Player
 * @typedef {Spawn & { id: string, radius: number, speed: number, alive: boolean,
 *   attack?: RangedAttackState,
 *   movement?: import('./unicorn-steering.js').MovementState }} Unicorn
 *
 * Attack timers belong to simulation. Navigation must hold position and facing
 * during windup/recovery. target is a copied aim sample; facing is locked at
 * windup start. cooldownFor measures time until another windup may begin.
 * @typedef {{ phase: 'idle' | 'windup' | 'recovery', remaining: number,
 *   cooldownFor: number, facing: number, target: Position | null }} RangedAttackState
 *
 * Shared survival contracts for player, pickups, and damage sources.
 * Health and armor are integer points in [0, 5]; zero health means defeated,
 * even if armor remains. invulnerableFor is a nonnegative duration in seconds.
 * @typedef {{ health: number, armor: number, invulnerableFor: number }} SurvivalState
 * @typedef {'health' | 'armor'} SurvivalResource
 * @typedef {'contact' | 'rose'} DamageCause
 * source identifies the unicorn or rose projectile responsible for the hit.
 * @typedef {{ cause: DamageCause, source: string }} SurvivalHit
 * Rule events have no world position; integration can attach it for feedback.
 * @typedef {SurvivalHit & { type: 'damage', amount: 1, resource: SurvivalResource,
 *   health: number, armor: number }} SurvivalDamageEvent
 * @typedef {{ state: SurvivalState, event: SurvivalDamageEvent | null }} DamageResult
 *
 * Session-owned point projectiles. z is decorative height, not a collision
 * radius; source identifies the firing unicorn and id identifies this rose.
 * nextRoseId is monotonic within a run and resets only on session restart.
 * @typedef {Position & { id: string, source: string, vx: number, vy: number,
 *   z: number, remaining: number }} RoseProjectile
 * @typedef {{ roses: RoseProjectile[], nextRoseId: number }} RoseState
 * @typedef {Position & { type: 'rose-fired', source: string, projectile: string,
 *   z: number, angle: number }} RoseFiredEvent
 * @typedef {Position & SurvivalDamageEvent} RoseDamageEvent
 * @typedef {{ roses: RoseProjectile[], state: SurvivalState,
 *   events: RoseDamageEvent[] }} RoseResult
 *
 * Collectibles: health is a rainbow cake; armor is a pastel star-shield
 * charm. The session replaces the pickup array each wave and on restart.
 * @typedef {SurvivalResource} PickupKind
 * @typedef {Position & { id: string, kind: PickupKind, radius: number }} Pickup
 * @typedef {Position & { type: 'pickup', source: string, kind: PickupKind,
 *   amount: 1, health: number, armor: number }} PickupEvent
 * @typedef {{ pickups: Pickup[], state: SurvivalState, events: PickupEvent[] }} PickupResult
 *
 * Sampled input is complete; simulation updates also accept Partial<InputFrame>.
 * Axes are in [-1, 1]; look is a consumed angle delta rather than a rate.
 * @typedef {{ forward: number, strafe: number, turn: number, look: number,
 *   fire: boolean, run: boolean }} InputFrame
 * @typedef {{ onPause?: () => void, onMute?: () => void,
 *   mouseSensitivity?: number }} InputOptions
 * @typedef {{ clear: () => void, setPaused: (value: boolean) => void,
 *   requestPointerLock: () => Promise<boolean>, sample: () => InputFrame,
 *   destroy: () => void }} InputAdapter
 *
 * Gameplay events are mutable authoritative data, discriminated by type.
 * @typedef {Position & { type: 'shot', angle: number, distance: number }} ShotEvent
 * @typedef {Position & { type: 'glitter', source: string, points: number,
 *   combo: number, score: number }} GlitterEvent
 * @typedef {Position & SurvivalDamageEvent} DamageEvent
 * @typedef {{ type: 'wave', wave: number }} WaveEvent
 * @typedef {{ type: 'victory' } | { type: 'defeat' }} ResultEvent
 * @typedef {ShotEvent | GlitterEvent | DamageEvent | WaveEvent | ResultEvent | RoseFiredEvent | PickupEvent} GameEvent
 *
 * Combat requires only this subset, so synthetic sessions need no lifecycle.
 * @typedef {{ world: World, player: Player, unicorns: Unicorn[], score: number,
 *   combo: number, elapsed: number, lastHitAt: number | null,
 *   events: GameEvent[] }} CombatState
 * @typedef {'ready' | 'playing' | 'paused' | 'won' | 'lost'} SessionState
 *
 * SessionData is a structural data contract, not a second session class.
 * @typedef {CombatState & RoseState & { seed: Seed, state: SessionState, world: GeneratedWorld,
 *   pickups: Pickup[], wave: number, intermissionRemaining: number, readonly remaining: number }} SessionData
 *
 * @typedef {'title' | 'playing' | 'paused' | 'victory' | 'defeat'} HUDState
 * HUD snapshots contain frozen scalar copies, never aliases of mutable session data.
 * @typedef {Readonly<{ state: HUDState, score: number, bestScore: number,
 *   health: number, maxHealth: number, armor: number, maxArmor: number,
 *   wave: number, remaining: number, combo: number, muted: boolean,
 *   audioUnavailable: boolean }>} HUDSnapshot
 * @typedef {{ onStart: () => void, onResume: () => void, onRestart: () => void,
 *   onPause: () => void, onMute: () => void }} HUDActions
 * @typedef {{ update: (snapshot: HUDSnapshot) => void, destroy: () => void }} HUD
 *
 * Effects snapshots contain frozen copies, never aliases of mutable state.
 * colorIndex is an index into the presentation's six-color rainbow palette.
 * @typedef {Readonly<Position & { z: number, age: number, vx: number, vy: number,
 *   vz: number, colorIndex: number, rotation: number }>} EffectParticle
 * @typedef {Readonly<ShotEvent & { age: number }>} EffectTrail
 * @typedef {Readonly<{ particles: readonly EffectParticle[], trails: readonly EffectTrail[],
 *   hitFor: number, damageFor: number, reducedMotion: boolean }>} EffectsSnapshot
 *
 * Projection positions/spans are in screen pixels; depth is camera-forward tiles.
 * Each visible span ends exclusively at x + width.
 * @typedef {{ width: number, height: number, focal: number, camera: Spawn,
 *   cosine: number, sine: number }} CameraFrame
 * @typedef {{ x: number, width: number }} ProjectionSpan
 * @typedef {Position & { depth: number, scale: number }} ScreenPosition
 * @typedef {ScreenPosition & { visibleSpans: ProjectionSpan[] }} ProjectionResult
 */

export {};
