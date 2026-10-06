// Release candidate only. Set enabled after the owner approves the exact track
// and release window in Focus; mirror this block in the Hub's rules.json.
export const WEEKLY_ROLLOUT = {
  enabled: false,
  eventId: 'weekly-02',
  opensAt: '2026-10-06T15:00:00-07:00',
  exclusiveAt: '2026-10-06T19:00:00-07:00',
  // Focus a1f45c71: weekly close 14:45 Pacific, next weekly opens 15:00.
  closesAt: '2026-10-13T14:45:00-07:00',
  overlapBoards: ['weekly-01'],
  legacyBoards: ['full', 'alpha-relay', 'beacon-prime', 'dustfall-station', 'nether-crossing', 'iron-veil', 'custom-track'],
};

export const WEEK2_DRAFT = {
  id: 'weekly-02', week: 2, version: 1, enabled: false,
  // Optional visual theme ('mall'). Read only by gfx/mallTheme.js; the sim, replay and hub ignore it.
  theme: 'mall',
  title: 'Owner track pending', tagline: 'One lap. Every shard. One shared leaderboard.',
  opensAt: WEEKLY_ROLLOUT.opensAt, closesAt: WEEKLY_ROLLOUT.closesAt,
  commentsPage: 'stardust-weekly-02', music: 'level3', ships: 'builds',
  rewards: {
    champion: 'weekly-02-champion', championTitle: 'Week 2 Champion',
    championEntitlement: 'weekly-02-named-hull',
    namedHull: { family: 'courier', delivery: 'pending', name: 'Named after the winner' },
    placements: [
      { rank: 2, id: 'weekly-02-silver', title: 'nothin wrong with silver' },
      { rank: 3, id: 'weekly-02-third', title: 'hell you could be fifth' },
    ],
    crossWeekTitle: 'weekly-02-hero', crossWeekTitleText: 'Week 2 Hero',
    crossWeekBoards: ['weekly-01', 'weekly-02'], podiumSize: 3,
  },
  // The owner authors/selects the track. No placeholder geometry is flyable.
  track: null,
};
