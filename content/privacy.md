---
title: "Privacy"
layout: "default"
description: "Plain-language privacy scope for this static website and its linked products."
date: "2026-09-28"
---

<p class="section-desc">What this website says, and what it cannot promise for linked products.</p>

## This website

This is a static website published from the repository. Optional accounts, game results and the Dogfight relay run on a small server Donaven operates at `api.donavencrenshaw.com` (see [Accounts](#accounts)). The site does not add analytics or advertising trackers, and it loads nothing from third-party hosts.

Updates are opt-in. There is no newsletter and no email list, and the site sends no email at all. If you want news, the community Discord and the social accounts linked in the footer are where it goes; following either is your choice, and nothing on this site subscribes you to anything.

The Stardust browser game keeps your sound and control settings in your browser's local storage. They never leave your device, and clearing site data removes them.

When you follow an external link—such as GitHub, GitHub Sponsors, Ko-fi, Discord, X, or a product repository—you are using that service under its own privacy practices. This page does not extend this site's promises to those services.

<h2 id="accounts">Accounts</h2>

Accounts are optional. Every page and every game works without one.

- **What is stored:** your email address, your username, a bcrypt hash of your password (never the password itself), and anything you add to your profile: a display name, a short bio, a Discord username. Stardust runs you finish while signed in (times, circuit splits and the game build), and your Dogfight wins and losses against other signed-in pilots are stored with the account too. Guest runs never leave your browser.
- **Where:** in a database on a server in Northern Nevada, on an encrypted disk, with encrypted backups. Nothing is sold or shared, and nothing is sent to an email or marketing service. No emails are sent at all.
- **Cookie:** signing in sets one cookie, `token`, on `api.donavencrenshaw.com`. It is HttpOnly (page scripts can't read it), sent only over HTTPS, and lasts 30 days. It exists only to keep you signed in. Signing out removes it; changing your password or choosing *Sign out everywhere* ends every session at once.
- **Friends:** friend requests you send and receive, your friends, and pilots you have blocked. Anyone who knows your exact username can send you a request; nothing happens until you accept it. A block is never announced to the other pilot.
- **Challenges:** challenge links you make (which of your runs, or a friend's, is the target, and who it was sent to, if anyone), and which of your runs were flown against a challenge.
- **Public:** your display name (or username), your best times and the date you set them appear on the Stardust leaderboards. Your Dogfight record is shown only to you, on your account page. Your email never does.
- **Challenge pages are public to anyone with the link**, signed in or not. A page shows the name of whoever made it, the name of the pilot whose run is the target, that run's time, circuit times and date, and the fastest attempts at it (up to 20 names, best times and whether they beat it). If you fly against a challenge while signed in, your name and best attempt can appear on its page. A friend can make a challenge link from one of your accepted runs, so your name and that run's times can appear on a page they share. Pilots you have blocked, or who have blocked you, can't open each other's challenges.
- **Seen only by you and your friends:** your friends list is shown only to you. The friends leaderboard shows you and your friends' best times to each of you.
- **Deleting:** the account page deletes your account and everything tied to it straight away, including friends, blocks and challenges you made or received. Backups roll off within about two weeks.
- **Logs:** the server keeps short-lived request logs, including IP addresses, to limit abuse such as password guessing. A few account actions (such as a rejected run or a new challenge link) are also noted in an event log to spot abuse; deleting your account detaches those notes from it.

Dogfight rooms connect through the same server and exist only while a match is being played. If both pilots are signed in, the server records who won and who lost; nothing else about the match is kept, and rounds with a guest are not recorded at all.

## underplain products

underplain's model is free-of-charge, source-available software with local-first and privacy-respecting goals. A product page must still state its own network behavior, data handling, and limitations. The existence of the underplain model is not proof that an unimplemented product has a working privacy design.

BetterFingers, GetFast, and PDFManager are not all at the same status. Where a product's network behavior, storage behavior, or recovery path has not been demonstrated, its page says so. Do not infer product guarantees from this website's static hosting.

## Infinite Ages and linked projects

Infinite Ages is a separate branch. Its current doorway links to repository PDFs only. Stardust, the browser game, has its own section and is covered by [Accounts](#accounts) above. Any future VTT, community service, storefront, or game build will need its own privacy explanation before it is presented as available.

## Contact

If you contact Donaven through an external service or email link, the information you choose to send is handled for that interaction. No broader data-retention, legal, or compliance promise is added here without a defined policy.

