/** Context construction is best-effort; the caller decides how to degrade. */
export function safeCreateContext(factory) {
  try { return factory(); } catch { return null; }
}

/** Resolve storage inside the guard: access itself can throw in private mode. */
export function readStorage(storage, key) {
  try { return storage()?.getItem(key) ?? null; } catch { return null; }
}

export function writeStorage(storage, key, value) {
  attempt(() => storage()?.setItem(key, value));
}

/** Best-effort synchronous cleanup; call separately for independent operations. */
export function attempt(operation) {
  try { operation(); } catch { /* Cleanup or persistence may be unavailable. */ }
}

/** Invoke now to preserve user activation, then normalize void/thenable results. */
export function invokePromise(operation) {
  try { return Promise.resolve(operation()); } catch (error) { return Promise.reject(error); }
}
