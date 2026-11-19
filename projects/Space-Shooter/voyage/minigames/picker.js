// The level-up point picker: each level earns one point, spent in any of that
// skill's three categories (design doc Section 5; P1: points = level, max 9 in
// one category). This is the data and rules; each category knows what its
// points do in plain words, so the picker can show "now" and "with one more".
// The numbers are the same functions the minigames use (setup.js), so the
// card and the game cannot disagree. Shooting has no minigame: its three
// categories are listed with no numbers yet.
import { POINT_MAX, REPAIR_BASE, setupRepair, setupHack, setupPersuade, setupIntimidate, setupPilot, setupPerihelion } from './setup.js';

const f1 = (n) => (Math.round(n * 10) / 10).toString();
const plus = (n, unit) => `${n > 0 ? '+' : ''}${f1(n)}${unit}`;

/**
 * skill -> [{ id, name, words(n) }]: `words(n)` is the effect with n points in the category, as a short phrase.
 * `built`: which minigame exists to feel it (repair and hacking are playable; the rest are planned in PLAN.md).
 */
export const CATEGORIES = Object.freeze({
  shooting: { built: false, cats: [
    { id: 'reload', name: 'Faster reload', words: () => 'numbers not set yet' },
    { id: 'ammo', name: 'Bigger ammo capacity', words: () => 'numbers not set yet' },
    { id: 'spray', name: 'Narrower spray pattern', words: () => 'numbers not set yet' } ] },
  piloting: { built: true, cats: [
    { id: 'handling', name: 'Handling', words: (n) => `drift power ${f1(setupPilot({ points: { handling: n }, level: 9 }).drift)} in a landing` },
    { id: 'boost', name: 'Boost', words: (n) => { const b = setupPilot({ points: { boost: n }, level: 9 }); return `${b.fuel} s of thrust, ${b.brakes} emergency brake${b.brakes === 1 ? '' : 's'} per landing`; } },
    { id: 'landing', name: 'Landing', words: (n) => `safe touchdown speed ${setupPilot({ points: { landing: n }, level: 9 }).safe}` } ] },
  stealth: { built: true, cats: [
    { id: 'quiet', name: 'Quiet movement', words: (n) => `a heard step adds ${f1(12 * (1 - 0.07 * n))} heat` },
    { id: 'range', name: 'Detection range', words: (n) => `guard view cones ${f1(4 * (1 - 0.06 * n))} cells long` },
    { id: 'decay', name: 'Heat decay', words: (n) => `cools ${8 + 2 * n} heat on a quiet beat` } ] },
  hacking: { built: true, cats: [
    { id: 'time', name: 'Time', words: (n) => `${plus(2 * n, ' s')} on every firewall` },
    { id: 'size', name: 'Puzzle size', words: (n) => { const s = setupHack({ points: { size: n }, level: 9 }); return `mirrors start up to ${s.spread} steps off, ${Math.floor(n / 2)} fewer decoy${Math.floor(n / 2) === 1 ? '' : 's'}, ${Math.floor(n / 3)} fewer path mirror${Math.floor(n / 3) === 1 ? '' : 's'} (never under 1)`; } },
    { id: 'retries', name: 'Retries', words: (n) => `${plus(n, '')} ${n === 1 ? 'retry' : 'retries'} on the same board` } ] },
  repair: { built: true, cats: [
    { id: 'time', name: 'Time', words: (n) => `slower-rising water: ${plus(REPAIR_BASE.capacityPerPoint * n, ' s')} before it reaches the valve (${setupRepair({ points: { time: n } }).capacity} s of one leak)` },
    { id: 'size', name: 'Puzzle size', words: (n) => { const s = setupRepair({ points: { size: n } }).size; return `${s} x ${s} board`; } },
    { id: 'quality', name: 'Repair quality', words: (n) => `${plus(REPAIR_BASE.qualityPerPoint * n, '')} quality on every patch` } ] },
  crafting: { built: false, cats: [
    { id: 'quality', name: 'Quality', words: (n) => `${plus(4 * n, '')} quality on every part` },
    { id: 'speed', name: 'Speed', words: (n) => `builds ${f1(5 * n)}% faster, ${5 - Math.floor(n / 3)} shaping steps` },
    { id: 'material', name: 'Material use', words: (n) => `${f1(4 * n)}% less scrap, the fraction saved across crafts` } ] },
  social: { built: false, cats: [
    { id: 'persuade', name: 'Persuade', words: (n) => { const u = setupPersuade({ points: { persuade: n }, level: 9 }); return `trust needed ${u.goal} at a steady roll, you notice ${u.tells} thing${u.tells === 1 ? '' : 's'} about them`; } },
    { id: 'intimidate', name: 'Intimidate', words: (n) => { const u = setupIntimidate({ points: { intimidate: n }, level: 9 }); return `snap risk on the first push ${u.chances[0]}%, the sixth ${u.chances[5]}%, ${u.saves} save${u.saves === 1 ? '' : 's'}`; } },
    { id: 'haggle', name: 'Haggle', words: (n) => `${plus(1.5 * n, '%')} better final price, comfort band ${plus(0.4 * n, '%')} wider` } ] },
  navigation: { built: true, cats: [
    { id: 'time', name: 'Travel time', words: (n) => { const w = setupPerihelion({ points: { time: n }, level: 9 }); return `the engine fires ${f1(w.window)} s of each burn${n >= 3 ? `, ${Math.floor(n / 3)} spare turn${n >= 6 ? 's' : ''}` : ''}`; } },
    { id: 'fuel', name: 'Fuel use', words: (n) => `burns and trims cost ${f1(4 * n)}% less fuel` },
    { id: 'warning', name: 'Hazard warning', words: (n) => { const w = setupPerihelion({ points: { warning: n }, level: 9 }); return `the arc shows ${Math.round(w.arc * 100)}% of the burn, shards flagged ${f1(w.warn)} s ahead${w.scan ? ', fog scanned' : ''}`; } } ] },
});
export const CATEGORY_SKILLS = Object.freeze(Object.keys(CATEGORIES));

const cats = (skill) => CATEGORIES[skill]?.cats || [];
const clean = (n) => Math.max(0, Math.min(POINT_MAX, Math.trunc(n) || 0));

/** Points in each category for a skill, whole numbers 0..9, never more than `level` in all. */
export function cleanSkillPoints(skill, points, level) {
  const out = {}; let left = clean(level);
  for (const c of cats(skill)) { out[c.id] = Math.min(clean(points?.[c.id]), left); left -= out[c.id]; }
  return out;
}
export const spent = (points) => Object.values(points || {}).reduce((a, b) => a + clean(b), 0);
/** Points still to spend: level (P1: one per level) minus spent. */
export const unspent = (skill, points, level) => Math.max(0, clean(level) - spent(cleanSkillPoints(skill, points, level)));

/** Can a point go into this category? false when none is left, the category is at 9, or the id is unknown. */
export function canAdd(skill, points, level, cat) {
  if (!cats(skill).some((c) => c.id === cat)) return false;
  const p = cleanSkillPoints(skill, points, level);
  return unspent(skill, p, level) > 0 && p[cat] < POINT_MAX;
}
export const addPoint = (skill, points, level, cat) => {
  const p = cleanSkillPoints(skill, points, level);
  return canAdd(skill, p, level, cat) ? { ...p, [cat]: p[cat] + 1 } : p;
};
/** Take a point back (the respec rules and fee belong to the skill screen; this is the arithmetic only). */
export const removePoint = (skill, points, level, cat) => {
  const p = cleanSkillPoints(skill, points, level);
  return p[cat] > 0 ? { ...p, [cat]: p[cat] - 1 } : p;
};

/**
 * What the picker shows for one category: { id, name, points, now, next, nextChange, canAdd }.
 *   now         the effect at the current points
 *   next        the effect with one more point
 *   nextChange  null when one more point changes nothing visible yet: { at } = points needed for the next visible change
 */
export function describeCategory(skill, points, level, cat) {
  const c = cats(skill).find((x) => x.id === cat);
  if (!c) return null;
  const p = cleanSkillPoints(skill, points, level);
  const n = p[cat];
  const now = n === 0 && c.id !== 'warning' && skill !== 'shooting' ? 'no bonus yet' : c.words(n), next = n >= POINT_MAX ? null : c.words(n + 1);
  let nextChange = null;
  if (next !== null && next === c.words(n)) { for (let k = n + 2; k <= POINT_MAX; k++) if (c.words(k) !== c.words(n)) { nextChange = { at: k }; break; } }
  return { id: c.id, name: c.name, points: n, now, next, nextChange, canAdd: canAdd(skill, p, level, cat) };
}
export const describeSkill = (skill, points, level) => cats(skill).map((c) => describeCategory(skill, points, level, c.id));
