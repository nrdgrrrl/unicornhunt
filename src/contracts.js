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
 * @typedef {Spawn & { radius: number, firing: boolean, magic: number,
 *   invulnerableFor: number, fireCooldown: number }} Player
 * @typedef {Spawn & { id: string, radius: number, speed: number, alive: boolean }} Unicorn
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
 * @typedef {Position & { type: 'damage', source: string, amount: number,
 *   magic: number }} DamageEvent
 * @typedef {{ type: 'wave', wave: number }} WaveEvent
 * @typedef {{ type: 'victory' } | { type: 'defeat' }} ResultEvent
 * @typedef {ShotEvent | GlitterEvent | DamageEvent | WaveEvent | ResultEvent} GameEvent
 *
 * Combat requires only this subset, so synthetic sessions need no lifecycle.
 * @typedef {{ world: World, player: Player, unicorns: Unicorn[], score: number,
 *   combo: number, elapsed: number, lastHitAt: number | null,
 *   events: GameEvent[] }} CombatState
 * @typedef {'ready' | 'playing' | 'paused' | 'won' | 'lost'} SessionState
 *
 * SessionData is a structural data contract, not a second session class.
 * @typedef {CombatState & { seed: Seed, state: SessionState, world: GeneratedWorld,
 *   wave: number, intermissionRemaining: number, readonly remaining: number }} SessionData
 *
 * @typedef {'title' | 'playing' | 'paused' | 'victory' | 'defeat'} HUDState
 * @typedef {{ state: HUDState, score: number, bestScore: number, magic: number,
 *   wave: number, remaining: number, combo: number, muted: boolean,
 *   audioUnavailable: boolean }} HUDSnapshot
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
