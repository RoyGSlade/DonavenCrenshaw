# Custom-domain setup

This repository builds the website for `https://donavencrenshaw.com`. DNS is configured outside this repository.

1. In the DNS provider, create four `A` records for the apex (`@`):
   - `185.199.108.153`
   - `185.199.109.153`
   - `185.199.110.153`
   - `185.199.111.153`
2. Create the `www` record as `CNAME`, host `www`, value `RoyGSlade.github.io`.
3. In GitHub, complete custom-domain verification for `donavencrenshaw.com` if GitHub requests it.
4. Open repository **Settings → Pages → Custom domain**, enter `donavencrenshaw.com`, and save.
5. Once DNS has resolved, enable **Enforce HTTPS** in the same Pages settings.

Before enabling the domain, remove or correct conflicting parking, forwarding, or old `A`/`CNAME` records. Do not use wildcard DNS records for this setup. Allow DNS propagation time, then verify both the apex and `www` resolve to the GitHub Pages site.

No `CNAME` file is required by the current GitHub Actions deployment.
