# Track Studio v2: what the game supports, and what each new tool needs

Track Studio v2 (`tools/track-studio/`) lets the owner design far more than the
weekly game can fly today. The converter (`projects/Space-Shooter/studio/sketchToWeekly.js`)
emits **only** what the game supports now. Everything else is kept as **design
intent**: it shows in the studio (violet tick, "Design intent (not in game
yet)" on checks and version cards, dashed on the preview SVG) and is written
into the version's report so refine agents and the owner can see it.

This branch changes no sim, physics, collision, replay, hub or leaderboard code.
The only game-side changes are visual or loader-side: an optional
`event.track.skin` (honoured by `gfx/trackSkin.js`, checked by
`systems/weeklyStudio.js`).

## What the weekly game supports today

Read from `engine/weekly/layout.js`, `engine/weekly/sim.js`, `engine/track.js`:

| Studio tool | Game today | How the converter emits it |
| --- | --- | --- |
| Lane (centre line) | Yes: a closed polyline, every point after the start is a checkpoint | RDP-simplified to ≤ 29 points, as v1 |
| Global width | Yes: **one** `track.width` per track, 5.8–8 (`WEEKLY_RULES.MIN_WIDTH/MAX_WIDTH`) | `width.base` clamped to 5.8–8 |
| Width brush / auto taper | **No**: width is one number used by rails, checkpoints, finish line, overlap checks | intent ("width varies from A to B") |
| Skin | Yes (visual only, this branch) | `track.skin` = `midnight` or `classic` |
| Mines (static) | Yes: `track.mines` `{seg,t,off}`, radius fixed 0.42 | stamps and obstacle-pen rows of type mine |
| Sweeping rocks | Yes: `track.bouncers` sweep rail to rail on the segment normal | rock stamps/rows, behaviour static or moving; `period` sets speed |
| Sentries | Yes: `track.sentries` `{point, side}` at a corner point | nearest corner point, inside/outside from the stamp's side |
| Fuel docks | Yes: `track.stations` | fuel stamps (else three automatic docks) |
| Shards | Yes: `track.shards` (≥ 3) | shard stamps, clusters (3), shard-pen rows (else 8–10 automatic) |
| Start / finish | Yes: point 0 | start stamp, or the lane's start point |
| Gate / checkpoint | Partly: every point is a checkpoint | a gate pins a point (like a v1 "tight" mark) |
| Feel marks (fast / tight / calm / hazard) | Converter-only | as v1: hazard density, pins |
| Moving / rotating / falling / timed / triggered obstacles | **No** | intent, left out |
| Barricades, falling debris | **No** | intent |
| Hazard zones (debris, wind, gravity, slow, boost, collapse, blackout) | **No** (`scene.gravityWells` exists but is always empty on weeklies) | intent with the polygon |
| Landmarks, stars, decor, notes | **No** (no decor layer in the weekly renderer) | intent with position and label |
| Requested items ("?") | n/a | intent + board card + optional 3D queue entry |

Auto hazards: when the design draws any obstacle, the converter places no
automatic mines/rocks/sentries (Track settings: Auto / Always / Never). The
autopilot fix-ups (remove a hit mine, move missed shards, widen to 8, …) still
run and are listed as fixes.

## The deterministic contract (why this needs care)

A weekly run is its input log (`SDW1/2/3|event|version|steps|finishMs|runs`).
Replaying the log through `engine/weekly/sim.js` must land on the same finish
time to the bit; ghosts are replays, and the Hub stores logs (and can verify
them later with the same modules in node). So anything that changes what
`createWeeklyLayout` builds or what `stepWeekly` does for an existing event
changes old runs. Rules for every addition below:

1. **New fields only, defaulting to today's behaviour.** An event without the
   field must build the identical layout and step identically. Test: every
   shipped event and every recorded test log replays unchanged.
2. **Pure functions of the step count.** Anything that moves (moving, rotating,
   falling, timed) is a function of `scene.step` / `scene.elapsed` and the
   event data, like `bouncerPosition(b, time)`. No `Math.random`, no wall clock,
   no frame-rate dependence.
3. **New physics on new logs only, if needed.** If an addition changes how the
   ship collides or moves in a way old content could hit, gate it behind a new
   `WEEKLY_PHYSICS` version and log prefix (as SDW2 / SDW3 did), so old logs
   replay under old rules. Pure content additions (new obstacle kinds that only
   appear on events that list them) do not need a new physics version.
4. **Bump the event `version`** whenever a published event's track data
   changes; the board and local bests are per version.
5. **The Hub verifier and the game must run the same module version.** Ship
   the engine change, then the Hub's verifier (or keep `replay: "store"` until
   it is updated), before any event uses the new field.
6. **Everything also has to work for the scripted autopilot**
   (`engine/weekly/pilot.js`), because the converter proves every track is
   finishable with it. New hazards need the pilot to avoid or survive them.

## Each new tool: the game change it needs

### 1. Variable lane width (width brush, auto taper) — biggest impact, most care
- Data: `track.widths: number[]` per point (or `[{at, w}]` stretches), absent =
  `track.width` everywhere. Width between points interpolates linearly by lap
  distance.
- `engine/track.js`: `isInsideTrack`, `hullLaneContact`, `laneNotches`,
  `constrainToTrack` all use `track.width / 2` today. They need the half-width
  at the nearest point (`nearestTrackPoint` already returns `segment` and
  `along`). Checkpoint `insideReach` and the finish-line lateral test
  (`crossedFinishLine`, `stepWeekly`) use `track.width` too.
- Rails must stay continuous where the width changes; the lane is the union of
  round-capped segments, so interpolated widths keep it watertight, but the
  inner-corner notch maths needs the local width on both sides of the corner.
- Gate it: physics changes only when `track.widths` is present, so existing
  events are untouched; a new physics version is not required if no shipped
  event uses it, but the Hub verifier must be updated first.
- Skin: `gfx/trackSkin.js` strokes the lane at one width; it needs per-segment
  widths (the studio already draws the deck clipped to a variable ribbon).
- Pilot: `pilotLine` clamps to `track.width/2 - margin`; use the local width.
- Checks: `geometryProblems` overlap distance uses one width; use the two local widths.

### 2. Moving obstacles on drawn paths, rotating obstacles
- Data: `track.movers: [{ kind: 'mine'|'rock', path: [[x,y]...] | {seg,t,…}, period, phase, radius }]`.
- Sim: position is a pure function of `scene.elapsed` (ping-pong or loop along
  the path), exactly like `bouncerPosition`. Collision reuses the mine
  (instant death) or rock (bounce + damage) code. Rotating bars need a
  segment-vs-hull test (the hull code has `shotHitsShip` for segments).
- Pilot: plan around the mover's position at the predicted time (the pilot
  already leads rocks by flight time).
- Replay: deterministic if pure in `elapsed`. New content only: no physics bump.

### 3. Falling debris zones (the mall escalator), collapsing floor, timed doors
- Data: `track.zones: [{ kind: 'debris'|'collapse'|'door', poly: [[x,y]], period, phase, duty }]`.
- Debris: pieces spawn on a fixed schedule from `elapsed` (seeded by index, no
  RNG), fall across the lane and use the rock collision. Collapse: a lane
  stretch that is "off" for part of its cycle (treated as outside the lane).
  Doors: a barrier segment that is solid while closed.
- These change where the ship can be; they must be pure in `elapsed` and the
  pilot must time them (wait or route) or the converter cannot prove the lap.
- Renderer: a telegraph before each drop/close (same as the sentry telegraph).

### 4. Hazard zones that push (wind / current, gravity wells, slow fields, boost strips)
- Data: zone polygons with a force vector or radial strength; boost strips
  with an impulse.
- Sim: an extra acceleration step in `stepWeekly` when the ship's centre is
  in a zone. The network circuits already have gravity wells
  (`applyGravity` in `engine/systems/environment.js`, used by
  `modes/roadmap.js`); the weekly scene carries `gravityWells: []` but
  `stepWeekly` never applies them, so wells are a reuse, not new physics.
- This changes ship motion: content-only for new events, but the Hub verifier
  must have the same code, and the pilot's speed plan must include the force.

### 5. Barricades and gates
- Barricade: a static solid segment across part of the lane. Collision: treat
  as a thin wall (rail response) or a mine (death). Content-only.
- Gate/checkpoint: the game already makes every point a checkpoint; a real
  "gate" (must pass between two posts) is a checkpoint with a narrower reach,
  which changes progress rules: new events only.

### 6. Landmark decor, per-sector themes, parallax
- Pure renderer work (`ui/graphics.js`, `gfx/`): a `track.decor` list
  (landmarks with a sprite/model id, size, position) drawn under/over the lane.
  The sim never reads it, so no replay or Hub change. Requested 3D assets from
  the kauto-3d queue would land here.
- Per-sector skins: `track.skinSectors: [{from, to, skin}]`, again visual only.

## Smallest safe order

1. **Skin field** (done on this branch): visual only, no sim change.
2. **Landmark decor / per-sector themes**: renderer only; uses the studio's
   landmark, star and request stamps; zero replay risk.
3. **Static barricades and gates**: new content types with existing collision
   code; only events that list them change.
4. **Moving / rotating obstacles on paths**: generalise `bouncerPosition`; pure
   in `elapsed`; pilot leads them.
5. **Timed doors, falling debris, collapsing floor**: scheduled, telegraphed,
   pure in `elapsed`; needs pilot timing.
6. **Force zones (wind, gravity, slow, boost)**: changes ship motion in `stepWeekly`; do it
   with the Hub verifier updated in lockstep.
7. **Variable width**: touches rails, checkpoints, finish line, notches, skin,
   pilot and overlap checks; the most code, so last, behind `track.widths`
   being absent on every shipped event, with all recorded logs replayed in CI.

For each step: replay every stored test log and every shipped event's
autopilot lap before and after (`node --test tests/stardust-weekly*.test.mjs`),
then teach the converter to emit the new field so the studio's intent turns
into real content.
