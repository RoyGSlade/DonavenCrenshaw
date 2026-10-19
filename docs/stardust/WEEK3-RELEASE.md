# Week 3 release — command sequence

Week 3 (`weekly-03`) is a **disabled, trackless candidate** in the site
(`WEEK3_DRAFT` in `projects/Space-Shooter/tracks/weeklyRollout.js`) and the Hub
(`rules.json` level + event, `replay/catalog.json` entry with `track: null`,
`config/titles.json` champion title). Nothing here enables or deploys it.

Window (owner cadence, Focus a1f45c71): Week 2 closes Tue Oct 13 **2:45 PM PT**;
Week 3 opens Tue Oct 13 **3:00 PM PT** (2026-10-13T22:00Z) and closes Tue Oct 20
2:45 PM PT. The tool refuses to ship if either repo's dates drift from this.

Placeholders the owner has not decided: Week 3 rewards are champion-only
(`weekly-03-champion`, no named hull, no placements) and the draft carries
`theme: 'mall'`. If the track is not a mall, delete that line from `WEEK3_DRAFT`
before shipping.

## Tuesday sequence (site checkout = `site`, Hub checkout beside it)

1. Branch both repos from fresh main (worktrees `site-week3` / `hub-week3`, or
   rebase this PR's branches). Site: `npm ci`.
2. Get the approved design as an event JSON. From a Track Studio v2 design
   (`.studio-data/designs/<id>.json`, field `doc`; converter currently only on
   `legacy/track-studio-v2`, not on main):
   ```sh
   node -e "const d=require('./d-mall-overhaul.json');require('fs').writeFileSync('doc.json',JSON.stringify(d.doc))"
   node scripts/stardust/sketch-to-weekly.mjs doc.json --id weekly-03 --title "<Title>" --landmark "<Landmark>" --version 1 > converted.json
   ```
   `converted.json` is `{ event, report, svg, intent }`; the ship tool takes it
   as-is, refuses it unless `report.ok` is true and warns if `intent` is not empty.
   Check `report.pilot.ms` (autopilot lap) and the `svg` preview first.
3. Dry run (writes nothing; flies a scripted lap, replays it through the Hub
   verifier, prints both track hashes):
   ```sh
   node scripts/stardust/ship-weekly-track.mjs --week 3 --draft converted.json --title "<Title>" --landmark "<Landmark>" --floor-ms <N> --hub ../hub --version 1 --dry-run
   ```
   `<N>` must be below the printed pilot time. Week 2's rule of thumb: 0.433 x
   the autopilot lap (124 s autopilot -> 53000). Owner evidence overrides it.
4. Same command without `--dry-run`: fills `WEEK3_DRAFT` (site) and the Hub
   rules/catalog. Still disabled. Review both `git diff`s; the two track hashes
   must be identical.
5. Only after the owner approves the track: repeat step 4 with `--enable`. It
   sets exactly `WEEK3_DRAFT.enabled`, Hub `levels[weekly-03].enabled` and
   `events[weekly-03].enabled`. It never touches Week 2 or the rollout gate.
6. Verify. Site: `npm run test:stardust` (set `STARDUST_HUB_ROOT=<hub path>` when
   the Hub is not the sibling `../hub`). Hub `api/`:
   `STARDUST_SITE_ROOT=<site path> npm test` and `node --test test/games.ship-weekly-track.test.js`.
7. Commit each repo (the tool never does), open PRs, owner merges. Hub deploys
   via the owner's `scripts/update.sh`; site deploys on merge to Pages.
   Aim to be live by 3:00 PM PT; the site rebuilds only on deploy.

## If Week 3 is not enabled by Tue 2:45 PM PT

- Hub: `weekly-02` stops taking new runs exactly at the close; `weekly-03` is a
  disabled board (`board_pending`, 403). History and boards keep reading.
- Site: the weekly card and ticker keep featuring Week 2 as a closed archive;
  nothing weekly is playable. Network circuits and the custom track stay retired
  (the Week 2 rollout lists them as `legacy` for good), so only Dogfight is open.
  The custom-track card stays hidden because a weekly is always "current".
- Fix is to ship step 5 whenever ready; the 3:00 PM opening is then honoured
  immediately if inside the window (no date change needed before Oct 20 2:45 PM).
