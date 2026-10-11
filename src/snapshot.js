// @ts-check

/**
 * Copy authoritative session values into the presentation-only HUD contract.
 * Audio availability is supplied by the app, which owns browser capability checks.
 * @param {import('./contracts.js').SessionData} session
 * @param {{ bestScore: number, muted: boolean, audioUnavailable: boolean }} presentation
 * @returns {import('./contracts.js').HUDSnapshot}
 */
export function createHUDSnapshot(session, { bestScore, muted, audioUnavailable }) {
  const state = session.state === 'ready' ? 'title'
    : session.state === 'won' ? 'victory'
    : session.state === 'lost' ? 'defeat' : session.state;
  return {
    state, score: session.score, bestScore,
    magic: session.player.magic, wave: session.wave,
    remaining: session.remaining, combo: session.combo,
    muted, audioUnavailable,
  };
}
