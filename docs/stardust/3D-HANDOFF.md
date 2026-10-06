# Stardust 3D look — handoff (2026-10-05)

Branch `claude/stardust-3d` (site repo `RoyGSlade/DonavenCrenshaw`). Not merged, not deployed. 2D stays the default.

## What it is
A 3D renderer for the weekly races that only draws. The sim, physics, drift, inputs, replays, hub verification and leaderboards are untouched (an integrity test proves the gameplay files are byte-identical to `main`). Turn it on with `?render=3d` or Settings → "3D view (beta)". Any WebGL or asset failure falls back to 2D.

## Run it
```
npm install
python -m http.server 8791 --bind 127.0.0.1      # from the repo root
# open http://127.0.0.1:8791/projects/Space-Shooter/?preview=weekly&render=3d → "Preview week 1"
npm run test:stardust     # 535 pass, 0 fail (14 optional skips)
npm run qa:3d -- --gpu    # browser e2e: 3D/2D/toggle/fallbacks; 60 fps at 1080p on an AMD 890M iGPU
```

## Layout
- `projects/Space-Shooter/gfx3d/index.js` orchestrator and module contracts; `mode.js` render choice.
- `world.js` + `world/` lane, rails, barricades, gate, shards, mines, asteroids, sentries, docks, backdrop.
- `ship.js`, `camera.js`, `fx.js` + `motion/` ship rig with visual-only banking/drift lean, chase camera mirroring the 2D view modes, pooled particles. `shots.js` sentry/player shots.
- `assets.js` loader; `art/3d/manifest.json` + `art/3d/ships|props/*.glb`; `viewer3d.html` (unlisted GLB viewer); `tools/3d/` export/optimize pipeline; `docs/stardust/3D-ASSETS.md` drop-in guide (`tools/3d/incoming/` + `npm run assets:3d:incoming`).
- `vendor/three/` three.js 0.186.0 (no third-party requests; `scripts/stardust/vendor-three.mjs`).
- Guards: `tests/stardust-3d-integrity.test.mjs` (gameplay byte-identical, 3D never writes sim state, import allowlist with reasons).

## Models in now
- Courier = Meshy multiview remake from `art/player-ship.png` (12k tris, 0.62 MB). Its length/width differ ~15% from the garage hull (radius fitted exactly; recorded in the manifest `hullFit`). Owner to judge.
- Needle / Manta / Wisp = the earlier approved Meshy sources, exported (≈1.1 MB each).
- Fuel-station gate (adaptive remesh, 5.7k tris) at start/finish; barricades (manual remesh, ~1k tris) instanced along both lane edges outside the rails.
- Meshy log and raw outputs: `C:\Users\Laptop\Documents\Codex\2026-09-29\stardust-3d-meshy\` (`ledger.jsonl`, `meshy_job.py`; 173 of the 500-credit cap used; multiview + remesh adaptive/manual both tested).

## Next, in order
1. **Owner's Needle remake** (decided 10-05: chase + cockpit views, starting with the Needle): `Codex\2026-09-29\stardust-cockpit-20261005\needle-3d\needle-full.glb` (source `Downloads\Meshy_AI_Twin_Spire_Starfighte_1005235057_texture.blend`, nose = −X). Drop it in as `tools/3d/incoming/ships/needle.glb` with `needle.json` `{"rotation":[0,180,0]}`, run `npm run assets:3d:incoming`, check it in `viewer3d.html`.
2. **Cockpit view**: add a third 3D camera mode in `gfx3d/camera.js` (camera just ahead of the canopy, looking down the lane; the twin spars frame the lane). Bind it to the existing C camera cycle only when 3D is on; 2D behaviour unchanged. Keep the 2D HUD readable over it. Test framing with the pure camera math tests in `tests/stardust-3d-ship.test.mjs`.
3. Owner playtest on the laptop (RTX 5070) with a controller; tune `SHIP_MOTION` (bank/slip) and camera tilt by feel.
4. Polish noted by agents: strafe-thruster jets read as thin spikes; explosion rings look flat; rail glow curtain hazy at steep angles.
5. Ship path: PR to `main` only after the owner says go (Pages deploys on merge; 3D stays opt-in).

Do not touch the sim, replay or hub code; do not change the 2D default; never push to `main` or deploy without the owner.
