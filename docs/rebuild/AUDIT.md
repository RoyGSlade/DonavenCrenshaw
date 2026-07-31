# Content and repository audit

Audit date: 2026-07-31. The supplied rebuild prompt is the active contract. The older living plan is useful context, but newer naming and truth rules win where they conflict.

## Outcome

The repository has been converted from a Source Arcanum/lore-first public experience into a Donaven Crenshaw parent site with three clearly separated branches. The static Markdown/EJS architecture remains. The generated artifact now contains the required current routes and explicit redirects, not the old public data cache or legacy project pages.

The strongest product evidence in the checkout is:

- BetterFingers tray/icon artwork and repository descriptions, but no current installer, independently reproducible current hash, compatibility matrix, or complete workflow recording;
- two real Infinite Ages PDFs;
- current authored content and structured branch/product records;
- the root repository's MIT license, which does not automatically license absent product repositories or the Infinite Ages PDFs.

Therefore BetterFingers is presented as feature-locked private alpha / public-alpha preparation, GetFast and PDFManager as concepts, and Infinite Ages as a prototype doorway with real PDFs but unresolved artifact licensing.

## Build and delivery facts

- Node ESM static generator: [scripts/build.mjs](../../scripts/build.mjs).
- Required structured inputs: `site`, `branches`, `products`, `support`, `updates`, and `redirects` JSON.
- Current output: 29 content routes, 32 authoritative redirects, 50 HTML files, four product records, and three branch records.
- `public/` receives only current HTML, local styles/scripts, and assets. It does not receive source JSON, old `projects/`, or the legacy rendering system.
- [scripts/verifySite.mjs](../../scripts/verifySite.mjs) enforces required routes, redirects, canonical/noindex behavior, internal link integrity, baseline document semantics, and banned public patterns.
- [pages.yml](../../.github/workflows/pages.yml) is the one deployment workflow. Duplicate deployment and automated legacy funding-refresh workflows were removed.
- Both `SITE_BASE=/` and `SITE_BASE=/SourceArcanum/` modes pass their built-site verifier.
- `npm audit` reports zero vulnerabilities.

## Content disposition

| Source area | Decision | Public handling |
| --- | --- | --- |
| Homepage, About, Now, Contact | Migrate | First-person founder workspace with dated state and no invented biography. |
| underplain | Migrate | Lowercase free-software branch. Separate branch policy from release proof. |
| BetterFingers | Migrate cautiously | Private alpha / public-alpha preparation; no current download claim. |
| GetFast, PDFManager | Migrate as concepts | Intent and missing proof are explicit. |
| Crenshaw Systems | Migrate | Diagnosis-first service, supplied discovery fee, intake path, no invented later terms. |
| Infinite Ages | Migrate | Restrained creative branch; only existing PDFs are downloadable. |
| Work | Migrate | Proof index that explicitly says no public customer case study exists yet. |
| Support | Replace legacy system | GitHub Sponsors recurring, Ko-fi one-time, no voting/merch/Discord promise. |
| Source Arcanum identity and lore | Retire publicly | Preserve source history locally; redirect public URLs. |
| Old categories and project HTML | Archive/redirect | No direct copy into `public/`. |
| Old Chronicles and VoiceSource | Archive/redirect | Dated URLs route to `/build-log/`; unreviewed old prose is not republished. |
| Funding/patron/media JSON | Archive | Not copied or fetched by the browser. |
| Space-shooter sprites/audio | Preserve locally | Not exposed as a current product without a tested archive decision. |

## Public architecture now

Primary navigation: Now, Projects, underplain, Crenshaw Systems, Infinite Ages, Build Log, About, Contact. Support and GitHub remain visible secondary actions. The footer adds Privacy and Licenses.

The homepage contains a direct promise, two high-value actions, dated win/difficulty/next step, mission/economic relationship, three active-project cards, three branch entrances, and evidence-backed participation links. No fake terminal, auto-typing, modal dossier, sponsor voting, stale funding totals, or placeholder video remains.

## Remote inspection

Read-only inspection on 2026-07-31 found the custom domain and HTTPS configured and the last observed Pages workflow successful. The production homepage still contained “Source Arcanum,” “BETTERFINGERS DECLASSIFIED,” and “STATUS: DEPLOYED.” This local rebuild was not pushed or deployed during implementation.

## Preserved risk boundary

The checkout began with a pre-existing modification to `SECURITY.md` (`asset` appended). It was deliberately not incorporated into this rebuild. That file also contains older BetterFingers release/hash language that should be reviewed separately before any future edit.
