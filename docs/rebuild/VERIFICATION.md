# Verification record

Verification date: 2026-07-31.

## Automated results

```text
npm run verify
[OK] All data files valid. 4 products, 3 branches, 32 redirects.
--- BUILD COMPLETE (4 products, 3 branches, 29 content routes) ---
[OK] Built-site verification passed: 17 required routes, 32 redirects, 50 HTML files.
privacy scan: pass
credential-pattern scan: pass
```

```text
npm audit
found 0 vulnerabilities
```

Subpath mode also passed:

```text
SITE_BASE=/DonavenCrenshaw/ npm run build
SITE_BASE=/DonavenCrenshaw/ npm run verify:site
```

The final reviewed artifact was rebuilt with `SITE_BASE=/`.

## What the artifact verifier checks

- the complete 17-route contract;
- all authoritative redirects, canonical targets, and `noindex`;
- absence of `public/data/` and unsupported `/crenshaw-systems/software/`;
- `lang`, title, description, one `h1`, `main`, and skip link;
- every local `href`/`src` target;
- image alt attributes;
- complete primary navigation labels;
- retired identity/lore strings, unsupported “deployed” status, sponsor voting, placeholder video, Google Fonts, and empty attributes.

## Browser evidence

Playwright reviewed the real local artifact at:

- desktop: 1440 × 1000;
- branch/laptop: 1366 × 900;
- tablet: 768 × 1024;
- mobile: 390 × 844.

Observed behavior:

- parent page hierarchy remained readable and unclipped at all sizes;
- mobile project and branch cards stacked cleanly;
- mobile navigation opened with the accessible name “Close navigation,” exposed all eight primary destinations, and returned `aria-expanded="false"` after Escape;
- the first Tab exposed “Skip to main content,” and Enter moved focus to `#main-content`;
- underplain, Crenshaw Systems, and Infinite Ages used distinct, coherent skins;
- no browser console errors or warnings appeared on the reviewed pages;
- reduced-motion CSS sets animation/transition duration to `0.01ms`.

Reviewed screenshots:

- [Desktop homepage](../../output/playwright/rebuild-home-desktop.png)
- [Mobile homepage](../../output/playwright/rebuild-home-mobile.png)
- [Tablet homepage](../../output/playwright/rebuild-home-tablet.png)
- [Keyboard skip link](../../output/playwright/rebuild-keyboard-skip-link.png)
- [underplain](../../output/playwright/rebuild-underplain.png)
- [Crenshaw Systems](../../output/playwright/rebuild-crenshaw-systems.png)
- [Infinite Ages](../../output/playwright/rebuild-infinite-ages.png)

## Artifact and remote checks

- Both Infinite Ages PDF links exist in `public/`; source sizes were 19,399,310 and 14,118,523 bytes.
- `https://donavencrenshaw.com/`, the GitHub profile, and GitHub Sponsors returned HTTP 200.
- Ko-fi returned HTTP 403 from the automated client, consistent with an anti-bot boundary; no claim about its checkout state is made.
- GitHub Pages reported built/verified/HTTPS-enforced, but production still served the old Source Arcanum homepage. No deployment was performed.

## Remaining launch verification

After an authorized push: observe the exact Actions run, test production canonical and redirect URLs, download both PDFs, test the mail link and support destinations, inspect the production console/network, and record the deployed commit/run in the release note.
