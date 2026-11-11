// Quest givers: the people who hand out jobs. Rep is kept per giver (S28), so
// each id here is also a rep key in core's GIVERS. From the world lane's
// proposal (lhc-lanes/stardust/world/QUEST-GIVERS.md): Hask, Vey, Garrity.
// Names and lines are drafts for Donaven to edit. Swapping a giver is a data
// change: quests name their giver by id and call them by role in text.
export const QUEST_GIVERS = Object.freeze({
  hask: {
    name: 'Stationmaster Orrin Hask',
    short: 'Hask',
    role: 'Relay Guild stationmaster',
    faction: 'relay-guild',
    sector: 'alpha',
    portrait: 'art/hask.png',
    greeting: 'Bad coffee, worse budgets, and a lane that keeps trying to die. Pull up a crate, courier.',
    quests: ['cold-run', 'black-lane'],
  },
  vey: {
    name: 'Lucan Vey',
    short: 'Vey',
    role: 'information broker',
    faction: 'none',
    sector: 'beacon',
    portrait: 'art/vey.png',
    greeting: 'Everything is a favour, captain. The trick is knowing whose.',
    quests: ['railgun-paper-trail', 'listening-gate'],
  },
  garrity: {
    name: 'Hob Garrity',
    short: 'Garrity',
    role: 'Driftborn salvage boss',
    faction: 'driftborn',
    sector: 'dustfall',
    portrait: 'art/garrity.png',
    greeting: 'If it floats, I can sell it. If it sinks, I can sell it slower.',
    quests: ['dead-weight'],
  },
});
