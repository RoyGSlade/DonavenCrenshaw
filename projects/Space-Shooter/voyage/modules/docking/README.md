# Docking

**Why first** (Donaven's building rule: written before anything is built)

1. **Why it should exist.** Coming home to the star base should feel like flying, not like a loading screen. He asked on 2026-11-19: "what would be necessary for a star base... if you had made a base or like a mobile base in space, and ships could pull up to it." Docking is the moment you arrive.
2. **The outcome it has to produce.** A player who has never seen it understands in ten seconds what to do (line up in the lit corridor, ride its sweep, ease in slowly), gets a clamp-thump of satisfaction on a clean dock, and wants to do it again cleaner. A bad approach costs hull, or the tug's fee, and always ends with the ship docked so the story moves on.
3. **How the outcome is tested.** `tests/model.test.mjs` (pure rules, the roll, the three paths, quick mode, and the four-bot sweep against the contract's target curve); `tests/browser.test.mjs` (real mouse and keys at 1440x900, real touch at 390x844, the house rules); proof shots at both sizes that the builder looked at; and a player's play notes (in the lane's READY.md).
4. **How it is built to get there.** A seeded pure model (`model.js`, `setup.js`) with a bot (`bot.js`) that flies it the way a hand does; a canvas view (`view.js`) where the state is physical (a corridor that flares at the wall, approach lights that go out, clamps that close, a tug) and the HUD is drawn bars, lamps and plain words; a guide tone that rises as you centre (`audio.js`), so the sound is a clue.

## What it is

Top-down. A big base turns slowly; a lit corridor runs out from a berth on its rim, wide at the mouth and narrow at the berth, so it **sweeps**. You start outside the mouth, off to one side. Aim the nose, burn, line up inside the funnel, match the sweep, and reach the berth under the safe speed. The clamps catch.

- **A scrape** (touch the wall longer than the wall warning, arrive too fast, or miss the berth face) costs hull and bounces you back out. It never ends the run.
- **The limit is in the world:** six approach lights over the berth go out one by one. When the last is out, a tug pushes you in: you still end up docked, minus the tug's fee and the hull you scraped.
- **The decision:** lead the corridor or chase it; when to turn and brake (late is fast and risks a scrape, early is safe and the corridor may sweep away); drift back to the middle now, or ride the edge and trust the warning.
- **Quick mode** (`ctx.quick`): you start already lined up inside the mouth, so it is only the last approach (6 to 10 s).
- **The first burn starts the run.** Until then the lights wait, so there is time to look.
- **The camera zooms in as you close.** Far out it keeps a wide view so the sweep reads; the last third zooms in smoothly (in three steps with reduced motion) so the walls feel close, the ship's nose reads and the clamps are an event. Geometry only: the model never moves.
- **Leave:** the module registers `ctx.onLeave(fn)` at the start. When the host calls `fn()` it stops its loop, keys and every sound (the Web Audio context is closed) and resolves `{ done: true, left: true }`.

## Hand

| | Aim | Burn |
| --- | --- | --- |
| Phone | drag a finger on the board (the nose swings to face it) | hold the THRUST pad (a second finger) |
| Desktop | move the mouse, or WASD / arrows | Space, or the mouse button, or any WASD / arrow key (it aims and burns that way) |

## Paths (Handling's divisions; the manifest lists them as contract-1.1 path objects, and Stardust's old piloting names are accepted as aliases in the code)

| Path | Alias | One point does |
| --- | --- | --- |
| Control | landing | a wider corridor (+4% a point) |
| Maneuver | handling | a slower sweep (-4% a point) |
| Pursuit | boost | a longer wall warning (+0.12 s a point): the wall glows from further out and the warning tone starts sooner |

The roll (tier -2 Rough to +2 Smooth) widens or narrows the corridor and slows or quickens the sweep. No point ever makes it harder (a test).

## Folder

| File | What |
| --- | --- |
| `manifest.json`, `index.js` | the contract (1.1) entry: `play(stage, ctx) -> result`; registers `ctx.onLeave(fn)` once at the start |
| `model.js`, `setup.js`, `rng.js` | the pure seeded rules, the roll and path scaling, the seeded random (copied from the game) |
| `bot.js` | the four bots (perfect, wobbly with reaction lag, lazy, mash) and the sweep helper |
| `words.js` | HUD words, end lines, the dockmaster's four lines (**the module lead's drafts for Donaven, not his words**; marked `draft` in `fixtures.json`) |
| `view.js`, `style.css`, `audio.js` | the full-screen view, its look, its sounds made in code |
| `fixtures.json` | the default base and ship records (`ctx.context.base`, `ctx.context.ship`) |
| `art/` | `base-drift-station.webp` and `ship-courier.webp` (reused from the library), `kit/` (the hangar kit frames the pad and card wear) |
| `test.html` | the standalone page: seed, roll, points, quick, context, and a host-style full-screen stage with Leave |
| `tests/` | `model.test.mjs`, `browser.test.mjs`, `serve.mjs` (a tiny static server for this folder) |

## Run it

```
node tests/model.test.mjs                      # or: node --test tests/model.test.mjs
node tests/serve.mjs                           # then open http://127.0.0.1:8765/test.html
STARDUST_BROWSER_TEST=1 ~/Desktop/lhc-lanes/stardust/round3/browser-slot.sh ~/kauto-3d/bin/capped 6G timeout 590 node --test tests/browser.test.mjs
```

`test.html` also takes `?auto=1&seed=3&tier=1&quick=1&control=3&maneuver=2&pursuit=4` for a straight-in start.

## Context the host gives it

`ctx.context.base = { id, name, faction, colour, icon, berths, berth, tugFee?, docked: [{ ship, berth }] }` and `ctx.context.ship = { name, icon }` (defaults in `fixtures.json`). No base or ship name is written in the model or the view (a test checks). The result carries `effects.world = { hullDelta, docked: { base, berth }, feeDelta? }`; the fee key is present only when waved off.

## Notes for the next builder

See the lane's `LESSONS.md`. Every number in `setup.js` (`DOCKING_BASE`) and `model.js` (`SCRAPE`, `A_T`, `DRAG`, `TURN`, the XP) is a placeholder, tuned only by the bot sweep and a few playthroughs.
