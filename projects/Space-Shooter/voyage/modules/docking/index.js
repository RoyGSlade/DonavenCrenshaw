// Docking: the module entry. play(stage, ctx) -> Promise<result>. See README.md for the filled brief and CONTRACT.md for the shape.
import { createDocking, dockingEffects, OUTCOMES } from './model.js';
import { setupDocking, POINT_MAX } from './setup.js';
import { mountDocking, loadStyle } from './view.js';

const FALLBACK = { base: { id: 'base', name: 'The base', colour: '#38d6cc', berths: 4, berth: 1, docked: [] }, ship: { name: 'Your ship' } };
let fixtures = null;
async function defaults() {
  if (fixtures) return fixtures;
  try { fixtures = await (await fetch(new URL('./fixtures.json', import.meta.url))).json(); } catch { fixtures = FALLBACK; }
  return fixtures;
}

export async function play(stage, ctx = {}) {
  const fx = await defaults(), cx = ctx.context || {};
  const base = { ...FALLBACK.base, ...fx.base, ...(cx.base || {}) }, ship = { ...FALLBACK.ship, ...fx.ship, ...(cx.ship || {}) };
  const quick = !!ctx.quick;
  const setup = setupDocking({ tier: ctx.tier ?? 0, points: ctx.points || {}, level: ctx.level ?? POINT_MAX, quick });
  const berth = Math.max(1, Math.min(base.berths, Math.trunc(base.berth) || 1));
  const state = createDocking({ seed: ctx.seed ?? 1, setup, quick, berth });
  await loadStyle();
  const r = await mountDocking(stage, { state, base: { ...base, berth }, ship, sound: ctx.sound || (() => {}), reducedMotion: ctx.reducedMotion || (() => false) });
  return {
    done: true, success: r.success, grade: r.grade, xp: r.xp, effects: dockingEffects(r, { ...base, berth }),
    clean: r.clean, hullLost: r.hullLost, timeS: r.timeS, scrapes: r.scrapes, wavedOff: r.wavedOff, berth: r.berth,
    outcome: r.outcome === OUTCOMES.docked ? 'docked' : 'waved-off', perfect: r.perfect, path: r.path, marks: r.marks,
  };
}
