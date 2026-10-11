import { STEP_SECONDS, MAX_CATCH_UP_STEPS } from './config.js';

export { STEP_SECONDS, MAX_CATCH_UP_STEPS } from './config.js';

const ROUNDING_EPSILON = 1e-12;

/**
 * Browser-independent fixed-step accumulator. Configuration and tick durations
 * are seconds; advance() accepts frame timestamps in milliseconds and returns
 * the bounded frame duration in seconds, including while inactive.
 *
 * Call reset() at pause, restart, and result transitions to discard old time.
 * The next advance() establishes a baseline without ticking. isActive() gates
 * accumulation and is checked before each tick; reset() inside a tick also
 * stops that frame's catch-up immediately.
 */
export function createClock({ stepSeconds = STEP_SECONDS, maxCatchUpSteps = MAX_CATCH_UP_STEPS } = {}) {
  const maxSeconds = stepSeconds * maxCatchUpSteps;
  if (!Number.isFinite(stepSeconds) || stepSeconds <= 0
    || !Number.isSafeInteger(maxCatchUpSteps) || maxCatchUpSteps <= 0
    || !Number.isFinite(maxSeconds)) {
    throw new RangeError('Clock step must be finite and positive, with a positive integer catch-up limit and finite duration.');
  }
  // Keep the existing allowance at 60 Hz, scaling down for smaller custom steps.
  const roundingEpsilon = ROUNDING_EPSILON * Math.min(1, stepSeconds / STEP_SECONDS);

  let previous;
  let accumulator = 0;
  let generation = 0;

  return {
    reset() {
      previous = undefined;
      accumulator = 0;
      generation++;
    },
    advance(now, tick, isActive = () => true) {
      if (!Number.isFinite(now)) throw new RangeError('Clock timestamp must be finite milliseconds.');
      if (typeof tick !== 'function' || typeof isActive !== 'function') {
        throw new TypeError('Clock tick and activity predicate must be functions.');
      }
      if (previous === undefined) {
        previous = now;
        return 0;
      }
      const seconds = Math.max(0, Math.min(maxSeconds, (now - previous) / 1000));
      previous = now;
      const frameGeneration = generation;
      if (!isActive()) return seconds;

      accumulator = Math.min(accumulator + seconds, maxSeconds);
      // Preserve the app's rounding allowance, with an explicit callback bound.
      for (let steps = 0; steps < maxCatchUpSteps
        && generation === frameGeneration
        && accumulator + roundingEpsilon >= stepSeconds
        && isActive(); steps++) {
        accumulator = Math.max(0, accumulator - stepSeconds);
        tick(stepSeconds);
      }
      return seconds;
    },
  };
}
