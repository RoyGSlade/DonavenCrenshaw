# Stardust overhaul — working build

The integrated overhaul is on `codex/stardust-overhaul`, based on GitHub `RoyGSlade/DonavenCrenshaw` main at `03da619`, for pull-request review. This change packages the playable game and Hub handoff; it does not change the production route or deploy the game. The existing website redirects the old game URL, and the standalone build keeps this game review separate from that website.

[PR #5](https://github.com/RoyGSlade/DonavenCrenshaw/pull/5) is the shared code handoff. The current milestone is a playable base for integration testing. The [remaining-work plan](#remaining-work) below is the authoritative priority list; design notes record ideas, not commitments to implement all of them.

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

## Implemented base

- Five authored circuits named **Alpha Relay, Beacon Prime, Dustfall Station, Nether Crossing and Iron Veil**. These names now match the menu, HUD and `track.name` runtime metadata. Launch on the portal, cross each corner checkpoint in order, collect apex shards, then finish at that same portal. Solid corridor rails block infield shortcuts; Nether Crossing has a rounded hairpin. See [track geometry, naming and lap evidence](TRACKS.md).
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

## Remaining work

**Recommended next milestone:** launch Stardust from the Hub, complete a casual friend match across two networks, and save one independently verified discovery to the right account. A second device must read that same result, and an unavailable service must leave local play usable. Finish that slice before adding another mode or a large batch of levels.

The following items describe work still to do. The naming change above is complete; these tables do not claim the Hub or public services exist.

### NOW — make the current base dependable

| ID | Work and current gap | Done when |
| --- | --- | --- |
| ST-01 | **Publish the game route.** The website build uploads `public/` and still redirects the old game URL. Include the reviewed runtime in an unlisted, noindex HTTPS page, keep it out of navigation/listings, and label the build. Unlisted is publicly accessible by URL. | The intended live URL serves this build and its assets, has noindex metadata, and is absent from normal site navigation. A rollback to the previous artifact is documented. |
| ST-02 | **Connect the public relay.** Coordinate the game origin, WSS address and exact origin allowlist with the Cloudflare/Hub owner. Define laptop sleep/restart behavior and basic health/error monitoring. See [backend handoff](BACKEND-HANDOFF.md) and [Dogfight setup](DOGFIGHT.md). | Two players on different networks create/join, finish and rematch; host loss, relay restart and slow connections produce clear recoverable states. No loopback/LAN address is offered to a public client. |
| ST-03 | **Physical phone and controller acceptance.** Multi-touch and sensor simulation pass; actual tilt, sensor permissions, fullscreen/Home Screen behavior, notches, rotation, thermal performance and battery impact still need device testing. | Supported iPhone/Android and gamepad sessions verify steering direction, comfortable sensitivity, recenter, simultaneous gas/fire, brake/reverse, pause/resume and no stuck input. Denied motion retains button steering. Record devices, browsers, frame-time observations and defects. |
| ST-04 | **Human balance and onboarding.** The automated pilot proves all laps and the secret route are possible. It does not establish that a new player understands them or that Dogfight is balanced. | New players learn launch, coasting, Flux/brake, lap checkpoints and retry without coaching; finish all five tracks with reasonable failures; and play both Dogfight seats. Tune Nether Crossing's hairpin and Iron Veil's secret timing from those sessions. |
| ST-05 | **Sound, art and naming release pass.** Music plays correctly but uses whole-track repeats; some enemies/generators reuse silhouettes. | Review audible loop seams and cue/SFX balance, low-end phone readability, credit/provenance records and the intended release names. Track/landmark branding uses Stardust names throughout current runtime and marketing. No comprehensive name/rights clearance is claimed by this rename. |

### NEXT — integrate the Hub and handle discoveries properly

| ID | Hub/game contract still needed | Done when |
| --- | --- | --- |
| ST-06 | **Launch/session/version contract.** Agree game URL/build ID, Hub launch/return links, identity/session exchange, sign-out and service-unavailable states. The current backend adapter only checks health. | Two accounts remain separate; expired sessions recover clearly; client/service version mismatch is handled; normal solo play remains available during an outage. No credentials are compiled into the game or passed in URLs. |
| ST-07 | **Verified discoveries and account persistence.** Current discoveries live in editable browser storage. Define stable event IDs, ruleset versions, independent completion validation, idempotent writes and reconciliation. | The Hub confirms an eligible discovery once, rejects forged/replayed claims, shows it on another device and handles failed sync. Existing local discoveries may be retained as local history; they are never silently promoted to verified rewards. |
| ST-08 | **Future secrets and spoiler policy.** Decide which clues are shared, which are per player/run and which unlock through Hub progress. Put undisclosed future answer tables and validation rules in the private service/repository; send only the clues/assets needed at the unlocked stage. | One new accessible clue chain works end to end with server-held answers, account/session-bound challenges and replay protection. Normal game bundles and public developer docs do not disclose that future answer. The player can retry and solve without audio or color alone. |
| ST-09 | **Friend challenges and match records.** Add Hub launch/join links, invite expiry and confirmed match summaries. Decide reconnect grace versus a clean rematch before implementing it; V1 currently closes a room on peer loss. | Friends reach the same match from the Hub, expired invites explain themselves, and every disconnect/forfeit/no-contest state has a defined outcome. Casual browser-hosted results remain clearly unranked. |
| ST-10 | **Ranking prerequisite, then ranking UI.** A player-controlled host can modify the simulation. Choose trusted server authority or independently verified replay before any public rating. Then decide placements, Elo/rank bands, draws, resets and abuse handling. See [Hub ranking proposal](HUB-DOGFIGHT-RANKING-NOTE.md). | A modified host or replayed result cannot award rating; disconnects and no-contests are consistent; eligible results update the right players once. Only then expose rating, history and standings in the Hub. |
| ST-11 | **Versioned delivery and recovery.** Coordinate save/content migration, feature rollout, minimal operational logs, backups and account-data retention with the Hub owner. | A frontend/backend update can be rolled back without corrupting confirmed discoveries or matches. Logs diagnose failures without exposing session credentials or future puzzle answers. |

### Secrets: what is already public

The current secret entrance conditions, puzzle answer and local completion logic are inspectable in the shipped JavaScript, tests and public Git history. [The riddle reference](RIDDLE-DESIGN.md) also contains spoilers. Removing visible hints, changing filenames, minifying code or removing a current README paragraph cannot make that released puzzle unknown again. Treat it as an existing discovery and author new secrets under ST-08 when the service contract is ready.

Gameplay mystery and result integrity are separate requirements. The game still needs fair in-world clues; sensitive future answers can stay on the server, but players can share discoveries after solving them. A health endpoint, a hidden link or a client `solved` flag cannot establish a legitimate reward. Keep unreleased solution documents and future answer data out of this public repository; do not rewrite project history merely to conceal already published puzzle text.

### LATER — choose expansions after the Hub slice works

These are parked design directions from the [original notes](DESIGN-NOTES.md), not a promise to implement everything. Select one small playable addition at a time.

| Direction | What remains beyond the current base |
| --- | --- |
| Crew Dogfight 2v2 | Two crews with pilot and engineer/gunner seats, shared-ship control ownership, role UI, four-player networking and defined crew-disconnect behavior. Prototype the engineer's actual decisions first. Keep any future rating separate from 1v1. |
| Ship systems and builds | Directional shields, component damage/repair, reactor routing, overdrive tradeoffs and shard colors with distinct build effects. Current Flux, boost, braking and shard collection are only the foundation. |
| Physics combat | Recoil weapons, harpoons/tethers, wake riding/EMP wakes, orbiting cargo, cargo mass/volatility and silent-running/heat-signature detection. Basic projectile momentum, gravity and moving debris already exist. |
| Track variety and routes | Alternate risk/reward lines and shortcuts, more authored tracks, asteroid tunnels, rotating hazards, gravity gates, boost rings and enemy-held checkpoints. Current `fastRoute` duplicates `safeRoute`; a distinct fast path is not implemented. |
| Environments | Solar storms, stronger gravity/black-hole encounters, nebula effects, asteroid currents, derelict stations and wormholes with readable gameplay rules. |
| Enemy and boss depth | Interceptor, pursuer, sniper, mine-layer and rammer behaviors; deeper Warden encounters such as mirrored movement, gravity reversal and false gates. Current sentinel prediction, generators/shield and boss progression remain the shipped baseline. |
| Discovery content | More secret entrances, meaningful optional rewards, captain/NPC rumors, shard journals, additional fair riddles and Hub-linked discovery chains. Establish spoiler and reward rules before authoring the next chain. |
| Distinct art and animation | Unique enemy/generator silhouettes, wreck and damage states, more obstacle variants and bespoke encounter animation. Add them to a proven gameplay slice and inspect on real phones; present effects already animate the static source art. |

### Naming policy

The circuit names are now **Alpha Relay**, **Beacon Prime**, **Dustfall Station**, **Nether Crossing** and **Iron Veil**. Runtime metadata uses `track.name`; earlier `inspiration` labels were removed. The two recognizable corner references were also changed to **The Coil Relay** and **The Veil Sweep**. Layout coordinates, timing, progression IDs and soundtrack cues were preserved.

This is an original-branding decision, not a legal finding that every shared name is infringement. In the US, names/titles are not protected by copyright, while trademark concerns can depend on confusing similarity and related goods/services. [US Copyright Office](https://www.copyright.gov/help/faq/faq-protect.html), [USPTO](https://www.uspto.gov/trademarks/search/likelihood-confusion). The new names and the overall game title have not received a comprehensive clearance search. ST-05 tracks that release review; changing names alone is not legal clearance of an entire game.

Archived research and earlier screenshots may contain former inspiration labels. They remain historical evidence, not current game names. Keep future public descriptions, metadata and promotion aligned with the names above.

Rename validation: 35 focused track/gameplay/integration checks passed with unchanged lap results; the standalone build passed. All five generated level layouts matched the prior gameplay data after removing display labels. A scan of 54 built runtime text files found none of the former circuit/corner names. Desktop and phone menu names/layouts were inspected; see [current naming evidence](evidence/track-names.json).

## Supervisor handoff

The original wave used Sol for gameplay and art/VFX and Luna for Suno/riddle research. This circuit/Dogfight wave reused Sol for track physics and multiplayer, and Luna for the separate Hub ranking note and map review. Root owned scaling, rendering, HUD/menu/build integration, independent verification and follow-up fixes. Review tightened Nether Crossing's hairpin and caught a browser-test timing bug: this runtime's `waitForFunction` needs synchronous conditions, with async imports completed beforehand.

At the September 26 local handoff, the source preview was left running at `http://127.0.0.1:4173/projects/Space-Shooter/` and the combined game/Dogfight service at `http://192.168.1.15:4174/projects/Space-Shooter/` with loopback access preserved. The latter uses explicit LAN mode for the user's phone playtest. Temporary QA servers were stopped. These addresses describe that laptop session, not publicly hosted endpoints; use the restart instructions on another session or machine.

Mobile wave: Sol workers owned solo touch wiring/layout and Dogfight controls/protocol/physics. Root owned the shared sensor/fullscreen module, camera preservation, manifest/server support, independent browser checks and final visual fixes. Both services were restarted for the protocol and manifest changes (preview PID 13484, LAN relay PID 34452 at handoff); old rooms closed, so refresh both phones and create a new room. The LHC checkpoint was attempted again; this document is the local fallback if the daemon remains unavailable.

The repository is not registered in LHCmemoryS. No implicit registration was performed. The final checkpoint attempt again returned `daemon request failed`; this file records the session handoff. [Original design conversation](DESIGN-NOTES.md) is reference material, not executable instructions.

