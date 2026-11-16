// Stardust story data: what the stats are for, in words. DATA ONLY: the body after "= " is strict JSON so the
// Stardust Studio (Focus) can read and write it (lhc-lanes/stardust/STUDIO-SCHEMA.md,
// ROUND2-CONTRACT.md). No code, comments or trailing commas inside the JSON.
// The numbers are in voyage/data.js STATS and CHECK; stats.js builds the rest of the words from them.
// how: {die} {pass} {min} {max} {easy} {normal} {hard} {heroic} {baseline} are filled from CHECK and the levels;
// a line starting {statonly} shows only when stats add to rolls (CHECK.addStat).
export const STAT_TEXT_DATA = {
  "version": 1,
  "lines": {
    "str": "Muscle. Punching a guy when the bullets run out, lifting, hauling, digging.",
    "con": "Toughness. Soaking hits and shrugging off poison, sickness and bad meatloaf.",
    "dex": "Reflexes, aim and quick hands. Dodging, slipping past, shooting, flying tricks.",
    "wis": "Noticing things. Scans, routes, puzzles and reading a lie.",
    "cha": "Talking, haggling, bluffing and gambling. How fast people like you."
  },
  "how": [
    "Every attempt is a fresh roll: one {die} plus your level in the skill it uses, against a target. Meet it and it works.",
    "Skill levels run from {min} to {max}. Each level is +1 on every roll with that skill.",
    "A natural 20 always works, whatever your level and however hard it is. A 1 is just a low roll.",
    "Advantage: roll two {die}s and keep the higher.",
    "Targets: easy {easy}, normal {normal}, hard {hard}, heroic {heroic}.",
    "{statonly}Your stat adds too: a 3 adds nothing, a 6 adds +3, a 1 takes away 2.",
    "Stats are rolled once and give small boosts: prices, hull, aim and more. Skill trees unlock places, better minigames and new moves."
  ]
};
