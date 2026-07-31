# SEO, accessibility, and performance plan

## Implemented SEO baseline

- Unique page titles and descriptions.
- Canonical URLs derived from the custom domain and selected `SITE_BASE`.
- Semantic `lang="en"`, one `h1`, and one `main` on current pages.
- Legacy pages are canonicalized and noindex.
- Retired identity and empty category pages are absent from primary navigation.
- Static crawlable HTML; important content is not injected by client JavaScript.

Before launch, submit or refresh the site's search-engine property only after production serves the new artifact. A future sitemap/robots addition is acceptable, but it must enumerate only canonical current routes and should not block redirect discovery during migration.

## Implemented accessibility baseline

- Skip link is first focus target and moves focus to `#main-content`.
- Navigation and footer have accessible names.
- Mobile menu uses a real button, `aria-expanded`, an updating accessible label, and Escape close.
- Current section uses `aria-current="page"`.
- Headings and landmarks are checked in the built artifact.
- Images require an `alt` attribute.
- Native links/lists/tables are used instead of click-only cards.
- Visible focus states and reduced-motion overrides are in CSS.
- Text remains readable with JavaScript disabled; JS only enhances the menu/current state.

Launch review should still include a screen reader pass, 200% and 400% zoom, Windows high-contrast mode, and manual color-contrast measurement for every branch skin.

## Implemented performance baseline

- Static HTML/CSS/JS on GitHub Pages.
- No framework runtime, analytics library, external font request, media autoplay, public JSON fetch, or modal system.
- Client script is limited to navigation behavior.
- Pages load local assets only when linked; product PDFs are not embedded into page load.
- Dependencies were pruned and audited.

The repository's full asset directory is roughly 44 MB because it preserves large PDFs and archived game media. Primary HTML pages do not request those files automatically. A future optimization should move unpublished game media out of the deploy asset set or add an explicit asset manifest, while retaining the two linked PDFs.

## Regression gates

`npm run verify` fails for missing routes, broken internal files, indexable redirects, missing basic semantics, empty rendered URLs, retired Source Arcanum language, lore status strings, sponsor-voting language, placeholder video, Google Fonts, analytics signatures, or credential-like patterns.
