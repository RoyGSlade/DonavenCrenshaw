# crate-look: look inside a crate

**1. Why it should exist.** Donaven, 2026-11-19: "be cool if the bay in the hanger you could look at whats in the crates ores minerals items food whatever or if they are empty". Cargo should be something you look at, not a number. It is also where the drill's finds end up and what the forklift carries later.

**2. The outcome it has to produce.** Walk up to any crate, lift the lid and see at once what is in it, how full it is and whether the packing slip tells the truth. Take things, put things back, chalk a mark on it, leave. Nothing is lost or made up on the way.

**3. How the outcome is tested.** Pure tests on `model.js` (every rule in the brief, five fixtures, five shopper bots: perfect, wobbly, lazy, mash and one that rests; nothing created or lost, capacity never passed, sealed stays sealed, points never remove anything). A browser test on desktop (mouse and keys) and phone 390x844 (touch) for the house rules, Leave by contract 1.1 and no sound left running. Proof shots at 1440x900 and 390x844, then a played-through set of notes.

**4. How it is built to get there.** `model.js` is seeded and pure: it turns a record into drawing data and applies take, take-all, put-back, chalk. `view.js` draws a crate seen from above at an angle in SVG and CSS (wood, steel, cold box), with a lid that is dragged or tapped, latches that flip, straw with dents, a slip clipped on the side and a tray for your bag. Items use the painted icons when a record has one and a strapped parcel (copied from the shop counter) when not. `audio.js` makes every sound in code with Web Audio; the host plays them through `ctx.sound`. All words about the world come in as records (`fixtures.json`).

---

## Contract (1.1)
- `kind: screen`, tabletop skill **Perception**: paths `awareness`, `inspection`, `trace`.
- Reads `ctx.context.crate`, `ctx.context.items`, `ctx.context.save`. Writes nothing itself: the host applies `effects`.
- `ctx.quick`: the lid is already off; look and take only (no chalk, no putting in).
- Leave: the module registers `ctx.onLeave(fn)`; the host's Leave calls it; the result is `{ done, left: true, ... }` with everything moved so far. Esc also leaves.
- Sounds: `ctx.sound(id)` with ids listed in `audio.js` (`SOUND_IDS`). A host that wants them plays them with `playSfx(id)` from `audio.js`.

## Context
```
context.crate = { id, label, kind: 'wood'|'steel'|'cold', owner, sealed, reason, capacity,
                  contents: [{ item, qty, hidden }], slip: [{ item, qty }], origin, traces: [], tag }
context.items = { [id]: { name, icon, blurb, glyph, kind } }
context.save  = { items: { [id]: n }, capacity }            // capacity is optional (no limit when absent)
```

## Result
`{ done, success (the crate was opened), grade: 100, left?, took: {item:n}, put: {item:n}, tag, saw: { mismatches, hidden },
  effects: { items: {id: +/-n}, world: { crates: { [id]: { contents: [...], tag } } } } }`
`effects.world.crates[id]` appears only when the crate changed (contents or chalk).

## Rules worth knowing
- Capacity: the crate holds at most `capacity` units (default: what it holds, or 12). The bag holds `save.capacity` (default: no limit). A refused move leaves everything as it was.
- A hidden thing is dug out once you have taken `depth` things from the pile on top of it (1 to 3, seeded; the roll shifts it: Smooth is sooner, Rough later), or at once with **Awareness**, which also makes it glint.
- **Inspection** marks every slip line that does not match the crate as it was when the lid came off, and tags things that are not on the slip. **Trace** shows an origin line even when the slip has none. A Rough roll smudges slip lines (Inspection reads them anyway).
- The slip shows digits (lead's ruling). Nothing else does.
- Items with no icon are drawn as a strapped parcel with a stencil by item kind or name (`glyph` on the item picks one).
