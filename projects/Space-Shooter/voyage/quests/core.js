// The one place quests reach core's Voyage code (INTERFACES.md, version 1).
// Today it re-exports the stub. When core's branch lands, point these at
// ../economy.js, ../character.js, ../upgrades.js, ../save.js and ../data.js.
export {
  grant, spend, canAfford, meets, missing,
  check, skillBonus,
  voyageShipStats,
  emptySave,
  GIVERS, ITEMS, STAT_NAMES, REP_MAX,
} from './coreStub.js';
