# Claw (module `claw-pull`)

## Why first
1. **Why it should exist.** The owner's words, 2026-11-19: "clear a path for extraction then and extraction claw like game for snagging it out". It makes the drilling matter: the tunnel the player cut in the Sounding drill is the board they now have to work in, so a careful drill job pays them back here and a rough one costs them.
2. **The outcome it has to produce.** A player who has never seen it understands in ten seconds: drag to steer the claw down your own tunnel, close the jaws on the find, hold Reel to pull it out, and nudge the load off the walls on the way. A pass puts the find on the bay floor; a drop is not the end, it is a new, harder problem (the find lies somewhere else in the tunnel, with one more crack); the third crack shatters it.
3. **How the outcome is tested.** Pure tests (`tests/model.test.mjs`): seeded determinism, every rule in the brief, roll scaling over five tiers, each path visibly changes something, points never make it worse, a board built from a real drill result matches the drill's tunnel, a dropped find moves and cracks, a resting thumb costs nothing, and a five-bot sweep (perfect, wobbly, thinker, lazy, mash) against the target curve. Browser test (`tests/browser.test.mjs`): real mouse and keys at 1440x900, real touch at 390x844, the house rules, and one test that plays a drill result into the claw start to finish. Then the builder plays it on both sizes and writes notes.
4. **How it is built to get there.** `board.js` turns a drill result into the board (open ground joined to the mouth, each find's pocket, a clearance probe). `model.js` is a pure seeded model: a claw head on a swaying cable, a grab that checks the side is cleared, a reel that drags the load back along the way you came in, a grip that knocks and tires. `view.js` draws it dark on a canvas lit by the claw's own work lamp, with the camera closing in on the find and again on the mouth; the HUD shows the grip on the claw itself and in plain words, never digits. `bots.js` plays it for the tests.

## Files
- `index.js`: `play(stage, ctx) -> Promise<result>` (contract 1.1; `ctx.onLeave` registered at the start).
- `board.js`: turns a drill result into the board (open ground joined to the mouth, cores, clearance probe, grasp check, mirror, quick-mode shaft). `model.js`: the rules. `bots.js`: the five bots. `rng.js`: copy of the quest rng.
- `view.js`, `audio.js` (Web Audio synth, no files), `style.css`, `art/` (kit frames and the eleven find pictures, copied from the drill).
- `fixtures.json`: 42 real Sounding drill results (run-length coded tunnels) and the item records. `test.html`: the standalone page.
- `tests/model.test.mjs` (pure, about 70 s), `tests/browser.test.mjs` and `tests/drive.mjs` (real mouse, keys and touch).

## Run it
- Pure: `node --test projects/Space-Shooter/voyage/modules/claw-pull/tests/model.test.mjs` (`SWEEP_N=2` for bigger sweeps).
- Browser: `STARDUST_BROWSER_TEST=1 PROOF_DIR=<folder> <browser-slot> node --test .../tests/browser.test.mjs` (set `PLAYWRIGHT_MODULE`).
- By hand: serve the repo root with any static server and open `modules/claw-pull/test.html?auto=1&seed=3&fixture=tall-clean-1`.

## The result the host gets
`{ done, success, grade 0..100, perfect, xp, pulled: [{ item, cracks, quality }], dropped, knocks, why, finds, shattered, effects: { items } }` (or `{ left: true }` if the player left).

## Context the host can give
`ctx.context.rock` = the Sounding drill's result (`finds`, `tunnel` with `rows` or `rle` and `entry`), `ctx.context.items = { id: { name, icon, colour, shards } }`. With no rock, a real drill result from `fixtures.json` is picked and mirrored by the seed. `ctx.quick` cuts a straight shaft to the main find and drops the bonus finds. `ctx.points = { control, maneuver, pursuit }` (also `handling`, `boost`, `landing`).
