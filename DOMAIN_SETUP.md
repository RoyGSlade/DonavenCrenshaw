# DonavenCrenshaw.com domain setup

The production site is GitHub Pages with the verified custom domain `donavencrenshaw.com`.

## DNS and Pages settings

1. Configure the apex `A` records:
   - `185.199.108.153`
   - `185.199.109.153`
   - `185.199.110.153`
   - `185.199.111.153`
2. Configure `www` as a `CNAME` to `RoyGSlade.github.io`.
3. In repository **Settings → Pages**, select GitHub Actions as the build source.
4. Set the custom domain to `donavencrenshaw.com`.
5. Keep **Enforce HTTPS** enabled after DNS and the certificate are ready.

Avoid wildcard and conflicting parking/forwarding records. The Actions deployment preserves the custom-domain setting through the Pages API; this build does not require a tracked `CNAME` file.

## Verified current remote state

Read-only inspection on 2026-07-31 reported:

- Pages status `built`;
- custom domain `donavencrenshaw.com`;
- domain state `verified`;
- HTTPS certificate `approved`;
- HTTPS enforcement enabled;
- last observed successful `pages.yml` run at commit `a36feef085ce7bd5cc04fb84df6f97606a150caf`.

The live homepage still served the old Source Arcanum experience at inspection time. The rebuilt local artifact in this checkout has **not** been pushed or deployed by this work.

## Release check

Run `npm run verify`, follow [docs/rebuild/DEPLOYMENT_AND_ROLLBACK.md](docs/rebuild/DEPLOYMENT_AND_ROLLBACK.md), then verify both apex and `www`, HTTPS, the 404 page, canonical tags, and several legacy redirects against production.
