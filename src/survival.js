// @ts-check

import { MAX_HEALTH, MAX_ARMOR, DAMAGE_INVULNERABILITY } from './config.js';

/**
 * Pure survival transitions for contact and rose hits. Inputs are trusted
 * SurvivalState values and are never mutated. Callers adopt the returned state
 * and queue non-null damage events; session lifecycle owns defeat events.
 * @returns {import('./contracts.js').SurvivalState}
 */
export function createSurvivalState() {
  return { health: MAX_HEALTH, armor: 0, invulnerableFor: 0 };
}

/**
 * Advance the shared cooldown once per simulation tick, before any hit checks.
 * Advancing it separately prevents each damage source from subtracting time.
 * @param {Readonly<import('./contracts.js').SurvivalState>} state
 * @param {number} seconds
 * @returns {import('./contracts.js').SurvivalState}
 */
export function updateInvulnerability(state, seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) {
    throw new RangeError('Survival update time must be finite and nonnegative.');
  }
  const remaining = state.invulnerableFor - seconds;
  // Repeated fractional steps must expire at the intended boundary, without
  // leaving subtraction noise that blocks a hit for an extra simulation tick.
  const tolerance = 32 * Number.EPSILON * Math.max(1, DAMAGE_INVULNERABILITY, seconds);
  return { ...state, invulnerableFor: remaining <= tolerance ? 0 : remaining };
}

/**
 * Accept exactly one point of damage, absorbing it with armor before health.
 * A blocked hit returns no event and does not restart the shared cooldown.
 * @param {Readonly<import('./contracts.js').SurvivalState>} state
 * @param {Readonly<import('./contracts.js').SurvivalHit>} hit
 * @returns {import('./contracts.js').DamageResult}
 */
export function applyDamage(state, hit) {
  if (state.health === 0 || state.invulnerableFor > 0) return { state, event: null };
  const resource = state.armor > 0 ? 'armor' : 'health';
  const next = {
    ...state,
    [resource]: state[resource] - 1,
    invulnerableFor: DAMAGE_INVULNERABILITY,
  };
  return {
    state: next,
    event: {
      type: 'damage', cause: hit.cause, source: hit.source, amount: 1, resource,
      health: next.health, armor: next.armor,
    },
  };
}

/**
 * Restore one health point, capped independently; never revive a defeated player.
 * Pickups are allowed during invulnerability and do not change its duration.
 * @param {Readonly<import('./contracts.js').SurvivalState>} state
 * @returns {import('./contracts.js').SurvivalState}
 */
export function restoreHealth(state) {
  if (state.health === 0) return state;
  return { ...state, health: Math.min(MAX_HEALTH, state.health + 1) };
}

/**
 * Restore one armor point, capped independently; never revive a defeated player.
 * @param {Readonly<import('./contracts.js').SurvivalState>} state
 * @returns {import('./contracts.js').SurvivalState}
 */
export function restoreArmor(state) {
  if (state.health === 0) return state;
  return { ...state, armor: Math.min(MAX_ARMOR, state.armor + 1) };
}
