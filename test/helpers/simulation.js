import { createPlayer, updatePlayer } from '../../src/player.js';
import { updateCombat } from '../../src/combat.js';
import { createClock } from '../../src/clock.js';
import { STEP_SECONDS, UNICORN_RADIUS, UNICORN_SPEED, WAVE_COUNTS, INTERMISSION_SECONDS } from '../../src/config.js';
import { arena } from './world.js';

export { STEP_SECONDS } from '../../src/config.js';

export function enemy(id, x = 4.5, y = 5.5, overrides = {}) {
  return { id, x, y, radius: UNICORN_RADIUS, speed: UNICORN_SPEED, angle: 0, alive: true, ...overrides };
}

// Lightweight combat state deliberately omits GameSession's wave lifecycle.
export function combatSession(unicorns = [], world = arena(), spawn = { x: 2.5, y: 5.5, angle: 0 }) {
  return {
    world, player: createPlayer(spawn), unicorns,
    score: 0, combo: 0, elapsed: 0, lastHitAt: null, events: [],
  };
}

// Preserve session tick order without a fixed-step clock: boundary tests need
// zero-duration shots and arbitrary elapsed seconds, including long ticks.
export function combatStep(session, seconds = 0, fire = true) {
  session.elapsed += seconds;
  updatePlayer(session.player, session.world, { fire }, seconds);
  return updateCombat(session);
}

export const snapshot = session => structuredClone({ ...session });

// Input factories receive the zero-based tick index and current session.
export function advance(session, ticks, input = {}) {
  const clock = createClock();
  let tickIndex = 0;
  const tick = seconds => {
    const frame = typeof input === 'function' ? input(tickIndex, session) : input;
    session.update(seconds, frame);
    tickIndex++;
  };
  const isActive = () => session.state === 'playing';
  clock.advance(0, tick, isActive);
  for (let i = 0; i < ticks; i++) clock.advance((i + 1) * STEP_SECONDS * 1000, tick, isActive);
}

export function clearWave(session) {
  for (const unicorn of session.unicorns) unicorn.alive = false;
  session.update(STEP_SECONDS);
}

export function win(session) {
  for (let wave = 1; wave <= WAVE_COUNTS.length; wave++) {
    clearWave(session);
    if (wave < WAVE_COUNTS.length) advance(session, Math.ceil(INTERMISSION_SECONDS / STEP_SECONDS));
  }
}
