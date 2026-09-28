# Stardust custom track

One extra circuit with its own leaderboard, released on a timer. It sits
outside the five-circuit network: it is not part of the full network run, its
splits, the network medal, challenges or the five-circuit achievements.

## What ships now

| Piece | Where |
| --- | --- |
| Track data (one file) | `projects/Space-Shooter/tracks/custom-track.js` |
| Release timer, launch flags, draft/export helpers (pure) | `projects/Space-Shooter/systems/customTrack.js` |
| Shared track checks and the scripted pilot | `projects/Space-Shooter/engine/trackChecks.js` |
| Hangar card | `systems/customTrackUi.js`, `#custom-track-card` in `index.html` |
| Hub runs for the board | `startBoardRun` / `finishBoardRun` in `systems/hubRuns.js`, wired in `systems/runSaving.js` |
| Stardust page section and board tab | `src/layouts/stardust.ejs`, `scripts/stardust-boards.js` |
| Track editor (unlisted, noindex) | `games/stardust/editor.html` (`projects/Space-Shooter/editor.html` + `editor/`) |
| Tests | `tests/stardust-custom-track*.test.mjs` |

The file ships a **placeholder** layout (a simple loop) marked
`placeholder: true`, with `releaseAt: "2026-09-29T19:00:00-07:00"`. A
placeholder never opens, even after its release time: the hangar says "coming
soon" and the Stardust page shows no Play button or board tab. That keeps the
stand-in from going live with a public leaderboard if the real track isn't in
by then.

## Build the track with the editor

Open `https://donavencrenshaw.com/games/stardust/editor.html` (or
`http://127.0.0.1:4173/projects/Space-Shooter/editor.html` with
`npm.cmd run dev:stardust`). It is not linked anywhere and is `noindex`.

- **Points** tool: click to add the next point (it goes after the selected
  point, or at the end), drag to move, select and press Delete to remove. Point
  0 (`S`) is the start/finish portal; the lap runs in point order. Arrow keys
  nudge the selected point (Shift for 2 cells). Ctrl+Z undoes.
- **Apex corners**: click a point to mark it. Each apex gets a signal pilots
  must collect; 3 to 5, never point 0.
- **Rocks**: click a stretch of lane to put a rock on that segment (segment *n*
  runs from point *n* to *n + 1*).
- Width slider (5.8 to 8), title, release time, music, board version,
  placeholder, and the optional briefing text.
- The editor remembers your work in this browser. *Start from* loads the
  shipped track, a blank grid, or pasted JSON / a `custom-track.js` file
  (parsed, never evaluated).

**Checks** run on every change with the same code the tests use: points
inside the map with room for the lane, lane width, lap longer than 95 cells,
3 to 5 apexes, signals and rocks inside the lane and apart, no rock on the
racing line, a drivable centreline, no two distant parts of the lane close
enough to cut across, and then the scripted careful pilot flying a whole lap
(under 60 s, fuel over 25, hull intact). Problems are listed in plain words.
Rocks the game would leave out (too close to a signal, portal or station) are
listed as notes.

**Test fly** saves the draft in this browser and opens
`games/stardust/?preview=custom&draft=1`: the game flies the draft, labelled
"Preview — not saved". It only flies once the checks pass.

## Publish it

1. All checks green, test flown.
2. Set the release time (ISO 8601 with its UTC offset, for example
   `2026-09-29T19:00:00-07:00`) and untick **Placeholder**.
3. **Copy custom-track.js** and paste it over
   `projects/Space-Shooter/tracks/custom-track.js`.
4. `node --test tests/stardust-custom-track*.test.mjs`, then the whole suite
   and the site build (`README` / `QA.md`).
5. Open a PR. After merge and deploy, the hangar and the Stardust page count
   down to `releaseAt` and then open the track.

You can also edit the file by hand: it is the `LEVELS` format from
`engine/levels.js` (`points`, `width`, `apexes`, `rocks`, and optionally
`moving`, `drones`, `well`) plus `id`, `version`, `releaseAt`, `placeholder`,
`title`, `landmark`, `lesson`, `rumor` and `music` (`level1` … `level5`).
The editor keeps `moving`, `drones` and `well` from an imported track but does
not edit them.

## The release timer

`releaseCountdown(releaseAt, now)` returns `{ valid, released, remainingMs,
label }`, with `label` like `1d 04:12:33` (or `04:12:33` under a day; seconds
round up, so it never reads zero early). An unreadable `releaseAt` never
releases.

- **Hangar:** the *Custom track* card shows a disabled "New track in 04:12:33"
  button with the release date, ticking every second, then "Fly the custom
  track". After release a placeholder or a track that fails its checks stays
  disabled and says why.
- **Stardust page** (`/stardust/#custom-track`): the build writes the release
  date into the page, so it reads right without JavaScript. With JavaScript it
  counts down and, at release, shows **Fly the custom track**
  (`games/stardust/?track=custom`, which opens the hangar on the card) and the
  **Custom track** leaderboard tab. A page built after release shows both
  straight away.
- The clock is the visitor's own. The timer is a presentation gate, not
  security: the track data ships in the public game bundle.

## Flags

| URL | What happens |
| --- | --- |
| `games/stardust/?track=custom` | Hangar opens on the custom track card |
| `games/stardust/?preview=custom` | Fly the shipped track any time. Never saved |
| `games/stardust/?preview=custom&draft=1` | Fly the editor's draft from this browser. Never saved |
| `games/stardust/?lab=…` | Lab rules apply to the custom track too. Never saved; the report names it |

## The hub board

The hub lists `custom-track` (name "Custom Track", version 1, `minTimeMs`
8000, `"network": false`) in `GET /api/games/stardust`. It has its own
leaderboard (`GET /api/games/stardust/boards/custom-track`) and its own runs:

- A launch opens `POST /runs { board: "custom-track", version, build }` and
  abandons any other open run. `version` is the file's `version`.
- The finish sends `POST /runs/<id>/finish { timeMs }`. No splits, fragments or
  challenge. Signal ids are `CT-S1` … so they can never be mistaken for network
  fragments.
- Guests fly it and are told times aren't saved. An asleep hub: played
  locally, "the leaderboard was offline".
- **An older hub without the board:** the game plays it locally and says "this
  track isn't on the leaderboard yet" on the card and at the finish. It never
  claims the game is out of date.
- **Another version on the hub:** no run is opened; the finish says the track
  doesn't match the leaderboard's version.
- No medal times are set for it yet.

Changing the layout after people have set times changes what a time means:
bump `version` in the file **and** in the hub's `rules.json`, which starts a
fresh board. Before release (and while it's the placeholder) no times exist, so
the real track can ship as version 1.
