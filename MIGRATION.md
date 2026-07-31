# Migration to the Donaven Crenshaw parent site

The public site now uses **Donaven Crenshaw** as the accountable parent identity. The three active branches are lowercase **underplain**, **Crenshaw Systems**, and **Infinite Ages Software**. Source Arcanum, lore-first labels, fake terminal framing, financial-category filler, and unsupported funding mechanics have been removed from the generated public identity.

## Canonical routes

The required routes are `/`, `/now/`, `/projects/`, `/underplain/`, the three underplain product pages, `/crenshaw-systems/`, `/crenshaw-systems/process/`, `/work/`, `/infinite-ages/`, `/build-log/`, `/support/`, `/about/`, `/contact/`, `/privacy/`, and `/licenses/`.

`data/redirects.json` maps 32 old paths, including historical `.html` URLs and dated Chronicle URLs, to a current canonical destination. Redirect pages carry a canonical URL and `noindex`; GitHub Pages does not provide server-side 301 rules, so these pages use a canonical/meta-refresh fallback without relying on the retired page content.

## Public-boundary changes

- The build no longer copies `data/`, old `projects/`, legacy page scripts, or legacy HTML into `public/`.
- Product status comes from `data/products.json`, not the contradictory legacy project inventory.
- Only approved current pages are discoverable; old Chronicle content is redirected rather than republished.
- GitHub Sponsors is the recurring support destination and Ko-fi is the one-time destination. Voting, merch, Discord, and percentages are not promised.
- Infinite Ages exposes only the two PDFs that are actually present. Their separate license scope remains unresolved.
- Crenshaw Systems publishes the supplied `$100` / up-to-two-hours discovery statement and does not invent later commercial terms.

## Maintainer rule

Update structured data and current content first, run `npm run verify`, then visually inspect the root-domain build. Never repair a missing fact with marketing copy. Record the gap in `docs/rebuild/UNRESOLVED_DECISIONS.md`.
