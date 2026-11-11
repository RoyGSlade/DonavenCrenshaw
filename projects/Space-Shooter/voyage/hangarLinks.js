// The hangar's seam to the story lane (ROUND2-CONTRACT.md sections 3 and 4).
// Story's modules (voyage/story/bus.js, progress.js) live on another branch
// until integration, so this file carries small stand-ins written from the
// contract. At integration, replace the bodies below with:
//   export { storyBus as bus, createBus } from './story/bus.js';
//   export { isUnlocked, storyOf } from './story/progress.js';
// and nothing else in the hangar changes.

/** A tiny event bus: { emit(type, detail), on(type, fn) -> off, once(type, fn) } (contract section 3). */
export function createBus() {
  const map = new Map();
  const on = (type, fn) => {
    if (!map.has(type)) map.set(type, new Set());
    map.get(type).add(fn);
    return () => map.get(type)?.delete(fn);
  };
  return {
    on,
    once(type, fn) { const off = on(type, (d) => { off(); fn(d); }); return off; },
    emit(type, detail = {}) {
      for (const fn of [...(map.get(type) || [])]) {
        try { fn(detail); } catch (error) { console.warn(`Stardust: a ${type} listener failed`, error); }
      }
    },
  };
}

/** The page's one bus (story's `storyBus` after integration). */
export const bus = createBus();

/** The save's story block, or null (contract section 4). */
export function storyOf(save) {
  const s = save?.story;
  return s && typeof s === 'object' ? s : null;
}

/**
 * Is an unlock open? A save with a captain and no story block played the slice
 * before round 2: everything is open. A fresh save with no story block (story's
 * director not running yet) is also treated as open, so the hangar is usable
 * on its own; the director writes `save.story` the moment it starts.
 */
export function isUnlocked(save, id) {
  const s = storyOf(save);
  if (!s) return true;
  if (s.finished || s.skipped) return true;
  return Array.isArray(s.unlocks) && s.unlocks.includes(id);
}

/** Is the tutorial running for this save? (respec is free while it is) */
export function tutorialOn(save) {
  const s = storyOf(save);
  return Boolean(s && !s.finished && !s.skipped);
}

// What each stat is for, in plain words (contract section 6). Story's
// `STAT_TEXT` (voyage/story/stats.js) replaces this at integration.
export const STAT_TEXT = Object.freeze({
  cha: { short: 'Talking, prices and how fast people warm to you.', rolls: 'Talking and trading rolls.', options: '[Charm]', boon: 'A 6: Edna sells to you 10% cheaper.' },
  con: { short: 'Hull, health on foot, hauling and digging.', rolls: 'Repair, towing and on-foot brawls.', options: '[Muscle]', boon: 'A 6: the first hit in each on-foot fight bounces off.' },
  dex: { short: 'Handling, dodging, aim and quick hands.', rolls: 'Navigation, dodging, ship fights and race legs.', options: '[Quick hands]', boon: 'A 6: your turret and sidearm pull onto nearby targets.' },
  wis: { short: 'Scanning, puzzles and reading people.', rolls: 'Scanning, puzzles and reading a room.', options: '[Read the room]', boon: 'A 6: every puzzle starts with one hint showing.' },
});

/** The chance a check passes: 1d6 + stat + bonus >= dc (story's `chance` after integration). */
export function chance(stat, dc, bonus = 0) {
  let pass = 0;
  for (let roll = 1; roll <= 6; roll++) if (roll + stat + bonus >= dc) pass++;
  return pass / 6;
}
