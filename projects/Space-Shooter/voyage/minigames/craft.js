// The crafting minigame, v2: HEAT AND SHAPE (its own verb: hold, release, order).
//   1. HEAT. Hold to heat the stock; the glow climbs. Let go inside the lit temperature band:
//        too cold  -> it will not take the shape: half the work time
//        in band   -> a clean heat
//        too hot   -> it spoils: two bad-heat spoils, but a little more work time (x1.25)
//        held to the top: it burns, counts as too hot.
//   2. SHAPE. The stock cools while you work, so the work clock runs. Shaping steps are tools
//      (Cut, Draw, Bend, Fold, Flatten, Polish): rough work first, fine work last. Tap them in that
//      order. A wrong tap spoils material and makes that step unclean. Finish every step before the
//      clock runs out; the part is made if at least half the steps were clean.
// Quality = 10 + 90 x clean steps / steps + quality points. Pure and seeded; the view sends
// heatStart(), release() and shape(); setup numbers (band, heat rate, steps, ...) come from setup.js.
import { step as rngStep, hashSeed } from '../quests/rng.js';

export const SPOIL_SHARE = 0.10;   // a spoil costs 10% of the recipe's materials
export const RUIN_BELOW = 0.5;     // fewer clean steps than this share ruins the part
export const HEAT_START = 0.15;
export const HEAT_RATE = 0.45;     // gauge per second at setup speed 1.0
export const HOT_SPOILS = 2;
export const COLD_TIME = 0.5;
export const HOT_TIME = 1.25;
/** Tools in the order the work must go (rough to fine). */
export const TOOLS = Object.freeze([
  { id: 'cut', name: 'Cut' }, { id: 'draw', name: 'Draw' }, { id: 'bend', name: 'Bend' },
  { id: 'fold', name: 'Fold' }, { id: 'flatten', name: 'Flatten' }, { id: 'polish', name: 'Polish' },
]);

export function createCraft({ seed = 1, recipe = { materials: 4, build: 30 }, setup = {}, bank = 0 } = {}) {
  let rng = hashSeed('craft2', seed, recipe.materials);
  const rand = () => { const [v, next] = rngStep(rng); rng = next; return v; };
  const zone = setup.zone ?? 0.22, steps = Math.min(TOOLS.length, setup.strikes ?? 5);
  const lo = 0.45 + zone / 2, hi = 0.85 - zone / 2;
  const centre = Math.round((lo + rand() * Math.max(0, hi - lo)) * 1000) / 1000;
  // Which tools this part needs, in work order; the tiles are shown shuffled (never already in order).
  const picked = TOOLS.map((t) => ({ t, r: rand() })).sort((a, b) => a.r - b.r).slice(0, steps).map((x) => x.t).sort((a, b) => TOOLS.indexOf(a) - TOOLS.indexOf(b));
  let tiles = picked.slice();
  for (let k = 0; k < 20; k++) { tiles = picked.map((t) => ({ t, r: rand() })).sort((a, b) => a.r - b.r).map((x) => x.t); if (tiles.some((t, i) => t !== picked[i])) break; }
  return {
    recipe, bank, zone, centre, heatRate: HEAT_RATE * (setup.speed ?? 1.1), strikes: steps, workFactor: setup.workFactor ?? 1,
    qualityBonus: setup.qualityBonus ?? 0, buildFactor: setup.buildFactor ?? 1, materialFactor: setup.materialFactor ?? 1,
    phase: 'heat', heating: false, temp: HEAT_START, heat: null, order: picked.map((t) => t.id), tiles: tiles.map((t) => t.id),
    index: 0, good: 0, wrong: 0, spoils: 0, dirty: false, marks: [], work: 0, workMax: 0, t: 0, done: false, result: null, events: [],
  };
}

/** The lit band [low, high] on the temperature gauge. */
export const bandOf = (s) => [s.centre - s.zone / 2, s.centre + s.zone / 2];
export const heatVerdict = (s, temp = s.temp) => { const [a, b] = bandOf(s); return temp > 1 - 1e-9 || temp > b ? 'hot' : temp < a ? 'cold' : 'ok'; };
export const workSecondsFor = (s, verdict) => Math.round(((3 + 2.5 * s.strikes) * s.workFactor * (verdict === 'cold' ? COLD_TIME : verdict === 'hot' ? HOT_TIME : 1)) * 10) / 10;

/** Start heating (hold). */
export function heatStart(s) { if (s.phase === 'heat' && !s.done) s.heating = true; }

/** Let go: lock the temperature and begin shaping. Returns the heat verdict. */
export function release(s) {
  if (s.phase !== 'heat' || s.done) return null;
  s.heating = false;
  s.heat = heatVerdict(s);
  if (s.heat === 'hot') s.spoils += HOT_SPOILS;
  s.phase = 'shape';
  s.workMax = s.work = workSecondsFor(s, s.heat);
  s.events.push({ type: 'heat', verdict: s.heat, temp: s.temp });
  return s.heat;
}

export function stepCraft(s, dt = 1 / 60) {
  s.events = [];
  if (s.done) return s;
  s.t += dt;
  if (s.phase === 'heat' && s.heating) {
    s.temp = Math.min(1, s.temp + s.heatRate * dt);
    if (s.temp >= 1) release(s); // burnt: forced let-go
  } else if (s.phase === 'shape') {
    s.work = Math.max(0, s.work - dt);
    if (s.work <= 0) finish(s, 'cooled');
  }
  return s;
}

/** Tap a tool. Returns 'good' (right tool, clean step), 'fixed' (right tool after a wrong tap), 'wrong' or null. */
export function shape(s, toolId) {
  if (s.done || s.phase !== 'shape') return null;
  if (toolId !== s.order[s.index]) {
    s.wrong++; s.spoils++; s.dirty = true;
    s.events.push({ type: 'wrong', tool: toolId });
    return 'wrong';
  }
  const clean = !s.dirty;
  if (clean) s.good++;
  s.marks.push(clean ? 'good' : 'fixed');
  s.index++; s.dirty = false;
  s.events.push({ type: clean ? 'good' : 'fixed', n: s.index });
  if (s.index >= s.strikes) finish(s, 'made');
  return clean ? 'good' : 'fixed';
}

/**
 * What the job eats, with the material points' fraction carried between crafts.
 * exact = recipe x factor x (1 + 10% per spoil) (a ruined part eats the recipe x factor, no spoil extra).
 * The bank holds the fraction of scrap earlier crafts rounded up; this craft uses ceil(exact - bank) (never under 1)
 * and the left-over becomes the new bank, so every Material point saves real scrap over a few crafts.
 * Returns { used, exact, bank (new), saved (this craft, vs the plain recipe) }.
 */
export function settleMaterials({ recipe, spoils = 0, factor = 1, ruined = false, bank = 0 }) {
  const exact = Math.round(recipe.materials * factor * (ruined ? 1 : 1 + SPOIL_SHARE * spoils) * 1e6) / 1e6;
  const need = Math.max(0, exact - Math.max(0, bank));
  const used = Math.max(1, Math.ceil(need - 1e-9));
  const newBank = Math.round((used - need) * 1e6) / 1e6;
  return { used, exact, bank: Math.max(0, newBank), saved: Math.round((recipe.materials - used) * 1e6) / 1e6 };
}

/** Quality 0..100: 10 + 90 x clean steps / steps + quality points, clamped. */
export const qualityOf = ({ good, strikes, qualityBonus = 0 }) => Math.max(0, Math.min(100, Math.round(10 + 90 * (good / strikes) + qualityBonus)));
export const starsOf = (q) => (q >= 90 ? 3 : q >= 65 ? 2 : 1);
/** Placeholder XP: 3 + stars (4 to 6); none for a ruined part. */
export const craftXp = (r) => (r?.success ? 3 + r.stars : 0);

function finish(s, how) {
  s.done = true; s.phase = 'done';
  const complete = how === 'made';
  const success = complete && s.good >= Math.ceil(s.strikes * RUIN_BELOW);
  const quality = success ? qualityOf({ good: s.good, strikes: s.strikes, qualityBonus: s.qualityBonus }) : 0;
  const mat = settleMaterials({ recipe: s.recipe, spoils: s.spoils, factor: s.materialFactor, ruined: !success, bank: s.bank });
  s.result = {
    success, how: success ? 'made' : complete ? 'sloppy' : how, heat: s.heat, temp: Math.round(s.temp * 1000) / 1000,
    good: s.good, wrong: s.wrong, spoils: s.spoils, strikes: s.strikes, quality, stars: success ? starsOf(quality) : 0,
    materials: mat.used, materialsExact: mat.exact, bank: mat.bank, saved: mat.saved,
    buildSeconds: Math.max(1, Math.round(s.recipe.build * s.buildFactor)), xp: 0,
  };
  s.result.xp = craftXp(s.result);
  s.events.push({ type: 'done', ...s.result });
}
