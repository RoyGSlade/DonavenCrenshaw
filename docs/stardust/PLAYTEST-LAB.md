# Stardust playtest lab

Phase 3 of the engagement plan asks to compare a few boost, fuel and collision
models in playtests before committing to one. The lab makes that a link
instead of a branch: the same game with different rules, and nothing saved.

## Links

The game at `games/stardust/` with a `lab` parameter. `?lab` alone is today's
rules under lab conditions, the fair baseline.

| Session | Link |
| --- | --- |
| Baseline | `https://donavencrenshaw.com/games/stardust/?lab` |
| Charge boost | `…/games/stardust/?lab=boost:charge` |
| Heat boost | `…/games/stardust/?lab=boost:heat` |
| Lean tank | `…/games/stardust/?lab=fuel:lean` |
| Impact rails | `…/games/stardust/?lab=rails:impact` |
| Any mix | `…/games/stardust/?lab=boost:charge,fuel:lean,rails:impact` |

The hangar also has three dropdowns to switch rules and reload.

| Rule | What changes |
| --- | --- |
| `boost:pips` | Today: tap for a push, three charges that refill. |
| `boost:charge` | Hold to build a push (0.15–0.7 s), release to fire: ×0.5 to ×1.6 of today's push, one charge, 0.6 s cooldown. A tap does nothing. |
| `boost:heat` | No charges. Every boost adds 34 heat (cools 26/s); push ×1.15 when cold down to ×0.40 when hot. The pips meter shows how cool the drive is. |
| `fuel:lean` | Fuel burns ×2.5 and each boost costs 4 fuel. Docking at the station refills it. |
| `rails:impact` | Along-rail speed is scrubbed by up to 45% in proportion to how hard you hit; above 4 units/s of impact the hull takes (impact − 4) × 3.5, at most 25. Scrapes barely slow you and never hurt. |

## What a lab session guarantees

- Run saving never starts: no run reaches the hub, nothing is compared with
  the leaderboard, and challenge links are ignored. A browser check of a lab
  session recorded zero requests to the hub.
- The status chip reads **PLAYTEST LAB · TIMES NOT SAVED** and the hangar lists
  the active rules.
- At the finish, **Copy playtest report** copies the rules, total and circuit
  times, boosts and their average strength, rail hits and damage, docks,
  fuel-outs, lowest fuel, and hull losses, ending with "How did it feel?".
- Dogfight is untouched: it never reads the lab settings.

## A session that produces an answer

Each tester, same device and controls throughout:

1. Two warm-up laps of Alpha Relay at `?lab` (baseline).
2. One full network at `?lab`, copy the report.
3. One full network per variant being tested, in a different order for each
   tester, copying the report each time and writing one line on feel.
4. Say which one you'd keep and why.

Three testers × (baseline + two variants) is an evening. Compare times only
within a tester; compare feel across testers.

## What the scripted pilot measured

`tests/stardust-lab.test.mjs` flies the circuit tests' careful line (no
boosting) under every rule set. Every circuit finishes under every rule, and
nothing ran dry on the careful line.

| Rules | Fuel left after one lap, circuits 1–5 |
| --- | --- |
| Today | 73.4, 75.9, 72.2, 67.9, 71.4 |
| Lean tank | 33.5, 39.7, 30.5, 19.7, 28.6 |

A crude pilot that boosts on a timer (not a racing line) spent 5–6 boosts per
lap on the lean tank and ended each circuit between −3.4 and 2.7 fuel, or did
not finish. That is a bound for tuning, not evidence about real players: on the
lean tank, roughly five boosts per lap is the budget without docking. Impact
rails and both boost models change nothing on the careful line, which barely
touches the rails and never boosts; their effect only shows in real flying.

## Known limits

- A gamepad's Y **toggle** keeps boost held, so charge boost never releases.
  Test charge boost with the bumper, Shift or the touch button.
- The charge build-up has no gauge yet; the push on release is the feedback.
- Hazards, fuel stations and circuit layouts are unchanged; so are medals and
  every hub rule.

## Turning a winner into the real game

A chosen rule changes flight, so it changes what a time means. Make it the
default in the game **and** bump every affected board's version (levels and
the season) in both the game and the hub's `rules.json`. That starts a new
comparable record set and archives the old one instead of mixing them, which
is the plan's rule for physics changes. Medal times start over with the new
version too.
