// THE WEEKLY TRACKS — one time trial a week, each with its own hub board.
//
// A weekly track is not part of the five-circuit network. It has its own rules
// (engine/weekly/): no portal (collect every shard, then cross the finish
// line), stationary mines that destroy the ship, bouncing asteroids in the
// corners, corner sentries that shoot slow ships, and rails that halve your
// speed and stun the controls for half a second. Runs are recorded input by
// input, so every finish can be replayed as a ghost.
//
// To add a week: append an entry below with a new id ("weekly-02"), a new
// hub board of the same id in the hub's rules.json (levels + events), and
// run `node --test tests/stardust-weekly*.test.mjs`. See docs/stardust/WEEKLY.md.
//
// Units are world cells, like engine/levels.js, but a weekly track is not
// held to the 48 x 32 network grid: its bounds come from its points.
//
// Placement conventions (all by lap position, so a reshaped point list moves
// everything with it):
//   seg    segment index (segment n runs from point n to point n + 1)
//   t      0..1 along that segment
//   off    cells to the right (+) or left (-) of the centreline, facing the
//          race direction
//
// opensAt/closesAt are ISO 8601 with an offset. The hub enforces the same
// window on its board, so change both together.
export const WEEKLY_EVENTS = [
  {
    id: 'weekly-01',
    week: 1,
    version: 1,
    title: 'Gantry Drop',
    tagline: 'One lap. Every shard. Cross the line fastest.',
    opensAt: '2026-09-29T19:00:00-07:00',
    closesAt: '2026-10-06T19:00:00-07:00',
    rewards: {
      champion: 'weekly-01-champion',
      championTitle: 'Week 1 Champion',
      podium: 'planetfall-vanguard',
      podiumTitle: 'Planetfall Vanguard',
      podiumSize: 3,
      entitlement: 'planetfall-early-access',
    },
    commentsPage: 'stardust-weekly-01',
    music: 'level3',
    track: {
      title: 'Gantry Drop',
      landmark: 'The Long Drop',
      width: 6,
      // Traced from the owner's sketch: a long top straight, a two-step
      // staircase, the long drop down the stem, a razor hairpin, the climb
      // back up and the tight knob at the start. Point 0 is the start/finish line.
      points: [
        [26, 11.5],
        [155, 24],
        [155.5, 40.5],
        [169, 41],
        [169, 56],
        [108, 56.5],
        [107, 88],
        [51.5, 89],
        [46.5, 261.5],
        [45, 269.5],
        [40.5, 273.5],
        [36, 269.5],
        [34.5, 261.5],
        [26.5, 194],
        [25, 104],
        [13, 30],
        [7, 16],
        [10, 10],
        [17, 10],
      ],
      // The shards: every one must be collected before the finish line counts.
      shards: [
        { seg: 0, t: 0.38, off: -1.9 },
        { seg: 2, t: 0.5, off: 0 },
        { seg: 4, t: 0.62, off: 1.7 },
        { seg: 6, t: 0.4, off: -1.8 },
        { seg: 7, t: 0.56, off: 2.0 },
        { seg: 9, t: 0.85, off: 1.1 },
        { seg: 13, t: 0.47, off: -1.9 },
        { seg: 16, t: 0.4, off: -0.9 },
      ],
      // Stationary mines: touch one and the ship is gone.
      mines: [
        // Top straight: a slalom that punishes the lazy centre line.
        { seg: 0, t: 0.18, off: 1.5 },
        { seg: 0, t: 0.3, off: -1.3 },
        { seg: 0, t: 0.52, off: 1.2 },
        { seg: 0, t: 0.53, off: -2.2 },
        { seg: 0, t: 0.7, off: -0.9 },
        { seg: 0, t: 0.86, off: 1.6 },
        // Staircase exits.
        { seg: 4, t: 0.3, off: -1.6 },
        { seg: 5, t: 0.55, off: 1.4 },
        { seg: 6, t: 0.72, off: 1.5 },
        // The long drop: a gauntlet at full speed.
        { seg: 7, t: 0.14, off: -1.2 },
        { seg: 7, t: 0.27, off: 1.3 },
        { seg: 7, t: 0.36, off: -0.4 },
        { seg: 7, t: 0.47, off: -1.9 },
        { seg: 7, t: 0.64, off: -0.8 },
        { seg: 7, t: 0.75, off: 1.7 },
        { seg: 7, t: 0.88, off: -1.5 },
        // The climb back up.
        { seg: 12, t: 0.3, off: 1.5 },
        { seg: 12, t: 0.62, off: -1.4 },
        { seg: 13, t: 0.2, off: 1.3 },
        { seg: 13, t: 0.72, off: 0.4 },
        { seg: 14, t: 0.35, off: -1.5 },
        { seg: 14, t: 0.7, off: 1.4 },
      ],
      // Bouncing asteroids that sweep across the lane near the corners.
      // speed in cells per second across the lane; phase 0..1 of a sweep.
      bouncers: [
        { seg: 1, t: 0.55, radius: 0.85, speed: 3.2, phase: 0.1 },
        { seg: 3, t: 0.5, radius: 0.8, speed: 3.6, phase: 0.6 },
        { seg: 5, t: 0.12, radius: 0.95, speed: 3, phase: 0.35 },
        { seg: 5, t: 0.9, radius: 0.8, speed: 3.4, phase: 0.8 },
        { seg: 6, t: 0.1, radius: 0.9, speed: 2.8, phase: 0.2 },
        { seg: 8, t: 0.5, radius: 0.75, speed: 3.8, phase: 0.5 },
        { seg: 11, t: 0.5, radius: 0.8, speed: 3.5, phase: 0.05 },
        { seg: 15, t: 0.82, radius: 0.9, speed: 3.1, phase: 0.7 },
        { seg: 17, t: 0.5, radius: 0.75, speed: 3.3, phase: 0.4 },
      ],
      // Corner sentries sit on the outside rail and fire at any ship in range
      // slower than minSpeed. Keep your speed up through the corners.
      sentries: [
        { point: 1, side: 'outside' },
        { point: 4, side: 'outside' },
        { point: 6, side: 'outside' },
        { point: 10, side: 'outside' },
        { point: 16, side: 'outside' },
      ],
      // Fuel docks: fly through the ring to refuel and repair.
      stations: [
        { seg: 7, t: 0.03, off: 0 },
        { seg: 14, t: 0.08, off: 0 },
      ],
    },
  },
];

/**
 * The event the game and the site feature at `now`: the latest one whose week
 * has started (opensAt minus 7 days, so next week's track is teased while this
 * one runs out), or the first if none has.
 */
export function currentWeekly(now = Date.now()) {
  const week = 7 * 86400000;
  let pick = WEEKLY_EVENTS[0];
  for (const event of WEEKLY_EVENTS) if (Date.parse(event.opensAt) - week <= now) pick = event;
  return pick;
}

export function weeklyById(id) {
  return WEEKLY_EVENTS.find((event) => event.id === id) || null;
}
