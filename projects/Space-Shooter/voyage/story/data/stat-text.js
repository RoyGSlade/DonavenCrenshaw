// Stardust story data: what the stats are for, in words. DATA ONLY: the body after "= " is strict JSON so the
// Stardust Studio (Focus) can read and write it (lhc-lanes/stardust/STUDIO-SCHEMA.md,
// ROUND2-CONTRACT.md). No code, comments or trailing commas inside the JSON.
// The numbers are in voyage/data.js STATS and CHECK; stats.js builds the rest of the words from them.
// how: {dice} {pass} {fail} {easy} {normal} {hard} {baseline} are filled from CHECK.
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
    "Every attempt is a fresh roll: {dice} plus your stat bonus, against a target. Meet it and it works.",
    "Your stat only shifts the odds: a 3 adds nothing, a 6 adds +3, a 1 takes away 2.",
    "A double six ({pass}) always works and a double one ({fail}) never does, whatever your stats.",
    "Targets: easy {easy}, normal {normal}, hard {hard}.",
    "Skills never change a roll. They unlock things: places, better minigames and new moves."
  ]
};
