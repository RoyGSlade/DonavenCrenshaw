# Ralph (screen module)

## Why first
1. **Why it should exist.** Donaven, 2026-11-19: "interactions with ralph the dog throw his ball give him a bone etc". Ralph is already in the hangar; this is the thing you go back to the hangar for. A toy, not a test: no skill, no roll, no fail.
2. **The outcome.** You open it, Ralph reads as a living dog within ten seconds, you throw his ball, rub the spot, give him a bone or kibble, and leave with him happier than you found him (and sometimes with a bolt he is very proud of).
3. **How it is tested.**
   - Pure tests (`tests/model.test.mjs`): the ball's flight and bounces repeat per seed; Ralph always reaches a thrown ball; each return style lands at its stated rate and never leaves the ball unreachable; bond rises at most one step a day; the bone ends fetch; items go down only when used; finds come from the record at their rate; nothing leaves him permanently away; an odd record never throws.
   - Five hands (`tests/bots.test.mjs`): nice, wobbly, lazy (only watches), mash, and the thinker who holds still on him. Invariants: the ball is always gettable, mood never sticks at the bottom, the result is plain data.
   - Browser test (`tests/browser.test.mjs`): desktop mouse and phone touch, real flicks, the house rules, Leave by contract 1.1 with no sound left running.
   - Then a human-style playthrough on both sizes and a Fable review.
4. **How it is built to get there.** `model.js` is pure and seeded (time comes in as `dt`). Ralph is a state machine (greet, chase, carry, return, rub, eat, chew, away) over a small physics world (ball with height and bounces, rectangles for the kennel, crates and the scrap pile). `view.js` draws a top-down hangar corner on one canvas. The one top-down picture of Ralph is split into body and head; the tail is drawn in code, so he can trot, skid, lean, sit, lie, kick and wag. Sound is synthesised in `audio.js` (no bark, no whine). Everything about the world (his record, items, finds, spot) arrives in `ctx.context`.

## Context in (`fixtures.json` has defaults)
`context.ralph = { mood 0-100, bond 0-5, asleep, lastSeen (ms), favourite, spot, tricks[], finds: [{item, chance}], bondProgress?, bondedOn? (day number), fetches? }`
`context.now` (ms; the host's clock, the module never reads one), `context.items` (id to `{name}`), `context.save.items` (`bone`, `kibble`, `ball`).
`spot` is a name (`behind-ear`, `chest`, `back`, `shoulder`, `rump`) or `{x, y}` in his body frame.
`favourite` is one of `ball`, `bone`, `kibble`, `rub`, `scrap`: that thing makes him happiest.
The ball is always his own, in the yard; `save.items.ball` is not consumed.

## Result
`{ done, success: true, grade (how happy he ended, 0-100), left?, fetches, petted, fed, found, greeting, effects: { items: {bone:-1, kibble:-n, <find>:+n}, world: { ralph: { bond, bondProgress, bondedOn, mood, lastSeen, fetches (new total) } } } }`

## Host notes
- Sounds are made in code: `import { createSfx } from './audio.js'` and play ids through `ctx.sound` (`test.html` shows it). `ralph-stop` is sent on Leave; nothing loops.
- `ralph.open.1` ("Tap. Tap. Tap.", a worried metal tapping) does **not** fit a greeting, so it is not asked for.
- New art queued in `pipeline/art-queue.jsonl`.

## Notes for the next builder
See `LESSONS.md` in the lane folder.
