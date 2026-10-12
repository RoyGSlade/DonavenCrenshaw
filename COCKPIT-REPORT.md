# Cockpit camera (Stardust 3D) — report

Branch `claude/stardust-3d-cockpit`, local commits only (nothing pushed, no PR):
- `753e469` the desktop session's WIP, cherry-picked from `cf7b2ee` (cockpit maths, Needle measurements)
- `d6c0d01` the finished cockpit view

## What changed
- `gfx3d/motion/cameraMath.js`: `COCKPIT_3D` (62° vertical FOV, 2.4° down, near 0.02, follows half the bank/pitch) and `placeCockpit()`. These are pure maths, using the ship rig's rotation order `Ry(-angle)·Rx(bank)·Rz(pitch)`.
- `gfx3d/camera.js`: `update(..., view)`. When the view is `'cockpit'`, the eye goes to the hull's measured point and looks down the heading, with no 2D lens shift. It falls back to the chase view during the wreck.
- `gfx3d/index.js`: `draw3d({ ..., view })` passes the view to the ship (`setView`) and to the camera.
- `gfx3d/motion/shipAssets.js`: `HULL_FEATURES.needle`. The eye is at `(-0.127, 0.107, 0.004)` in unit space, with one tail nozzle and two painted glows.
- `gfx3d/ship.js`: The Needle's exhaust now comes from its single measured tail nozzle instead of the two default side ports. Two cheap additive sprites are added: one at the nozzle, which brightens with the engines, and a faint one on the canopy, which is hidden in the cockpit view. `shipInfo` now carries the eye, bank and pitch.
- `gfx3d/motion/shipInfo.js`: the new fields.
- `systems/flightSettings.js`: a new `camera3d: 'chase'|'cockpit'` setting (default `'chase'`) and `camera3dView()`.
- `ui/settingsPanel.js`: a "3D behind-ship camera: Chase / Cockpit" row on the Camera tab. It only shows while the 3D view is on.
- `ui/graphics.js`: passes `view` into `draw3d` through `drawArgs()`. The intro flythrough forces the chase view so the track pan still shows.
- `tests/stardust-3d-ship.test.mjs`: 6 new tests covering:
  - the eye position against the Blender measurement
  - the lens values
  - the eye position and look direction for poses, plus bank and reduced motion
  - the rig end to end: lane dead ahead, nose in view, no shear, and the chase view restored afterwards
  - cockpit is 3D-only: 2D and `input.js` don't know it exists
  - the Needle's nozzle, and the canopy glow hiding in the cockpit

Not touched: `input.js`, sim, physics, replay, hub, leaderboard, runGuard. `git diff 2b5267f` shows no change to any protected path.

## How to try it
1. Serve the repo root (`python -m http.server 8791 --bind 127.0.0.1`).
2. Open `http://127.0.0.1:8791/projects/Space-Shooter/?preview=weekly&render=3d` and choose "Preview week 1" with the Needle.
3. Settings → Camera → "3D behind-ship camera" → **Cockpit**.
4. In the race, press **C** to switch between track view and the behind-ship slot, which is now the cockpit. The toast still says "behind ship" because `input.js` is protected.

## Tests
`node --test tests/stardust-*.test.mjs`: 523 tests, 507 pass, 13 fail, 3 skipped.
- **11 failed only because `ws` is not installed** (no node_modules here):
  - dogfight-browser, dogfight-map-relay, dogfight-relay
  - ffa-browser, ffa-relay
  - laser-traps-browser
  - lobby-browser, lobby-relay
  - prediction-browser
  - ships-browser, ships
- **2 integrity tests fail because of this checkout, not the change:** "byte-identical to main" and "protected list names real files". The local `main`/`origin/main` here is from Sep 28 (`1c69408`) and is older than the weekly code, so `engine/weekly` "does not exist at origin/main". I checked directly that no protected file differs from the branch base `2b5267f`. They should pass on the laptop with an up-to-date `origin/main`.
- All 3D ship, camera and FX tests pass, including the 6 new ones.
- Not checked: I didn't look at it in a browser or with a GPU (headless run). The framing comes from the Blender measurements and the projection tests.

## Open questions for the owner
1. **Does the framing feel right in motion?** I'd like you to check the eye height, the 2.4° dip, and whether following half the visual bank feels good or makes you queasy. All of these are in `COCKPIT_3D`.
2. **C-cycle shape.** `input.js` is protected, so cockpit replaces the behind-ship slot (track ↔ cockpit) instead of adding a third stop. The toast still says "behind ship". A real 3-way cycle would need `input.js` to change and the integrity guard to be updated. Do you want that?
3. **Ship-anchored HUD marks.** The 2D HUD text and panels sit on top unchanged. Anything the 2D layer anchors to the ship's 2D pixel will drift from the 3D hull in the cockpit, because the lens shift is off there. Is that acceptable, or should those marks hide in the cockpit?
4. **Share codes.** The new setting isn't in settings share codes yet. Should it be?
5. **Other hulls.** Only the Needle has a measured eye. Courier, Manta and Wisp use a generic one, `(0.05, 0.09, 0)`, which may sit inside their canopies. Do you want them measured in Blender like the Needle?
6. **Glow sprites.** Are the nozzle and canopy sprites wanted, or is the painted texture enough?
