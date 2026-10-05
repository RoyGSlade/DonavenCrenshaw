# Sketch to weekly preview

`projects/Space-Shooter/studio/sketchToWeekly.js` is a pure ES module for node
and the browser. It does not publish an event or change `WEEKLY_EVENTS`.

```js
import { sketchToWeekly, weeklyPreviewSvg } from './studio/sketchToWeekly.js';
const { event, report } = sketchToWeekly(sketch, { title: 'My Loop' });
const svg = weeklyPreviewSvg(event, { width: 600 });
// Only offer flight when report.ok; the game caller uses:
// startWeekly(event, { preview: true });
```

The sketch has `version: 1`, `points: [[x,y], ...]` in normalized canvas
coordinates (y down), and positive `aspect: canvasWidth / canvasHeight`.
The last point need not repeat the first; the converter closes the loop.
4–2000 points are accepted (phone strokes normally have 50–2000).
`start` is an original point index, default 0; drawing order sets race direction.
Optional `difficulty` is `easy`, `normal` (default), or `hard`. `scale` defaults
to 1. Canvas coverage does not set world size: scale 1 uses Gantry Drop's lap
length, with aspect and proportions preserved.

`marks` contain `{ at, kind, note? }`, where `at` is an original point index.
`tight` pins a sharp corner; `landmark` supplies its note as the landmark name.
`hazard` and `fast` increase nearby straight mine density, while `calm` reduces
mines and avoids nearby bouncers/sentries. Options can override `title`,
`landmark`, `tagline`, `id` (default `studio-draft`), and `version` (default 1).

The stroke is aspect-corrected, lightly filtered, simplified with pinned RDP,
and subdivided to 12–30 points. Shards are spread by lap distance with alternating
lateral offsets. Hazards use weekly `seg/t/off` conventions. Three fuel docks
support longer laps. Each accepted event is flown with the existing default
weekly pilot and current hull physics. A failed flight may remove the mine
it hit, clear damaging hazards, centre missed shards, widen the lane up to
8 cells, or add a tangent approach behind a corner start. Every edit appears
in `report.fixes`; the final event is flown again before `ok` can be true.
Crossings and distant lane overlaps are rejected with segment numbers rather
than silently changing the drawing's topology.

Invalid data throws `TypeError`. A valid but unflyable drawing returns
`report.ok: false`, human-readable `problems`, a full event, and a drawable
preview. Flights are bounded to the weekly pilot's 420 seconds; laps shorter
than 300 cells or longer than four times Gantry Drop are rejected before flight.
`pilot.ms` is null when there is no verified finish. `estimatedHumanMs` is
78% of the careful pilot time, a heuristic rather than a measured human lap.
Pilot verification is synchronous and can take seconds: a phone UI should
run conversion in a worker. All output is deterministic, and inputs are never
mutated. Preview events have empty rewards and no comments page or release
window; promotion to a published week requires a separate release workflow.

```sh
node scripts/stardust/sketch-to-weekly.mjs sketch.json --title "My Loop" --landmark "The Drop" --version 1 --id studio-draft
cat sketch.json | node scripts/stardust/sketch-to-weekly.mjs
```

The CLI writes `{ event, report, svg }` JSON to stdout. Rejected geometry exits
0 so a caller can show its problems; invalid JSON, data, paths or flags exit 2
with an error on stderr. The SVG includes lane rails, start/finish, drawing
direction, shards, mines, bouncers, sentries, docks, title and landmark.

```sh
node --test tests/stardust-studio-sketch.test.mjs tests/stardust-weekly.test.mjs
npm run test:stardust
```

## Validation in this clone (2026-10-05)

All 14 studio tests pass. The focused studio + weekly run has 31 tests:
30 passed, 1 failed. The full Stardust run has 453 tests: 437 passed,
2 failed, 14 skipped. Both existing failures are the sibling Hub's week-two
close at `2026-10-13T19:00:00-07:00` versus this site's owner-approved
`2026-10-13T14:45:00-07:00` (weekly consistency and week-two rollout tests).
The live weekly event data, physics and existing tests were left untouched.
No browser/phone flight was performed.

The shell does not expose npm, so the full run executed its package.json
script directly: `node --test tests/stardust-*.test.mjs`, using the installed
Codex Node v24.21.0 runtime. No dependencies were installed.

The deterministic 700-point noisy oval test produced:

```json
{"ok":true,"problems":[],"fixes":[],"lengthCells":794.56,"corners":20,"shards":9,"mines":11,"bouncers":5,"pilot":{"finished":true,"ms":182161.38083632942},"estimatedHumanMs":142086}
```

The requested local commit was blocked because this session's `.git` is
read-only (`git add` cannot create `.git/index.lock`). No push or PR was made.
From this clone in a session with writable Git metadata, the scoped commit is:

```sh
git add -- projects/Space-Shooter/studio/sketchToWeekly.js scripts/stardust/sketch-to-weekly.mjs tests/stardust-studio-sketch.test.mjs docs/stardust/SKETCH-STUDIO.md
git commit -m "Convert phone sketches into verified weekly track previews" -m "Co-Authored-By: Codex GPT-6.1 Sol <noreply@openai.com>"
```
