// Glue the adapters share (the existing games are wrapped, not moved). Legacy per-station options (title, who, what, open, best, lock,
// system, tool, resume, opening, range, gift, embedded, onProgress) travel in `ctx.context`; a host-computed `ctx.setup` wins over computing one.
import { setupOf } from '../registry.js';

/** The old `o` object a game's create/play functions were handed: { seed, setup, sound, reducedMotion, onLeave, ...context }. */
export function legacy(id, ctx = {}) {
  const c = ctx.context || {};
  const setup = ctx.setup ?? setupOf(id, { tier: ctx.tier, level: ctx.level, points: ctx.points, ...(c.lock != null ? { lock: c.lock } : {}), ...(c.tool ? { tool: c.tool } : {}) });
  return { ...c, seed: ctx.seed ?? 1, setup, sound: ctx.sound || (() => {}), reducedMotion: ctx.reducedMotion || (() => false), onLeave: ctx.onLeave };
}

// Scrap a craft rounded up is carried into the next one (the game's own rule); shared by craft, cut, screw and bolt-plate.
let bank = 0;
export const craftBank = { get: () => bank, set: (n) => { if (Number.isFinite(n)) bank = n; }, reset: () => { bank = 0; } };
