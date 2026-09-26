# Stardust backend handoff

The [README remaining-work plan](README.md#remaining-work), especially ST-06 through ST-11, is the current integration priority list. It covers identity, verified discoveries, future server-held secrets, friend challenges, result authority and recovery. This document describes the existing service boundary, not a completed Hub integration.

## Current contract

The frontend is static and playable without an account service. `projects/Space-Shooter/runtime-config.js` deliberately ships with an empty `backendBaseUrl`; this keeps all gameplay in local mode. `systems/backend.js` only performs an optional health probe. If configured, it requests `GET {backendBaseUrl}/v1/health` with credentials omitted, no-store caching, redirects rejected, and a bounded timeout. The expected body is exactly the useful subset `{ "ok": true, "service": "stardust", "version": 1 }`. Network errors or a mismatched response fall back to local play.

The progression module stores discoveries in versioned browser storage and labels the seal result local. Neither an HTTP health response nor a local victory proves an account identity or a legitimate run. Do not attach tokens to the browser bundle, local storage, query strings, or game requests.

## Smallest sensible future topology

If a backend is justified, start with the home laptop running a separate API bound to loopback, with Cloudflare Tunnel routing one public hostname to that local origin. Keep the static game and API as separate services/hostnames, and expose only explicit API routes. Cloudflare documents published application routes as public-hostname-to-local-service mappings; their setup needs a Cloudflare account/domain for a named published application and a running `cloudflared` connector. [Cloudflare Tunnel setup](https://developers.cloudflare.com/tunnel/get-started/) and [routing concepts](https://developers.cloudflare.com/tunnel/concepts/routing/) (official docs, last updated 2026-09-11; checked 2026-09-26).

That is a deployment shape, not a security system. Before account results exist, the API needs at least:

- Real identity and session authentication, with narrowly scoped, short-lived credentials; never a shared secret compiled into the static client.
- Server-side validation of a run/result, including allowed level/state transitions, timing bounds, replay protection, request size limits, and rate limits. Client claims are untrusted even over HTTPS.
- A database schema and retention policy for account data, a migration/backup plan, monitoring, and a way to delete/export user data where required.
- CSRF/origin policy appropriate to the selected auth flow, input validation, secure cookie/header policy, and explicit CORS rules. Health checks must not leak configuration or user data.
- A privacy and abuse review before collecting account identifiers, leaderboard data, or persistent achievements.

Only after those pieces exist should a new authenticated endpoint record “Stardust Remembers” or any leaderboard result. Preserve local discoveries when the service is unavailable; make sync idempotent and do not tell the player an account achievement was saved until the server confirms it.

## Deploy and tunnel boundary

Dogfight now has a separate local room relay: `npm.cmd run dev:dogfight` binds to `127.0.0.1:4174`, exposes `/relay` for WebSockets and `/health` for its own service check, and serves only game assets. The host browser remains the simulation authority; the laptop service forwards guest inputs and host snapshots. It stores rooms in memory and writes no account data or rankings. See [Dogfight protocol, setup and limits](DOGFIGHT.md).

The user subsequently authorized home-network play. The running relay now uses explicit `STARDUST_LAN_IP=192.168.1.15`, allowing that interface's local subnet while preserving loopback clients in the same rooms. The user confirmed the physical phone loads the game. See [LAN playtest and restart instructions](LAN-PLAYTEST.md). This is separate from the future public Cloudflare setup.

The later Cloudflare work can route a dedicated public hostname to this relay. Set `DOGFIGHT_ALLOWED_ORIGINS` to the exact HTTPS game origin and configure the same `wss://hostname/relay` address in both clients. Client defaults intentionally stay local on localhost and blank on public pages. No DNS, credentials, tunnel, public origin, authentication or remote-device verification has been configured here. Keep this room service separate from any future account/result API.

No tunnel, account API, public DNS route, or account storage was created as part of this handoff. A tunnel forwards a public hostname to the selected local service; it does not add the missing game authentication or validate a run. The local preview server in `scripts/preview-stardust.mjs` binds to `127.0.0.1` and must stay local. Do not point a tunnel at the preview server or publicize it as a backend.
