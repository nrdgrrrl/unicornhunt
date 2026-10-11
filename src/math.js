/** Clamp a number to an inclusive interval. */
export function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

/** Return a unit vector, or { x: 0, y: 0 } for a zero vector. */
export function normalize({ x, y }) {
  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    throw new TypeError('Vector components must be finite numbers.');
  }
  // Scaling first also handles finite vectors whose length would overflow.
  const scale = Math.max(Math.abs(x), Math.abs(y));
  if (scale === 0) return { x: 0, y: 0 };
  const length = Math.hypot(x / scale, y / scale);
  return { x: x / scale / length, y: y / scale / length };
}

/** A local, reproducible PRNG returning numbers in [0, 1). Zero is a valid seed. */
export function createRng(seed) {
  if (typeof seed !== 'string' && !(typeof seed === 'number' && Number.isFinite(seed))) {
    throw new TypeError('Seed must be a string or finite number.');
  }
  // FNV-1a hashes strings (and the complete numeric representation) to 32 bits.
  let state = 2166136261;
  for (const character of String(seed)) {
    state = Math.imul(state ^ character.codePointAt(0), 16777619) >>> 0;
  }
  return function random() {
    // Mulberry32; explicitly wrap state to avoid loss of integer precision.
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}
