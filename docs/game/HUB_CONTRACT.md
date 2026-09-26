# Stardust and the hub

What the game sends to the hub at `https://api.donavencrenshaw.com`, what comes
back, and the rules the game code must follow so runs can be checked later.
Written for whoever builds the game.

This file is public. Unlock conditions, hidden content and puzzle answers live
in the private hub repo and never belong here.

## Basics

- Every call goes to `HUB_ORIGIN + '/api/games/stardust/...'` with
  `credentials: 'include'` and JSON bodies.
- **Guests** play everything. Nothing is sent, and the game never says what a
  signed-in player would have seen.
- **Signed in or not.** Sign-in belongs to the site. The game calls
  `GET /api/games/stardust/me`: `401` or `403` means guest.
- **Hub asleep.** The hub runs on a home laptop. If the health probe fails, play on
  as a guest and tell the player once that this run will not be recorded. Never
  queue runs to send later: the hub only trusts runs it saw start.
- **Errors** come back as `{ "error": "<code>", "message": "..." }`.
- Ignore fields you do not recognise. The hub adds fields without warning.

## Game info

`GET /api/games/stardust` returns the boards and their versions:

```json
{
  "id": "stardust", "name": "Stardust", "season": 1,
  "boards": [
    { "board": "full", "kind": "full", "version": 1, "name": "Full run" },
    { "board": "alpha-relay", "kind": "level", "version": 1, "name": "Alpha Relay" }
  ],
  "achievements": [{ "id": "first-flight", "name": "First Flight", "description": "Finish Alpha Relay." }],
  "hiddenAchievements": 5, "fragments": 24, "saveSlots": 3,
  "platinum": { "size": 10, "claimed": 0 }
}
```

A board is `full` or a level id: `alpha-relay`, `beacon-prime`,
`dustfall-station`, `nether-crossing`, `iron-veil`.

**Versions.** The game carries a version number for each level and a season for
full runs, and they must match the hub's. When a level's layout or physics
change, bump its version (and the season, if full-run times change), and ask for
the same bump in the hub's rules. On a mismatch the hub answers
`409 version_mismatch` with its `current` version: play the run unrecorded and
suggest a reload.

## Runs

**Start** when the player gets control:

```
POST /api/games/stardust/runs
{ "board": "iron-veil", "version": 1, "build": "0.4.2" }

201 { "runId": "...", "seed": 874114859, "board": "iron-veil", "version": 1, "startedAt": "..." }
```

- `build` identifies the game release: 1 to 64 letters, digits, `.`, `_`, `+`,
  `-`. A build with a known exploit can be refused with `403 build_blocked`.
- `seed` drives everything random that affects play in this run. See the
  determinism rules below.

**Finish** when the level or full run ends:

```
POST /api/games/stardust/runs/<runId>/finish
{
  "timeMs": 58312,
  "exit": "front",
  "fragments": ["L5-S1", "L5-S2"],
  "splits": { "alpha-relay": 61000 },
  "inputLog": "..."
}
```

| Field | Rule |
| --- | --- |
| `timeMs` | Active play time in whole milliseconds, pauses excluded. It can never exceed the real time since the run started. |
| `exit` | How the level ended, as a short lowercase name such as `front`. Send it on every finish. |
| `fragments` | Apex shard ids collected during this run, exactly as the game names them: `L1-S1` to `L1-S4`, then `L2-S1` to `L5-S5`. A new shard needs a hub change first. |
| `splits` | Full runs only: milliseconds per level id. |
| `inputLog` | The recorded inputs, up to 256 KB of text in a format the game defines. Optional now, required once replay checks start. |

The answer:

```json
{
  "runId": "...", "status": "accepted", "verification": "timed", "timeMs": 58312,
  "best": { "timeMs": 55120, "rank": 4 }, "personalBest": false,
  "achievements": [{ "id": "...", "name": "...", "description": "...", "hidden": false }],
  "unlocks": { "...": "see below" }
}
```

- `status` is `accepted`, or `flagged` or `rejected` with `reasons`. Only
  accepted runs reach a board. Show the time either way; do not accuse anyone.
- `achievements` lists only the ones just earned. Show each one's name and
  description as sent. Never hard-code achievement names or conditions in the
  game.
- A run can be finished once. Starting a new run abandons the old one.

**Unlocks.** A finish may carry `unlocks`. The game does not know or decide why.

- `unlocks.arena.module` and `unlocks.arena.pass`: load the module and hand over:

  ```js
  const arena = await import(HUB_ORIGIN + unlocks.arena.module);
  const session = await arena.mount(host, { hub: HUB_ORIGIN, pass: unlocks.arena.pass });
  // later: session.unmount()
  ```

  The module lives in the private hub repo and talks to the hub itself.
  `host` is the game's side of the deal: the smallest surface the module needs,
  such as the canvas, input, audio, camera, the ship's state, and a way to return
  to normal play. Define it next to the loader. If the import fails, carry on as
  if nothing was unlocked.
- `unlocks.arena.lockedUntil`: do nothing visible.

## Connecting the game

The game's backend adapter (`systems/backend.js`) stays local until
`runtime-config.js` sets:

```js
backendBaseUrl: 'https://api.donavencrenshaw.com/api/games/stardust'
```

It then calls `GET {backendBaseUrl}/v1/health`, and the hub answers
`{ "ok": true, "service": "stardust", "version": 1 }`, or `503` when it cannot
serve. Every other call in this document sits under the same base URL.

**Dogfight rooms** use `wss://relay.donavencrenshaw.com/relay` once the hub runs
its relay. It accepts only the site's own origins, and results stay casual and
unranked.

## Boards and the player

- `GET /api/games/stardust/boards/<board>?limit=10` gives the best time per
  player: `{ "entries": [{ "rank", "username", "displayName", "timeMs", "setAt" }] }`.
  `&version=<n>` reads an older version of a board.
- `GET /api/games/stardust/me` gives the signed-in player's `bests` per board,
  earned `achievements`, found `fragments`, and `platinum`.

## Saves

```
GET    /api/games/stardust/saves               list slots
GET    /api/games/stardust/saves/<slot>        { "slot", "version", "data", "updatedAt" }
PUT    /api/games/stardust/saves/<slot>        { "version": 1, "data": { ... } }
DELETE /api/games/stardust/saves/<slot>
```

- Slot names are short lowercase words such as `main`. A player has 3 slots.
- `data` is a JSON object up to 64 KB. `version` is the game's own save format
  number, so the game can upgrade old saves when it loads them.
- Saves are progress and settings, not proof: the hub never trusts a save for
  times, unlocks or achievements.

## Determinism rules

The hub will eventually replay a run's inputs with the game's own simulation to
confirm its time. That only works if the same seed and inputs always produce the
same run, on every browser and in Node. Build the new physics this way from the
start; retrofitting it later is far harder.

1. **Fixed step.** The simulation advances in fixed steps, for example 120 per
   second, with an accumulator. Rendering interpolates between steps. Today
   `engine/core.js` advances by frame time; that has to go.
2. **Time is steps.** Gameplay never reads `Date.now()` or `performance.now()`.
   A run's time is its step count times the step length. Today the boss moves by
   the wall clock in `engine/modes/arena.js`.
3. **Seeded randomness.** Everything random that affects play uses a small
   seeded generator, such as mulberry32 or sfc32, started from the run's `seed`.
   Cosmetic effects like particles may use their own randomness.
4. **Plain arithmetic.** In the simulation, use `+ - * /`, `Math.sqrt`,
   `Math.abs`, `Math.min`, `Math.max`, `Math.floor`, `Math.round` and
   `Math.sign`. Browsers may disagree in the last digit on `Math.sin`,
   `Math.cos`, `Math.atan2`, `Math.exp`, `Math.pow` and `Math.hypot`, so the
   simulation needs its own versions of those, from a lookup table or a fixed
   polynomial.
5. **Inputs per step.** Read input once per step and record what was read. The
   input log is that record, compressed however suits the game.
6. **A pure simulation.** Keep the simulation in modules that import nothing
   from rendering, audio or the DOM, and take only level data, the seed and the
   inputs, so the hub can run them in Node.

## Error codes

| Status | `error` | What to do |
| --- | --- | --- |
| 400 | `bad_board`, `bad_version`, `bad_build`, `bad_time`, `bad_exit`, `bad_splits`, `bad_fragments`, `bad_slot`, `bad_data` | A bug in the game. Log it. |
| 401, 403 | none, `signed_out` | Treat as a guest. |
| 403 | `banned` | Treat as a guest. |
| 403 | `build_blocked` | Suggest a reload. |
| 404 | `unknown_board`, `unknown_run`, `no_save` | A bug, or a save that does not exist yet. |
| 409 | `version_mismatch` | Play unrecorded and suggest a reload. |
| 409 | `run_finished`, `no_free_slot` | Already done, or all save slots in use. |
| 410 | `run_expired` | The run was started hours ago. Start a new one. |
| 413 | `input_log_too_large`, `save_too_large`, `too_large` | Trim it. |
| 429 | `too_many_requests` | Back off. |
