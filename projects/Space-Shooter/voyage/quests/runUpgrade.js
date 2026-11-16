// Quest runs saved before the d20 (run v 1) stored targets on the 2d6 scale: an
// on-foot fight's dc, a rolled enemy's parleyDc. Loading such a run moves those
// numbers to the d20 scale once, so a job left half-done keeps its odds. Pure:
// no imports, so the save loader can use it without pulling in the engine.

// Run v 2: targets are on the d20 scale (launch tech lane, outcome 1).
export const RUN_VERSION = 2;

// The one conversion from a 2d6 target to a d20 target: new = 2 x old - 4.
// 6 -> 8, 7 -> 10, 8 -> 12, 9 -> 14, 11 -> 18: a level-1 captain keeps about
// the odds an average stat had (data.js CHECK). Clamped to 2..30.
export const dcFrom2d6 = (old) => Math.min(30, Math.max(2, Math.round(2 * old - 4)));

const DC_KEYS = new Set(['dc', 'parleyDc']);

function rescale(node) {
  if (Array.isArray(node)) return node.map(rescale);
  if (!node || typeof node !== 'object') return node;
  const out = {};
  for (const [k, v] of Object.entries(node)) out[k] = DC_KEYS.has(k) && Number.isFinite(v) ? dcFrom2d6(v) : rescale(v);
  return out;
}

/**
 * A run as the current engine expects it. A v 1 run's part state (where the
 * engine keeps targets between steps) is rescaled and the run stamped v 2;
 * rolls already made (lastCheck, the log) stay as they were rolled. Anything
 * else is returned as it came. Never mutates the input.
 */
export function upgradeRun(run) {
  if (!run || typeof run !== 'object' || Array.isArray(run)) return run;
  if (Number.isInteger(run.v) && run.v >= RUN_VERSION) return run;
  const out = { ...run, v: RUN_VERSION };
  if (run.part && typeof run.part === 'object') out.part = rescale(run.part);
  return out;
}
