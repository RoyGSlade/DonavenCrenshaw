// The pure rules of the sample: a seeded lit pad among six, a few tries (the tier and the points add tries). No DOM, no clock, no Math.random.
export const PADS = 6;
const mix = (n) => { let t = (n + 0x6d2b79f5) | 0; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
export const targetOf = (seed) => Math.floor(mix(seed) * PADS);
/** Tries: 2, +1 per smooth tier step above steady (down to 1 at Rough), +1 per 3 points in `diagnose`. */
export const triesOf = ({ tier = 0, points = {} } = {}) => Math.max(1, 2 + Math.trunc(tier / 2) + Math.floor((points.diagnose || 0) / 3));
export const create = (ctx = {}) => ({ target: targetOf(ctx.seed ?? 1), tries: triesOf(ctx), picks: [], done: false, success: false });
export function pick(state, pad) {
  if (state.done) return state;
  const picks = [...state.picks, pad], success = pad === state.target;
  return { ...state, picks, success, done: success || picks.length >= state.tries };
}
export const resultOf = (s) => ({ done: true, success: s.success, grade: s.success ? Math.round(100 - (s.picks.length - 1) * (100 / s.tries) / 2) : 0 });
