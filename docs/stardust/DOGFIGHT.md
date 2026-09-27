# Dogfight — casual 1v1 and 1v1v1

## Run locally

For a local phone playtest, use the [home-network setup](LAN-PLAYTEST.md). The current public game is at https://donavencrenshaw.com/games/stardust/dogfight/. The maps/three-player release is held for coordinated website and relay deployment; see [release handoff](PUBLIC-RELEASE.md).

From the repository root:

```powershell
npm run dev:dogfight
```

Or run `node scripts/serve-stardust-dogfight.mjs` directly. Open [Dogfight](http://127.0.0.1:4174/projects/Space-Shooter/dogfight/) in two browser windows or profiles. One pilot selects **Create room**; the other enters the eight-character code and selects **Join friend**. Both use the same relay address. The server also serves the main Stardust page and its public sprite/audio assets, so the **Stardust** link works without a second preview server.

The parent menu links to `./dogfight/`. A main-game preview on port 4173 uses `ws://127.0.0.1:4174/relay` by default. Connection settings are collapsed for local play and open when a published page has no configured relay. On donavencrenshaw.com the default is the hub's public relay, `wss://relay.donavencrenshaw.com/relay`. Any other relay a player picks is saved only in that browser's local storage.

Controls: **W / up** thrust; **A/D / left/right** rotate; **S / down / R** reverse; **Q/E** strafe; **X** brake; **Ctrl / Space** fire; **Shift** boost. Standard controllers use the same solo mapping: **left stick** thrust/reverse/strafe, **right stick X** turn, **RT** fire, **LB** hold boost, **Y** toggle boost, **RB** brake, and **Start** fullscreen. Press a controller button if the browser has not exposed it yet. Phone controls put **GAS / REVERSE** on the left and **FIRE / BRAKE / BOOST** on the right. Small turn buttons remain available. The countdown prevents spawn movement/shooting. The default Medium hull starts at 100, primary weapons deal 50, and the round ends when a hull reaches zero or the three-minute clock expires. At time expiry, remaining hull percentage determines the winner; equal percentages draw. All connected pilots must press **Ready for rematch** to begin a fresh round.

Choose two-seat **1v1** or three-seat **1v1v1** before creating a room. See the [free-for-all rules](FREE-FOR-ALL.md) and [arena guide](DOGFIGHT-MAPS.md). [Custom ships](CUSTOM-SHIPS.md) offer Light, Medium and Heavy hulls with body/accent paint; Medium preserves solo flight exactly, while Light/Heavy apply documented class multipliers. The baseline collision radius is 0.2112. Primary fire and a rechargeable laser trap are available; health follows each ship. Eight rocks use seeded, mirrored positions with radii from 0.75 to 1.25. New rematches select a fresh deterministic seed.

## Architecture and trust

This is a **host-browser-authoritative casual match**, not a ranked or cheat-resistant service. The room creator's browser runs a fixed 60 Hz network tick with two 120 Hz flight/weapon substeps and owns movement, obstacles, bullets, damage, and victory. Each guest transmits bounded control inputs at 30 Hz. The host sends sanitized render snapshots at 20 Hz. The guest interpolates roughly 75 ms behind its received snapshots; it does not predict authoritative hits or positions.

The relay binds host/guest roles to actual WebSocket connections. A guest cannot impersonate the host by adding a role field, send positions, claim damage, or publish accepted snapshots. The host itself remains trusted and can modify its own browser code; therefore these results must not be used for competitive rankings. Existing Hub tickets identify signed-in duel pilots for casual account stats; three-player matches never persist results. Server-authoritative simulation, stronger anti-abuse protections, and 2v2 pilot/engineer roles remain later work.

Dogfight has its own match state and arena rules, and shares pure `engine/systems/flight.js`, `engine/systems/weapons.js`, and `systems/gamepad.js` with single-player. The baseline ship uses the exact same thrust, reverse/strafe strengths, steering inertia, drag, speed cap, flux braking, boost recharge, gun heat, firing cadence, muzzle offset and inherited projectile velocity. It uses unlimited propulsion fuel like the solo boss arena. Arena geometry, collision damage and network interpolation remain mode-specific. Dogfight currently has no dedicated music or audio mix.

## Lifecycle and bounded resources

- Room capacity is locked to two or three players; no global room list, player list, chat, account, or public match history.
- Random eight-character invitation codes from cryptographic random bytes. Rooms live only in memory and are lost when the relay restarts.
- Maximum 64 rooms, 128 WebSocket clients, and 16 successful WebSocket connections per source IP. Behind a proxy every connection shares the proxy's IP. Pass `clientIpHeader` (or set `DOGFIGHT_CLIENT_IP_HEADER`, e.g. `cf-connecting-ip` behind Cloudflare) so the cap applies per visitor; set it only when every connection arrives through that proxy.
- Maximum incoming WebSocket payload 16 KiB. JSON text only. Per-connection token bucket: 60 messages/second with a 100-message burst. Room attempts limited to 12/minute per connection.
- Input sequences must increase and match the current round. Unknown control fields and invalid values are rejected. Guest controls become neutral after 350 ms without an accepted input at the host.
- Outbound transient messages are dropped above 16 KiB of buffered data; above 64 KiB the slow socket is closed. The host sends the latest state rather than building an application-level snapshot queue.
- Disconnect closes the room, clears controls, ends the match, and returns the surviving pilot to the lobby. Rematch requires every connected pilot.
- Hiding the host tab explicitly ends the round. A host frame gap greater than 500 ms also interrupts it. The relay independently interrupts a round after three seconds without an accepted host snapshot. There is no claim that a browser-hosted match keeps simulating reliably in the background.
- Rooms expire after ten minutes without activity, and both pilots are told. Sockets outside a room are closed after 60 seconds (`idleTimeoutMs`), so idle connections cannot hold slots; the page closes its own socket when a room ends. WebSocket heartbeat detects dead connections.

## Local server and future internet connection

The relay binds **127.0.0.1 by default**. Setting `STARDUST_LAN_IP` to an assigned private IPv4 address explicitly enables home-network play. LAN mode accepts only loopback or that interface's local-subnet clients, with an exact LAN-origin allowlist entry. No tunnel, public endpoint, credential, or internet hosting setup was created. The user confirmed physical-phone page access; internet play remains unverified.

For a future tunnel/proxy, forward its HTTPS/WebSocket endpoint to this loopback service. Set `DOGFIGHT_ALLOWED_ORIGINS` to the exact browser page origins that may connect, comma-separated, before starting the server. Example placeholders:

```powershell
$env:DOGFIGHT_ALLOWED_ORIGINS='https://game.example,https://relay.example'
npm run dev:dogfight
```

Then both pilots enter `wss://relay.example/relay` in Connection settings. The browser requires `wss:` for public connections and for HTTPS pages. Plain `ws:` is accepted for loopback from HTTP pages, or for the exact same private-IP host and port as a home-network HTTP page. URLs containing credentials, query strings, or fragments are rejected. **These are configuration examples, not working hosted URLs.**

Allowed origins default to the actual bound loopback server port and loopback preview port 4173. An arbitrary matching Host/Origin pair is not trusted. Origin checks are a browser boundary, not user authentication; a non-browser client can forge headers. Static files are restricted to the public Space-Shooter, sprite, and audio directories; paths are resolved against real paths, dot/traversal paths are rejected, and unsupported file types are not served. The service never exposes repository configuration or a directory listing.

Cross-internet latency, proxy WebSocket timeouts, TLS, home-laptop sleep, and real remote disconnect/reconnect behavior remain unverified until the actual endpoint exists.

## Verification

Run simulation and relay checks:

```powershell
node --test tests/stardust-dogfight.test.mjs tests/stardust-dogfight-relay.test.mjs
```

The focused checks cover deterministic physics, countdown lockout, fixed-step enforcement, actual projectile damage/victory, cover absorption, collision response, timeout draws, payload sanitation, two seats, connection-bound host authority, replayed inputs, rematch/disconnect, Host/Origin spoofing, static-file boundaries, payload limits, and an independently stalled-host timeout.

Run the optional actual-browser test:

```powershell
node scripts/test-stardust-dogfight-browser.mjs
```

It uses an isolated ephemeral relay port and installed Playwright, or the bundled Codex Playwright runtime when available. `PLAYWRIGHT_MODULE` can point to another local Playwright module. It is optional in the normal unit-test glob; the runner enables it explicitly. Browser checks use synchronous polling after loading the diagnostics function, because async predicate polling in the available Playwright build was observed to return too early.

The first direct two-browser Chromium run verified create/join, real keyboard fire and damage, matching host victory, hull reset on rematch, guest victory on the second round, zero buffered outbound data, and room closure after guest disconnect; no page errors occurred. The persisted runner additionally verifies actual keyboard thrust and rotation from transmitted snapshots and a real host JavaScript stall. Full final test output belongs to the integration handoff.

Original V1 local result: all 12 simulation/relay checks passed, and the persisted actual-browser runner passed in 22.0 seconds with real thrust/rotation, both pilots winning through keyboard fire, two rematches, a real 5.2-second host JavaScript stall, and subsequent disconnect recovery (server rooms = 0). Mobile 390 × 844 join view was inspected: touch controls and portrait orientation hint visible, document scroll width 390, and zero page/HTTP errors. These are local results, not internet or ranked-service validation.

The relay’s static server also excludes evidence path segments and files ending in provenance.json; generation prompts and QA evidence are not runtime content. Focused static-boundary checks include both current art provenance files.

## Phone steering and boost

**Enable tilt** requests motion access directly from a tap. **Recenter** makes the next valid phone orientation straight ahead. Steering is analog in [-1, 1], with the shared controller handling orientation, smoothing and a dead zone. A missing sensor sample for 350ms yields zero turn; touch cancellation and blur clear held buttons. Two touch actions can be held while steering by tilt. Manual turn buttons override tilt while pressed.

Tilt requires a secure browser context and actual sensor readings. The current plain-HTTP home-network link keeps button steering; an unavailable or denied sensor never claims to be enabled. **Fullscreen** requests the whole document so controls stay present. Browsers without that API show Home Screen guidance; manifest and Apple Home Screen metadata are included. Actual iPhone/Android motion permission and physical tilt still require a phone check on a trusted HTTPS link.

Boost adds the solo impulse of 4 with a 0.25-second minimum repeat interval, spending 20 flux first or one of three rechargeable pips. Holding repeats while resources remain. Both normal thrust and boost respect the solo speed cap of 15. Pips recharge at 0.22 per second; motion generates flux, and braking consumes flux. Reverse and strafe have 60% maximum thrust. Primary shots travel at 16 plus the full ship velocity, live 1.2 seconds, and use solo heat/overheat behavior. The guest HUD receives the host's flux, pips, cooldown and heat.

The network accepts finite analog turn [-1,1], forward [0,1], reverse [0,0.6] and strafe [-0.6,0.6]. Older boolean-only controls receive the equivalent full-strength values. Resource fields are bounded. A controller disconnect, blur or hidden tab clears the boost toggle; returning controllers must first release their controls before rearming, preventing a stuck throttle or surprise boost.

Controller/flight verification: a frame-by-frame test compares the real solo movement wrapper with Dogfight across analog thrust, reverse, strafing, steering release, sustained boost, depleted braking and coasting. A separate Edge browser case drives both host and guest with simulated standard controllers, checks relayed analog values and resulting movement/resources, and exercises disconnect, focus/visibility recovery and fullscreen rejection. Physical controller feel and cross-internet latency still need a hands-on playtest.

Mobile implementation validation: simulation/relay suite passed 17 tests with the existing optional LAN test skipped. New focused tests cover analog proportionality and malformed input, reverse versus brake, countdown boost lockout, equal impulse, speed cap, cooldown, press/hold behavior, snapshot bounds and rematch reset. The original two-browser combat/rematch/stall test still passes. The additional phone browser test passes with real simultaneous CDP touch presses, simulated sensor events producing analog input, cancellation/stale-axis neutrality, guest reverse/boost reaching the host, cooldown feedback, blur cleanup, and whole-document fullscreen with controls retained. Simulated orientation is integration coverage, not a claim of physical sensor validation. The 844×390 landscape screenshot was inspected: the arena is 317px high, with touch columns outside it and no HUD overlap.

## Laser trap secondary fire

Press **F**, **controller LT**, or the phone **{-} TRAP** button to launch an aimed purple clamp. It travels at 18 world units per second for up to 1.8 seconds. A hit stops translation, rotation and boost for **0.85 seconds**, clears momentum, and deals no direct damage. The trapped pilot can still shoot back. Both pilots see the clamp, release ring and LOCKED label; your trap HUD and phone button show the **12-second recharge**.

Intact cover absorbs the projectile; destroyed cover opens the shot. Collision follows each ship class's actual radius. A released ship has 1.5 seconds of trap immunity, so another hit cannot extend or immediately repeat the lock. One press fires once; holding does not repeat, and pressing during recharge does not queue a later shot. A held button during countdown takes effect after GO. A rematch restores a ready trap with no lingering lock or projectile. Host authority applies the hit; guests send only the trap button state, with bounded snapshots carrying the result.

Validation (September 27): `node --test tests/stardust-laser-traps.test.mjs` covers charge/press behavior, both seats, zero direct damage, movement and angular lock, return fire, automatic release, hull bumps, class radii, intact/destroyed cover, misses/expiry, immunity, match cleanup, malformed payloads and deterministic replay. `node scripts/test-stardust-laser-traps-browser.mjs` runs an isolated live relay and two Chromium clients: host keyboard and guest touch/short keyboard taps, matching host/guest locks, frozen movement, release, full recharge and rematch reset. Evidence: [browser receipt](evidence/laser-traps-browser.json), [projectile](evidence/laser-trap-flight.png), [desktop lock](evidence/laser-trap-desktop-locked.png), [landscape phone lock](evidence/laser-trap-phone-locked.png) and [portrait controls](evidence/laser-trap-phone-portrait.png). The browser phone is emulated; physical controller/phone feel, internet latency and human balance still need playtesting.

Integration handoff: trap behavior lives in `dogfight/laserTraps.js` and drawing/HUD in `dogfight/laserTrapView.js`; keep its simulation/protocol/client hooks when changing flight, ship classes or terrain. The trap check shares the new flight/weapon helpers and ship-class radius API. Restart an existing relay after the coordinated changes are ready, then refresh both clients so their protocol versions agree. This work does not deploy the game.
