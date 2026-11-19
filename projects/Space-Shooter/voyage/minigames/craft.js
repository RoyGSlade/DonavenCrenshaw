// The crafting minigame: forge strikes. A gauge with a needle sweeping to and fro and a lit
// strike zone. Tap Strike with the needle inside the zone: a good strike shapes the part.
// Outside: a bad strike spoils some material. After the last strike the part is made, graded
// 0 to 100, or ruined (fewer than half the strikes were good). Each strike lights a new zone.
// Pure and seeded; the view sends strike() and steps the clock. Numbers come from setup.js.
import { step as rngStep, hashSeed } from '../quests/rng.js';

export const SPOIL_SHARE = 0.10; // a bad strike spoils 10% of the recipe's materials
export const RUIN_BELOW = 0.5;   // fewer good strikes than this share ruins the part

/**
 * recipe: { materials: units the recipe needs, build: seconds the job takes } (the game's recipe data).
 * setup: from setupCraft.
 */
export function createCraft({ seed = 1, recipe = { materials: 4, build: 30 }, setup = {} } = {}) {
  let rng = hashSeed('craft', seed, recipe.materials);
  const rand = () => { const [v, next] = rngStep(rng); rng = next; return v; };
  const zone = setup.zone ?? 0.22, strikes = setup.strikes ?? 5;
  // Zone centres: spread over the gauge, never touching the ends, and never the same place twice in a row.
  const centres = [];
  for (let i = 0; i < strikes; i++) {
    const lo = zone / 2 + 0.04, hi = 1 - zone / 2 - 0.04;
    let c = lo + rand() * (hi - lo);
    const prev = centres[centres.length - 1];
    if (prev !== undefined && Math.abs(c - prev) < zone) c = Math.max(lo, Math.min(hi, prev < 0.5 ? prev + zone + rand() * 0.05 : prev - zone - rand() * 0.05));
    centres.push(Math.round(c * 1000) / 1000);
  }
  return {
    recipe, zone, speed: setup.speed ?? 1.1, strikes, qualityBonus: setup.qualityBonus ?? 0,
    buildFactor: setup.buildFactor ?? 1, materialFactor: setup.materialFactor ?? 1,
    centres, index: 0, good: 0, spoils: 0, marks: [], t: 0, phase: rand(), done: false, result: null, events: [],
  };
}

/** The needle's position 0..1 (a triangle wave). */
export const needleAt = (s, t = s.t) => { const x = (s.phase * 2 + t * s.speed) % 2; return x <= 1 ? x : 2 - x; };
/** The current strike zone [from, to] on the gauge. */
export const zoneOf = (s, i = s.index) => [s.centres[i] - s.zone / 2, s.centres[i] + s.zone / 2];
export const inZone = (s) => { const [a, b] = zoneOf(s); const p = needleAt(s); return p >= a && p <= b; };

export function stepCraft(s, dt = 1 / 60) {
  s.events = [];
  if (!s.done) s.t += dt;
  return s;
}

/** Strike now. Returns 'good', 'bad' or null (done). */
export function strike(s) {
  if (s.done) return null;
  const good = inZone(s);
  s.marks.push(good ? 'good' : 'bad');
  if (good) s.good++; else s.spoils++;
  s.index++;
  s.events.push({ type: good ? 'good' : 'bad', n: s.index });
  if (s.index >= s.strikes) finish(s);
  return good ? 'good' : 'bad';
}

/** Materials the job eats: the recipe less the material points, plus 10% of that per bad strike (never under 1; ruined = everything). */
export function materialsUsed(recipe, spoils, factor = 1, ruined = false) {
  const base = Math.max(1, Math.round(recipe.materials * factor));
  if (ruined) return base;
  return Math.max(1, Math.round(base * (1 + SPOIL_SHARE * spoils)));
}

/** Quality 0..100: 10 + 90 x good strikes / strikes + the quality points. (Bad strikes cost material, not extra quality.) */
export const qualityOf = ({ good, strikes, qualityBonus = 0 }) => Math.max(0, Math.min(100, Math.round(10 + 90 * (good / strikes) + qualityBonus)));
export const starsOf = (q) => (q >= 90 ? 3 : q >= 65 ? 2 : 1);
/** Placeholder XP: 4, +1 per star above one; none for a ruined part. */
export const craftXp = (r) => (r?.success ? 3 + r.stars : 0);

function finish(s) {
  s.done = true;
  const success = s.good >= Math.ceil(s.strikes * RUIN_BELOW);
  const quality = success ? qualityOf({ good: s.good, strikes: s.strikes, qualityBonus: s.qualityBonus }) : 0;
  s.result = {
    success, good: s.good, spoils: s.spoils, strikes: s.strikes, quality, stars: success ? starsOf(quality) : 0,
    materials: materialsUsed(s.recipe, s.spoils, s.materialFactor, !success),
    buildSeconds: Math.max(1, Math.round(s.recipe.build * s.buildFactor)), xp: 0,
  };
  s.result.xp = craftXp(s.result);
  s.events.push({ type: 'done', ...s.result });
}
