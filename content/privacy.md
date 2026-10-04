---
title: "Privacy"
layout: "default"
description: "Plain-language privacy scope for this static website and its linked products."
date: "2026-10-04"
---

<p class="section-desc">What this website says, and what it cannot promise for linked products.</p>

## This website

This is a static website published from the repository. Optional accounts, game results and the Dogfight relay run on a small server Donaven operates at `api.donavencrenshaw.com` (see [Accounts](#accounts)). The site has no third-party analytics or advertising trackers, and it loads nothing from third-party hosts. It does count visits on that same server, in a way that identifies no one (see [Visit counts](#visit-counts)).

Updates are opt-in. There is no newsletter, marketing email or email list. Optional Community voting email confirmation uses only a message you request, once an owner-configured mail provider is available (see [Community voting](#development-votes)). If you want news, the community Discord and the social accounts linked in the footer are where it goes; following either is your choice, and nothing on this site subscribes you to anything.

The Stardust browser game keeps your sound and control settings in your browser's local storage. As a guest they never leave your device, and clearing site data removes them. Signed in, your flight settings, ship and designs are also saved to your account (see [Accounts](#accounts)).

When you follow an external link—such as GitHub, GitHub Sponsors, Ko-fi, Discord, X, or a product repository—you are using that service under its own privacy practices. This page does not extend this site's promises to those services.

<h2 id="accounts">Accounts</h2>

Accounts are optional. Every page and every game works without one.

- **What is stored:** your email address, your username, a bcrypt hash of your password (never the password itself), and anything you add to your profile: a display name, a short bio, a Discord username. Stardust runs you finish while signed in (times, circuit splits and the game build), and your Dogfight wins and losses against other signed-in pilots are stored with the account too. Guest runs never leave your browser.
- **Where:** in a database on a server in Northern Nevada, on an encrypted disk, with encrypted backups. Account data is not sold or shared for marketing. If you request Community voting email confirmation after a mail provider is configured, that provider receives your address and the confirmation message, as described below.
- **Cookie:** signing in sets one cookie, `token`, on `api.donavencrenshaw.com`. It is HttpOnly (page scripts can't read it), sent only over HTTPS, and lasts 30 days. It exists only to keep you signed in. Signing out removes it; changing your password or choosing *Sign out everywhere* ends every session at once.
- **Friends:** friend requests you send and receive, your friends, and pilots you have blocked. Anyone who knows your exact username can send you a request; nothing happens until you accept it. A block is never announced to the other pilot.
- **Challenges:** challenge links you make (which of your runs, or a friend's, is the target, and who it was sent to, if anyone), and which of your runs were flown against a challenge.
- **Public:** your display name (or username), your best times and the date you set them appear on the Stardust leaderboards. Your Dogfight record is shown only to you, on your account page. Your email never does.
- **Challenge pages are public to anyone with the link**, signed in or not. A page shows the name of whoever made it, the name of the pilot whose run is the target, that run's time, circuit times and date, and the fastest attempts at it (up to 20 names, best times and whether they beat it). If you fly against a challenge while signed in, your name and best attempt can appear on its page. A friend can make a challenge link from one of your accepted runs, so your name and that run's times can appear on a page they share. Pilots you have blocked, or who have blocked you, can't open each other's challenges.
- **Ship and flight settings:** signed in, your equipped ship and designs and your flight settings are saved to your account so they follow you between devices. A ship is a design from the garage: parts, colours, shapes and a saying picked from a fixed list. Never an uploaded image, never text you typed. Other pilots can copy your equipped ship from the leaderboards ("Fly this ship") unless you switch **Ship** off on your account page. Your flight settings (camera, controls, key and controller bindings, HUD layout) are shared with nobody unless you switch on **Flight settings** there; then any pilot can copy them with "Use their settings", and nothing else about you comes with them. Both are switches under Public profile and take effect immediately. Copying never changes the other pilot's ship or settings, and asks you before it changes yours.
- **Share cards:** the Share button draws a picture of your time, track, place, name (or "Guest") and ship in your browser and hands it to your share sheet or downloads it; the picture is never uploaded or stored (sharing a full run does make an ordinary challenge link, above). A shared weekly or challenge link previews that time for anyone who opens it, drawn by the server from what the leaderboard already shows, never from an uploaded image. Staff, banned pilots and anyone who turned off *events* on their profile get no weekly card.
- **Sponsors:** the wall at the top of the Support page lists people who sponsor through GitHub Sponsors and have made that sponsorship public on GitHub. It shows what GitHub already shows publicly: the name and username GitHub gives them, their tier and the month they started. Private sponsorships are never listed, and no email address is stored or shown. Ask on the Contact page and a name comes off the wall.
- **Seen only by you and your friends:** your friends list is shown only to you. The friends leaderboard shows you and your friends' best times to each of you.
- **Deleting:** the account page deletes your account and everything tied to it straight away, including friends, blocks and challenges you made or received. Backups roll off within about two weeks.
- **Logs:** the server keeps short-lived request logs, including IP addresses, to limit abuse such as password guessing. A few account actions (such as a rejected run or a new challenge link) are also noted in an event log to spot abuse; deleting your account detaches those notes from it.

Dogfight rooms connect through the same server and exist only while a match is being played. If both pilots are signed in, the server records who won and who lost; nothing else about the match is kept, and rounds with a guest are not recorded at all.

<h2 id="development-votes">Development votes</h2>

A poll may have an owner-selected closing time. The server sets that deadline when the owner opens the poll and refuses new votes once it passes; a manual close can end it sooner. A countdown is a display of that server deadline, not a client-side permission to vote.

Results guide development decisions. They do not guarantee a feature, release date or that the highest total will be implemented. Sponsorship buys no extra votes or roadmap control.

When voting is enabled, each account can submit one final choice per poll opened by Donaven. The Hub stores the poll, your account id, your choice and the submission time. Poll options and aggregate counts are public; voter names and individual choices are not published. Your own confirmed choice is shown only in your signed-in view. Deleting your account deletes its votes and reduces the totals. Server operators can access records to administer the service; they are not anonymous to the server.

To vote, you must confirm the email already on your account. A random, single-use confirmation link expires after 30 minutes. The Hub keeps its hash, account/email binding and request/expiry times, and deletes the challenge when used or when your email changes. The message is sent through Google Workspace (Donaven's own mailbox), which receives your address and the confirmation message; no marketing subscription is added.

There is no per-network or IP-address voting limit, and no IP address is stored with ballots. Email confirmation does not prove one account is one person. No device fingerprint or new identity document is collected.

GitHub sponsor verification is not enabled yet. It will not add voting weight or display private sponsorships publicly.

### Discord

Linking Discord is optional, and every page and game works without it. It lets a bot on Donaven's Discord server give you Stardust roles.

- **What is stored:** your Discord user id, the name Discord shows for you when you link, and when you linked. That is all. The "Discord username" box on your profile is separate: it is only what you type there.
- **What is asked of Discord:** only your basic identity (the `identify` permission). The hub never asks for your messages, your servers, your email or your friends, and it uses Discord's one-time token once and then revokes it.
- **What the bot does:** it adds and removes only the Stardust roles on Donaven's server (Pilot, Weekly Finisher, Podium, Weekly Champion and a ship family such as Manta Pilot), based on your Stardust results and on whether your profile shows your ship. It changes no other role and reads no messages. Weekly results posted in the server name the top three pilots, as the leaderboard does, and mention your Discord account if you linked it.
- **Unlinking:** the account page's Unlink button removes the roles from the server straight away and deletes your Discord id and name from the hub. Deleting your account does the same. If Discord can't be reached at that moment, the link is still removed and a role may linger until Donaven clears it.
- **Discord's side:** the link flow and the server run under Discord's own privacy policy and terms, not this page.

<h2 id="visit-counts">Visit counts</h2>

To see whether anyone is reading and playing, the site counts page views. It is a plain tally kept on the same server as accounts, not a tracking service, and no outside company is involved.

- **What is counted:** for each page view, the page (its path, such as `/stardust/weekly/`, without anything after a `?` or `#`), the day, and where the visit came from. That is a `?via=` tag on the link (Donaven tags links he posts, such as `?via=reddit`) or the name of the site that sent you (just the host name, such as `reddit.com`), or "internal" when you arrive from another page of this site, or "direct" when there is nothing to go on. Each view adds one to the count for that page, day and source.
- **What is not:** no cookies, nothing is stored in your browser, no IP address or device fingerprint is recorded with the counts, and a view is never tied to an account, whether or not you are signed in. The tally cannot tell one visitor from another or follow anyone from page to page.
- **Switching it off:** if your browser sends Do Not Track or Global Privacy Control, the counter does not send anything at all.
- **Who sees it:** only Donaven, as totals. The counts are not shared, sold or published.
- **Request logs:** the server's short-lived request logs (see Logs under [Accounts](#accounts)) still note requests to it, as they do for any request, and a count is a request. Those logs are not where the counts live and are not used to build them. To stop one browser flooding the tally, the server also keeps your address in its memory for a short while; that is never written to disk or to the database, and it is gone when the server restarts.

## underplain products

underplain's model is free-of-charge, source-available software with local-first and privacy-respecting goals. A product page must still state its own network behavior, data handling, and limitations. The existence of the underplain model is not proof that an unimplemented product has a working privacy design.

BetterFingers, GetFast, and PDFManager are not all at the same status. Where a product's network behavior, storage behavior, or recovery path has not been demonstrated, its page says so. Do not infer product guarantees from this website's static hosting.

## Infinite Ages and linked projects

Infinite Ages is a separate branch. Its current doorway links to repository PDFs only. Stardust, the browser game, has its own section and is covered by [Accounts](#accounts) above. Any future VTT, community service, storefront, or game build will need its own privacy explanation before it is presented as available.

## Contact

If you contact Donaven through an external service or email link, the information you choose to send is handled for that interaction. No broader data-retention, legal, or compliance promise is added here without a defined policy.

