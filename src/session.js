// @ts-check

import { createWorld } from './world.js';
import { createPlayer, updatePlayer } from './player.js';
import { spawnUnicorns, updateUnicorns } from './unicorn.js';
import { updateCombat } from './combat.js';
import { spawnPickups, collectPickups } from './pickups.js';
import { updateRoses } from './projectiles.js';
import { updateRangedAttacks } from './ranged-attacks.js';
import { restoreHealth } from './survival.js';
import { WAVE_COUNTS, INTERMISSION_SECONDS } from './config.js';

/** @typedef {import('./contracts.js').SessionData} SessionData */

// Existing session imports remain valid while configuration owns the values.
export { WAVE_COUNTS, INTERMISSION_SECONDS } from './config.js';

/**
 * Authoritative, browser-independent simulation. Time is in seconds; callers
 * supply one fresh input frame per fixed step and drain events for feedback.
 * Construction prepares a ready world. Restart begins a clean run with the
 * same seed by default, so identical inputs reproduce the map and gameplay.
 * @implements {SessionData}
 */
export class GameSession {
  /** @param {import('./contracts.js').Seed} [seed] */
  constructor(seed = 1) {
    this.#reset(seed);
  }

  /** @param {import('./contracts.js').Seed} seed */
  #reset(seed) {
    const world = createWorld(seed);
    const player = createPlayer(world.spawn);
    const unicorns = spawnUnicorns(world, player, WAVE_COUNTS[0], 1);
    /** @type {import('./contracts.js').Seed} */
    this.seed = seed;
    /** @type {import('./contracts.js').SessionState} */
    this.state = 'ready';
    /** @type {import('./contracts.js').GeneratedWorld} */
    this.world = world;
    /** @type {import('./contracts.js').Player} */
    this.player = player;
    /** @type {import('./contracts.js').Unicorn[]} */
    this.unicorns = unicorns;
    /** @type {import('./contracts.js').Pickup[]} */
    this.pickups = spawnPickups(world, player, unicorns, 1);
    /** @type {import('./contracts.js').RoseProjectile[]} */
    this.roses = [];
    /** @type {number} */
    this.nextRoseId = 0;
    /** @type {number} */
    this.wave = 1;
    /** @type {number} */
    this.intermissionRemaining = 0;
    /** @type {number} */
    this.elapsed = 0;
    /** @type {number} */
    this.score = 0;
    /** @type {number} */
    this.combo = 0;
    /** @type {number | null} */
    this.lastHitAt = null;
    /** @type {import('./contracts.js').GameEvent[]} */
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

  /**
   * @param {import('./contracts.js').Seed} [seed]
   * @returns {this}
   */
  restart(seed = this.seed) {
    this.#reset(seed);
    return this.start();
  }

  /** @param {'won' | 'lost'} state */
  #finish(state) {
    this.state = state;
    this.intermissionRemaining = 0;
    this.events.push({ type: state === 'won' ? 'victory' : 'defeat' });
  }

  /**
   * @param {number} seconds
   * @param {Partial<import('./contracts.js').InputFrame>} [input]
   * @returns {this}
   */
  update(seconds, input = {}) {
    if (!Number.isFinite(seconds) || seconds < 0) {
      throw new RangeError('Session update time must be finite and nonnegative.');
    }
    if (this.state !== 'playing') return this;
    // Defeat takes precedence over supplies and between-wave restoration.
    if (this.player.health <= 0) {
      this.player.health = 0;
      this.#finish('lost');
      return this;
    }

    const betweenWaves = this.intermissionRemaining > 0;
    this.elapsed += seconds;
    const previousPosition = { x: this.player.x, y: this.player.y };
    updatePlayer(this.player, this.world, input, seconds);
    const supplies = collectPickups(this.pickups, this.world, this.player, this.player);
    this.pickups = supplies.pickups;
    Object.assign(this.player, supplies.state);
    this.events.push(...supplies.events);
    updateCombat(this);
    this.events.push(...updateUnicorns(this.unicorns, this.world, this.player, seconds));
    const projectiles = updateRoses(this.roses, this.world, this.player, this.player, seconds, previousPosition);
    this.roses = projectiles.roses;
    Object.assign(this.player, projectiles.state);
    this.events.push(...projectiles.events);
    this.events.push(...updateRangedAttacks(this.unicorns, this.world, this.player, this, seconds));

    const defeated = this.player.health <= 0;
    if (defeated) {
      this.#finish('lost');
    }
    // Conversion disables actions immediately; remove actors after defeat checks.
    this.unicorns = this.unicorns.filter(unicorn => unicorn.alive);
    if (defeated) return this;
    if (betweenWaves) {
      const remaining = this.intermissionRemaining - seconds;
      // Repeated 1/60 steps must finish at exactly 120 ticks, despite rounding.
      const tolerance = 32 * Number.EPSILON * Math.max(INTERMISSION_SECONDS, seconds);
      this.intermissionRemaining = remaining <= tolerance ? 0 : remaining;
      if (this.intermissionRemaining === 0) {
        const wave = this.wave + 1;
        Object.assign(this.player, restoreHealth(this.player));
        this.unicorns = spawnUnicorns(this.world, this.player, WAVE_COUNTS[wave - 1], wave);
        this.wave = wave;
        this.pickups = spawnPickups(this.world, this.player, this.unicorns, wave);
        this.events.push({ type: 'wave', wave });
      }
    } else if (this.unicorns.length === 0) {
      this.roses = [];
      if (this.wave === WAVE_COUNTS.length) this.#finish('won');
      else this.intermissionRemaining = INTERMISSION_SECONDS;
    }
    return this;
  }

  /**
   * Return each queued event once; all consumers can share the returned batch.
   * @returns {import('./contracts.js').GameEvent[]}
   */
  drainEvents() {
    return this.events.splice(0);
  }
}
