---
title: "Gantry Drop: Stardust's first weekly time trial"
date: "2026-09-29"
author: "Donaven Crenshaw"
tags: ["stardust", "weekly", "build-log"]
publicationStatus: "published"
description: "A new weekly Stardust track, replay ghosts, pilot titles and public profiles."
excerpt: "Gantry Drop brings a one-lap weekly race to Stardust, with ghosts, a leaderboard and pilot profiles."
ogImage: "assets/stardust-posts/gantry-drop-weekly-page.png"
branch: "stardust"
skin: "stardust"
---

Stardust has a new challenge: **Gantry Drop**, the first weekly time trial. The [weekly page](../../stardust/weekly/) is up now with the track map, rules and countdown. Racing opens **September 29 at 7 p.m. Pacific** and runs through October 6 at 7 p.m. Pacific.

<figure>
  <a href="../../assets/stardust-posts/gantry-drop-weekly-page.png"><img src="../../assets/stardust-posts/gantry-drop-weekly-page.png" alt="The live Gantry Drop weekly page showing its countdown, rewards, track map and rules" loading="lazy" width="1692" height="1056"></a>
  <figcaption>The live weekly page before the first race opens. The countdown changes as launch gets closer.</figcaption>
</figure>

The goal is simple to explain and harder to fly: collect all eight shards in one lap, then cross the finish line. Mines end a run. Bouncing asteroids, corner sentries and rails punish sloppy turns. You can see the route before launch, but the hazards stay hidden until you're on the track.

<figure>
  <a href="../../assets/stardust-posts/gantry-drop-gameplay-preview.png"><img src="../../assets/stardust-posts/gantry-drop-gameplay-preview.png" alt="Development preview of a Stardust ship racing alongside its best-time ghost on Gantry Drop" loading="lazy" width="1366" height="768"></a>
  <figcaption>Development preview: a best-time ghost on Gantry Drop. The weekly race has not opened yet.</figcaption>
</figure>

I wanted your next lap to have someone to chase, even when nobody else is online. The game records each weekly run so your best-time ghost can fly beside you; once the board has a leader, you can chase that pilot's ghost too. The new race simulation was built for repeatable timing, and the PR's local tests replayed a finished lap to the same time. That's promising engineering evidence, but the public board still needs its first real week of pilots.

This update also adds preset avatars, earned titles and optional public pilot profiles. Your avatar and title can appear beside your times and comments. A public profile is a choice in your account settings; you can leave it off. When the week closes, the fastest eligible pilot is slated for the **Week 1 Champion** title, and the top three for **Planetfall Vanguard** plus early access to *Stardust: Planetfall*. Signed-in runs count for rewards; staff times are unranked.

[See the weekly track and countdown](../../stardust/weekly/) · [Read the merged change](https://github.com/RoyGSlade/DonavenCrenshaw/pull/17)
