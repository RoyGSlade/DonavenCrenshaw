# Deployment and rollback runbook

This work does not authorize a push by itself. Publish only after the diff and unresolved decisions are reviewed.

## Pre-deploy

1. Confirm the checkout contains only intended rebuild files.
2. Preserve the pre-existing `SECURITY.md` modification separately unless it is explicitly reviewed.
3. Run:

   ```bash
   npm ci
   npm run verify
   npm audit
   ```

4. Review the screenshots in `output/playwright/`.
5. Record the current production commit and successful Pages workflow as the rollback point.
6. Commit the reviewed rebuild and push the intended branch according to the repository's publication policy.

## Deployment

The one [Pages workflow](../../.github/workflows/pages.yml) installs with `npm ci`, runs the full verifier, configures Pages, uploads only `public/`, and deploys the saved artifact. A failing verification job must prevent deployment.

Observe the run through completion. Record:

- Git commit SHA;
- Actions run URL and conclusion;
- deployment timestamp;
- Pages URL and custom-domain status.

## Production smoke test

1. Confirm the homepage says Donaven Crenshaw and no longer exposes Source Arcanum/lore copy.
2. Visit all eight primary navigation destinations.
3. Test a product page, Systems process, both PDFs, Privacy, and Licenses.
4. Test `/source-arcanum/`, `/projects/betterfingers.html`, `/chronicles.html`, and `/support.html`.
5. Confirm redirects point at the expected canonical and are noindex.
6. Test an unknown route and the 404 page.
7. Confirm apex and `www` use HTTPS without mixed content.
8. Inspect console/network for missing files, analytics, external fonts, or public JSON.
9. Test mobile menu and keyboard skip link on production.

## Rollback

Preferred rollback is a normal revert commit of the rebuild commit, pushed to `main`, so history remains auditable and the same verification/deployment workflow runs. Do not force-push or rewrite the shared branch.

If an urgent content-only defect exists, revert the smallest responsible commit. If the deployment infrastructure is broken but the last Git commit is sound, use the last known successful workflow/run artifact only through GitHub's supported Pages controls and document the exception.

After rollback:

- verify production content and primary routes;
- confirm custom-domain/HTTPS state;
- record the reverted SHA, new deployment run, reason, and follow-up owner;
- fix forward in a new reviewed commit.

## Known pre-rebuild production point

The last observed successful `pages.yml` run before this local rebuild used commit `a36feef085ce7bd5cc04fb84df6f97606a150caf` and completed on 2026-07-29. Recheck it at deployment time; do not assume this note remains the latest remote state.
