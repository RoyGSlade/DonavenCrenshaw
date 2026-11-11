// Quest givers: the people who hand out jobs. Rep is kept per giver (S28), so
// each id here is also a rep key in core's GIVERS. From the world lane's
// proposal (lhc-lanes/stardust/world/QUEST-GIVERS.md): Hask, Vey, Garrity.
// Names and lines are drafts for Donaven to edit. Swapping a giver is a data
// change: quests name their giver by id and call them by role in text.
// Portraits live in core's art map (voyage/art.js giverPortrait), keyed by id.
export const QUEST_GIVERS = Object.freeze({
  hask: {
    name: 'Stationmaster Orrin Hask',
    short: 'Hask',
    role: 'Relay Guild stationmaster',
    faction: 'relay-guild',
    sector: 'alpha',
    greeting: 'Pull up a crate, Captain. The coffee is still terrible. Deputy says hello. He\'s a cactus.',
    quests: ['cold-run', 'three-tiers', 'slow-parade', 'black-lane', 'dead-channel'],
  },
  vey: {
    name: 'Lucan Vey',
    short: 'Vey',
    role: 'information broker',
    faction: 'none',
    sector: 'beacon',
    greeting: 'Captain. You look like someone with a favour to spend.',
    quests: ['missing-page', 'railgun-paper-trail', 'teapot', 'warden-file', 'listening-gate'],
  },
  garrity: {
    name: 'Hob Garrity',
    short: 'Garrity',
    role: 'Driftborn salvage boss',
    faction: 'driftborn',
    sector: 'dustfall',
    greeting: 'If it floats, I can sell it. If it sinks, I can sell it slower.',
    quests: ['dead-weight', 'deep-seam', 'lighthouse', 'dustfall-derby', 'black-box'],
  },
});
