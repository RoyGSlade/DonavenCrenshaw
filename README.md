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
SITE_BASE=/SourceArcanum/ npm run build
SITE_BASE=/SourceArcanum/ npm run verify:site
```

Rebuild with `SITE_BASE=/` before reviewing the custom-domain artifact.

## Source of truth

- `data/site.json` — founder identity and dated state.
- `data/branches.json` — the three branch boundaries.
- `data/products.json` — promoted product status and evidence links.
- `data/support.json` — support channels and tier labels.
- `data/updates.json` — publishable and draft updates.
- `data/redirects.json` — the single authoritative legacy URL map.
- `content/` — first-person page copy and redirect frontmatter.
- `src/components/` and `src/layouts/` — shared semantic structure.
- `src/styles/` — local design system; no external font or analytics dependency.
- `scripts/build.mjs` — deterministic static build into ignored `public/`.
- `scripts/verifySite.mjs` — built-artifact contract checks.

Legacy `data/projects.json`, funding/media JSON, raw HTML, and old Chronicle prose are not copied into `public/` and are not public truth sources.

## Delivery

GitHub Actions runs `npm ci` and `npm run verify`, uploads exactly `public/`, and deploys through GitHub Pages. See [docs/rebuild/](docs/rebuild/) for the audit, architecture, evidence register, verification record, and launch/rollback runbook.

Do not publish a product release, performance claim, customer result, license scope, community destination, or support benefit unless its evidence is present and linked. Keep `SECURITY.md` changes separate unless they are deliberately reviewed; the current checkout contained a pre-existing user edit.
