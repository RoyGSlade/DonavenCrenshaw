# Project briefs (archive — not built)

These are the original authoring worksheets for the project dossiers. They are
kept for their drafting prose only.

**They are not the source of truth and nothing reads them.**
`data/projects.json` is the source of truth: `scripts/script.js` fetches it at
runtime, `scripts/validateData.js` enforces it, and `buildProjectPages()` in
`scripts/build.mjs` generates `/projects/<id>.html` from it.

Until 2026-07-25 the pipeline ran the other way —
`project_cards/*.md → buildProjectsJson.js → data/projects.json` — but the V2
migration ported only the content-page builder, so these files went inert and
drifted from the JSON the site actually serves. BetterFingers, for example,
still reads `UNSEALED` here where the live data says `DECLASSIFIED`.

Treat every status, tagline, and link in this directory as historical. To change
what the site shows, edit `data/projects.json` and rebuild.
