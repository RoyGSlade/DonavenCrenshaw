# Three interactive Dogfight arenas

The host chooses an arena before creating a room. Joining uses the host's map. Rematches keep that arena and restore its breakable cover. Classic remains available for the original open-space layout and existing control/weapon tests.

| Arena | Terrain and interaction | Tactical choice |
| --- | --- | --- |
| **Shatterbelt** | Rock islands, seven crystal barricades, four fuel pods. Crystals break after three primary hits; pods explode after two. Dotted rings show the 3.4-unit blast radius. | Keep cover intact to break sightlines, shoot a new firing lane, or detonate a pod beside either pilot. Explosions damage the shooter too. |
| **Gravemaw** | Two solid gravity cores pull ships through visible spiral fields. Close core exposure burns hull. Two linked jump gates teleport ships while preserving heading and momentum. | Slingshot through a field, risk the inner orbit, or flank through the other gate. Gates have a short re-entry cooldown and cannot bypass a laser-trap lock. |
| **Stormworks** | Wreckage makes staggered corridors. Opposing streams accelerate ships horizontally. Two reactor vents share an eight-second cycle: five seconds safe, 1.5 seconds warning, 1.5 seconds live. | Ride a stream for a fast approach or cross the vents between pulses. Active vents inflict 12 damage with a 0.6-second damage cooldown. |

Ships and primary/secondary projectiles collide with intact solid terrain. Primary fire breaks crystals and fuel pods. Laser traps do not destroy terrain; broken cover stops blocking them. Gravity and jump gates affect ships only. Gravity core exposure inflicts 6 damage with a 0.6-second cooldown. Fuel explosions deal 12–30 damage by distance and damage nearby breakable terrain; they never regenerate during a round.

The maps have 180-degree rotational symmetry and clear starting positions for all three ship sizes. Symmetry is a layout property, not a claim of human-tested balance.

## Implementation

- `projects/Space-Shooter/dogfight/maps.js`: reusable terrain definitions, arena metadata, shared hazard clock and terrain snapshots.
- `terrain.js`: forces, jump gates, timed damage, destruction, explosions and swept-hit ordering.
- `terrainView.js`: shared Canvas renderer for the map thumbnails and battlefield. Gameplay geometry drives the visual footprint. No new paid art or external assets.
- `terrainProtocol.js`: validates map identity, immutable terrain layout, bounded integrity and explosion state. The relay locks map identity to the room and the guest renders host terrain state.
- `mapPicker.js` / `maps.css`: accessible map selection, readable rules and in-match map information.

Existing ship classes/paint, shared flight physics and laser traps remain integrated. The terrain force step runs alongside the existing 120 Hz flight substeps. Hazard phases derive from round time, not display frame rate. Guest interpolation snaps across jump-gate distances so a teleport does not sweep a ship visibly across the map.

## Acceptance

Validated September 27, 2026:

- **11 focused map/relay checks passed** (`node --test tests/stardust-dogfight-maps.test.mjs tests/stardust-dogfight-map-relay.test.mjs`). Covers symmetry/spawn clearance, swept projectile destruction, friendly-fire blasts that crack nearby cover, gravity/streams, jump-gate cooldown and locks, vent timing, deterministic replay, hostile snapshot rejection, room selection, host/guest synchronization and clean rematches. Rerun successfully after the coordinated three-player integration landed.
- **All three two-browser map runs passed** (`node scripts/test-stardust-maps-browser.mjs`) against the frozen combined integration. Actual keyboard fire destroyed Shatterbelt cover; the guest received identical settled terrain integrity. All three maps selected correctly and retained their selection while restoring terrain in round two. Stormworks warning/live phases were captured. No browser exceptions, console errors or failed resources. See [browser results](evidence/maps/browser-results.json).
- **Three existing Dogfight browser regressions passed** (`node scripts/test-stardust-dogfight-browser.mjs`): keyboard wins/rematches/stall recovery, mobile multi-touch/simulated tilt, and standard gamepad emulation. Old combat fixtures explicitly select Classic; changing the default map must not turn terrain obstruction into a false weapon failure.
- Standalone build, JavaScript syntax checks and Git whitespace check passed. The broader pre-FFA Node suite passed 131 checks with 6 optional checks skipped; that historical total excludes a subsequently added terrain-lock check and later FFA tests and is not presented as the current combined suite count.

Browser acceptance uses actual keyboard fire to destroy Shatterbelt cover, two independent browser contexts and a live local WebSocket relay. Screenshots cover desktop and phone layouts plus reactor warning/live phases. Physical phones, public-network latency and human balance remain separate playtests.

Desktop and phone screenshots were inspected directly. Vent labels now have dark backing and stream labels clear the vent columns; map thumbnails and ship selection share a compact desktop row. The phone picker scrolls within the lobby without horizontal page overflow. Browser destruction checks wait for in-flight projectiles to settle before comparing the host and guest, avoiding comparison of different simulation ticks.

## Shared-work handoff

Map hooks preserve the controls/class/trap baseline commit `9b51f69`; the coordinated multiplayer chat subsequently added a fifth `mode` argument without changing map selection. This map work did not push or publish. The multiplayer chat completed the integrated relay restart. This map chat independently verified healthy responses, map-picker HTML, and exact map-source agreement at both `http://127.0.0.1:4174/projects/Space-Shooter/dogfight/` and `http://192.168.1.15:4174/projects/Space-Shooter/dogfight/`. These are local-session addresses, not public deployment. Refresh both clients before creating a new room.

The maps are designed with two-player rotational symmetry. Three-player spawning and mode acceptance belong to the coordinated multiplayer change; equal three-player route advantage is not established by the two-player map tests.

LHCmemoryS reports this checkout unregistered; checkpoint calls returned `daemon request failed`. This document is the local handoff.
