# NOIR_SPEC — DonavenCrenshaw noir restyle (Wave: noir-restyle)

Single source of truth for the monochrome-noir redesign. Concept references live in
`docs/design/concepts/01..10-*.png` (workers cannot view them; this spec IS the design).
Director: `director` session. Questions → `collab_post` to `director`.

## 0. Hard rules (every worker)

1. NO git write commands ever (no add/commit/branch/push/stash/checkout). Read-only `git status`/`git diff` allowed.
2. NO sub-agents, NO collab_spawn. You are the hands; the director is the eyes.
3. Claim exactly your task's files with `collab_claim` before editing; never edit outside your list.
4. NEVER edit `public/` (build output) — edit `src/`, `content/`, `scripts/`, `assets/` only.
5. TRUTH RULE: the site's copy is truth-audited. Restyle markup freely, but do NOT invent
   numbers, stats, counts, or claims that aren't already in the content file. Concept images
   contain filler stats ("120+ audits", "95%") — those are placeholders, NOT copy to add.
6. The dev server (localhost:3000) rebuilds on file change; you may run `node scripts/build.mjs`
   once serially to check for build errors, but do not loop builds.
7. Preserve accessibility: skip-link, aria labels, keyboard focus visibility, heading order.
   All decorative layers get `aria-hidden="true"` and `pointer-events: none`.
8. `prefers-reduced-motion: reduce` must disable ALL animation (smoke drift, sheen sweeps,
   glow pulses) — static first frame is fine.

## 1. Look in one paragraph

Detective-noir command desk. Near-black concrete room, one hot desk lamp, a monitor glowing
with a white neon ring, faint circuit traces climbing the wall, graffiti ghosting in the dark
right edge, real smoke drifting. All chrome is monochrome: silver metallic headlines, glassy
charcoal cards with a lit top edge, thin white-hot divider lines, mono-font letterspaced
uppercase labels. Bright white neon is the ONLY "color". Light behaves physically: glow
sources sit on a low z-layer, occluders above them carve shadows, content floats above that,
smoke drifts over everything except the sidebar.

## 2. Z-INDEX LIGHT SYSTEM (the core mechanic)

Tokens (defined in `tokens.css`, used everywhere):

```css
--z-void: 0;      /* page backdrop: concrete gradient + noise + vignette (body::before) */
--z-light: 1;     /* .light-source — bright white neon glow blobs (UNDER everything) */
--z-occluder: 2;  /* .shadow-caster — dark masks that block light and cast shadows */
--z-scene: 3;     /* hero scene imagery */
--z-content: 10;  /* cards, text, main */
--z-smoke: 40;    /* #smoke-layer canvas overlay */
--z-nav: 50;      /* sidebar */
--z-top: 100;     /* skip-link, modals */
```

Semantics:
- `.light-source`: absolutely/fixed positioned div, `z-index: var(--z-light)`, pure white
  radial gradient `radial-gradient(closest-side, rgba(255,255,255,var(--glow-a,0.55)), transparent 70%)`,
  optional slow pulse. Because it sits at z 1, any `.shadow-caster` (z 2+) partially hides it
  → the light appears to come from BEHIND page elements.
- `.shadow-caster`: gets a directional shadow pointing AWAY from the key light via
  `box-shadow: calc(var(--shadow-dx, 0px)) calc(var(--shadow-dy, 8px)) 28px rgba(0,0,0,0.55)`.
- Global key light position: `--light-x` / `--light-y` (viewport-relative %, default 62% / 18%
  — the monitor glow). `scripts/light-engine.js` computes per-element `--shadow-dx/--shadow-dy`
  from the vector (element center − key light) so every card's shadow falls away from the neon
  source. This is what makes "bright white neon casts shadows along the webpage" literal.
- `.lit-edge`: 1px top border highlight `border-top: 1px solid rgba(255,255,255,0.22)` plus
  `background-image: linear-gradient(180deg, rgba(255,255,255,0.05), transparent 30%)`.
- `.divider-lit`: 1px hairline with a moving hotspot:
  `background: linear-gradient(90deg, transparent, rgba(255,255,255,0.7) var(--hot,30%), transparent)`.

## 3. Palette + type tokens (tokens.css)

```css
color-scheme: dark;
--noir-0: #050506;  /* void */
--noir-1: #0a0a0c;  /* room */
--noir-2: #101013;  /* panel */
--noir-3: #17171b;  /* panel raised */
--bg-void: var(--noir-0); --bg-rift: var(--noir-1);
--bg-panel: rgba(255,255,255,0.03);        /* glass card fill */
--bg-panel-strong: var(--noir-3);
--line-hair: rgba(255,255,255,0.08);
--line-bright: rgba(255,255,255,0.22);
--text-main: #e8e8ea; --text-muted: #9a9aa0; --text-soft: #c4c4c8; --text-secondary: #7c7c84;
--neon: #ffffff;
--glow-strong: 0 0 24px rgba(255,255,255,0.35), 0 0 64px rgba(255,255,255,0.12);
--metal: linear-gradient(180deg, #fdfdfd 0%, #cfcfd3 30%, #8e8e94 50%, #f2f2f4 62%, #6f6f76 100%);
--shadow-low: 0 8px 24px rgba(0,0,0,0.5);
--shadow-high: 0 24px 64px rgba(0,0,0,0.65);
--radius-cut: 14px; --radius-soft: 10px;
```

Keep existing spacing vars, `--nav-width: 264px`, `--container-max`, font stacks. Map ALL old
skin blocks (`skin-underplain`, `skin-crenshaw*`, `skin-infinite-ages`, parent) to these same
noir values — one noir look site-wide, skins become no-ops that keep markup valid.

Type rules (base.css):
- Display/h1: Inter 800, uppercase, `letter-spacing: -0.01em`, metallic fill via
  `.metal-text { background: var(--metal); -webkit-background-clip: text; background-clip: text; color: transparent; }`
  with a `text-shadow`-free fallback (`@supports not (background-clip: text) { color: #d9d9dc; }`).
- Mono labels: `.section-label` — `--font-mono`, uppercase, `letter-spacing: .18em`,
  `font-size: .72rem`, color `--text-muted`.
- Body: Inter 400, `--text-soft`, line-height 1.65.
- Links: `--text-main`, underline `rgba(255,255,255,.3)`, hover white + subtle glow.

## 4. Page backdrop (base.css)

`body`: `--noir-0`. `body::before` (fixed, inset 0, `z-index: var(--z-void)`):
layered backgrounds — (a) radial vignette darkening corners, (b) very faint concrete noise via
two repeating conic/linear gradients at low alpha (no external image), (c) a faint top-right
wash `radial-gradient(1200px 600px at 78% 0%, rgba(255,255,255,0.05), transparent)`.
`body::after` (fixed, right edge, width ~292px, `background: url(assets/noir/wall-graffiti.jpg)`,
`background-size: cover`, `opacity: .18`, `mix-blend-mode: screen`, masked with
`mask-image: linear-gradient(90deg, transparent, #000 40%)`) — the ghosted graffiti wall.

## 5. Smoke (scripts/smoke.js + src/styles/smoke.css) — REAL animation, no libraries

- IIFE. Creates `<canvas id="smoke-layer" aria-hidden="true">` appended to body.
  CSS: fixed, inset 0, `z-index: var(--z-smoke)`, `pointer-events: none`.
- Particle system: 24–40 particles (scale with viewport area). Each: x, y, radius 60–200px,
  life 12–24s, slow drift up-left `vx∈[-14,-4]px/s, vy∈[-10,-3]px/s` plus sinusoidal curl
  (`x += sin(t*f + seed) * amp`), alpha envelope ramping 0 → peak 0.07 → 0.
- Sprite: one offscreen canvas, radial gradient white→transparent; draw with
  `globalCompositeOperation = 'lighter'`.
- Spawn zones weighted to the right 40% of viewport and upper third (matches concepts).
- 30fps cap (`setTimeout`+rAF), pause on `document.hidden`, full stop + single faint static
  fog frame under reduced motion. Resize-safe (devicePixelRatio aware, cap DPR at 1.5).
- API: `window.NoirSmoke = { configure({density, opacity}), pause(), resume() }`.

## 6. Light engine (scripts/light-engine.js + src/styles/light.css)

- light.css: `.light-source`, `.shadow-caster`, `.lit-edge`, `.divider-lit`, `.sheen`
  (a `::after` specular sweep: skewed white gradient translating across on hover/auto every ~9s),
  `.glow-pulse` (opacity 0.85→1 pulse 6s), z-token wiring, reduced-motion guards.
- light-engine.js: on load/resize/scroll(throttled 100ms): key light px position from
  `--light-x/--light-y`; for each `.shadow-caster`: unit vector from light to element center,
  `--shadow-dx = clamp(ux*18,-22,22)px`, `--shadow-dy = clamp(uy*18, 4, 26)px`. Also sets
  `--edge-a` (0.1–0.3) stronger on the side facing the light for `.lit-edge` elements.
  On pointermove (desktop only, throttled, skip under reduced motion): drift all
  `.light-source.parallax` by up to ±12px toward cursor.

## 7. Shell (src/components/nav.ejs, layouts, layout.css, responsive.css)

Sidebar (desktop ≥960px, fixed left, width `--nav-width`, `z-index: var(--z-nav)`, full height,
bg `--noir-1` + right hairline, own inner light: a small `.light-source` behind the logo card):
1. Logo card: `.noir-card .lit-edge`, centered — ring sigil (pure CSS: 64px circle,
   `border: 3px solid transparent` + conic-gradient silver ring with a bright white arc,
   `box-shadow: var(--glow-strong)`, slow rotate of the conic hotspot 14s), then
   "DONAVEN CRENSHAW" (letterspaced), mono sub "SOFTWARE · SYSTEMS · CREATION".
2. Nav list: items = icon + label, mono uppercase 0.78rem, `--text-muted`; hover → white text,
   icon glow; ACTIVE route → `.noir-card`-style pill with lit edge + white text (keep existing
   `data-route` mechanism / script.js active-route logic working).
   Inline stroke SVG icons (16px, stroke currentColor, stroke-width 1.5): now=house,
   projects=folder, underplain=&lt;/&gt; glyph (text ok), crenshaw-systems=cube (isometric box),
   infinite-ages=∞ (two circles path), build-log=trend line, about=circle-i, contact=envelope.
3. Bottom (pinned): hairline divider, Support (people icon) + GitHub (octocat-ish circle icon).
Mobile (<960px): keep existing top-bar + hamburger pattern, restyled noir (bg `--noir-1`,
hairline bottom, drawer panel `--noir-2`). Do not break `nav-toggle` JS.

Layout wiring (default.ejs + home.ejs):
- After `<body>`: `<div class="page-light light-source parallax" aria-hidden="true"></div>`
  positioned at `left: var(--light-x); top: var(--light-y)`, ~900px diameter, opacity ~0.5.
- Render hero via `<%- include('hero', { frontmatter }) %>` when `frontmatter.hero_title`
  exists; else keep current plain `h1` block (legacy pages: chronicles, privacy, licenses,
  roadmap etc. must still build and look acceptable on the dark theme).
- Before `</body>`: `<script src="<%= siteRoot %>scripts/light-engine.js"></script>` and
  `<script src="<%= siteRoot %>scripts/smoke.js"></script>` (after existing script.js).
- `content-wrapper`/`page-shell` gets `position: relative; z-index: var(--z-content)`.

## 8. Hero partial (src/components/hero.ejs + src/styles/hero.css)

Frontmatter contract (page workers set these):
```yaml
hero_kicker: "A DIRECTORY OF ACTIVE WORK AND TOOLS."   # optional mono line under title
hero_title: "PROJECTS"                                  # required to trigger hero
hero_sub: "one short sentence"                          # optional paragraph
hero_scene: desk | lamp | book | none                   # default desk
```
Structure:
```html
<section class="noir-hero" data-scene="<%= frontmatter.hero_scene || 'desk' %>">
  <div class="hero-light light-source glow-pulse" aria-hidden="true"></div>
  <div class="hero-scene" aria-hidden="true"></div>
  <svg class="hero-circuit" aria-hidden="true">…</svg>
  <div class="hero-copy">
    <h1 class="metal-text"><%= frontmatter.hero_title %></h1>
    <% if kicker %><p class="hero-kicker section-label">…</p><% %>
    <% if sub %><p class="hero-sub">…</p><% %>
  </div>
  <div class="hero-baseline divider-lit" aria-hidden="true"></div>
</section>
```
hero.css:
- `.noir-hero`: relative, min-height ~clamp(320px, 42vh, 470px), full-bleed to content column,
  overflow hidden, bottom `divider-lit`.
- `.hero-scene`: absolute right 0, top 0, width min(60%, 820px), height 100%,
  `background-size: cover; background-position: center right;`
  scene images: desk→`assets/noir/hero-desk.jpg`, lamp→`hero-lamp.jpg`, book→`hero-book.jpg`
  (use `<%= siteRoot %>`-relative URL via a CSS var set inline OR data-scene selectors with
  relative url in CSS — CSS lives at `styles/`, so url is `../assets/noir/hero-desk.jpg`).
  Mask left+bottom fade: `mask-image: linear-gradient(90deg, transparent 0, #000 22%),
  linear-gradient(180deg, #000 70%, transparent)` (use -webkit- prefix too), so it melts into
  the void. `z-index: var(--z-scene)`.
- `.hero-light`: centered on the monitor/ring area (right ~28%, top ~35%), white radial,
  `z-index: var(--z-light)` — sits UNDER `.hero-scene`; the scene's mask lets the glow bleed
  around its edges = light source hidden behind imagery, halo escaping.
- `.hero-circuit`: absolute, right ~8%, top 0, width ~320px, height ~60%; 5–7 `<path>` right-angle
  traces (stroke `rgba(255,255,255,0.35)`, width 1.5, small circle nodes at ends,
  `stroke-dasharray` + CSS `stroke-dashoffset` animation drawing them over 3s once, then a
  slow opacity shimmer). `z-index: var(--z-scene)`.
- `.hero-copy`: relative `z-index: var(--z-content)`, max-width 56ch, padding-block clamp;
  h1 `font-size: clamp(2.6rem, 6.5vw, 4.6rem)`.
- `data-scene="none"`: hide scene/circuit, keep light + copy.
- Mobile: scene opacity .45 full-bleed behind copy, copy full width.

## 9. Component library (src/styles/components.css) — class contract

Implement these; page workers may ONLY compose these + their own `pages/<name>.css`:
- `.noir-card` = glass panel: bg `--bg-panel`, `border: 1px solid var(--line-hair)`,
  lit top edge (as `.lit-edge`), `border-radius: var(--radius-cut)`,
  `box-shadow: var(--shadow-low)`, `backdrop-filter: blur(6px)`; is a `.shadow-caster`.
- `.noir-card--lit`: adds bottom center glow underline (`::after` 60% width 1px white gradient
  + blur) like concepts' card under-glow.
- `.stat-tile`: row/column tile — `.icon-ring` + `.stat-number` (metal-text, 2rem mono-ish) +
  mono label + small desc. Grid helper `.stat-row` (auto-fit minmax(200px,1fr)).
- `.icon-ring`: 56px circle, hairline border + inner radial sheen, centered inline SVG,
  subtle white glow on hover.
- `.progress-bar`: 4px track `rgba(255,255,255,0.08)`, fill white gradient with
  `box-shadow: 0 0 12px rgba(255,255,255,0.5)`; width via inline `style="--p: 62%"`.
- `.data-table`: full-width, mono uppercase header row with hairline under, row hairlines,
  first col icon+name bold; wrap in `.noir-card` with `overflow-x: auto`.
- `.tag-chip`: mono, hairline border, radius 6px, padding .2rem .6rem.
- `.timeline`: left rail line + node dots (white glow for current), entry cards `.noir-card`.
- `.btn-noir`: transparent, hairline border, mono uppercase letterspaced, padding .7rem 1.4rem,
  `.sheen` sweep on hover, radius 8px. `.btn-noir--solid`: bg `--noir-3` + lit edge.
  Restyle existing `.btn`, `.btn-primary` to these visuals so old markup upgrades free.
- `.quote-block`: oversized quote glyph, centered mono caption (concepts 06/10 footer lines).
- Forms (contact): inputs/textarea bg `--noir-1`, hairline border, radius 8px, white caret,
  focus → `border-color: var(--line-bright)` + soft glow ring. Style existing `.accordion` to
  noir (accordion.css stays compatible).
- Keep every existing class name that content already uses (`section-block`, `section-title`,
  `section-desc`, `manifesto-grid`, `manifesto-point`, `directory-tile`, `status-chip`,
  `folder-tag`, `boxed-note`, `reading-text`, `page-meta`…) — restyle them noir rather than
  deleting, so unmigrated pages stay presentable.

## 10. Page blueprints (one worker each; own your content file + src/styles/pages/<name>.css)

Common recipe: add hero frontmatter (title/kicker/sub/scene), convert top sections to
`.section-label` + card grids, wire `.shadow-caster` via `.noir-card`, keep ALL existing copy
and links, keep heading hierarchy (hero h1 replaces in-content h1 — demote or remove the old
one), page css only for page-specific layout.

- **home** (`content/index.md`, scene desk): hero title "SOFTWARE THAT SAVES TIME." (existing
  h1 copy is "Software that gives your time back." — KEEP the existing sentence as the title,
  uppercased by CSS; do not import concept copy). Keep hero CTA buttons as `.btn-noir`.
  "THREE BRANCHES OF WORK" → 3 `.noir-card--lit` with `.icon-ring` (road/cube/∞) linking
  underplain / crenshaw-systems / infinite-ages. "CURRENT STATE SNAPSHOT" → `.stat-row` of
  existing Win/Difficulty/Next-step manifesto points restyled as `.stat-tile` cards with
  `.progress-bar` accents only if a real progress value exists in copy; else no bars.
- **now** (`content/now.md`, scene lamp): hero "NOW", page-meta mono "UPDATED <date> STATUS:
  CURRENT" under title; big dated `.noir-card` with the date oversized `.metal-text`; then
  Win/Difficulty/Next-step as three `.noir-card--lit` with icon rings.
- **projects** (`content/projects.md`, scene desk): status summary tiles from REAL counts in
  the existing content/data (count what the page actually lists; if none stated, omit numbers),
  branch cards row, "browse by type" only if such grouping already exists; recently-updated
  list → `.data-table`.
- **underplain** (`content/underplain/index.md` + product pages, scene desk): intro card with
  `</>` icon-ring + 4 fact chips row (Free of charge / No paid editions / MIT licensed /
  Community supported — only where the existing copy already claims them); "THE FIRST THREE
  TOOLS" → `.data-table` (Product / Status / What is true today / Next proof) using existing
  product copy; closing 3-principle row. Product subpages: hero + noir cards, keep copy.
- **crenshaw-systems** (`content/crenshaw-systems/index.md` + `process.md`, scene desk): hero
  sub "BUSINESS SYSTEMS CONSULTING — DIAGNOSE. DESIGN. DELIVER." only if that language exists
  (it does in current copy in some form — reuse the actual phrasing). "OUR PROCESS" → 5-step
  arrow row of `.noir-card` steps (01–05) from the existing process copy; audit types → 4 cards.
  NO invented stats (no "120+", no "95%").
- **infinite-ages** (`content/infinite-ages.md`, scene book): hero "INFINITE AGES / STORIES
  WITHOUT END." (reuse existing tagline if different); "CURRENT DOWNLOAD" `.noir-card` row —
  version/status/`.btn-noir` download IF a real download link exists in content (there is a
  PDF at assets/InfiniteAgesGenesis.pdf referenced today — keep whatever the page already
  links); future-branch cards from existing copy; closing centered `.quote-block` if a quote
  already exists in copy.
- **build-log** (`content/build-log.md`, scene desk): two-column ≥1100px — left: "CURRENT
  ENTRY" big `.noir-card` + "EARLIER NOTES" `.timeline`; right rail: focus bars/tags/velocity
  ONLY from data already present in the page; otherwise right rail = recent tags `.tag-chip`
  cloud from existing tags/categories, or omit rail.
- **about** (`content/about.md`, scene desk): founder `.noir-card` (portrait area = dark
  silhouette placeholder div with ring glow — no photo asset exists; CSS-only), mission card;
  "GUIDING PRINCIPLES" → 5 `.stat-tile`-style cards if the page lists principles (use its real
  ones, whatever the count).
- **contact** (`content/contact.md`, scene desk): hero "LET'S BUILD SOMETHING REAL." only if
  aligned with existing copy tone — otherwise existing heading; "CHOOSE YOUR ROUTE" — 3
  `.noir-card--lit` route cards (Business / Public projects / Collaboration) from existing
  contact routes; forms styled per §9 IF forms exist today — if the page is mailto-based, make
  route cards link cards + keep the direct email line with send icon. Page css may draw the
  connector rail (circles + lines) as decoration.
- **support** (`content/support.md`, scene desk): tiers → 3 `.noir-card--lit` with icon rings
  and bullet hairline lists (use REAL tier names/prices from the page; if none exist, style
  the real support channels as cards); one-time + infrastructure cards row; closing
  hairline-bordered pledge line.

## 11. File ownership (claim exactly this)

| Worker | Files |
|---|---|
| luna-tokens | src/styles/tokens.css, src/styles/base.css, src/styles/styles.css (imports + create empty placeholders: light.css, smoke.css, hero.css, pages/*.css for the 10 pages) |
| luna-smoke | scripts/smoke.js (new), src/styles/smoke.css |
| luna-light | scripts/light-engine.js (new), src/styles/light.css |
| luna-shell | src/components/nav.ejs, src/components/footer.ejs, src/layouts/default.ejs, src/layouts/home.ejs, src/styles/layout.css, src/styles/responsive.css |
| luna-cards | src/styles/components.css, src/styles/accordion.css |
| luna-hero | src/components/hero.ejs (new), src/styles/hero.css |
| luna-home | content/index.md, src/styles/pages/home.css |
| luna-now | content/now.md, src/styles/pages/now.css |
| luna-projects | content/projects.md, src/styles/pages/projects.css |
| luna-underplain | content/underplain/*.md, src/styles/pages/underplain.css |
| luna-crenshaw | content/crenshaw-systems/*.md, src/styles/pages/crenshaw.css |
| luna-ages | content/infinite-ages.md, src/styles/pages/ages.css |
| luna-buildlog | content/build-log.md, src/styles/pages/buildlog.css |
| luna-about | content/about.md, src/styles/pages/about.css |
| luna-contact-support | content/contact.md, content/support.md, src/styles/pages/contact.css, src/styles/pages/support.css |

styles.css import order (luna-tokens writes): tokens → base → light → smoke → layout →
components → accordion → hero → responsive → roadmap → pages/*.

## 12. Verify (every worker, before handoff)

1. `node scripts/build.mjs` exits 0 (run once).
2. `node --check` any JS you wrote.
3. Grep your output for your claimed classes actually existing in CSS you depend on.
4. Post HANDOFF in room chat: what changed, exact verify output, anything you punted.
