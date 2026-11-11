// The one place quests reach core's code (INTERFACES.md). Quests import the
// rules below from here and nowhere else, so a rename in core is one edit.
export { grant, spend, canAfford, meets, missing } from '../economy.js';
export { check, skillBonus } from '../character.js';
export { voyageShipStats, combatStats, raceStats, writesBoard } from '../upgrades.js';
export { emptySave } from '../save.js';
import { GIVERS as G, ITEMS as I, STATS, REP_MAX } from '../data.js';
export const GIVERS = Object.freeze(Object.fromEntries(G.map((g) => [g.id, g])));
export const ITEMS = Object.freeze(Object.fromEntries(I.map((i) => [i.id, i])));
export const STAT_NAMES = Object.freeze(Object.fromEntries(STATS.map((s) => [s.id, s.name])));
export { REP_MAX };

/** A captain for tests and the quest sandbox, shaped like core's createCharacter makes them. */
export function testCharacter(stats = { cha: 3, con: 3, dex: 3, wis: 3 }, name = 'Test Pilot') {
  return { id: 'c-test', name, look: { portrait: 'p1', color: '#81e6df' }, stats: { ...stats }, earned: 0, permanent: 0, skills: {}, deaths: 0, createdAt: 0 };
}
