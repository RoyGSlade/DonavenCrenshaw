# Route and redirect map

Audit date: 2026-07-31. [data/redirects.json](../../data/redirects.json) is authoritative. Generated redirect pages use a canonical URL, `noindex`, a meta-refresh fallback, and a visible destination link because GitHub Pages does not expose server-side redirect rules.

## Canonical routes

| Route | Purpose |
| --- | --- |
| `/` | Living Donaven Crenshaw founder workspace |
| `/now/` | Dated current state |
| `/projects/` | Cross-branch status directory |
| `/underplain/` | Free-software branch |
| `/underplain/betterfingers/` | BetterFingers truth-first dossier |
| `/underplain/getfast/` | GetFast concept |
| `/underplain/pdfmanager/` | PDFManager concept |
| `/crenshaw-systems/` | Commercial overview |
| `/crenshaw-systems/process/` | Intake and discovery process |
| `/work/` | Proof and case-study boundary |
| `/infinite-ages/` | Creative branch and current PDF artifacts |
| `/build-log/` | Dated current build log |
| `/support/` | Support model |
| `/about/` | Founder context |
| `/contact/` | Contact routing |
| `/privacy/` | Static-site privacy scope |
| `/licenses/` | Site, branch-policy, and artifact license boundaries |

`/crenshaw-systems/software/` is deliberately absent because no commercial product evidence exists.

## Redirect groups

| Legacy sources | Canonical target |
| --- | --- |
| `/source-arcanum/` | `/underplain/` |
| `/treasury/`, `/support.html` | `/support/` |
| `/productivity/`, `/financial/`, `/finance.html`, `/docs.html`, `/voicesource/` | `/projects/` |
| `/productivity.html` | `/underplain/` |
| `/games/`, `/games.html` | `/infinite-ages/` |
| `/chronicles/`, `/chronicles.html`, `/writing/`, `/roadmap/`, `/roadmap.html` | `/build-log/` |
| `/betterfingers/`, `/projects/betterfingers.html` | `/underplain/betterfingers/` |
| `/projects/pdf-manager.html` | `/underplain/pdfmanager/` |
| Infinite Ages and old game project paths | `/infinite-ages/` |
| Other old concept/project HTML | `/projects/` |
| Three old `/posts/*.html` paths | `/build-log/` |
| Two dated Chronicle paths | `/build-log/` |

The JSON register contains all 32 exact source/target records. The verifier confirms every source is emitted, every canonical is correct for the selected `SITE_BASE`, and every redirect is noindex.

## Link policy

- Current navigation always points to canonical routes.
- Bare internal content links are treated as site-root links by the builder; explicit `./` and `../` links remain document-relative.
- External URLs use their real scheme and receive `noopener noreferrer` when opened in a new tab.
- Empty links and placeholder destinations fail verification.
- Old source files can remain tracked for history, but only the generated artifact defines the public route surface.
