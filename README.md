# Donaven Crenshaw · Source Arcanum

This is the official website of Donaven Crenshaw. **Source Arcanum** is the independent software lab behind local-first tools, creative systems, and build notes.

The site is a static EJS and Markdown build: no frontend framework, analytics, external font CDN, or tracking is used.

## Local development

```bash
npm ci
npm run validate
npm run build
npm run dev
```

The development server serves the generated `public/` directory at `http://localhost:3000`.

## Content and configuration

- `data/site.json` is the single source of truth for the public identity, domain, studio, and public GitHub URL.
- `content/` contains Markdown pages and Chronicle entries. Frontmatter controls titles, descriptions, layouts, and redirects.
- `data/projects.json` is the project directory. Use `plainDescription` for visitor-facing language; `maturity` and `portfolioFeatured` improve card presentation.
- `src/components/` holds shared head, navigation, footer, and modal templates.
- `src/layouts/` wraps page content; `scripts/build.mjs` generates `public/`.

When branding changes, update `data/site.json` first rather than duplicating names across templates.

## Deployment and domain

GitHub Pages runs the build with `SITE_BASE=/` for the custom domain. The builder keeps a `/SourceArcanum/` fallback configuration for repository-path deployments, while relative asset paths keep generated pages portable.

See [DOMAIN_SETUP.md](DOMAIN_SETUP.md) for the manual GitHub and DNS steps. Preserve the BetterFingers release URLs and legacy page routes; redirects are generated for the former category pages.

## Privacy and claims

Do not add analytics, telemetry, advertising, external font CDNs, private contact information, employer-sensitive details, or healthcare data. Describe prototypes and experiments by their documented status; do not imply completion or professional credentials that the repository cannot support.
