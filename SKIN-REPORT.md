# Midnight metal track skin — report

Branch `claude/stardust-track-skin`: v1 is local commit `45a4f09` and v2 is `dc09a9e`, on top of origin/main `c9dce79`. Not pushed.

## v2 (Oct 6): rain removed from the deck, real animation added

### What changed
- **Static rain is gone.** The rain streaks were painted into the cached chunks, so they sat on the deck and never moved. That code (`paintRain`) is deleted, and nothing in the chunk cache moves or should move.
- **Falling rain** is a screen-space layer drawn each frame over the deck and under everything else, so checkpoints, shards, mines, sentries and ships all draw on top of it.
  - The streaks are short, thin (1 device px, or `H/900` on tall screens) and faint (13 % alpha). They lean and fall about 18° off vertical.
  - Each drop has a depth. Nearer drops are longer, fall faster, and drift more with the world's on-screen motion, which gives the parallax against the ship. A camera cut or respawn (a jump over 20 % of the screen width) is ignored, so drops don't streak across the screen.
  - Drops over a rail's glow band are drawn in a second stroke, a little brighter and cyan-tinted (30 % alpha).
  - The pool is one `Float32Array` for 90 drops, allocated once for the page. The low tier uses 40 drops and the high tier 90. The per-frame loop doesn't allocate: no objects, arrays or closures, and the near-segment list is reused.
  - Rain stops while the game is paused, because it runs on `visualTime`.
- **Neon flow on the rails:** a 1.6-cell pulse every 10.6 cells travels along each rail's cyan strip in the race direction at 6 cells/s.
  - It's an animated `lineDashOffset` on a path traced only through the runs of on-screen segments, so the cached chunks aren't rebuilt.
  - The path follows the lane's real rail: it stops at the bisector on the inside of a corner and rounds the outside like the lane's round join. A pulse flows through a corner without breaking.
  - The dash phase comes from each run's distance along the lap, so pulses line up wherever a run starts.
  - The high tier draws a soft halo plus a bright core. The low tier draws only the core.
  - One known imperfection: at the inner tip of week 1's hairpin (point 10), the rail line runs up to 0.2 cells inside the deck edge for about a third of a cell. A pulse passing there will briefly touch the deck. I checked the whole lap numerically, and that's the only spot.
- **Sheen:** the existing one-stroke gradient now drifts about 10× slower (a band's width every ~33 s). It's still high tier only.
- **Reduced motion:** no rain, no rail flow and no sheen, so the lane is static and rain-free. The cached deck still draws.
- **Plate tone:** plates are a little darker, now between #23282E and #464E57 (was #2A2F35–#4A525B), with the tones weighted toward the dark end.
  - More specular variation: about half the plates get a soft diagonal glint (4–14 %), and the baked diagonal bands now range from 3 to 11 % (was 4–9 %).
  - These are baked into the chunks, so they cost nothing per frame.
- **Week 2:** the skin keys off `scene.weekly`, which every weekly event sets (`engine/weekly/sim.js`), so it already covers week 2. No code change was needed, and a test now proves it. Main circuits and the custom track have no weekly event and stay classic. `?skin=classic` still wins.

### Week 2
- Id `weekly-02` (`WEEK2_DRAFT` in `tracks/weeklyRollout.js`, listed in `WEEKLY_EVENTS`).
- Window: opens **Tue Oct 6, 3:00 PM PDT**, exclusive from 7:00 PM PDT, closes **Tue Oct 13, 2:45 PM PDT** (`WEEKLY_ROLLOUT`).
- On this branch `WEEK2_DRAFT.track` is still `null` and `enabled: false`. The owner's geometry goes in through `scripts/stardust/ship-weekly-track.mjs` (branch `origin/claude/ship-week2-tool`). The test builds week 2 with week 1's geometry as a stand-in. The skin doesn't depend on the geometry, but I couldn't look at the real week-2 track.

### Per-frame draw cost (v2)
Counted with a fake canvas context over a full week-1 lap, two frames per position with the cache warm, behind-ship camera at zoom 1:

| | Phone, low tier (2532×1170, dpr 3) | Desktop, high tier (1920×1080, dpr 1) |
| --- | --- | --- |
| Rain drops | 40 | 90 |
| Rain strokes | 2 (1 if no drop is over the glow) | 2 |
| Rail-flow strokes | avg 2.9, max 6 | avg 5.1, max 12 (halo + core) |
| Sheen strokes | 0 | 1 |
| All animation strokes | avg 4.9, max 8 | avg 8.1, max 15 |
| Path vertices (moveTo/lineTo/arc) | avg 92, max 110 | avg 210, max 229 |
| Chunk blits (unchanged) | avg 11.8, max 20 | avg 10.6, max 18 |

- Rain also tests each drop against the lane segments near the view for the glow tint: about 40–90 drops × a handful of segments of arithmetic per frame.
- No `shadowBlur` and no per-frame canvases or gradients, apart from the sheen's one gradient on the high tier.
- Still not timed on a real device. These are call counts, not milliseconds.

### Tests (v2)
- `node --test tests/stardust-*.test.mjs`: 416 tests, 402 pass, 3 skipped, 11 fail.
- All 11 failures are `ERR_MODULE_NOT_FOUND: Cannot find package 'ws'` (node_modules isn't installed). It's the same 11 files as before:
  - stardust-dogfight-browser
  - stardust-dogfight-map-relay
  - stardust-dogfight-relay
  - stardust-ffa-browser
  - stardust-ffa-relay
  - stardust-laser-traps-browser
  - stardust-lobby-browser
  - stardust-lobby-relay
  - stardust-prediction-browser
  - stardust-ships-browser
  - stardust-ships
- `tests/stardust-track-skin.test.mjs` passes all 9 of its tests (4 new):
  - No rain is baked into the tile cache. No chunk stroke has more than one subpath, and the rain colour never appears.
  - The rain pool is bounded per tier (40 low, 90 high, capacity 90). It's the same pool on every frame, allocated once even across tier switches, and the drops move. Rain is at most 2 strokes a frame, and rail flow is bounded with both rails pulsing.
  - Reduced motion: no animation strokes and no drop moves, while the deck still blits.
  - Week 2 (`weekly-02`, matching the rollout window) gets midnight, and so does week 1. It's still midnight when week 2 is the featured weekly. Non-weekly scenes are classic, and `?skin=classic` wins.
- `node --check` passes on `gfx/trackSkin.js` and the test file. `ui/graphics.js` wasn't touched in v2.
- Visual only: v2 touches only `gfx/trackSkin.js` and its test. No sim, collision, replay, timing, run-guard, hub or leaderboard file was changed.

### Ready to PR for tomorrow: checklist
- [x] Static rain removed from the cached deck.
- [x] Falling rain and rail flow added, both off under reduced motion and lighter on the low tier.
- [x] Plates a bit darker with more specular variation.
- [x] Week 2 (`weekly-02`) gets the skin, and a test covers it.
- [x] Stardust tests green apart from the 11 known missing-`ws` files. `node --check` is clean.
- [x] Committed locally (`dc09a9e`). Nothing pushed, no PR, no deploy.
- [ ] **Owner: look at it in a browser.** Neither v1 nor v2 has been rendered (no browser in these unattended runs). Use `npm run dev:stardust`, then http://127.0.0.1:4173/projects/Space-Shooter/?weekly=weekly-01&preview=weekly. Check:
  - rain strength and speed
  - the pulse speed and brightness on the rails
  - the darker plates against `track-a-0.png`
  - that shards, mines and ships still read clearly
- [ ] Check it on a phone: frame times, and that the rain doesn't read as noise at dpr 3.
- [ ] Check reduced motion (settings) shows a static, rain-free lane.
- [ ] After the week-2 geometry lands (ship tool), preview week 2 once: `?weekly=weekly-02&preview=weekly`, if the draft preview path exists on the release branch.
- [ ] Rebase onto the week-2 release branch or main once week 2 is merged. This branch only touches `gfx/trackSkin.js`, `ui/graphics.js` and one test, so no conflicts are expected with the week-2 files.
- [ ] Owner approval, then push and open the PR (not done).

---

## v1 (first pass)

## What changed
- **New `projects/Space-Shooter/gfx/trackSkin.js`**: one module for both skins.
  - `midnight` (the default): dark brushed gunmetal deck plates in tones between #2A2F35 and #4A525B, with fine brushing along the lane. Plates sit in 3 staggered rows with etched seams (a dark groove with a faint lit lip) running across and along the lane, plus a seam on each corner bisector. Some plates get corner rivets and some get recessed service hatches. There's a faint diagonal specular sheen and very faint short diagonal rain streaks that stay fixed in the world. Each rail has a thin recessed #3DF2FF neon strip with a bright core, dashed into long segments, set in a dark recess with a metal lip and a soft cyan underglow onto the space around it. The start/finish checker is white and charcoal. The backdrop is near-black, with the existing starfield at 55 % opacity.
  - `classic`: the original lane drawing, moved over unchanged, with the original checker colours and backdrop.
- **`ui/graphics.js`**: `drawCircuit` now asks the skin module to draw the lane and the checker colours. The static backdrop and the star opacity follow the skin. Checkpoint lines, pieces, mines, sentries, shards and ships are unchanged.
- **Visual only.** No sim, collision, hull, replay, timing, run-guard, hub or leaderboard file was touched. The lane drawing is still the same round-joined corridor as the collision lane.
- **Scope:** the midnight skin only dresses **weekly** lanes. Main circuits and the custom track keep the classic look (see open questions).
- **New test `tests/stardust-track-skin.test.mjs`**:
  - `?skin=classic` parsing, plus the default and bogus values.
  - Weekly-only scope.
  - The classic lane never touches the cache.
  - Zoom-bucket hysteresis.
  - A full simulated lap of week 1 under a rotating, heavily zoomed camera on both device tiers. It checks that the chunk count never passes the cap, that eviction ran, that evicted canvases free their memory, and that no canvas is over 4096 px.

## How to view it
1. `npm run dev:stardust` (port 4173).
2. Week 1 weekly preview (midnight): http://127.0.0.1:4173/projects/Space-Shooter/?weekly=weekly-01&preview=weekly
3. The same with the old skin: http://127.0.0.1:4173/projects/Space-Shooter/?weekly=weekly-01&preview=weekly&skin=classic

Press "Preview week 1 (not saved)" on the weekly card. Nothing is saved.

## Test results
- `node --test tests/stardust-*.test.mjs`: 412 tests, 398 pass, 3 skipped, 11 fail.
- All 11 failures are `ERR_MODULE_NOT_FOUND: Cannot find package 'ws'` (node_modules isn't installed), and the same 11 fail on untouched `c9dce79`:
  - stardust-dogfight-browser
  - stardust-dogfight-map-relay
  - stardust-dogfight-relay
  - stardust-ffa-browser
  - stardust-ffa-relay
  - stardust-laser-traps-browser
  - stardust-lobby-browser
  - stardust-lobby-relay
  - stardust-prediction-browser
  - stardust-ships-browser
  - stardust-ships
- The new skin test file passes all 5 of its tests.
- `node --check` passes on `gfx/trackSkin.js`, `ui/graphics.js` and the new test.

## Perf notes
- **Cache:** chunks are 512 px plus a 2 px apron (516×516, about 1.07 MB each). They're built only where the lane or its glow reaches, and only when the camera gets near. Least-recently-drawn chunks are evicted first, and evicted canvases are zeroed so their memory is freed.
  - Phones and low-memory devices (coarse pointer, or `deviceMemory` of 4 or less): up to 64 texels per cell, at most 28 chunks, so about **30 MB** worst case.
  - Desktop: up to 96 texels per cell, at most 48 chunks, so about **51 MB** worst case.
  - The brushing texture is one 256×128 canvas.
  - No canvas is over 516 px on a side, far under 4096.
- **Zoom buckets:** 8/12/16/24/32/48/64/96 texels per cell, picked from the real on-screen scale (zoom × cell size × dpr). A bucket is held while it stays between 0.75× and 2× of what's needed, so the speed zoom never rebuilds it.
- **Typical phone (2532×1170 at dpr 3) at the start line:** 11 visible chunks, about 12 MB.
  - The first frame paints them all at once, about 1,800 canvas calls per chunk. That's a one-off hitch I estimate at tens of ms on a phone, during READY/SET/GO.
  - After that, a chunk takes at most 4 ms, at least one per frame when one is missing on screen. A ring just outside the view is painted ahead, one chunk per frame. Until a chunk is ready its area shows a plain two-stroke lane.
- **Per frame (steady):** about 11–15 `drawImage` blits and a little transform math. On desktop only, one gradient stroke adds the slow wet sheen; it's off on phones and under reduced motion. No shadowBlur and no per-frame texture work.
- The rain and other deck detail are static, baked into the chunks.
- **Not measured:** I couldn't run a browser in this unattended session (headless Chrome and the preview server need approval). The numbers above come from counting canvas calls with a fake context, not from timing real frames. Please check frame times on a phone.

## Open questions
1. **I haven't seen it rendered.** The look is built from the reference images and code review only, so there was no screenshot pass. Things worth checking by eye:
   - plate brightness against the references (I kept it toward the darker end of the range)
   - how strong the rain and the glow are
   - the dash length of the neon segments
   - whether the half-texel overlap fully hides chunk seams on your GPU
2. Should the midnight skin also dress the main circuits and the custom track? It's limited to weekly lanes for now. Turning it on everywhere is a one-line change in `laneSkin`.
3. Shards keep their existing per-shard colours (blue, green, purple, pink), all glowing. Did you want every shard forced to cyan?
4. The phone tier caches at 64 texels per cell, which a dpr-3 phone upscales about 2×. If the brushing looks soft, raising it to 96 needs about 2.25× as many chunks on screen, so the phone cap would have to go up to about 48 chunks (about 51 MB).
5. There's no in-game skin toggle yet, only `?skin=classic`. Do you want a settings switch?
