# Track Studio v2 — report (not committed)

Branch `claude/track-studio-v2` (worktree `~/Desktop/track-studio-v2`), local commits only. Nothing pushed,
merged, deployed or restarted. The live checkout `~/homelab/apps/track-studio-site` and its `.studio-data`
were only read (copied once into the ignored `.collab-reports/studio-data-copy/` to study v1 use).

Commits on top of `claude/track-studio` (4aaf967):
1. Merge of the skin branch (`~/Desktop/DonavenCrenshaw-skin` `claude/stardust-track-skin`, `gfx/trackSkin.js`).
2. Draft format v2, live geometry, converter v2, per-track `skin`.
3. Server: v2 designs, autosave, request cards, kauto-3d queue, `--host` + whois, `--preview`.
4. The phone page (full rewrite of `tools/track-studio/static/`) + headless phone smoke test.
5. Docs: `docs/stardust/TRACK-STUDIO-V2-GAME-SUPPORT.md`, `docs/stardust/TRACK-STUDIO-V2-IDEAS.md`, README.

## What works (all exercised in a 412×915 headless phone Chromium, 24/24 checks)

- **Lane populates as you draw**: live Gaussian low-pass + RDP + Chaikin/Catmull-Rom smoothing, the lane drawn at
  its real width in the chosen skin, auto-close when you come back near the start (ring + haptic tick), pink
  markers live for overlaps, crossings, too-tight turns and (orange) razor zig-zags. Draw over the lane to reshape a
  stretch; Eraser opens the loop so you can redraw a piece; Set start / Auto start / Reverse / Close loop.
- **Skin picker** (Track sheet): Midnight metal / Classic, previews drawn by the game's own `trackSkin.js`. The board
  lane is `drawMidnightLane` / `drawClassicLane` itself for a uniform width, and the same deck clipped to the
  ribbon for a variable width. New optional `event.track.skin` (visual only); `?skin=` still wins.
- **Width tools**: global slider, width brush (paint a stretch wider/narrower, 5.8–14), auto taper (smoothstep
  ramps over N cells so very wide flows into narrow), live mini width graph with the game's 5.8–8 band.
- **Colour pens with layers**: obstacles (pink; rows with type, spacing, size, behaviour), shards (cyan; rows,
  racing-line suggestion, "lay 8 on the racing line", live count vs ≥3), landmarks (violet), hazard zones
  (orange lasso, 7 zone types), notes (grey scribbles + text pins). Layer sheet: show/hide, lock, per-layer eraser.
- **Stamps**: landmark, star, mine, sweeping rock, sentry, barricade, falling debris, gate/checkpoint, shard
  cluster, start/finish, fuel dock, feel marks, "?" request. Scale and rotate handles, drag to move, long-press for
  properties (type, size, rotation, behaviour, timing, label, note → layer follows type). Snap to centre line, lane
  edge or grid; Mirror (place a mirrored copy across the lane). Select: tap or lasso, move, duplicate, delete,
  mirror across lane, flip, snap, space evenly, turn across lane.
- **Phone handling**: two-finger pan + pinch, palm rejection (large contacts and late second fingers are ignored
  while drawing; a quick second finger turns into a pinch), stylus mode (pen draws, finger pans), haptics, deep
  undo/redo (300), autosave to the server (`designs/`) plus the phone's local copy. Midnight look, 16px+ text,
  44px+ targets, no outside scripts/fonts, CSP unchanged in spirit (`worker-src 'self'` added).
- **Request something new** card: title, description, effect, need/why, type, behaviour, form (size/shape/look),
  sketch from the canvas region or a quick pad, optional photo. On save: request + images saved, LHC board card
  (`board add` + `board note` with everything), "?" stamp placed where it's needed, kauto-3d queue file for visual
  types (contract fields, flock, atomic). Retry if LHC fails; nothing is lost.
- **Checks panel (live)**: loop closed, overlaps, crossings, tight turns vs the ship's lateral-grip turning model,
  zig-zags, tightest corner and its speed, width vs the game range, lap length and lap-time estimate, shards
  reachable vs requirement, start/finish + checkpoint count (auto start button), and the **real converter +
  autopilot running in a web worker on every edit** (≈0.5–1.2 s in headless Chromium), with fixes and the
  design-intent list. "Show what the game flies" overlays the converted layout (checkpoints, mines, shards…).
- **Version cards** (Tracks): thumbnail, autopilot time, your best lap, problems, design intent, Playtest / Copy
  link / Refine (optionally with the design) / Approve, Open in editor (v1 sketches load as v2), compare two
  versions side by side. Existing playtest, refine and approve flows unchanged and tested.
- **Draft v2** (`projects/Space-Shooter/studio/draftV2.js`): lane, width profile, skin, layered strokes, stamps,
  requests, notes, layer state; v1 sketches convert (marks → stamps, lap length kept). Converter emits only what
  the game supports and returns the rest as `intent` (stored on the version, shown everywhere, dashed on the SVG,
  given to refine agents).

Calibration on the owner's real week-2 sketch: the v2 checks flag 18 overlap spots and 4 zig-zags on it (what the
agent fixed by hand in v3), and estimate the lap at 2:06 autopilot vs the measured 2:04 on v3.

## Preview on the phone

```
bash ~/Desktop/track-studio-v2/studio-v2-preview.sh
# then on the phone (tailnet): http://100.125.226.51:8790/studio/
```
It copies `~/homelab/apps/track-studio-site/.studio-data` to a fresh temp dir, runs the v2 server from this
worktree on 100.125.226.51:8790, identifies every client with `tailscale whois` (owner donavencrenshaw@gmail.com),
refuses approvals (`--preview`), uses the real lhcmemorys for cards/refine (`LHC=off` to disable) and a temp 3D
queue (`KAUTO_QUEUE=~/kauto-3d/queue` to queue for real). Ctrl-C stops it. It is **not** running now.
I could not run the script itself here (it needs approval in this session); I ran the same server binary on
100.125.226.51:8790 with a scratch data dir: page 200, state 200, auth via real `tailscale whois`; then stopped it.

## Test results

- `python3 tools/track-studio/test_server.py`: **75 tests OK** (55 original unchanged + v2 designs, make, autosave,
  refine prompt, request cards + attach detection + retry, kauto queue writer on temp roots, whois host auth,
  preview, static, one end-to-end run of the real node converter on a v2 design).
- `node --test tests/stardust-studio-v2.test.mjs`: **17/17** (smoothing, overlap/crossing/tight/zig-zag
  detection, width taper maths, brush spans, draft v2 schema + v1 compatibility, converter v2, skin field).
- `node --test tests/stardust-*.test.mjs`: 456 tests, **442 pass, 3 skipped, 11 fail — all 11 are the expected
  missing `ws` package** (dogfight/ffa/lobby relay and browser files, ships). Includes the skin branch's
  `stardust-track-skin`, `stardust-studio-sketch` (v1 converter unchanged) and `stardust-weekly-studio`.
- `node --check` on every touched JS file; `python3 -m py_compile` on the server: clean.
- UI smoke: `node tools/track-studio/testing/ui_smoke.mjs <dir> <playwright/index.mjs>`: 24/24 (Playwright from the
  local npx cache + cached Chromium; nothing installed). One earlier run stalled on a Chromium screenshot; the script
  now has a watchdog and kills its server on any exit.

## Still needs game support (design intent today)

Variable lane width, moving/rotating/falling/timed obstacles, barricades, falling-debris and other hazard zones,
landmark/decor rendering, per-sector themes. Exact changes, replay/Hub implications and the safe order are in
`docs/stardust/TRACK-STUDIO-V2-GAME-SUPPORT.md` (decor first, variable width last). No sim, physics, collision,
replay, Hub or leaderboard code was changed.

## Open questions

1. **Sketch attachments**: the lhcmemorys CLI has no `board attach` (only the MCP tool `lhc_board_attach`). Cards
   get a note with the PNG path for an agent to attach. Add a CLI `board attach <id> <png>`? The server detects it
   automatically once it exists.
2. **Preview refine requests** go to the live checkout's repo target, whose converter is v1-only; refining v2
   designs works properly once this branch is merged. OK to keep, or point preview refines elsewhere?
3. **Queue for real from the preview?** It defaults to a temp queue; set `KAUTO_QUEUE` if the owner wants preview
   requests to reach kauto-3d.
4. Lane points are clamped to the page; is a 260-cell page (≈ Gantry Drop's lap for a loop round the page) the
   right default, with S/M/L/XL in Track settings?
5. Widths above 8 are allowed as intent (up to 14). Should the brush stop at 8 until variable width lands?

---

# True-to-game sizes (2026-10-06)

Owner's ask: "only change allow size of stuff to be accurate to depiction in game based on scale of track".
Same branch, local commit only. Nothing pushed, merged, deployed or restarted; no sim, physics, collision,
replay, Hub or leaderboard code changed.

## What changed

- **One scale for everything.** `projects/Space-Shooter/studio/gameSizes.js` (new) is the table of in-game sizes,
  read from the game's code (constants imported; the two values `createWeeklyLayout` writes inline, the sentry and
  mine radius, are measured from a real layout). The renderer draws every stamp, shard, obstacle row, the
  "Show what the game flies" overlay and the ship at that true size on the lane's world-to-screen scale. The old
  "never smaller than a fingertip" inflation is gone: items too small to see at the current zoom get a hollow
  dashed locator ring in screen pixels instead (the body stays true size). Tap targets are still fingertip-sized.
- **Default sizes = game sizes.** Mine 0.84, sentry 1.1, shard 0.627 (the drawn diamond), fuel dock 2.4 (pickup
  circle), gate and start/finish = the lane width the game flies, rock 1.6 (inside its range), cluster 3.
- **Honest size handles.** Fixed in game (mine, sentry, shard, fuel dock, gate, start): the handle is locked (⊘) and
  the box says "0.84 cells across · fixed in game"; the properties sheet and sub-toolbar show the same instead of a
  slider. Ranges (sweeping rock 0.8 to lane width − 0.6; shard cluster from 3): the handle and sliders snap inside
  it in 0.05-cell steps, labelled "1.6 cells across · game 0.8–6.4". Design intent (landmark, star, barricade,
  debris, feel marks, notes, "?" requests): free size, labelled "4.0 cells across · design intent", drawn true size.
  Old drafts with a non-game size on a fixed item (a mine sized 3) are drawn and checked at the game size.
- **Scale bar and ship.** Bottom-left of the board: "1 lane width = 7.0 cells" (or "5 lane widths = 35 cells" when
  zoomed out, with a tick per lane width), and the ship silhouette (the game's hull outline, `engine/shipHull.js`)
  at true size beside it once it is ≥ 10 px long; below that it reads "Ship 0.95 long: zoom in". The ship also
  sits on the start grid (2.5 cells behind the line, facing the lap) when zoomed in.
- **Width brush clamps to the game.** Brush, Base and the Lane tool's Width slider run 5.8–8 (confirmed:
  `WEEKLY_RULES.MIN_WIDTH/MAX_WIDTH` in `engine/weekly/layout.js`) with a "game max 8" tick at the end; the brush
  default is 8; painting can't exceed 8. Older drafts with wider intent (up to 14) still load and draw as saved;
  the first edit clamps base and brushed stretches to 8 in the same undo step and shows a one-time note per design
  ("This design was drawn wider than the game allows…"). Until then the Checks sheet says so.
- **Checks at true size.** New: "Mines block the whole lane in N spots" (bad, with a marker and Show) when a mine
  row at real radius leaves no gap as wide as the ship's hull (0.869); rows closer along the lap than a ship length
  count as one wall; wraps the lap. Shards: reachable only within `max(half − hull half-span + 0.7, half + 0.31)`
  of the centre line (pickup radius from the ship's centre, or the body touching the drawn shard); anything further
  is flagged with Show. The Checks sheet ends with an "In-game sizes (cells)" table (value, source file, constant).
- **One converter fix found by the new tests.** A shard cluster at its old smallest size (gap 1.2) lost its middle
  shard, because the converter merges shards closer than 1.2 and on a curve the gap measures just under that. The
  smallest cluster gap is now 1.5 (`SHARD_CLUSTER_MIN_GAP`); the default cluster (size 3, gap 1.5) is unchanged.
  The rock limits and the merge distance moved into `gameSizes.js` as named constants the converter imports (same
  values). Intent text now reads "(4 cells across)" instead of "(size 4)".

## The size table (`studio/gameSizes.js`, pinned by `tests/stardust-studio-sizes.test.mjs`)

| Size | Cells | Source | Constant |
| --- | --- | --- | --- |
| Lane width, narrowest / widest | 5.8 / 8 | engine/weekly/layout.js | `WEEKLY_RULES.MIN_WIDTH` / `MAX_WIDTH` |
| Mine radius | 0.42 | engine/weekly/layout.js | `WEEKLY_RULES.MINE_RADIUS` (also measured from a layout) |
| Shard pickup radius (ship centre) | 0.7 | engine/weekly/layout.js | `WEEKLY_RULES.SHARD_PICKUP` |
| Shard touch radius (ship body) | 0.31 | engine/weekly/layout.js | `WEEKLY_RULES.SHARD_TOUCH` |
| Shard drawn height × width | 0.627 × 0.351 | ui/graphics.js, state.js, gfx/stardustVfx.js | `drawShard(0.95 cell × config.SHARD_SCALE 0.66)`, diamond ±0.28 wide |
| Fuel dock pickup radius | 1.2 | engine/weekly/layout.js | `WEEKLY_RULES.STATION_PICKUP` |
| Sentry body radius | 0.55 | engine/weekly/layout.js | `createWeeklyLayout` sentry `radius` (measured) |
| Sentry range / distance beyond the rail | 11 / 1.1 | engine/weekly/layout.js | `WEEKLY_RULES.SENTRY_RANGE` / `SENTRY_OFFSET` |
| Sweeping rock radius | 0.4 to half width − 0.3 | studio/gameSizes.js → sketchToWeekly.js | `ROCK_RADIUS.MIN` / `RAIL_GAP` |
| Shards merge closer than | 1.2 | studio/gameSizes.js → sketchToWeekly.js | `SHARD_MERGE` |
| Shard cluster gap, smallest | 1.5 | studio/gameSizes.js → sketchToWeekly.js | `SHARD_CLUSTER_MIN_GAP` |
| Ship hull length × width | 0.9533 × 0.8691 | engine/shipHull.js | `SHIP_BODY.length` / `.width` |
| Ship hull half wingspan | 0.4337 | engine/hull.js | `PLAYER_HULL.halfSpan` |
| Ship start behind the line | 2.5 | engine/weekly/layout.js | `WEEKLY_RULES.START_BEHIND` |
| Start/finish line depth (midnight) | 0.48 | gfx/trackSkin.js | `finishChecker` rows × depth |
| Checkpoint / gate / start line across | lane width | engine/track.js, engine/weekly/sim.js | `track.width / 2` each side |

Barricades, falling debris, landmarks, stars, hazard zones, notes and requests have no game size yet (design intent).

## Test results (this change)

- `node --test tests/stardust-studio-sizes.test.mjs` (new): **10/10**: table pinned to the game constants and read
  from them (not copied), converter flies rocks/clusters inside the listed limits, default sizes = game sizes,
  lock/snap/free rules and labels, scale maths (scale bar, ship visibility, one scale), width clamps, old wide
  drafts (load as saved, game flies 8 with intent, clamp on edit), blocked mine rows, shard reach.
- `node --test tests/stardust-studio-v2.test.mjs`: **17/17** (three assertions updated: the brush now stops at 8;
  older drafts still load up to 14).
- `node --test tests/stardust-*.test.mjs`: 466 tests, **452 pass, 3 skipped, 11 fail: all 11 are the expected
  missing `ws` package** (same list as before).
- `python3 tools/track-studio/test_server.py`: **75 tests OK**. `python3 -m py_compile` on the server and
  `node --check` on every touched JS file: clean.
- UI smoke in a 412×915 headless phone Chromium (`tools/track-studio/testing/ui_smoke.mjs`, cached Playwright):
  **29/29**, including new checks: brush paints at the game max, both width sliders stop at 8 with the "game max 8"
  tick, a tapped mine is 0.84 and its size is locked, the selected mine's handle is locked and labelled "fixed in
  game", the scale bar reads in lane widths, and an old 12/13-wide draft loads as saved, clamps to 8 on edit and
  shows the note. Screenshots: `.collab-reports/ui-smoke-sizes/shots/` (03b-true-size.png is zoomed in on a mine
  with the scale bar and ship).

Open question 5 above is answered by this change: the brush stops at 8.
