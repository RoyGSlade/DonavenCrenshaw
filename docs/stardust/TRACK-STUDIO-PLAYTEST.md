# Private Track Studio playtest

Serve this repository at the private server's root, and open:

```text
http://localhost:<port>/projects/Space-Shooter/?preview=weekly&draft=/studio/drafts/<id>.json
```

The `draft` value must be a root-relative `/studio/drafts/*.json` path. Absolute URLs, foreign URLs, traversal, queries, fragments and redirects are refused. An invalid or missing draft stays disabled; it never falls back to a public weekly track. The JSON is a weekly **event** with `id`, positive integer `week` and `version`, `title`, and `track` (the same layout fields as `tracks/weekly.js`). A draft may have `enabled: false` and may omit its release dates. If dates are present, both must form a valid window. The geometry must have at least three shards, a lap longer than 300 cells, and width 5.8–8 cells.

Use the Playtest button, or navigate the menu with the controller and press A. Flight uses the normal weekly keyboard/gamepad controls, simulation, input recorder and best-run ghost. The persistent label says `PLAYTEST: <title> v<version> — not ranked`. Escape, the controller pause button, and Return to playtest start keep this draft ready to retry. A wreck has Retry and Playtest start actions. Settings still work normally.

Local bests use `stardust.studio.<encoded draftId>.v<version>.best`, isolated from public weekly bests. `draftId` is the part of the path between `/studio/drafts/` and `.json`; it does not come from the event's public weekly id. **Bump `version` whenever geometry or rules change** so an old ghost is not compared against a different layout.

Each finished attempt sends a same-origin JSON POST to `/studio/api/runs`:

```json
{"draftId":"owner-track","version":1,"ms":106731,"finished":true,"log":"SDW2|weekly-02|1|…","build":null}
```

`log` is the existing SDW1/2/3 replay string, including its event id/version. `build` is the existing garage build key, or `null` for the standard ship. Wrecks and unfinished exits/retries send `{ draftId, version, finished: false, ms, reason }` once per attempt; reasons include `mine`, `hull`, `fuel`, `abort`, `retry` and `pagehide`. A wreck followed by an exit does not send a second aborted attempt. Even slower finished laps are posted. POST errors and non-success responses do not interrupt play.

The private server must supply the draft JSON and runs endpoint; this change adds only the game client. It does not start a server, publish tracks or expose new public links. Delivery is best effort (especially closing the tab or large replay logs); there is no retry queue or server receipt. Browser storage must be available for bests to survive reloads. Validation checks event types and layout construction, not whether the owner finds a circuit fun or can finish it with a physical controller.

Checks:

```text
node --test tests/stardust-weekly-studio.test.mjs tests/stardust-gameplay-integration.test.mjs
npm run test:stardust
npm run test:site
```
