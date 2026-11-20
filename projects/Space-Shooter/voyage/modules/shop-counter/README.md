# Shop counter (`shop-counter`)

**Why it should exist.** One counter that plays any shop. A shopkeeper, their stock, their lines and their prices are records, so an NPC record that says "shop" becomes a shop you can stand at, with no new code. The star base's tier 1 needs three of these, and the laptop session is writing more as data.

**The outcome it has to produce.** A player who walks up to any counter understands it in ten seconds without a manual: they can see the keeper's mood, what is on the shelf, what is left, what it costs and what they can't have yet. They pick things up, put them down, argue the price once, sell their own goods, pay, and walk away. Nothing on the way is a dead end, and money only moves when they say so.

**How it is tested.**
- Pure tests (`node --test tests/model.test.mjs`): a record in gives the right drawing data; each control gives the right effects; you can't spend more than you have; a limit holds; a locked item stays locked; each haggle outcome changes the total as written and removes the control; a shut shop does nothing but leave; the same seed gives the same shop; points never change a price or an effect.
- Browser test (`tests/browser.test.mjs`): real mouse and keys at 1440x900, real touch at 390x844, against the house rules (full screen, nothing scrolls sideways, no icon over a button, one h1).
- Proof pictures at both sizes, and a play-through by the builder with notes.

**How it is built to get there.** `model.js` is the whole shop: seeded, no DOM, no clock, no `Math.random`, and no shop, keeper, item, price or line written in it. It turns `context` into drawing data (`view(state)`) and takes the player's actions (`lift`, `putBack`, `pay`, `askPrice`, `offer`, `sellOne`, ...) and returns what changed. `view.js` only draws that: a shop front with a roll-up shutter, shelves, a keeper bust whose face follows what you do, a chalk board, your purse, a till and a tray. Everything is drawn in CSS and SVG. The only pictures are the keeper portraits and a few library item icons; any item without a picture gets a drawn glyph.

---

## Using it

```js
import { play } from './index.js';
const result = await play(stage, ctx);   // resolves when the player leaves (or the host leaves it)
```

`ctx` follows `CONTRACT.md` plus `CONTRACT-PROPOSALS.md`. What this module reads:

| `ctx` | Use |
| --- | --- |
| `seed` | which way items lean on the shelf, which line variant a keeper uses (when a record gives a list), dust and chalk wobble |
| `tier` | `+2` the keeper starts happy, `-2` starts annoyed; passed on to the haggle game |
| `points` | `valuation`, `barter`, `market` (each 0 to 9). `haggle` counts as `barter` (the social alias) |
| `quick` | the short version: no shutter roll, no haggle, no selling tray; just look and buy |
| `play(id, overrides)` | opens the haggle game. Missing: the haggle control is not shown |
| `sound(id)` | `shutter`, `lift`, `knock`, `coins`, `till`, `glass`, `broke`, `line:<id>`, `music:<id>`, `music:stop` |
| `reducedMotion()` | cuts the shutter roll, the flying items and the coin slide |
| `context.shopId` | the id `effects.world.shops[shopId]` is keyed by |
| `context.shop` | the game's shop record: `name`, `blurb`, `lines`, `discounts`, `stock`, `buys`, `open`, optional `music` |
| `context.keeper` | `{ name, portrait: { neutral, happy, annoyed } }` (paths relative to `index.js`, or absolute) |
| `context.items` | `{ id: { name, icon, blurb, value, max } }` |
| `context.lines` | `{ lineId: { text, emotion, direction } }`: the story's line table, for record lines that carry only an id (Mel's `open` and `buy` do) |
| `context.names` | `{ id: "Name" }` for rep givers and skills, used in the plain "has to know you first" reasons |
| `context.save` | `money`, `items`, `rep`, `skills`, `flags`, `stats` (the game's save; `save.character.skills` and `.stats` are read too) |
| `context.bought` | `{ itemId: n }` bought here before; with `limit` it sets what is left on the shelf |

**Leaving.** The host's Leave calls `stage.leave()` (or dispatches a `stardust:leave` event on the stage), and the promise resolves with `{ left: true, ... }` and everything bought and sold so far. Esc does the same. Pay is final: it changes nothing until pressed, so leaving with a full basket buys nothing.

**Result.**
```
{ done: true, success, grade, left: true,
  effects: { items: { id: +n | -n },
             world: { moneyDelta, rep: { giver: n }, shops: { [shopId]: { bought: { id: n } } } } },
  bought, sold, spent, earned, haggle: { used, outcome } }
```
`success` is true when anything was bought or sold. `grade` is 100 for that, otherwise 0 (a screen has no skill grade). The host applies the effects; the module never writes the save.

## What is on the screen, and where the digits are allowed
Digits show on three things that have numbers written on them in the real world: a **price tag**, the **till** and **your purse**. Nothing else shows a number: stock is what is on the shelf ("last one", a dusty gap), discounts are the record's words on the chalk board, the keeper's mood is a face, a haggle's result is a stamp. (The lead's ruling in the brief, for Donaven to overturn.)

## Out of this version (for the next builder)
- The record's risky `deals[]` (Edna's mystery crate, knucklebones): each needs a skill check and a result scene.
- Equipping gear (`lines.equip`, Mel's "turn round"): the game's `shop.js` wears gear on purchase; the host can do that from `effects.items` for now.
- Shop-side discounts only. The game's `priceFor` (charisma and skills) is not applied here: the host should hand in prices already adjusted, or add `context.priceOff`.
- Voice and music are listed (`ctx.sound`) but rendered separately.

## Files
`index.js` entry, `model.js` rules, `view.js` drawing, `style.css` (scoped under `.m-shop-counter`), `fixtures.json` (Mel's locker as it stands in the game's data, Edna's back room, and an invented test stall whose lines are drafts), `test.html` (the test page), `tests/`.
