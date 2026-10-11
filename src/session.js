import { createWorld } from './world.js';
import { createPlayer, updatePlayer } from './player.js';
import { spawnUnicorns, updateUnicorns } from './unicorn.js';
import { updateCombat } from './combat.js';
import { MAX_MAGIC, WAVE_COUNTS, INTERMISSION_SECONDS, WAVE_MAGIC_BONUS } from './config.js';

// Existing session imports remain valid while configuration owns the values.
export { WAVE_COUNTS, INTERMISSION_SECONDS, WAVE_MAGIC_BONUS } from './config.js';

/**
 * Authoritative, browser-independent simulation. Time is in seconds; callers
 * supply one fresh input frame per fixed step and drain events for feedback.
 * Construction prepares a ready world. Restart begins a clean run with the
 * same seed by default, so identical inputs reproduce the map and gameplay.
 */
export class GameSession {
  constructor(seed = 1) {
    this.#reset(seed);
  }

  #reset(seed) {
    const world = createWorld(seed);
    const player = createPlayer(world.spawn);
    const unicorns = spawnUnicorns(world, player, WAVE_COUNTS[0], 1);
    this.seed = seed;
    this.state = 'ready';
    this.world = world;
    this.player = player;
    this.unicorns = unicorns;
    this.wave = 1;
    this.intermissionRemaining = 0;
    this.elapsed = 0;
    this.score = 0;
    this.combo = 0;
    this.lastHitAt = null;
    this.events = [];
  }

  get remaining() {
    return this.unicorns.filter(unicorn => unicorn.alive).length;
  }

  start() {
    if (this.state === 'ready') {
      this.state = 'playing';
      this.events.push({ type: 'wave', wave: this.wave });
    }
    return this;
  }

  pause() {
    if (this.state === 'playing') this.state = 'paused';
    return this;
  }

  resume() {
    if (this.state === 'paused') this.state = 'playing';
    return this;
  }

  restart(seed = this.seed) {
    this.#reset(seed);
    return this.start();
  }

  #finish(state) {
    this.state = state;
    this.intermissionRemaining = 0;
    this.events.push({ type: state === 'won' ? 'victory' : 'defeat' });
  }

  update(seconds, input = {}) {
    if (!Number.isFinite(seconds) || seconds < 0) {
      throw new RangeError('Session update time must be finite and nonnegative.');
    }
    if (this.state !== 'playing') return this;
    // Defeat takes precedence over a cleared wave or its magic restoration.
    if (this.player.magic <= 0) {
      this.player.magic = 0;
      this.#finish('lost');
      return this;
    }

    const betweenWaves = this.intermissionRemaining > 0;
    this.elapsed += seconds;
    updatePlayer(this.player, this.world, input, seconds);
    updateCombat(this);
    // Combat publishes conversion data before dead actors leave the world.
    this.unicorns = this.unicorns.filter(unicorn => unicorn.alive);
    this.events.push(...updateUnicorns(this.unicorns, this.world, this.player, seconds));

    if (this.player.magic <= 0) {
      this.#finish('lost');
    } else if (betweenWaves) {
      const remaining = this.intermissionRemaining - seconds;
      // Repeated 1/60 steps must finish at exactly 120 ticks, despite rounding.
      const tolerance = 32 * Number.EPSILON * Math.max(INTERMISSION_SECONDS, seconds);
      this.intermissionRemaining = remaining <= tolerance ? 0 : remaining;
      if (this.intermissionRemaining === 0) {
        const wave = this.wave + 1;
        this.unicorns = spawnUnicorns(this.world, this.player, WAVE_COUNTS[wave - 1], wave);
        this.wave = wave;
        this.player.magic = Math.min(MAX_MAGIC, this.player.magic + WAVE_MAGIC_BONUS);
        this.events.push({ type: 'wave', wave });
      }
    } else if (this.unicorns.length === 0) {
      if (this.wave === WAVE_COUNTS.length) this.#finish('won');
      else this.intermissionRemaining = INTERMISSION_SECONDS;
    }
    return this;
  }

  /** Return each queued event once; all consumers can share the returned batch. */
  drainEvents() {
    return this.events.splice(0);
  }
}
