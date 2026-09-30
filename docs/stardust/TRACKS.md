# Stardust circuit implementation

Five original, widened 2D layouts replace the rectangular sectors. Each starts on its finish portal: launch in the arrow direction, fly one lap, collect the corner-apex signals, and return through the same portal. Original sector identities, music cues, lore and the fifth-sector secret remain.

| Circuit name | Landmark | Intended rhythm | Lane width |
| --- | --- | --- | --- |
| Alpha Relay | The Coil Relay | Hairpin, changing-radius bends and a switchback | 6.4 cells |
| Beacon Prime | The Orbital Esses | Broad sweepers and linked direction changes | 6.4 cells |
| Dustfall Station | The Foundry Straight | Long acceleration sections interrupted by chicanes | 6.4 cells |
| Nether Crossing | The Harbour Needle | Tight corners and a distinct rounded hairpin | 5.8 cells |
| Iron Veil | The Veil Sweep | Sweeping bends and a linked direction-change sequence | 6.4 cells |

These are freely authored game circuits inspired by racing rhythms, not scale recreations. The Nether Crossing hairpin has opposing centerlines seven cells apart, leaving an actual infield strip between its 5.8-cell lanes. Elevation, real-world corner counts and circuit logos are not reproduced. The names above are used in the hangar, HUD and runtime metadata; the renaming did not change coordinates, handling, timing or progression IDs.

## Archived reference research

The following are historical research references, not names for the game circuits or claims of affiliation. No map image or logo is bundled in the game. Current branding follows the [README naming policy](README.md#naming-policy).

- [Laguna Seca track information and Corkscrew](https://weathertechraceway.com/pages/track-information)
- [Silverstone official event map](https://www.silverstone.co.uk/sites/default/files/pdf/Silverstone-F1-2021-Event-Map.pdf)
- [Monza official circuit description](https://www.monzanet.it/tracciato-pista-monza/)
- [Automobile Club de Monaco circuit information](https://acm.mc/en/edition/formula-1-tag-heuer-grand-prix-de-monaco-2025/event/le-circuit-de-monaco/)
- [Spa-Francorchamps official access and circuit map](https://www.spa-francorchamps.be/assets/bf9d8b0a-509b-4607-abb3-2174b1522aa1/acces-camping-parking.pdf)

## Runtime and renderer contract

`createLevelLayout(level)` in `engine/levels.js` returns the existing nodes, hazards, wells, drones and level copy, plus `track`. All positions are world-cell units in a 48 by 32 world. Nodes retain the existing half-cell origin convention; `track` coordinates are their actual world positions. `safeRoute` is an authored apex line used by the control-driven validation pilot; `fastRoute` currently duplicates that line.

`track.name` is the circuit's Stardust display name. It replaces the former `inspiration` metadata; consumers should use `name` or the level's `title`. `track.points` is a closed centerline polyline (the last point connects to the first); `track.width` is the full driving width. `segments` supply cumulative distance, lengths and unit tangents. `checkpoints` supply position, tangent, index and along-track distance. `portal` supplies position, tangent `tx/ty`, normal `nx/ny` and initial ship `angle`. `bounds` supplies the world rectangle. The renderer uses the same geometry as collision detection.

`trackProgress` contains `nextCheckpoint`, `passed`, `lapStarted`, `distance` and `boundaryHits`. Use exported `isLapReady(scene)` for completion readiness rather than checking the checkpoint count alone. `pointOnTrack`, `nearestTrackPoint`, `isInsideTrack`, `portalCoordinates`, `constrainToTrack` and `updateTrackProgress` are exported by `engine/track.js`.

Rail collision checks the entire swept movement and clips at the first boundary, including a jump whose endpoint happens to land on another lane. Shots and sentinel sight lines cannot cross the infield. Ordered forward checkpoint crossings and a minimum travelled distance independently prevent skipping the lap. A checkpoint teleport is not credited. Nearby pieces of the circuit have verified separation; normal local corner cutting within the lane remains possible.

Player and shard collision use `config.PLAYER_RADIUS` and `config.PLANET_RADIUS`, matching the parent renderer's 66% scaling. Asteroid sizes cycle deterministically through 0.75, 0.875, 1, 1.125 and 1.25 of the authored base radius, permuted by sector. `radius = baseRadius * sizeScale` is calculated once and used by both collision and rendering. Destroyed rocks have zero HP and `destroyedAt` for the renderer; two direct player shots clear one.

## Finish, retry and secret rules

A normal finish needs every actual signal, every checkpoint in forward order, sufficient travelled distance, fuel, and an inward crossing on the front side. Spawn overlap never finishes a level. Retry rebuilds checkpoint and shard state. Fuel/hull failure retains the time already spent and adds its existing penalty; restarting the entire run intentionally starts a new attempt.

The Iron Veil secret additionally needs entry before 60 seconds of active sector time. Portal side, velocity and facing are measured relative to its tangent. To seek the rear entrance, finish the lap, pass the portal laterally outside its trigger radius, turn downstream of it, and fly back toward its rear face. Simply pointing backward or banking the last shard before waiting does not qualify. The existing boss, encrypted shard and local riddle follow this entrance unchanged.

## Verification and limits

Run `node --test tests/stardust-track.test.mjs tests/stardust-gameplay.test.mjs tests/stardust-gameplay-integration.test.mjs`.

The closed-loop validation pilot uses only turn and thrust inputs, with real physics, gravity, moving rocks, live sentinel fire, rail collision and the smaller signal pickup radius. It does not teleport the ship or synthesize lap proof. It collects every signal and returns to the starting portal. Representative deterministic results with the final rock-size cycle:

| Circuit              | Normal lap | Fuel left | Hull left | Rail contacts |
| -------------------- | ---------- | --------- | --------- | ------------- |
| Alpha Relay          | 40.73 s    | 73.4      | 100       | 0             |
| Beacon Prime         | 39.88 s    | 75.9      | 100       | 0             |
| Dustfall Station     | 43.36 s    | 72.2      | 91.5      | 0             |
| Nether Crossing      | 53.01 s    | 67.9      | 100       | 2             |
| Iron Veil            | 43.23 s    | 71.4      | 90.4      | 0             |

**Legacy (parked 2026-09-30):** the portal is gone from the main tracks and a lap ends at the finish line, so the Iron Veil rear-entry secret (arena, seal, Platinum 10) cannot be reached. It stays in the code, switched off, until it is restarted with a new trigger. The figures below are from when it was live.

The genuine Iron Veil lap plus deliberate portal bypass and rear entry takes 50.36 seconds, leaving 66.1 fuel and 90.4 hull. This proves mechanical attainability with roughly nine seconds of secret margin; it does not establish novice human difficulty. Nether Crossing's two harmless rail contacts are retained in the evidence. The pilot does not need boost, shooting or station refuelling, leaving those options available to players.

Earlier timestamped package/screenshot evidence retains its former research labels. Current naming is verified separately in `evidence/track-names.json` and the `track-names-*.png` screenshots; the old evidence was not rewritten to imply it captured a later build.

Additional regressions cover exact asteroid size limits, deterministic retries, swept infield blocking, reverse/skipped/teleported checkpoints, rotated portal rules, the actual finish API rejecting missing lap proof, restart timer preservation, frame-rate stability, predictive enemy fire and the existing arena progression. Browser rendering and human control review remain separate from these Node simulations.
