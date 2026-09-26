---
title: "Privacy"
layout: "default"
description: "Plain-language privacy scope for this static website and its linked products."
date: "2026-09-26"
---

<p class="section-desc">What this website says, and what it cannot promise for linked products.</p>

## This website

This is a static website published from the repository. Optional accounts, game results and the Dogfight relay run on a small server Donaven operates at `api.donavencrenshaw.com` (see [Accounts](#accounts)). The site does not add analytics or advertising trackers, and it loads nothing from third-party hosts.

The Stardust browser game keeps your sound and control settings in your browser's local storage. They never leave your device, and clearing site data removes them.

When you follow an external link—such as GitHub, GitHub Sponsors, Ko-fi, or a product repository—you are using that service under its own privacy practices. This page does not extend this site's promises to those services.

<h2 id="accounts">Accounts</h2>

Accounts are optional. Every page and every game works without one.

- **What is stored:** your email address, your username, a bcrypt hash of your password (never the password itself), and anything you add to your profile: a display name, a short bio, a Discord username. Once saved runs ship, your Stardust times, achievements and any Platinum 10 place are stored with the account too.
- **Where:** in a database on a server in Northern Nevada, on an encrypted disk, with encrypted backups. Nothing is sold or shared, and nothing is sent to an email or marketing service. No emails are sent at all.
- **Cookie:** signing in sets one cookie, `token`, on `api.donavencrenshaw.com`. It is HttpOnly (page scripts can't read it), sent only over HTTPS, and lasts 30 days. It exists only to keep you signed in. Signing out removes it; changing your password or choosing *Sign out everywhere* ends every session at once.
- **Public:** your username or display name appears on leaderboards and the Platinum 10 once you have a saved result. Your email never does.
- **Deleting:** the account page deletes your account and everything tied to it straight away. Backups roll off within about two weeks.
- **Logs:** the server keeps short-lived request logs, including IP addresses, to limit abuse such as password guessing.

Dogfight rooms connect through the same server. Rooms exist only while a match is being played, and nothing about a match is kept.

## underplain products

underplain's model is free-of-charge, source-available software with local-first and privacy-respecting goals. A product page must still state its own network behavior, data handling, and limitations. The existence of the underplain model is not proof that an unimplemented product has a working privacy design.

BetterFingers, GetFast, and PDFManager are not all at the same status. Where a product's network behavior, storage behavior, or recovery path has not been demonstrated, its page says so. Do not infer product guarantees from this website's static hosting.

## Infinite Ages and linked projects

Infinite Ages is a separate branch. Its current doorway links to repository PDFs only. Stardust, the browser game, has its own section and is covered by [Accounts](#accounts) above. Any future VTT, community service, storefront, or game build will need its own privacy explanation before it is presented as available.

## Contact

If you contact Donaven through an external service or email link, the information you choose to send is handled for that interaction. No broader data-retention, legal, or compliance promise is added here without a defined policy.

