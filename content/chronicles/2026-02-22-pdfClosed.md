---
title: "Why I Paused the PDF Editor"
date: "2026-02-22"
author: "Donaven Crenshaw"
tags: ["chronicle", "pivot", "privacy", "pdf-editor", "voicesource"]
excerpt: "The PDF editor is functionally near-done, but I paused it to focus on VoiceSource after Discord's age-verification and third-party breach made the privacy stakes impossible to ignore."
---

The PDF editor is close.

Functionally, it already covers the core things people expect:

- Signatures
- Mild editing
- OCR
- TTS
- Read/write PDFs
- Create PDFs from scratch

What is next is the unglamorous endgame: **UI polish**, **packaging**, **shipping**, and making it feel like a clean, finished tool instead of a working prototype.

So why pause something that is near the finish line?

Because the privacy risk I am seeing around mainstream communication platforms has a bigger blast radius than "one more editor."

## Trigger: age verification and third-party breach risk

A GamersNexus video pulled several threads together and forced me to treat this as urgent, not theoretical: identity and age-verification direction, third-party dependencies, and what happens when a communication platform becomes a growth machine.

Then came the part that is not abstract: Discord disclosed that a third-party customer support incident may have exposed government ID photos tied to age-related appeals.

That is not paranoia. It is a concrete example of what can happen when identity verification collides with outsourcing and breach reality.

That is the moment where my internal priority stack flipped.

## Why this rerouted my roadmap

A PDF editor is privacy-sensitive because documents can be extremely personal, but the blast radius is usually **you + your files**.

A communication platform is different. It naturally accumulates:

- Your social graph (who you talk to)
- Your habits (when/how you communicate)
- Your history (what you said, how you said it)
- Metadata (even when content is encrypted, metadata can still reveal patterns)

Once a platform starts pulling identity verification into the loop (ID checks, face scans, third-party vendors), failure modes get nastier. Even one breach can leak data that cannot be rotated like a password.

So the decision rule became blunt:

> I do not prioritize what is coolest.  
> I prioritize what has the biggest privacy blast radius if it goes wrong.

That is why the PDF editor is paused.

## Why "just use an alternative" did not satisfy the mission

I looked at other options (TeamSpeak and others). Some are fine. Some cost money for hosting or scale. Some are hosted and centralized by design. Some have different tradeoffs, but the pattern is still recognizable: central platform plus incentive drift.

Discord's IPO trajectory, even without a confirmed date on the calendar, is another signal of incentive shift. When the scoreboard becomes quarterly growth, privacy is often reclassified as "friction."

I am not writing this as a moral judgment. It is incentive math.

## The pivot: VoiceSource (local-first comms you actually own)

So I am stepping into a lane I did not plan as an original pillar, because the need forced it.

**VoiceSource** is my attempt to invert the default model:

- Runs on your PC
- You own it
- If your PC is off, it is off
- Isolation-first (containerization / quarantines)
- Cryptographic pairing and secure transport
- Strict defaults, minimal data exposure

The goal is not "Discord with my logo."

The goal is: **a communication system where you do not have to upload your identity to keep talking to your friends.**

This is hard. Secure comms is not a weekend project. That is exactly why it needs full focus.

## Quarantines + permissioned contact (strict by default)

One core concept: **quarantine**.

If someone does not have your direct pairing proof (QR, ticket, or cryptographic handshake), they should not be able to "just message you" in a way that lands in your main inbox. Requests go into a gated queue. You review them. You decide.

Could there be a public discovery directory later? Maybe. But public discovery increases attack surface, and the last thing I want is to ship "convenient danger." The safer default is: **add people you actually know**, then explicitly grant access.

## Timeline (milestone-based, not promises)

I am personally aiming to leave Discord around **March 1, 2026**.

I am pushing for a **March milestone** where something is workable, at minimum secure peer-to-peer, and then iterate toward safer server and community hosting as the architecture hardens.

If that slips, you will get Chronicles and roadmap updates explaining why. I will not ship something unsafe just to hit a date.

## What "paused" means (so this is not a graveyard)

Paused does **not** mean dead.

The PDF editor's core functionality is largely built. The remaining work is mainly:

- UI refinement / UX cleanup
- Packaging + installers
- Release hardening and making it feel finished

It is parked while VoiceSource gets a stable, safe baseline.

## Closing

I would rather ship fewer things than ship the wrong thing at the wrong time.

Source Arcanum's mission is local-first ownership and privacy-respecting tools. If I am going to stay true to that pact, I have to prioritize the systems that prevent identity extraction from becoming the default cost of everyday life.

**Hoard nothing. Reject reliance. Build sovereignty.**
