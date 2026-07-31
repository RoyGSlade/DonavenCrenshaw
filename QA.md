# DonavenCrenshaw.com QA

Evidence date: 2026-07-31. Full details and screenshots are in [docs/rebuild/VERIFICATION.md](docs/rebuild/VERIFICATION.md).

## Automated gates

- [x] Structured identity, branch, product, update, support, and redirect data validates.
- [x] Root-domain build succeeds.
- [x] All 17 required routes exist.
- [x] All 32 legacy redirects exist, canonicalize correctly, and are noindex.
- [x] All 50 generated HTML files have language/title metadata and valid internal targets.
- [x] Every non-redirect page has one `h1`, a `main` landmark, a skip link, and a description.
- [x] Generated output contains no public `data/` cache, retired identity, lore status, placeholder video, Google Fonts dependency, empty URL, or unsupported Crenshaw Systems catalog.
- [x] Privacy and credential-pattern scans pass.
- [x] `npm audit` reports zero vulnerabilities.
- [x] `/SourceArcanum/` subpath build and verifier pass.

## Browser gates

- [x] Desktop homepage reviewed at 1440 × 1000.
- [x] Laptop/branch pages reviewed at 1366 × 900.
- [x] Tablet homepage reviewed at 768 × 1024.
- [x] Mobile homepage reviewed at 390 × 844.
- [x] Mobile menu opens, updates its accessible name/state, and closes with Escape.
- [x] First Tab exposes the skip link; Enter moves focus to `#main-content`.
- [x] No browser console errors or warnings were observed on the reviewed routes.
- [x] Reduced-motion CSS collapses animation and transition durations.
- [x] underplain, Crenshaw Systems, and Infinite Ages are visually distinct without changing the parent navigation contract.

## Launch-only gates

- [ ] Review and intentionally commit only the rebuild files; do not absorb the pre-existing `SECURITY.md` edit accidentally.
- [ ] Push the reviewed commit and observe the GitHub Pages workflow.
- [ ] Confirm production changed from the old Source Arcanum homepage.
- [ ] Test the apex, `www`, HTTPS, 404, PDF downloads, mail link, support links, and a redirect sample on production.
- [ ] Record the deployed commit and workflow URL for rollback.
