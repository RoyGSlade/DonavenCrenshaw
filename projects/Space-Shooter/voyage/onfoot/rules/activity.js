// Skill levels upgrade the activities themselves (BRIEF "SKILL LEVELS",
// Donaven 2026-11-11): Slicer 2 gives more time on a hack, a wider bypass
// window, and opens "needs Slicer 2" doors. Every minigame reads its
// modifiers through activityMods(); every gate asks hasAccess(). Pure.
//
// Data (../tuning.json): `skillLevels` [{ skill, level, unlocks: [{ type:
// 'activity'|'access'|'ability', id, text }] }] and `activities` (what each
// activity id changes). Story's contract publishes the real ids; a page can
// pass its own `levels` (story or core data) and nothing here changes.
import TUNING from '../tuning.json' with { type: 'json' };
import { SKILLS } from '../../data.js';

/** Core/story skills with levels ({ id, levels: [{ level, unlocks }] }) as the flat list used here. */
export function levelsFromSkills(skills = []) {
  return skills.flatMap(s => (s.levels || []).map(l => ({ skill: s.id, level: l.level, unlocks: l.unlocks || [] })));
}
// Story's skill levels win once they are in data.js (SKILLS[].levels); until then tuning.json's stand-in table.
const FROM_DATA = levelsFromSkills(SKILLS);
export const SKILL_LEVELS = Object.freeze(FROM_DATA.length ? FROM_DATA : TUNING.skillLevels);
export const ACTIVITY_IDS = Object.freeze(Object.fromEntries(Object.entries(TUNING.activities).filter(([k]) => !k.startsWith('_'))));

/** Every unlock the captain has: for each skill, the entries of every level up to its rank. */
export function unlocksFor(character, levels = SKILL_LEVELS) {
  const skills = character?.skills || {};
  return levels.filter(l => (skills[l.skill] || 0) >= l.level).flatMap(l => l.unlocks.map(u => ({ ...u, skill: l.skill, level: l.level })));
}

/**
 * The modifiers for one activity ('hack', 'mine', 'puzzle', 'foot'), summed
 * over the captain's activity unlocks: { time, window, misses, hintSooner,
 * band, heatUp, spread, rate, dash, ids: [...] }. Missing keys are 0.
 */
export function activityMods(character, activity, { levels = SKILL_LEVELS, ids = ACTIVITY_IDS } = {}) {
  const mods = { ids: [], texts: [] };
  for (const u of unlocksFor(character, levels)) {
    if (u.type !== 'activity') continue;
    const def = ids[u.id];
    if (!def || def.activity !== activity) continue;
    mods.ids.push(u.id);
    if (def.text || u.text) mods.texts.push(u.text || def.text);
    // An unlock may carry its own size (story data: { id, value }); it replaces the default amount.
    const nums = Object.entries(def).filter(([, v]) => typeof v === 'number');
    for (const [k, v] of nums) mods[k] = (mods[k] || 0) + (typeof u.value === 'number' && nums.length === 1 ? u.value : v);
  }
  return mods;
}
export const mod = (mods, key) => mods?.[key] || 0;

/** Does the captain hold an access unlock (e.g. 'access:slicer.2')? A higher level of the same skill counts. */
export function hasAccess(character, accessId, { levels = SKILL_LEVELS } = {}) {
  if (!accessId) return true;
  return unlocksFor(character, levels).some(u => u.type === 'access' && u.id === accessId);
}

/** The plain-words reason an access gate is shut, from the level that grants it. */
export function accessReason(accessId, { levels = SKILL_LEVELS, skillName = id => id } = {}) {
  const l = levels.find(x => x.unlocks.some(u => u.type === 'access' && u.id === accessId));
  return l ? `Needs ${skillName(l.skill)} ${l.level}` : 'Locked';
}
