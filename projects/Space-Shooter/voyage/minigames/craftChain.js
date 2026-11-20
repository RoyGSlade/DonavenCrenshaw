// The crafting chain's shared rules (v2/PLAN.md section 4.2) and a small recipe runner. Pure: no DOM, no clock, no randomness
// of its own. Every game of the chain (Cut, Screw, Bend, Flatten, Polish, Pour now; Weld later) ends with a grade 0..100 and hands it
// to submit(); this module decides pass, redo or ruin, counts the spoils, and builds the result card. The old heat-and-shape
// game (craft.js) keeps its own rules; this module reuses its material bank and star rules so a craft costs the same everywhere.
//
//   one roll per craft sets the tier for every game      (the caller: setupCut / setupScrew take that tier)
//   grade 70 passes, 85 is clean, 95 is perfect          under 70 the piece is redone on a fresh sheet and spoils material
//   two redos per game; the third fail ruins the craft   a spoil costs 10% of the recipe's materials (the built rule)
//   item quality = the average of the passing grades + 4 per Quality point, 100 at most; stars at 65 and 90 (the built rule)
//   XP (placeholder) = 2 + 1 per game passed + 1 per star above the first, 10 at most; 0 if ruined
import { settleMaterials, starsOf, SPOIL_SHARE } from './craft.js';
import { setupCut, setupScrew, setupBend, setupFlatten, setupPolish, setupPour, setupOrder, CRAFT_CATEGORIES, POINT_MAX } from './setup.js';

export const PASS = 70, CLEAN = 85, PERFECT = 95;
export const MAX_REDOS = 2;
export const XP_BASE = 2, XP_CAP = 10;
export { SPOIL_SHARE, starsOf };

/** The word for a grade. */
export const gradeWord = (g) => (g >= PERFECT ? 'perfect' : g >= CLEAN ? 'clean' : g >= PASS ? 'passes' : 'too rough');
export const clampGrade = (g) => Math.max(0, Math.min(100, Math.round((Number.isFinite(g) ? g : 0) * 100) / 100));

/** Item quality: the average of the grades plus the Quality points' bonus (4 a point), 0..100, whole number. */
export function itemQuality(grades, qualityBonus = 0) {
  if (!grades.length) return 0;
  const avg = grades.reduce((a, b) => a + b, 0) / grades.length;
  return Math.max(0, Math.min(100, Math.round(+(avg + qualityBonus).toFixed(6))));
}

/** Placeholder XP for a craft. */
export const chainXp = ({ ruined, passed, stars }) => (ruined ? 0 : Math.min(XP_CAP, XP_BASE + passed + Math.max(0, stars - 1)));

/** Recipes: steps of games. `materials` is the scrap a craft eats at its plainest, `build` the seconds it takes. */
export const RECIPES = Object.freeze({
  cut: Object.freeze({ id: 'cut', name: 'Cut a plate', what: 'plate', materials: 3, build: 20, steps: Object.freeze([{ name: 'Cut the plate', games: Object.freeze([{ kind: 'cut' }]) }]) }),
  screw: Object.freeze({ id: 'screw', name: 'Drive a bolt', what: 'bolt', materials: 2, build: 10, steps: Object.freeze([{ name: 'Drive the bolt', games: Object.freeze([{ kind: 'screw' }]) }]) }),
  bend: Object.freeze({ id: 'bend', name: 'Bend a bracket', what: 'bracket', materials: 3, build: 20, steps: Object.freeze([{ name: 'Bend the bracket', games: Object.freeze([{ kind: 'bend', bends: 2 }]) }]) }),
  flatten: Object.freeze({ id: 'flatten', name: 'Flatten a plate', what: 'plate', materials: 3, build: 20, steps: Object.freeze([{ name: 'Flatten the plate', games: Object.freeze([{ kind: 'flatten' }]) }]) }),
  polish: Object.freeze({ id: 'polish', name: 'Polish a plate', what: 'plate', materials: 3, build: 25, steps: Object.freeze([{ name: 'Polish the plate', games: Object.freeze([{ kind: 'polish' }]) }]) }),
  pour: Object.freeze({ id: 'pour', name: 'Mix a coolant flask', what: 'flask', materials: 3, build: 15, steps: Object.freeze([{ name: 'Pour the flask', games: Object.freeze([{ kind: 'pour', pours: 3, liquids: Object.freeze(['coolant', 'glycol', 'water']) }]) }]) }),
  steak: Object.freeze({ id: 'steak', name: 'Sear a steak', what: 'steak', materials: 4, build: 30, steps: Object.freeze([{ name: 'Sear the steak', games: Object.freeze([{ kind: 'order' }]) }]) }),
  'bolt-plate': Object.freeze({
    id: 'bolt-plate', name: 'Bolt plate', what: 'bolt plate', materials: 4, build: 30,
    steps: Object.freeze([{ name: 'Cut the plate', games: Object.freeze([{ kind: 'cut' }]) }, { name: 'Bolt it down', games: Object.freeze([{ kind: 'screw' }]) }]),
  }),
});
export const KIND_NAME = Object.freeze({ cut: 'Cut', screw: 'Screw', bend: 'Bend', flatten: 'Flatten', polish: 'Polish', pour: 'Pour', order: 'Order' });

/** The setup of one game of the chain at the craft's roll. */
export function gameSetup(kind, { tier = 0, points = {}, level = POINT_MAX, tool = 'shop', bends = 1, pours = 3, liquids = null } = {}) {
  if (kind === 'cut') return setupCut({ tier, points, level, tool });
  if (kind === 'screw') return setupScrew({ tier, points, level });
  if (kind === 'bend') return setupBend({ tier, points, level, bends });
  if (kind === 'flatten') return setupFlatten({ tier, points, level });
  if (kind === 'polish') return setupPolish({ tier, points, level });
  if (kind === 'order') return setupOrder({ tier, points, level });
  if (kind === 'pour') return setupPour({ tier, points, level, pours, liquids });
  throw new Error(`No chain game ${kind}`);
}

/**
 * A craft in progress. `tier`, `points`, `level` come from the one d20 roll and the character; `tool` is the cutter's grade.
 * The state is plain JSON (the bench keeps it between steps), so it can be saved, left and picked up.
 */
export function createRecipe({ recipe = RECIPES['bolt-plate'], tier = 0, points = {}, level = POINT_MAX, tool = 'shop', bank = 0, seed = 1 } = {}) {
  const list = [];
  recipe.steps.forEach((st, si) => st.games.forEach((g) => list.push({ ...g, step: si, stepName: st.name })));
  const bits = gameSetup('screw', { tier, points, level });
  return {
    recipe: { id: recipe.id, name: recipe.name, what: recipe.what, materials: recipe.materials, build: recipe.build, steps: recipe.steps.map((st) => ({ name: st.name, games: st.games.map((g) => ({ ...g })) })) },
    tier: bits.tier, points: bits.points, level, tool, bank, seed,
    qualityBonus: bits.qualityBonus, buildFactor: bits.buildFactor, materialFactor: bits.materialFactor, label: bits.label,
    list, i: 0, attempt: 0, grades: [], spoils: 0, fails: 0, history: [], done: false, result: null,
  };
}

/** The game to play now (kind, its setup at this craft's roll, a fresh seed per sheet), or null when the craft is over. */
export function current(s) {
  if (s.done) return null;
  const g = s.list[s.i];
  return {
    kind: g.kind, shape: g.shape, index: s.i, total: s.list.length, step: g.step, stepName: g.stepName, attempt: s.attempt, redosLeft: MAX_REDOS - s.attempt,
    seed: s.seed + s.i * 977 + s.attempt * 131, bends: g.bends, pours: g.pours, liquids: g.liquids, setup: gameSetup(g.kind, { tier: s.tier, points: s.points, level: s.level, tool: s.tool, bends: g.bends, pours: g.pours, liquids: g.liquids }),
  };
}

/**
 * Hand in the grade of the game just played. Returns 'passed' (next game or the end), 'redo' (a spoil, same game on a fresh sheet)
 * or 'ruined' (the third fail). The result is on s.result once the craft is over.
 */
export function submit(s, grade) {
  if (s.done) return null;
  const g = clampGrade(grade), game = s.list[s.i];
  s.history.push({ kind: game.kind, grade: g, attempt: s.attempt });
  if (g >= PASS) {
    s.grades.push({ kind: game.kind, grade: g, attempts: s.attempt + 1 });
    s.i++; s.attempt = 0;
    if (s.i >= s.list.length) { finish(s, false); return 'passed'; }
    return 'passed';
  }
  s.spoils++; s.fails++;
  if (s.attempt >= MAX_REDOS) { finish(s, true); return 'ruined'; }
  s.attempt++;
  return 'redo';
}

function finish(s, ruined) {
  s.done = true;
  const grades = s.grades.map((x) => x.grade);
  const quality = ruined ? 0 : itemQuality(grades, s.qualityBonus);
  const stars = ruined ? 0 : starsOf(quality);
  const mat = settleMaterials({ recipe: s.recipe, spoils: s.spoils, factor: s.materialFactor, ruined, bank: s.bank });
  const passed = s.grades.length;
  s.result = {
    success: !ruined, ruined, recipe: s.recipe.id, name: s.recipe.name, what: s.recipe.what, grades: s.grades.map((x) => ({ ...x })), history: s.history.map((x) => ({ ...x })),
    average: grades.length ? Math.round((grades.reduce((a, b) => a + b, 0) / grades.length) * 100) / 100 : 0,
    spoils: s.spoils, quality, stars, passed, games: s.list.length,
    materials: mat.used, materialsExact: mat.exact, bank: mat.bank, saved: mat.saved, materialFactor: s.materialFactor, recipeMaterials: s.recipe.materials,
    buildSeconds: Math.max(1, Math.round(s.recipe.build * s.buildFactor)), qualityBonus: s.qualityBonus, tier: s.tier, label: s.label, tool: s.tool, xp: 0,
  };
  s.result.xp = chainXp(s.result);
}

/** A saved craft left between games, in plain words for the bench menu: "Bolt plate: Cut done (92), next Screw". */
export function partLine(s) {
  if (!s || s.done) return '';
  const done = s.grades.map((g) => `${KIND_NAME[g.kind]} ${Math.round(g.grade)}`).join(', ');
  const next = s.list[s.i];
  return `${s.recipe.name}: ${done || 'nothing done yet'}, next ${KIND_NAME[next.kind]}.`;
}
export { CRAFT_CATEGORIES };
