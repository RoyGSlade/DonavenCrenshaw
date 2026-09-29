# Stardust weekly time trial

One hand-built track a week, one lap, its own leaderboard, seven days to set
your fastest time. Week 1 is **Gantry Drop**, traced from the owner's sketch.

| Piece | Where |
| --- | --- |
| Event data (tracks, windows, rewards) | `projects/Space-Shooter/tracks/weekly.js` |
| Layout builder and the weekly rules | `projects/Space-Shooter/engine/weekly/layout.js` (`WEEKLY_RULES`) |
| Fixed-step simulation (pure, deterministic) | `projects/Space-Shooter/engine/weekly/sim.js` |
| Input logs, replays, ghosts | `projects/Space-Shooter/engine/weekly/replay.js` |
| Scripted test pilot | `projects/Space-Shooter/engine/weekly/pilot.js` |
| Live game mode | `projects/Space-Shooter/engine/modes/weekly.js` |
| Visuals (mines, sentries, ghosts, stun, speed warning) | `projects/Space-Shooter/gfx/weeklyVfx.js` |
| Hangar card | `projects/Space-Shooter/systems/weeklyUi.js`, `#weekly-card` in `index.html` |
| Release window, links, layout picture (pure) | `projects/Space-Shooter/systems/weekly.js` |
| Hub saving + ghost download | `systems/runSaving.js` (`stardust:weeklyAttempt` / `stardust:weeklyRunComplete`), `systems/hubRuns.js` |
| Website page | `/stardust/weekly/` (`content/stardust/weekly.md`, `src/layouts/stardust-weekly.ejs`, `scripts/stardust-weekly.js`) |
| Tests | `tests/stardust-weekly.test.mjs`, `scripts/test-stardust-weekly-browser.mjs` |

The weekly took over the custom track's slot: the Stardust page's
custom-track section and board tab become the weekly's, and the hangar hides
the placeholder custom-track card (its code, editor and hub board are kept;
see [CUSTOM-TRACK.md](CUSTOM-TRACK.md)).

## The rules

- **One lap, no portal.** Collect every shard, then cross the full-width
  start/finish line. Crossing it with shards missing doesn't count.
- **Checkpoints and corner lines span the full lane**, corner included: across
  a corner the lane reaches `width/2` on the outside rail but
  `width/2 / cos(turn/2)` on the inside where the inner rails meet, and the
  line covers all of it (`engine/track.js`). An apex cut always counts. This
  applies to the network circuits too, which previously missed deep apex cuts.
- **Mines** are stationary. Touching one destroys the ship.
- **Rails**: a hit halves your speed and stuns the controls for 0.5 s. A
  scrape (outward speed under 0.35) or a touch while already stunned just
  slides.
- **Bouncing asteroids** sweep rail to rail near the corners. They hurt and
  shove; two shots break one.
- **Corner sentries** sit beyond the outside rail and fire at any ship in
  range (11 cells) slower than 4.5 cells/s. A 0.45 s aim line warns you;
  three hits breach the hull. The HUD shows your speed and "SENTRY LOCK —
  SPEED UP".
- **Fuel docks** refuel and repair when you fly through the ring.
- A death (mine, hull, fuel) sends you straight back to the grid on a fresh
  clock after a 1.5 s countdown. Each attempt is its own hub run.

All the numbers live in `WEEKLY_RULES`.

## The clock, recordings and ghosts

The weekly simulation runs at exactly 120 steps a second from a fixed-step
accumulator. The clock is the step count, and the finish is timed to the
fraction of the step where the ship crossed the line. Nothing in it reads
`Date.now()`, `performance.now()` or `Math.random()`, and it touches no global
game state. The playtest lab never changes a weekly run.

Every step's input is quantised (steering to 2 %, throttles to 5 %) *before*
it reaches the physics, live and in replays alike, and recorded. The log is
text:

```
SDW1|<eventId>|<version>|<steps>|<finishMs>|<n,turn,thrust,back,strafe,bits;…>
```

run-length encoded, numbers in base 36. A keyboard lap is ~40–80 KB; the hub
takes up to 256 KB and the game leaves the log off anything longer. Replaying
a log through `replayInputLog` lands on the same finish time to the bit
(tested in node and in the browser).

Ghosts are replays: your best on this browser (local storage, per event and
version) and the leaderboard's #1 (`GET …/boards/<id>/ghost?rank=1`) fly with
you. **G** toggles them.

The hub stores logs but does not verify them yet (`replay: "store"`). Because
the simulation is pure and deterministic, a hub-side `verifyReplay` can run the
same `engine/weekly/` modules in node later.

## Release timing

`opensAt`/`closesAt` in `tracks/weekly.js` must match the hub's
`rules.json` (`levels` and `events`); `tests/stardust-weekly.test.mjs` checks
both repos when they sit side by side. Before `opensAt` the hangar counts down
and only `?preview=weekly` flies it (never saved); the weekly page shows the
layout (no obstacles, numbered shards) and the countdown. After `closesAt` the
hub finalises the event (3 h grace for runs in flight): #1 gets the champion
title, the top 3 get **Planetfall Vanguard** and the `planetfall-early-access`
entitlement.

The owner's account (role ADMIN) never appears on a weekly board. Its times
show only on its public profile under **Dev times — not ranked**, and it may
post them before the board opens.

## Add a week

1. Append an event to `WEEKLY_EVENTS` (`weekly-02`, `week: 2`, new window,
   rewards, `commentsPage: "stardust-weekly-02"`, `track`). Placements are by
   segment and fraction (`seg`, `t`, `off`), so reshaping the points moves
   everything with them.
2. Add the `weekly-02` level and event to the hub's `rules.json`, and a
   `weekly-02-champion` title to `api/config/titles.json`.
3. `node --test tests/stardust-weekly.test.mjs` (layout, lane gaps, the
   scripted lap, replays) and `node scripts/test-stardust-weekly-browser.mjs`.
4. Preview: `npm run dev:stardust`, open
   `http://127.0.0.1:4173/projects/Space-Shooter/?preview=weekly`.

## Local playtest against a local hub

`?hub=http://localhost:3100` points the game at a hub on this machine for the
rest of the tab (plain-HTTP loopback only; `?hub=off` clears it). Build the
site with `HUB_URL=http://localhost:3100` and serve it on `localhost` (not
`127.0.0.1`) so the session cookie is same-site with the hub.
