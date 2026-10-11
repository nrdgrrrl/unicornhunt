// Preserve the existing balance while making tuning independent of subsystem
// ownership. Distances are tiles, durations are seconds, and angles are radians.
export const DEFAULT_RADIUS = 0.2;
export const WALK_SPEED = 2.5;
export const RUN_MULTIPLIER = 2;
export const TURN_SPEED = Math.PI;
export const MAX_MAGIC = 100;

export const UNICORN_RADIUS = 0.25;
export const UNICORN_SPEED = 1.2;
export const WAVE_SPEED_INCREMENT = 0.08;
export const PLAYER_SPAWN_DISTANCE = 3;
export const UNICORN_SPAWN_DISTANCE = 1;
export const CONTACT_DAMAGE = 20;
export const CONTACT_INVULNERABILITY = 0.75;

export const FIRE_COOLDOWN = 0.22;
export const COMBO_WINDOW = 2;
export const MAX_COMBO = 5;
export const HIT_POINTS = 100;

// Freezing prevents one run from changing the rules of later seeded replays.
export const WAVE_COUNTS = Object.freeze([6, 8, 10]);
export const INTERMISSION_SECONDS = 2;
export const WAVE_MAGIC_BONUS = 20;

// Production and test clocks must agree on both tick size and catch-up policy.
export const STEP_SECONDS = 1 / 60;
export const MAX_CATCH_UP_STEPS = 5;

// Cosmetic particles still use physical clearance, so their radius belongs
// with other simulation radii rather than inside canvas drawing code.
export const EFFECT_PARTICLE_RADIUS = 0.025;
