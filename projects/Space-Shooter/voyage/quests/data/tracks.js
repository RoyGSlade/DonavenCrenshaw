// Tracks a quest can race on. pilotMs is the racing game's own test pilot
// (engine/weekly/pilot.js flyWeeklyLap) on that layout with today's physics,
// rounded to the millisecond. tests/stardust-voyage-quests.test.mjs flies the
// pilot again and fails if a number here drifts from the real track.
export const TRACKS = Object.freeze({
  'gantry-drop': { title: 'Gantry Drop', weekly: 'weekly-01', pilotMs: 103902 },
  'abandoned-mall': { title: 'The Abandoned Mall', weekly: 'weekly-02', pilotMs: 123970 },
});
