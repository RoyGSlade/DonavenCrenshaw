# Sounding drill (module `sounding-drill`)

## Why first
1. **Why it should exist.** The owner called the old mining game bland (hold a button, keep a bar in a band). His words, 2026-11-19: "maybe like ultrasound where its dark and your drill sends a pulse out as you go you can find gems ores all kinds of cool stuff including rare shit ancient shit art whatever in them never know where that rock came from or if it even is a rock". This is the one Stardust game played mostly from memory: you see the inside of the rock for a moment, then it goes dark again.
2. **The outcome it has to produce.** A player who has never seen it understands in ten seconds: drag to drill, the rings show what is inside, steer to the glint, clear the rock round it without touching it, then bring the claw. A pass leaves a real tunnel for the claw game; a fail costs the cell and turns the rock, so the next try is never the same.
3. **How the outcome is tested.** Pure tests (`tests/model.test.mjs`): seeded determinism, every rule in the brief, roll scaling over five tiers, each path visibly changes something, points never make it worse, a turned rock keeps its tunnels and cracks, and a four-bot sweep (perfect, wobbly, lazy, mash) against the target curve. Browser test (`tests/browser.test.mjs`): real mouse and keys at 1440x900, real touch at 390x844, and the house rules. Then the builder plays it start to finish on both sizes and writes notes.
4. **How it is built to get there.** `model.js` is a pure seeded model on a cell grid (no DOM, no clock): geology, a tunnel mask, rings that light features for a while, heat, charge, cracks. `view.js` draws it dark on a canvas with a DOM HUD in the hangar kit's frames; the HUD uses a drawn power cell, a heat glow and plain words, never digits. `bots.js` plays it for the tests.

## Files
- `index.js`: `play(stage, ctx) -> Promise<result>` (contract 1.1).
- `model.js`: rules. `rng.js`: copy of the quest rng. `bots.js`: the four bots (used by the tests).
- `view.js`, `sound.js` (WebAudio synth, no files), `style.css`, `art/` (kit frames and nine item pictures reused from the Driftwake library).
- `tests/model.test.mjs` (pure, about 25 s) and `tests/browser.test.mjs` (desktop mouse and keys, phone touch).
- `fixtures.json`: the items and rocks used when the host gives none.
- `test.html`: the standalone page (panel for seed, tier, points, quick, context; full-screen stage; Leave).

## Notes for the next builder
See `LESSONS.md` in the lane folder and the READY report. Every number is a placeholder until a real hand says otherwise; the numbers live in `BASE` at the top of `model.js`.

## Run it
- Pure tests: `node --test projects/Space-Shooter/voyage/modules/sounding-drill/tests/model.test.mjs` (`SWEEP_N=300` for a bigger bot sweep).
- Browser test: `STARDUST_BROWSER_TEST=1 PROOF_DIR=<folder> <browser-slot> node --test .../tests/browser.test.mjs` (set `PLAYWRIGHT_MODULE`).
- By hand: serve the repo root with any static server and open `modules/sounding-drill/test.html?auto=1&seed=3`.

## The result the host gets
`{ done, success, grade 0..100, perfect, xp, why: 'claw'|'cell'|'shattered', finds: [{ item, kind, freed, cracks, seen, x, y, r, isFreed }], tunnel: { cell, w, h, rows, entry, board }, chargeLeft, turned, canTurn, effects: {} | { items: { scrap: 1 } }, resume }` (or `{ left: true }` if the player left).

## Context the host can give
`ctx.context.rock = { size, finds: [{ item, kind, main? }] }`, `ctx.context.items = { id: { name, icon, colour } }`, `ctx.context.resume` (a previous result's `resume`). With no rock, one is rolled from `fixtures.json`. `ctx.quick` shrinks it to a small rock with one find. `ctx.points = { awareness, inspection, trace }`.

## Round 2 notes
- One listen per stop; the listen ring charges round the bit. The thinker bot (`bots.js`) rests with the pointer held.
- Wide board 1400 wide, phone board 1000 wide; the rock fills it; the main find sits deep with a vein always across the way; medium and large rocks hold 1-3 bonus finds.
- Leave is `ctx.onLeave(fn)` (contract 1.1). `manifest.json` is contract 1.1 with measured `length_s`.
