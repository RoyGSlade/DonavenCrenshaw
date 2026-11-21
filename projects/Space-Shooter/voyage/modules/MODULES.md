# Add a module in 5 minutes

A module is a folder. The game never needs editing to accept one. Contract: `pipeline/CONTRACT.md` (v1.1, in lhc-lanes/stardust). Working example: `tests/fixtures/modules/_sample-game/` (a mini-game) and `_sample-screen/` (a screen).

## The 5 steps
1. **Copy** `tests/fixtures/modules/_sample-game/` to `voyage/modules/<your-id>/` (this exact path, never anywhere else). Rename the id in `manifest.json`, `style.css` (`.m-<id>`) and the folder.
2. **Fill `manifest.json`**: `id`, `kind` (`minigame` | `screen`), `title`, `verb` (the short action words), `skill` (the skill it trains, or leave it out), `status` (`draft` to start; only Donaven sets `approved`), `contract: 1`. Optional `paths`: `[{ "id": "diagnose", "division": "Diagnose", "tabletopSkill": "Mechanical" }]`. With `paths`, `ctx.points` is keyed by those ids; without them it is `{ speed, quality, material }`.
3. **Write `index.js`**: `export function play(stage, ctx)` returns a promise of `{ done, success, grade, ...outputs }`. A screen puts what it changed in `effects.world`; the host applies it. Rules go in `model.js` (pure: seeded, no DOM, no clock, no Math.random), drawing in `view.js`.
4. **Add one line** to `modules/list.js`: `'<your-id>',`.
5. **Run** `node scripts/build-module-index.mjs` (rewrites `modules/index.json`, which the controller reads) and `node --test tests/stardust-modules.test.mjs`.

Nothing else changes. After step 4 the module is on the workbench Module shelf (Skills board, "Module shelf"), in the controller index, in the skill picker lines for its skill, and has a roll preview.

## What `ctx` gives you
`seed`, `tier` (-2..+2), `points` (keyed by your paths), `level`, `context` (world state to read), `sound(id)`, `reducedMotion()`, `onLeave()`, `mode` (`field` | `trainer`) and `play(id, overrides)`: opens another module full screen on top and resolves with its result (a shop screen opening haggle). Never import another module. Every field has a default, so your module runs on its own test page.

## Bind it to a console in a map (one data line)
On any map prop: `"interact": { "kind": "module", "id": "<your-id>" }`. Optional keys on the line: `tier`, `seed`, `mode`, `context` (extra world state your module reads). The page builds `ctx` from the save, plays the module full screen, then applies `effects` (`items` and `flags` through the save, `world` through the page's `applyWorld` hook). A test fails if a map names a module that is not in the list.

## Opt in from the manifest (no other file changes)
- **The gym:** `"gym": { "name": "Sample pads" }`. The module then appears in `GYM_GAMES` (minigames/gym.js reads the registry), in `gymGamesFor(skill)` and in the workbench trainer, trained at a Steady roll. Its category ids are its `paths`.
- **A scene hook:** `"hook": { "skill": "repair", "outcomes": ["win","lose"], "inputs": { "pads": { "type": "int", "min": 3, "max": 6 } }, "defaults": { "title": "..." } }`. A scene choice can then say `"minigame": { "kind": "<your-id>", "pads": 4 }`. `hookIssues` checks the inputs from the manifest (`int` with min, max, required, greaterThan; `enum` with values; `string`); `outcomes` may include `"mid"` (the choice then needs a `mid` node); `"branch": { "by": "outcome", "win": [...], "mid": [...] }` maps a result's `outcome` to a branch instead of `success`; `"worldFields"` names result fields that become the scene's world facts.
- **Bare:** `"bare": true` means the module draws its own top bar and Leave.

## Optional host hooks (exports of `index.js`)
None are required; each has a default built from the manifest.
- `setup(o)`: how the d20 tier, level and points set your game up (default: a plain time factor).
- `rollSpec`: `{ setup, phrases }` for the roll preview line "Smooth roll: ...".
- `picker`: `[{ id, name, words(n) }]` for the skill picker words, one per path.
- `hookWorld(result)`: what a finished scene hook did to the world.

## The existing games
The nine games plus Perihelion, Cut, Screw, Bolt plate, the practice lock and the bribe are modules too: thin adapters in `modules/<id>/` that call the existing `createX`/`playX` in `minigames/`. The workbench, scene hooks and trainer launch only through `modules/registry.js`. Legacy per-station options (`title`, `who`, `what`, `open`, `best`, `lock`, `system`, `tool`, `resume`) arrive in `ctx.context`; hack's old `context` option (foot, ship, combat) is `ctx.context.context`.

## Page code that uses the registry
The launch paths (`play`, `playModule`, `openModule`, `playGame`, `playHook`) and the async starters `startHookAsync` and `startStationAsync` wait for the registry themselves. A sync API cannot wait, so if it is called before `await ready()` (from `modules/registry.js`) it throws one error that names `ready()`: `startHook`, `startStation`, `hookIssues`, `HOOK_KINDS`, `GYM_GAMES`, `gymGamesFor`, `pickerLines`, `shelfRows`, `setupOf`, and `rollPreview` for an id with no built-in list. Page code should use the async starters. Tests that call the sync ones put `await ready()` right under their imports.
