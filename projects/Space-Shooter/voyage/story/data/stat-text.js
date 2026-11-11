// Stardust story data: what the stats are for, in words. DATA ONLY: the body after "= " is strict JSON so the
// Stardust Studio (Focus) can read and write it (lhc-lanes/stardust/STUDIO-SCHEMA.md,
// ROUND2-CONTRACT.md). No code, comments or trailing commas inside the JSON.
// The numbers are in voyage/data.js STATS; stats.js builds the rest of the words from them.
export const STAT_TEXT_DATA = {
  "version": 1,
  "lines": {
    "cha": "How well you talk, haggle and win people over. Talk and trade checks roll it.",
    "con": "How much you and your ship can take, and how hard you can graft. Hauling, digging and brawls roll it.",
    "dex": "Hands, reflexes and aim. Slipping past, dodging and ship fights roll it.",
    "wis": "Noticing things. Scans, routes, puzzles and reading people roll it."
  },
  "how": [
    "A check rolls one die and adds the stat. Meet the target number and you pass. Skills add more.",
    "Every point over {baseline} helps a little all the time. Every point under {baseline} costs a little.",
    "At {optionMin} or more a stat opens its own options in talks. A 6 also gives a boon."
  ]
};
