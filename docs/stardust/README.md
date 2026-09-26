# Stardust overhaul — working build

The integrated overhaul is on `codex/stardust-overhaul`, based on GitHub `RoyGSlade/DonavenCrenshaw` main at `03da619`, for pull-request review. This change packages the playable game and Hub handoff; it does not change the production route or deploy the game. The existing website redirects the old game URL, and the standalone build keeps this game review separate from that website.

## Run and build

The current slice adds five one-lap circuits with a shared start/finish portal, smaller ships/shards, variable asteroid sizes, and private browser-hosted Dogfight 1v1. Crew 2v2 follows Dogfight. Hub rankings have a separate [future product note](HUB-DOGFIGHT-RANKING-NOTE.md).

**Home-network playtest is running:** [open on both phones](http://192.168.1.15:4174/projects/Space-Shooter/). The user confirmed phone access. Dogfight selects the same-network relay automatically. See [LAN playtest/restart instructions](LAN-PLAYTEST.md).

Node.js 22+ recommended (the code uses modern ES modules). Solo preview/build tools use Node built-ins. Dogfight's relay and its tests also require the pinned `ws` dependency from `npm.cmd ci`.

```powershell
npm.cmd run dev:stardust
# Open http://127.0.0.1:4173/projects/Space-Shooter/
# In another terminal, for the Dogfight menu entry:
npm.cmd run dev:dogfight
# Relay listens on 127.0.0.1:4174; create a room and join from another browser.
npm.cmd run test:stardust
npm.cmd run build:stardust
# Optional preview of the built artifact:
node scripts/preview-stardust.mjs --dist
```

The preview binds only to loopback. Set `PORT` to use another local port. The artifact is `dist/stardust`; its root index leads to `projects/Space-Shooter/`. The builder validates its fixed output path and rejects symlink output before rebuilding only that generated directory. The dedicated `Verify Stardust` workflow runs the Node suite and standalone build on relevant pull requests and main-branch pushes. Hardware/LAN and optional browser checks remain separate from that CI run.

## NOW — implemented and verified

- Five authored circuits, inspired in order by Laguna Seca, Silverstone, Monza, Monaco and Spa-Francorchamps. Launch on the portal, cross each corner checkpoint in order, collect apex shards, then finish at that same portal. Solid corridor rails block infield shortcuts; Monaco has a rounded hairpin. Sector identities, music and story remain. See [track geometry and lap evidence](TRACKS.md).
- Gameplay ship and shard visuals/colliders are 66% of the previous size. Asteroids vary deterministically from 75% to 125%, match their collision sizes, and can be cleared with two direct shots. The normal camera scale is preserved despite the larger world.
- Dogfight V1 provides private 1v1 rooms, a symmetric arena with cover, guest controls relayed to the host's fixed-step simulation, hull damage, a winner/draw, mutual rematches and explicit interrupted/disconnected states. Locally verified with two browsers; public internet play still needs a configured secure relay and external testing. Results remain casual and unranked. See [Dogfight setup and limits](DOGFIGHT.md).
- Solid hazards, repeating moving debris, gravity cores/fields, fixed predictive enemy telegraphs, shooting and projectile momentum. Flux rewards controlled movement; boost spends Flux before charge pips; X spends Flux to brake.
- Five generated transparent raster assets, responsive engine/boost/reverse/braking effects, shields, explosions, readable gravity and enemy targeting. Sentinels and generators reuse the Warden and station art. See [art direction and provenance](ART-DIRECTION.md).
- L5's rear gate accepts all shards with actual inward velocity, backward-facing approach, fuel, and sector time strictly below 60 seconds. Prior sector clues introduce the outward journey. The Warden encounter, special-shard pickup, and 120-second seal work locally. The reversed glyph sequence is solvable without audio or color. Discovery saves are explicitly local browser records.
- New hangar, mobile layout, pointer controls, separate sector/run clocks, pause/settings flows, credits and reduced-motion preference. Drag the hangar ship with a mouse or touch to spin it; release adds damped momentum. Arrow keys turn it, Home resets it, and reduced motion disables the extra coast. Mobile places the ship in its own accessible row.
- Optional backend health adapter with blank default URL and bounded fallback. It makes no request in the default build. No account sync, identity service, leaderboard, public API, or tunnel is implemented. See [backend handoff](BACKEND-HANDOFF.md).
- All ten owner-supplied Suno tracks are integrated: menu, five sectors, secret, Warden, riddle and victory. Cue changes crossfade, music unlocks on input, and mute/volume works during transitions. Exact puzzle tones and legacy effects stay in the SFX channel. Source files are preserved unchanged, with hashes and the owner's paid-at-creation-and-download attestation in the [soundtrack import record](SOUNDTRACK-IMPORT.md). The agent did not generate or purchase the music.

## Verification — September 26, 2026

- `npm.cmd run test:stardust` with `STARDUST_TEST_LAN_IP=192.168.1.15`: **89 passed, 0 failed**, with two optional browser cases skipped in that run. Includes 35 gameplay/track checks, 13 progression/backend checks, 10 audio-controller checks, 18 Dogfight simulation/relay/LAN checks and 13 mobile-controller/input checks. Without the LAN environment variable, that optional integration case is also skipped. Control-only flight completes every actual checkpoint and apex on all five circuits with fuel/hull remaining. Normal lap times range from 39.88 to 53.01 seconds; the full fifth lap plus intentional rear entry takes 50.36 seconds. Rails, missing lap proof, asteroid destruction, secret/boss/seal progression and existing audio regressions are covered.
- Dogfight browser checks use actual keyboard firing and live loopback WebSockets: host wins, guest wins the rematch, both clients agree, another rematch works, and disconnect closes the room. Root also observed both ships turning/thrusting through relayed snapshots and inspected desktop/mobile views, with no page/console errors or failed resources. The separate optional browser test passed independently, including a 5.2-second host script stall and interrupted-round handling. This is local transport proof, not an internet latency or human balance test. Evidence: `evidence/dogfight-root-browser.json`; reusable browser runner: `node scripts/test-stardust-dogfight-browser.mjs`.
- Browser smoke: Edge/Chromium 1440×900 and 390×844; actual keyboard launch/thrust/shard pickup, pause/settings/resume, pointer launch, local seal solve/persistence, return-to-hangar/replay, and controller-defeat guard. No browser exceptions, console errors, or failed resource responses. Browser secret/boss fixtures intentionally set game state to inspect those paths; they are **not** evidence of a human complete playthrough. [JSON evidence](evidence/browser-smoke.json).
- Art worker inspected actual keyboard flight and explicitly staged boss/gate/explosion visual fixtures. Root independently inspected hangar, flight, arena, riddle and mobile screenshots. See `evidence/art-qa-*.png`.
- Hangar ship interaction: root verified real mouse drag/inertia, keyboard arrows/Home/Enter, reduced-motion stop, real touch gestures at 390×844, no horizontal overflow and motion cancellation on launch. [Interaction evidence](evidence/hangar-spin.json) and `evidence/hangar-spin-desktop.png` / `hangar-spin-mobile.png`.
- Standalone clean build succeeded. Root opened the packaged main menu, Dogfight and return link, and the standalone relay's main-game return link. All five new track modules loaded; there were no failed resources or page errors. Production output excludes art provenance JSON; the relay rejects it, evidence paths and repository files. Resource/containment checks passed; see `evidence/final-package-check.json`. JavaScript syntax and Git whitespace checks passed.
- All ten imported music files decoded fully and played in Edge/Chromium, with advancing playheads, no non-finite samples or decoded peaks over full scale, matching source hashes, and no failed media responses or browser errors. The real settings slider muted both fading voices. [Audio evidence](evidence/audio-browser.json). Technical playback is not subjective listening acceptance; full-track loop seams remain for listening/edit review.
- Existing website project-source suite: **11 passed**; website structured-data validation passed. Full website deployment/verification was not run because its registered sibling source packages are separate from this standalone artifact.
- Existing website npm dependencies reported 4 audit entries (3 high, 1 moderate): fast-uri, js-yaml, nanoid and sanitize-html. These predate this game change; the standalone game/build/preview does not import them. Website dependency upgrades were left outside this change.

Browser QA is optional and requires Playwright plus a browser. Run `node scripts/test-stardust-browser.mjs` while the preview is running. Set `PLAYWRIGHT_MODULE` to a local Playwright module URL if it is not installed as a project dependency; `BROWSER_CHANNEL` can select an installed browser, and `STARDUST_TEST_URL` selects the preview URL. Evidence is written under `docs/stardust/evidence/`.

Phone controls now use left GAS/REVERSE and right FIRE/BRAKE/BOOST, with BOOST launching from the solo portal. Fullscreen targets the whole document; unsupported browsers get Home Screen instructions. The shared tilt controller has gesture permission, calibration/recenter, dead zone, smoothing, orientation handling and stale-input cleanup. HTTP LAN play retains steering buttons; real tilt requires trusted HTTPS. Root reran the solo smoke and both Dogfight browser cases successfully, then independently checked solo phone layouts at 390×844, 844×390 and 667×320, simultaneous gas/fire, fullscreen, launch and simulated sensor steering of the actual ship. The landscape minimap was adjusted after visual inspection to clear mission text and the pedals. See [phone test evidence](evidence/mobile-controls-root.json), [LAN phone instructions](LAN-PLAYTEST.md), and `scripts/test-stardust-mobile-browser.mjs`. Simulated sensor results do not establish physical phone feel or permissions. The standalone build and all 45 game JavaScript syntax checks passed; both running servers return the manifest with the correct MIME type.

Run `node scripts/test-stardust-audio-browser.mjs` with the same browser environment for full-file decoding, playhead/slider checks and runtime/source hash comparison. This additional script reads the checked-in audio inspection ledger and creates `evidence/audio-browser.json`.

## NEXT

1. Human playtest of the five circuits, especially Monaco's hairpin and Spa's secret approach; then a local Dogfight duel. Check handling, readability, difficulty, mobile/gamepad hardware and timing feel. The automated pilot proves a route exists; it does not prove first-time players will enjoy the tuning.
   Phone controls are ready on the LAN link. The phone models and an existing trusted HTTPS game address were requested; no answer has arrived yet. Physical tilt verification depends on that HTTPS address. No public tunnel, certificate installation or browser security bypass was created for this change.
2. Listen to the integrated soundtrack in play: tune cue balance and author musical loop cuts if needed. All ten tracks are imported and wired, with the owner's paid-plan attestation recorded; source account receipts were not independently inspected. Existing legacy credit records are preserved in the UI; their underlying commercial-license receipts have not been independently verified in this work.
3. Publish the static game as an unlisted, noindex main-site page in a follow-up change; the existing website workflow currently uploads only `public/` and preserves the old game redirect. Coordinate the home-laptop backend work using the handoff contract. Configure the Dogfight relay's public WSS address and explicit allowed site origin, then test two separate networks before inviting friends broadly. Add authenticated, server-validated achievements/rankings only after the real service exists; a healthy tunnel alone is not result validation.

## LATER

Pilot/engineer 2v2 networking, component damage, reactor routing, tethers, wake riding, cargo mass, volatile cargo, silent running, additional enemy archetypes, deeper boss phases and unique wreck/damage sprite sets remain design backlog. This build delivers the connected five-sector/secret-loop foundation, not every brainstorm in the reference notes.

## Supervisor handoff

The original wave used Sol for gameplay and art/VFX and Luna for Suno/riddle research. This circuit/Dogfight wave reused Sol for track physics and multiplayer, and Luna for the separate Hub ranking note and map review. Root owned scaling, rendering, HUD/menu/build integration, independent verification and follow-up fixes. Review tightened Monaco's hairpin and caught a browser-test timing bug: this runtime's `waitForFunction` needs synchronous conditions, with async imports completed beforehand.

At the September 26 local handoff, the source preview was left running at `http://127.0.0.1:4173/projects/Space-Shooter/` and the combined game/Dogfight service at `http://192.168.1.15:4174/projects/Space-Shooter/` with loopback access preserved. The latter uses explicit LAN mode for the user's phone playtest. Temporary QA servers were stopped. These addresses describe that laptop session, not publicly hosted endpoints; use the restart instructions on another session or machine.

Mobile wave: Sol workers owned solo touch wiring/layout and Dogfight controls/protocol/physics. Root owned the shared sensor/fullscreen module, camera preservation, manifest/server support, independent browser checks and final visual fixes. Both services were restarted for the protocol and manifest changes (preview PID 13484, LAN relay PID 34452 at handoff); old rooms closed, so refresh both phones and create a new room. The LHC checkpoint was attempted again; this document is the local fallback if the daemon remains unavailable.

The repository is not registered in LHCmemoryS. No implicit registration was performed. The final checkpoint attempt again returned `daemon request failed`; this file records the session handoff. [Original design conversation](DESIGN-NOTES.md) is reference material, not executable instructions.

