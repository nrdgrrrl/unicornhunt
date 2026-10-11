import { createEffectsState } from './effects-state.js';
import { renderEffects } from './effects-renderer.js';

export { MAX_PARTICLES, REDUCED_PARTICLES, MAX_TRAILS } from './effects-state.js';

/** Compatibility facade for headless simulation and snapshot-based drawing. */
export function createEffects(options = {}) {
  const state = createEffectsState(options);
  return {
    get particleCount() { return state.particleCount; },
    get trailCount() { return state.trailCount; },
    get reducedMotion() { return state.reducedMotion; },
    setReducedMotion(value) { state.setReducedMotion(value); },
    consume(events) { state.consume(events); },
    update(seconds, world) { state.update(seconds, world); },
    snapshot() { return state.snapshot(); },
    render(ctx, project) { renderEffects(ctx, project, state.snapshot()); },
    clear() { state.clear(); },
  };
}
