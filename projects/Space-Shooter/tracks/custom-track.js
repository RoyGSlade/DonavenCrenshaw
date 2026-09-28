// THE CUSTOM TRACK — one extra circuit with its own leaderboard ("custom-track"
// on the hub). It is not part of the five-circuit network, its splits, the
// network medal or the circuit achievements.
//
// How to replace it: draw it in the track editor (games/stardust/editor.html),
// press Export, paste the result over the object below, run the tests, open a
// PR. See docs/stardust/CUSTOM-TRACK.md.
//
// Format: exactly the LEVELS format in engine/levels.js (points on the 48 x 32
// grid in lap order, point 0 is the start portal; width; apexes = point
// numbers of the signal corners; rocks = segment numbers; optional moving,
// drones, well), plus:
//   id         always "custom-track" (the hub board)
//   version    the hub board version; bump it in the game AND the hub's
//              rules.json if the layout changes after times exist
//   releaseAt  when the hangar and the Stardust page unlock it (ISO 8601 with
//              an offset). Before then it counts down; ?preview=custom flies
//              it early, unsaved.
//   placeholder  true keeps it locked even after releaseAt, so this stand-in
//              never goes live. Remove it (or set false) with the real track.
//   music      which circuit's music plays: level1 … level5
//
// PLACEHOLDER: the layout below is a stand-in so the build, tests and editor
// have something valid to work with. It is not the real custom track.
export const CUSTOM_TRACK = {
  id: "custom-track",
  version: 1,
  placeholder: true,
  releaseAt: "2026-09-29T19:00:00-07:00",
  title: "Custom Track",
  landmark: "Placeholder loop",
  music: "level1",
  width: 6.4,
  lesson: "Placeholder layout. The real custom track replaces this loop.",
  rumor: "Relay log: a new lane is being charted. Check back soon.",
  points: [
    [12, 25],
    [26, 25],
    [38, 25],
    [42, 21],
    [42, 12],
    [38, 7],
    [27, 7],
    [21, 11],
    [15, 7],
    [9, 7],
    [6, 11],
    [6, 20],
    [8, 24],
  ],
  apexes: [3, 5, 7, 10],
  rocks: [1, 4, 8, 11],
};
