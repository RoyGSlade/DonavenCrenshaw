# Source Arcanum V2: QA & Verification

Checklist of manual verification steps pre-launch:

## 1. Build Pipeline
- [x] Run `npm install` gracefully.
- [x] Run `npm run build` with no errors.
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
- [x] Test old link mapping: Does clicking Legacy "Support" redirect to the new "Treasury"? (If we added redirects).
