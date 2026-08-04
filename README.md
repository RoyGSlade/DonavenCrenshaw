# DonavenCrenshaw.com

This repository builds Donaven Crenshaw's public workspace: current work, free software under the lowercase **underplain** branch, commercial diagnosis and implementation through **Crenshaw Systems**, and creative work through **Infinite Ages Software**.

Source Arcanum is retired from the public identity. Its old source files remain in the repository only as migration evidence; generated legacy URLs are noindex redirects.

## Run locally

Requirements: Node.js 20 or newer and `rg` (ripgrep) for the privacy and credential scans.

```bash
npm ci
npm run verify
npm run dev
```

`npm run dev` serves `public/` at `http://localhost:3000`. The full verification command validates structured data, performs a clean root-domain build, checks all required routes and redirects, rejects broken internal links and banned public claims, and runs privacy and credential-pattern scans.

For a repository-path preview:

```bash
SITE_BASE=/DonavenCrenshaw/ npm run build
SITE_BASE=/DonavenCrenshaw/ npm run verify:site
```

Rebuild with `SITE_BASE=/` before reviewing the custom-domain artifact.

## Source of truth

- `data/site.json` — founder identity and dated state.
- `data/branches.json` — the three branch boundaries.
- `data/project-sources.json` — the allowlist of project-owned source packages.
- each registered project's `website/` directory — authoritative project facts, narrative, updates, and approved media.
- `data/products.json` — legacy branch inventory while the remaining projects migrate.
- `data/support.json` — support channels and tier labels.
- `data/updates.json` — publishable and draft updates.
- `data/redirects.json` — the single authoritative legacy URL map.
- `content/` — first-person page copy and redirect frontmatter.
- `src/components/` and `src/layouts/` — shared semantic structure.
- `src/styles/` — local design system; no external font or analytics dependency.
- `scripts/build.mjs` — deterministic static build into ignored `public/`.
- `scripts/projectSources.mjs` — schema validation, safe import, Markdown sanitization, and namespaced project assets.
- `scripts/verifySite.mjs` — built-artifact contract checks.

The retired `data/projects.json` duplicate was removed. Project details now come from the owning repository; the website owns only validation and presentation. Funding/media JSON, raw HTML, and old Chronicle prose are not copied into `public/` and are not public truth sources.

To prove the BetterFingers import from sibling checkouts:

```bash
PROJECT_SOURCE_ROOT=.. SITE_BASE=/ npm run verify
```

See [the project-source contract](docs/project-sources/README.md) for the files
every project supplies, [the optional showcase guide](docs/project-sources/SHOWCASES.md)
for project-owned image/video carousels and development labels, and
[the automation guide](docs/project-sources/AUTOMATION.md) for GitHub setup.

## Delivery

GitHub Actions checks out each registered project explicitly, runs the same importer and site verification, uploads exactly `public/`, and deploys through GitHub Pages. A validated project push can notify this repository with `repository_dispatch`; the central workflow still re-checks every source before deployment. See [docs/rebuild/](docs/rebuild/) for the audit, architecture, evidence register, verification record, and launch/rollback runbook.

Do not publish a product release, performance claim, customer result, license scope, community destination, or support benefit unless its evidence is present and linked. Keep `SECURITY.md` changes separate unless they are deliberately reviewed; the current checkout contained a pre-existing user edit.
