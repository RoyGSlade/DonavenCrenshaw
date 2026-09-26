# Stardust art direction and runtime contract

## Delivered art

The look is industrial gunmetal with pale beveled armor. Cyan marks the courier, services, and normal transit; amber/orange marks hostile energy. Purple is reserved for gate anomalies. Large value groups and silhouettes carry the read at gameplay scale. Generated raster assets are complete single objects; animations use Canvas geometry so effects respond to simulation state.

| Asset | Pixels | PNG bytes | Runtime role |
| --- | --- | --- | --- |
| `projects/Space-Shooter/art/player-ship.png` | 1254 × 1254 | 1,151,284 | Courier; nose up in source; `angle + PI/2` rotation |
| `projects/Space-Shooter/art/warden-v1.png` | 1237 × 1271 | 1,931,096 | Warden; forward face at top |
| `projects/Space-Shooter/art/relay-gate-v1.png` | 1254 × 1254 | 1,656,091 | Normal gate and arena exit; genuinely empty aperture |
| `projects/Space-Shooter/art/relay-station-v1.png` | 1333 × 1180 | 1,492,158 | Refueling relay; native aspect ratio preserved |

All five are 32-bit RGBA PNGs. Corners were measured alpha 0; the gate aperture center was measured alpha 0. Ship, Warden, and station center alpha is 253. No raster cleanup, background removal, or frame extraction was needed. Runtime uses the exact generated originals. The original ship/gate/station pack totals 6.23 MB; the additional 1254 × 1254 asteroid (`art/asteroid-v1.png`) is 2,345,334 bytes with corner alpha 0. Combined total is 8.58 MB; a lower-resolution export pass remains a possible delivery optimization, not a visual blocker.

Generation used the built-in OpenAI image_gen tool on 2026-09-26, one transparent image per asset. Exact production prompts and role-to-file mapping are saved in `projects/Space-Shooter/art/provenance.json`. Original generation IDs: player `exec-cac4af96-4ea8-4275-b112-67c2f83f4807`, Warden `exec-babcdaa6-3efc-4edb-ba93-fb3dc237e010`, gate `exec-060802da-961f-4d82-8080-e389df15fc8c`, station `exec-8f973b59-b5a7-45a2-8c84-5f71dba90292`.

## Rendering

`assets.js` keeps the existing exported `assets` object and asynchronous `loadAssets()` contract. Existing aliases and sequence keys remain available. New art resolves relative to the module, rather than depending on the document URL. `relayGate` is an added asset key; `playerShip` and `bossShip` now contain individual sprites rather than animated sheets. The only consuming renderer has been updated accordingly.

`gfx/stardustVfx.js` owns pure draw helpers; no helper changes simulation state. Every public helper saves and restores its Canvas state.

- Courier: dual animated engine plumes with strength from actual thrust input and fuel; enlarged boost plume while `_boostCd > 0.12`; reverse jets; braking arc while Flux is available; amber hit shell while invulnerable; low-health reactor pulse.
- Gate: animated internal arcs, two-sided approach markers, dim locked state, reversed purple anomaly pulse after shards are collected under one minute. Visuals do not determine eligibility.
- Warden: segmented animated amber shield, time-bounded expanding explosion and debris sparks.
- Gravity well: clear solid core, translucent influence boundary, pulsing field rings. Field visuals use actual `radius` and `influence`.
- Hazards: generated slate asteroid with deterministic rotation variants, plated wrecks with amber hazard strips, dotted motion tracks. Shapes stay within their circular collision radius; the small faceting gap is intentional silhouette variation.
- Sentinels: orange reactor silhouette and dashed line to their fixed predicted target during the telegraph. Dead drones are hidden.
- Shards: floating faceted colored crystals with soft local glow, removed immediately after collection.
- World: restrained dark blue background, faint navigation grid, and parallax stars behind entities and UI. All visual animation uses a pause-aware clock.

## Validation and limits

Each generated image was inspected directly. JavaScript syntax checks passed for assets, renderer, and VFX. A Canvas contract smoke test covered idle/empty fuel, thrust, reverse, boost, brake, damage, gate locked/ready/anomaly, shield, explosion, shards, wells, both hazard types, motion tracks, and drone telegraphs at five frame times: 1,303 finite drawing operations and balanced save/restore. This checks helper safety, not browser frame rate or collision qualification.

Source art is deliberately static: the responsive engine flames, hit state, shield, and effects supply animation. There is no claim of separately authored hull damage sprites or skeletal animation. Generators reuse the generated station body and gold shards use the same faceted crystal renderer. Sentinels intentionally reuse the Warden silhouette at a smaller scale; the asteroid uses one source with rotation variants. Those are asset reuse decisions, not additional unique raster assets. Wrecks remain code-drawn plated geometry. The parent owns full gameplay acceptance. Independent actual-browser visual review is recorded below.

## Independent browser visual QA

Playwright bundled Chromium, 1440 × 1000 viewport, localhost port 4174, September 26. No page errors during launch, flight, level overview, or arena fixture. Actual images were opened with `view_image`:

- `docs/stardust/evidence/art-qa-start.png`: start screen and same generated courier hero.
- `docs/stardust/evidence/art-qa-flight-thrust.png`: real keyboard Space + W flight; launched state true, timer advancing, responsive dual plume, coherent asteroid silhouette.
- `docs/stardust/evidence/art-qa-flight-nether.png`: staged level-4 overview with fixed drone telegraph. Confirms gravity core/field, sentinel target line, shards, station, and hazards at gameplay scale. This is a visual fixture, not a completed run.
- `docs/stardust/evidence/art-qa-warden.png`: staged arena with boss centered. This is an art review fixture, not evidence of entering or defeating the boss through play.

Visual review caught and fixed a missing environment-render call, primitive placeholder rocks inconsistent with the generated ship, legacy exhaust drawing across the hull, and a gate anomaly condition that did not use the simulation's actual eligibility. The final asteroid read is materially stronger. Reused Warden silhouettes clearly identify smaller sentinels as hostile. World and UI remain legible; large rocks intentionally occupy meaningful navigation space.

A browser sample of 100 level-4 render calls took 84.4 ms of CPU submission time. This is a bounded smoke measurement, not GPU timing, FPS proof, or a mobile benchmark. Reduced-motion mode freezes decorative oscillation/rotation, suppresses particles and star parallax/streaks, and renders explosion spread statically while preserving its fade. Its decorative clock was verified unchanged after a rendered frame.

Asteroid generation prompt is in `art/asteroid-provenance.json`, generation ID `exec-1983a2c9-a17e-40d0-998b-669be04c1912`. Raster assets have been visually inspected; none were altered after generation.

Final follow-up also inspected staged gate and explosion screenshots (art-qa-gate.png, art-qa-explosion.png). These verify the transparent aperture and time-driven explosion rendering, not gameplay transitions. Arena generators and shards now use the matching art family. Final VFX smoke was rerun after texture reuse and reduced-motion changes: 5 frame times, finite Canvas calls and balanced save/restore.
