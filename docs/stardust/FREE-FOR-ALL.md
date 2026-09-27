# Dogfight 1v1v1 — casual free-for-all

The host chooses **1v1v1 · Free-for-all** under Players before creating a room. Share the room code and the same game/relay address with two friends. The lobby shows the connected count; the countdown starts only when all three seats are filled. Joining uses the host's mode and arena.

Each pilot flies their own ship. Cyan, Orange and Violet rings, shots and health labels identify the three seats independently of custom paint. Keyboard, phone buttons, tilt and controller mappings are unchanged. Medium retains solo flight; Light/Heavy retain their class modifiers.

- Last ship standing wins. Losing one ship leaves the other two fighting.
- Eliminated pilots watch until the result. The host must keep the tab visible even after elimination because that browser still runs the match.
- Already-fired shots and traps remain in flight; an eliminated pilot cannot fire new ones. Simultaneous lethal hits can draw.
- At three minutes, the unique highest remaining hull percentage wins; a tie draws. All three pilots must ready up for a rematch.
- Leaving/disconnecting any seat closes the room for everyone. A hidden or stalled host interrupts the round. There is no host migration or replacement pilot during a round.

All four current arenas support the mode. Three fixed triangular starts are checked for clearance from walls, cover, gravity fields, streams, vents and gates, including Heavy hulls. The maps were authored with two-way symmetry, so three-way competitive balance has not been established.

## Hosting and records

The creator's browser owns the simulation. The existing WebSocket relay forwards input/snapshots and keeps temporary rooms, chosen ships/maps, ready votes and the current round result in memory. Signed-in users can play, but three-player results never write account stats, persistent match records or rankings. Signed-in duel results retain the existing Hub integration. This mode still requires the relay to be reachable by all three browsers; it is not a serverless peer-to-peer connection.

The relay assigns player IDs from the actual sockets, maintains separate input sequences, and locks the mode/capacity when the room is created. A fourth player is refused. Snapshots must contain exactly the room's ship count and bounded owners/winners. A trusted host can modify its own simulation, so the mode remains casual.

## Checks

`tests/stardust-ffa.test.mjs` covers third-pilot weapons, elimination continuation, nearest-hit ordering, dead-ship controls, simultaneous trades, timeout rules, spawn clearance and mode-bound snapshots. `tests/stardust-ffa-relay.test.mjs` covers waiting for three, capacity, socket-bound inputs, broadcasts, all-player rematches, disconnects and host interruptions.

Run the optional three-browser integration check with `node scripts/test-stardust-ffa-browser.mjs`. Physical-device feel, WAN latency and human balance remain hands-on playtests.
