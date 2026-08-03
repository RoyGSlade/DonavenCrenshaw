---
title: "Two Signals Inbound"
date: "2026-07-25"
author: "Donaven Crenshaw"
tags: ["announcement", "getfast", "infinite-stacks"]
status: "announced"
excerpt: "Two new artifacts are close enough to name: GetFast, which pulls one download across every network link you own, and Infinite Stacks, a LAN dungeon crawl that forgets you the moment the server stops."
---

Two things have been under construction long enough to be worth naming. Neither
is released today. Both are close.

## GetFast — Twin Current

Your machine probably has more than one road to the internet. Ethernet. Wi-Fi.
A phone you could tether. It almost certainly uses exactly one of them at a
time, and leaves the rest sitting idle.

GetFast splits a download into chunks, pulls those chunks over several
interfaces at once, verifies each piece, and puts the file back together in
order. A chunk that fails on one path gets retried on another. A download you
cancel — or one that dies with the machine — resumes from its parts instead of
starting over.

The harder half of the work was not the downloading. It was making sure the
tool can never strand your network. GetFast takes a snapshot of your routing
state before it touches anything, confines itself to a narrow reserved band of
policy tables it owns outright, and restores that snapshot on every ending:
completion, cancellation, watchdog trip, shutdown, or crash. It never rewrites
your main route table. Metered and mobile links stay excluded until you say
otherwise, in writing, per session. The daemon runs unprivileged; only a small
separate helper is ever elevated, and only to touch tables it owns.

What remains before release is validation on real hardware — two genuinely
independent links, real gateways, a real file — and the Windows build. Neither
is a rewrite. Both are the difference between "the logic is proven" and "the
thing works on your desk," and that distinction is the whole point of this
project.

## Infinite Stacks — The Lost Meaning

One person starts a server on the home network and reads out a room code.
Everyone else opens a browser. That is the entire setup.

Inside: character creation, exploration, puzzles, shops, and combat with live
reactions. Guests install nothing. There is no launcher, no account, no
matchmaking service, no lobby hosted by anyone but you.

Nothing is persisted. When the server stops, the run is over — no save files,
no logs, no history filed away under your name. The server binds to loopback
until you explicitly ask for LAN access, generates a fresh high-entropy access
code at startup, and allowlists Host and Origin headers to the machine's own
addresses. Nothing typed at the table is written down or leaves the network.

It was extracted into its own project on 24 July 2026 and now stands alone.

## Why announce early

Because the alternative is a launch that arrives fully formed and asks you to
trust it on sight.

Both of these are listed as **IMMINENT** in the archive, with no download links
attached, because there is nothing to download yet. When the links appear, they
will appear with checksums. If a date slips, it slips in public.

Hoard nothing. Reject reliance. Build sovereignty.
