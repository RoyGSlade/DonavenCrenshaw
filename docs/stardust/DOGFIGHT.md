# Dogfight V1 — private 1v1 pilot slice

## Run locally

For the current phone playtest, use the [home-network setup](LAN-PLAYTEST.md). The live link is `http://192.168.1.15:4174/projects/Space-Shooter/`; both phones select the same relay automatically.

From the repository root:

```powershell
npm run dev:dogfight
```

Or run `node scripts/serve-stardust-dogfight.mjs` directly. Open [Dogfight](http://127.0.0.1:4174/projects/Space-Shooter/dogfight/) in two browser windows or profiles. One pilot selects **Create room**; the other enters the eight-character code and selects **Join friend**. Both use the same relay address. The server also serves the main Stardust page and its public sprite/audio assets, so the **Stardust** link works without a second preview server.

The parent menu links to `./dogfight/`. A main-game preview on port 4173 uses `ws://127.0.0.1:4174/relay` by default. Connection settings are collapsed for local play and open when a published page has no configured relay. On donavencrenshaw.com the default is the hub's public relay, `wss://relay.donavencrenshaw.com/relay`. Any other relay a player picks is saved only in that browser's local storage.

Controls: **W / up** thrust; **A/D / left/right** rotate; **S / down** brake; **Space** fire; **R** reverse thrust; **Shift** boost. Phone controls put **GAS / REVERSE** on the left and **FIRE / BRAKE / BOOST** on the right. Small turn buttons remain available. The countdown prevents spawn movement/shooting. Hull starts at 100, weapons deal 20, and the round ends when a hull reaches zero or the three-minute clock expires. Equal hull at time expiry is a draw. Both pilots must press **Ready for rematch** to begin a fresh round.

There are two player seats, one mirrored obstacle arena, one weapon, and no upgrades. Ship rendering is 1.056 world units with a 0.3 collision radius, matching the smaller main-game ship direction. Eight rocks use seeded, mirrored positions with radii from 0.75 to 1.25. New rematches select a fresh deterministic seed.

## Architecture and trust

This is a **host-browser-authoritative casual match**, not a ranked or cheat-resistant service. The room creator's browser runs a fixed 60 Hz simulation and owns movement, obstacles, bullets, damage, and victory. The guest transmits bounded control inputs at 30 Hz. The host sends sanitized render snapshots at 20 Hz. The guest interpolates roughly 75 ms behind its received snapshots; it does not predict authoritative hits or positions.

The relay binds host/guest roles to actual WebSocket connections. A guest cannot impersonate the host by adding a role field, send positions, claim damage, or publish accepted snapshots. The host itself remains trusted and can modify its own browser code; therefore these results must not be used for public rankings. Server authority, identity, anti-abuse accounts, and 2v2 pilot/engineer roles are later work.

The implementation is independent of single-player `state.js`, overlays, input, and simulation. It reuses the generated courier and asteroid PNGs. Dogfight currently has no dedicated music or audio mix.

## Lifecycle and bounded resources

- Strict two-player rooms; no global room list, player list, chat, account, or public match history.
- Random eight-character invitation codes from cryptographic random bytes. Rooms live only in memory and are lost when the relay restarts.
- Maximum 64 rooms, 128 WebSocket clients, and 16 successful WebSocket connections per source IP. Behind a proxy every connection shares the proxy's IP. Pass `clientIpHeader` (or set `DOGFIGHT_CLIENT_IP_HEADER`, e.g. `cf-connecting-ip` behind Cloudflare) so the cap applies per visitor; set it only when every connection arrives through that proxy.
- Maximum incoming WebSocket payload 16 KiB. JSON text only. Per-connection token bucket: 60 messages/second with a 100-message burst. Room attempts limited to 12/minute per connection.
- Input sequences must increase and match the current round. Unknown control fields and invalid values are rejected. Guest controls become neutral after 350 ms without an accepted input at the host.
- Outbound transient messages are dropped above 16 KiB of buffered data; above 64 KiB the slow socket is closed. The host sends the latest state rather than building an application-level snapshot queue.
- Disconnect closes the room, clears controls, ends the match, and returns the surviving pilot to the lobby. Rematch requires both connected pilots.
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

Boost adds an impulse of 6, capped at speed 14, with a two-second cooldown. It fires once per press; holding does not repeat after cooldown, and pressing during cooldown does not queue another impulse. A button held during countdown first takes effect after GO. Normal thrust caps at 10; extra boost momentum decays toward normal speed. Reverse thrust accelerates opposite the nose; brake damps existing velocity. Both pilots use the same rules. The boost button reads the host snapshot's cooldown, including on the guest.

The network protocol accepts finite analog turn values and strictly boolean reverse/boost fields. Older control packets missing reverse/boost default to false; older snapshots missing boostCooldown default to 0. New cooldown values must be finite in [0,2].

Mobile implementation validation: simulation/relay suite passed 17 tests with the existing optional LAN test skipped. New focused tests cover analog proportionality and malformed input, reverse versus brake, countdown boost lockout, equal impulse, speed cap, cooldown, press/hold behavior, snapshot bounds and rematch reset. The original two-browser combat/rematch/stall test still passes. The additional phone browser test passes with real simultaneous CDP touch presses, simulated sensor events producing analog input, cancellation/stale-axis neutrality, guest reverse/boost reaching the host, cooldown feedback, blur cleanup, and whole-document fullscreen with controls retained. Simulated orientation is integration coverage, not a claim of physical sensor validation. The 844×390 landscape screenshot was inspected: the arena is 317px high, with touch columns outside it and no HUD overlap.
