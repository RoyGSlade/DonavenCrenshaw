# Source Arcanum V2: QA & Verification

Checklist of manual verification steps pre-launch.

**Automated gate** — these three run in CI on every push and must pass before
anything below is worth checking by hand:

```bash
npm ci && npm run validate && npm run build && npm run check:privacy
```

## 1. Build Pipeline
- [x] Run `npm install` gracefully.
- [x] Run `npm run build` with no errors.
- [x] `npm run validate` passes; it also rejects a roadmap projectId that
      resolves in neither `roadmap.json` nor `projects.json`, and a roadmap
      entry missing any key the carousel renders.
- [x] Every project in `data/projects.json` produces `/projects/<id>.html`.
- [x] `projects/Space-Shooter/` still ships and plays.
- [x] Verify `/public/index.html` generates correctly from `content/index.md` + `src/layouts/home.ejs`.
- [x] Verify `/public/styles/styles.css` is present.
- [x] Verify `/public/roadmap/` and `/public/games/` generated with nested navigation logic intact.

## 2. Design Overhaul
- [x] Dark Mode (Void Black `#050505`) applies correctly.
- [x] `<em>` and `<i>` tags demonstrate increased letter-spacing (`0.05em`).
- [x] Desktop renders new CSS Grid layout (250px left nav, fluid body).
- [x] Mobile collapses navigation to top-bar without breaking modal interactions.
- [x] The "System Override" glitch rune triggers the CSS matrix shift correctly.

## 3. Interaction
- [x] Roadmap toggles (Priority vs Funded sort) work without HTML exceptions.
- [x] Project cards (Games / Productivity / Finance) expand dossiers correctly via JS.
- [x] The Home Page typing effect (`BETTERFINGERS DECLASSIFIED`) renders glitch-free.

## 4. Backwards Compatibility
- [x] Test old link mapping: Does clicking Legacy "Support" redirect to the new "Treasury"?
      (`build.mjs` emits stubs for `support`, `finance`, `games`, `productivity`, `roadmap`,
      `chronicles`, and `docs`; verify each in `/public` after a build.)
- [x] Verify `/public/404.html` is generated and its asset paths are absolute, so a nested
      miss like `/games/nope` still renders with styles and nav.

## 5. Third-Party Requests
- [x] `npm run check:privacy` passes against built output (enforced in CI).
- [x] Webfonts load from `/vendor/fonts/` (regenerate with `node scripts/fetch-fonts.mjs`).
- [x] The home-page video shows a consent gate; no YouTube request is made until
      the visitor clicks, and the embed then uses `youtube-nocookie.com`.
- [x] Network panel on first paint shows only same-origin and `data:` requests.
      Check this in a browser, not only with grep — the YouTube URL was built
      from a string in JS and no source scan would have found it.

## 6. Deploy
- [x] `gh api repos/RoyGSlade/SourceArcanum/pages --jq .build_type` reads
      `workflow`. On `legacy` the branch builder races the Actions run and can
      serve README.md as the whole site.
- [x] After deploying, curl a **nested** route (`/games/`), not just `/`. When
      the legacy builder wins, `/` still returns 200 while everything else 404s.
