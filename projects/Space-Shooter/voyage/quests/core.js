// The one place quests reach core's code (INTERFACES.md). Today it re-exports
// the stub, so this branch runs on its own. When core's branch is merged,
// replace the export below with this (checked 2026-11-11: all quest tests pass
// against core's real economy, character, upgrades and save modules):
//
//   export { grant, spend, canAfford, meets, missing } from '../economy.js';
//   export { check, skillBonus } from '../character.js';
//   export { voyageShipStats } from '../upgrades.js';
//   export { emptySave } from '../save.js';
//   import { GIVERS as G, ITEMS as I, STATS, REP_MAX } from '../data.js';
//   export const GIVERS = Object.fromEntries(G.map(g => [g.id, g]));
//   export const ITEMS = Object.fromEntries(I.map(i => [i.id, i]));
//   export const STAT_NAMES = Object.fromEntries(STATS.map(s => [s.id, s.name]));
//   export { REP_MAX };
//
// (core's data.js also needs the `mining-drill` item, proposed in INTERFACES.md.)
export {
  grant, spend, canAfford, meets, missing,
  check, skillBonus,
  voyageShipStats,
  emptySave,
  GIVERS, ITEMS, STAT_NAMES, REP_MAX,
} from './coreStub.js';
