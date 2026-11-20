# Sounding drill (module `sounding-drill`)

## Why first
1. **Why it should exist.** Donaven called the old mining game bland (hold a button, keep a bar in a band). His words, 2026-11-19: "maybe like ultrasound where its dark and your drill sends a pulse out as you go you can find gems ores all kinds of cool stuff including rare shit ancient shit art whatever in them never know where that rock came from or if it even is a rock". This is the one Stardust game played mostly from memory: you see the inside of the rock for a moment, then it goes dark again.
2. **The outcome it has to produce.** A player who has never seen it understands in ten seconds: drag to drill, the rings show what is inside, steer to the glint, clear the rock round it without touching it, then bring the claw. A pass leaves a real tunnel for the claw game; a fail costs the cell and turns the rock, so the next try is never the same.
3. **How the outcome is tested.** Pure tests (`tests/model.test.mjs`): seeded determinism, every rule in the brief, roll scaling over five tiers, each path visibly changes something, points never make it worse, a turned rock keeps its tunnels and cracks, and a four-bot sweep (perfect, wobbly, lazy, mash) against the target curve. Browser test (`tests/browser.test.mjs`): real mouse and keys at 1440x900, real touch at 390x844, and the house rules. Then the builder plays it start to finish on both sizes and writes notes.
4. **How it is built to get there.** `model.js` is a pure seeded model on a cell grid (no DOM, no clock): geology, a tunnel mask, rings that light features for a while, heat, charge, cracks. `view.js` draws it dark on a canvas with a DOM HUD in the hangar kit's frames; the HUD uses a drawn power cell, a heat glow and plain words, never digits. `bots.js` plays it for the tests.

## Files
- `index.js`: `play(stage, ctx) -> Promise<result>` (contract 1.1).
- `model.js`: rules. `rng.js`: copy of the quest rng. `bots.js`: the four bots (used by the tests).
- `view.js`, `sound.js` (WebAudio synth, no files), `style.css`, `art/` (kit frames and nine item pictures reused from the Driftwake library).
- `fixtures.json`: the items and rocks used when the host gives none.
- `test.html`: the standalone page (panel for seed, tier, points, quick, context; full-screen stage; Leave).

## Notes for the next builder
See `LESSONS.md` in the lane folder and the READY report. Every number is a placeholder until a real hand says otherwise; the numbers live in `BASE` at the top of `model.js`.
