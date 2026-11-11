// Skills unlock things (ROUND2-CONTRACT.md section 9; Donaven 2026-11-11:
// "Skills should be for neat stuff or locked areas"). Skill levels live ONLY
// in data.js (SKILLS[].levels) and are read through character.js; nothing here
// keeps its own table. Pure.
//
//   activity unlocks make a minigame itself better: activityMods(c, 'hack')
//     sums the stacked `value`s of the unlocks the minigame understands;
//   access unlocks open gates: hasAccess(c, 'door.sealed'), and accessReason()
//     says which skill rank is missing in core's words ("Needs Hacker rank 2.").
//
// Which contract activity ids onfoot understands, and what each one changes, is
// data: ../tuning.json "activities" ({ id: { activity, mod } }). The numbers
// come from the skill's own level data. Ids nobody here implements yet
// (brawl.combo, stare.time, charge.radius, stealth.time, race.boost...) simply
// do nothing; the skill still shows in the hangar.
import TUNING from '../tuning.json' with { type: 'json' };
import { skillUnlocks, hasUnlock, skillsGranting } from '../../character.js';
import { missing } from '../../economy.js';

export const ACTIVITY_IDS = Object.freeze(Object.fromEntries(Object.entries(TUNING.activities).filter(([k]) => !k.startsWith('_'))));

/** Every unlock the captain has learned: [{ type, id, value?, text, skill, level }]. */
export const unlocksFor = (character) => skillUnlocks(character);

/**
 * The modifiers for one activity ('hack', 'lock', 'mine', 'explore', 'repair'),
 * summed over the captain's activity unlocks: { time, pins, sweet, yield, scan,
 * repair, ids: [...], texts: [...] }. Missing keys read as 0 (use mod()).
 * `texts` are the skills' own "this lets you..." lines, for the minigame panel.
 */
export function activityMods(character, activity, { ids = ACTIVITY_IDS } = {}) {
  const mods = { ids: [], texts: [] };
  for (const u of unlocksFor(character)) {
    if (u.type !== 'activity') continue;
    const def = ids[u.id];
    if (!def || def.activity !== activity) continue;
    mods.ids.push(u.id);
    if (u.text) mods.texts.push(u.text);
    mods[def.mod] = (mods[def.mod] || 0) + (Number(u.value) || 0);
  }
  return mods;
}
export const mod = (mods, key) => mods?.[key] || 0;

/** Does the captain hold this access unlock ('door.sealed', 'terminal', 'area.salvage')? A higher level holds the lower ones too. */
export function hasAccess(character, accessId) {
  if (!accessId) return true;
  return hasUnlock(character, 'access', String(accessId).replace(/^access:/, ''));
}

/**
 * The plain-words reason an access gate is shut, in core's requirement words:
 * "Needs the Hacker skill." (level 1) or "Needs Hacker rank 2." The lowest rank
 * that grants the access is the one named. `save` is optional (core reads the character from it).
 */
export function accessReason(accessId, save = null) {
  const id = String(accessId || '').replace(/^access:/, '');
  const first = skillsGranting('access', id).sort((a, b) => a.level - b.level)[0];
  if (!first) return 'Locked.';
  return missing(save || {}, { skills: { [first.skill]: first.level } })[0] || 'Locked.';
}

/**
 * A map gate (door or interact), as data -> null when open, else { reason, hack?, pick? }:
 *   access: 'door.sealed'      a contract access id (skills unlock it)
 *   requires: { skills: ... }  core's requirement format (only checked when a save is given)
 *   lock: { hack: n }          bypass it with the hack minigame (open to anyone)
 *   lock: { pick: n }          pick it (needs the Lockpick skill's door.locked access)
 * `reason` is a whole sentence in core's words ("Needs Hacker rank 2.").
 */
export function gateFor(def, { character = null, save = null } = {}) {
  if (!def) return null;
  if (def.access && !hasAccess(character, def.access)) return { reason: accessReason(def.access, save) };
  if (def.requires && save) { const why = missing(save, def.requires); if (why.length) return { reason: why[0] }; }
  if (def.lock?.pick) return hasAccess(character, 'door.locked') ? { reason: 'Locked.', hack: def.lock.pick, pick: true } : { reason: accessReason('door.locked', save) };
  if (def.lock?.hack) return { reason: 'Locked.', hack: def.lock.hack };
  return null;
}
