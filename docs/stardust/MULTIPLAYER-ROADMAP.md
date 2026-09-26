# Stardust multiplayer roadmap

## NOW — circuits and Dogfight V1

The active racing slice is five one-lap circuits: Alpha Relay, Beacon Prime, Dustfall Station, Nether Crossing, and Iron Veil. These are the game names in the menu, HUD and runtime metadata. Each lap starts and finishes at the same portal. Apex shards reward a racing line, hazards remain readable, ship/shards use 66% scale, and asteroid variants use 75–125% scale. The [README remaining-work plan](README.md#remaining-work) is the priority list; this document explains the multiplayer direction.

Dogfight V1 is implemented for private casual 1v1 arena play. The host browser runs fixed-step movement, bullets and damage; a room-bound WebSocket relay forwards guest controls and host snapshots, with a strict two-player room capacity. Root independently verified both pilots winning, keyboard turning/thrust, repeated rematches and disconnect handling through a live local relay. This is a friend-match authority model, not a trusted source for public rankings. Internet play still requires public WSS configuration and separate-network testing; nothing has been deployed.

## NEXT — acceptance and match reliability

- Human playtest the five circuits and Dogfight; tune fairness and handling after local automated and browser checks.
- Keep V1 results casual and unranked. A host browser can be modified by its owner, so its result cannot directly set a public rating.
- V1 closes the room on peer loss and interrupts a round when the host hides or stalls; neither grants a ranked forfeit. Verify this behavior across the actual public relay before broad friend testing.
- If public standings still add value, use the separate [Hub Dogfight ranking proposal](HUB-DOGFIGHT-RANKING-NOTE.md) as the product starting point.

## LATER — Dogfight V2 crew play

Add 2v2 with pilot and engineer roles only after the 1v1 room, controls, disconnect behavior, and result lifecycle pass acceptance. Treat crew matches as a separate mode; if they become ranked, they need separate standings from 1v1.

The first build stays focused on the five circuits and casual friend dogfights. Account-backed rankings and 2v2 are later work, not current features. See [backend handoff](BACKEND-HANDOFF.md) for the existing backend boundary.
