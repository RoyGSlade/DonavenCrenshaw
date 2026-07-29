---
title: "BetterFingers"
layout: "default"
description: "A private voice workflow that captures speech, refines it into usable writing, and works across applications."
---

<p class="section-desc">Your voice. The right message.</p>
<div class="mono page-sector">RELEASED · WINDOWS · LOCAL-FIRST WORKFLOW</div>

<section class="section-block" style="padding-top: 2.5rem;">
<div class="reading-text"><p>BetterFingers is for people who want to speak naturally and send clearer messages without handing their voice data to a cloud service. It records speech, transcribes it locally, and gives you a draft to review before it is typed into the active application.</p><p>The current release is tested for Windows. It is useful today, but hardware, model choices, and optional features affect the experience; the limitations below are part of the product story.</p></div>
</section>

<section class="section-block" style="padding-top: 2.5rem;">
<div class="section-header">
<div>
<h2 class="section-title" style="font-size: 1.8rem;">SEE IT FIRST</h2>
<p class="section-desc">What's actually running before you download anything.</p>
</div>
</div>

<div class="bf-media-grid">
<figure class="bf-media-item">
<img src="../assets/betterfingers/tray-active.png" alt="BetterFingers system tray icon, active/recording state" loading="lazy">
<figcaption class="mono">Tray icon — recording</figcaption>
</figure>
<figure class="bf-media-item">
<img src="../assets/betterfingers/tray-inactive.png" alt="BetterFingers system tray icon, idle state" loading="lazy">
<figcaption class="mono">Tray icon — idle</figcaption>
</figure>
<figure class="bf-media-item bf-media-pending">
<div class="bf-media-placeholder mono">Screenshot coming soon<br><span>Recording overlay</span></div>
</figure>
<figure class="bf-media-item bf-media-pending">
<div class="bf-media-placeholder mono">Screenshot coming soon<br><span>Review-before-send window</span></div>
</figure>
</div>
<p class="section-intro" style="font-size: 0.85rem;">The overlay and review-window screenshots are still being captured — everything else on this page is accurate today.</p>
</section>

<section class="section-block">
<div class="section-header">
<div>
<h2 class="section-title" style="font-size: 1.8rem;">DOWNLOAD</h2>
<p class="section-desc">Windows installer. Signed build, no account required.</p>
</div>
</div>

<div class="bf-download-panel">
<div class="bf-download-actions">
<a href="https://github.com/RoyGSlade/SourceArcanum/releases/download/BetterFingersV1.0.0/BetterFingers_Setup.exe" target="_blank" class="btn btn-primary">DOWNLOAD FOR WINDOWS (.EXE)</a>
<a href="https://github.com/RoyGSlade/SourceArcanum/releases/tag/BetterFingersV1.0.0" target="_blank" class="btn btn-primary">RELEASE NOTES</a>
<a href="https://github.com/RoyGSlade/BetterFingers" target="_blank" class="btn btn-primary">SOURCE CODE</a>
</div>

<div class="bf-checksum mono">
FILE: BetterFingers_Setup.exe<br>
SHA256: <span class="bf-hash">EBDE5D5F4C857170399D8E1E5D30D43A4E3B90BAF40B85FFDCC6128C2D9C99F5</span>
</div>

<details class="verify-details">
<summary class="mono">How do I check this?</summary>
<div class="mono verify-steps">
Windows (PowerShell):<br>
<code>certutil -hashfile BetterFingers_Setup.exe SHA256</code>
<br><br>
Mac / Linux:<br>
<code>shasum -a 256 BetterFingers_Setup.exe</code>
<br><br>
Compare the output to the SHA256 above. If they don't match exactly, don't run the installer — re-download it or report it.
</div>
</details>
</div>
</section>

<section class="section-block">
<div class="section-header">
<div>
<h2 class="section-title" style="font-size: 1.8rem;">FEATURES</h2>
<p class="section-desc">What it does once it's running.</p>
</div>
</div>

<div class="manifesto-grid">
<div class="manifesto-point">
<h4>LOCAL SPEECH-TO-TEXT</h4>
<p>Whisper-based transcription runs on your machine. No cloud round-trip for the core dictation flow.</p>
</div>
<div class="manifesto-point">
<h4>REVIEW-FIRST BY DEFAULT</h4>
<p>Every recording lands in a draft you can check before it's sent. Auto-send is optional, not forced.</p>
</div>
<div class="manifesto-point">
<h4>HOTKEYS + CONTROLLER SUPPORT</h4>
<p>Global hotkeys (record, stop, emergency stop) plus gamepad bindings for setups where reaching a keyboard isn't practical.</p>
</div>
<div class="manifesto-point">
<h4>SMART AUDIO DUCKING</h4>
<p>Game or media audio automatically ducks while you record, then restores — configurable, not automatic-and-jarring.</p>
</div>
<div class="manifesto-point">
<h4>OPTIONAL AI CLEANUP</h4>
<p>A local LLM can tidy up phrasing before send, with persona presets for tone. Off by default behavior stays close to what you said.</p>
</div>
<div class="manifesto-point">
<h4>REVIEW TTS</h4>
<p>Have your draft read back to you before sending, with voice and speed controls (via kokoro-onnx, Windows fallback included).</p>
</div>
</div>
</section>

<section class="section-block">
<div class="section-header">
<div>
<h2 class="section-title" style="font-size: 1.8rem;">SETUP</h2>
<p class="section-desc">What you need, and what install looks like.</p>
</div>
</div>

<div class="reading-text" style="margin-bottom: 2rem;">
<p>Run the installer, let it walk you through first-time setup (it can pre-fetch models to cut down on first-run wait), and pick a model tier that matches your hardware. Everything below runs locally — the only network use is optional model downloads and update checks.</p>
</div>

<div class="bf-hw-table" role="table" aria-label="Hardware tiers">
<div class="bf-hw-row bf-hw-head" role="row">
<span role="columnheader">Tier</span>
<span role="columnheader">CPU</span>
<span role="columnheader">RAM</span>
<span role="columnheader">GPU</span>
<span role="columnheader">Suggested models</span>
</div>
<div class="bf-hw-row" role="row">
<span data-label="Tier">Minimum</span>
<span data-label="CPU">6 cores / 12 threads</span>
<span data-label="RAM">16 GB</span>
<span data-label="GPU">Optional (CPU-only works)</span>
<span data-label="Models">Gemma 4B Q4, Whisper base.en</span>
</div>
<div class="bf-hw-row" role="row">
<span data-label="Tier">Recommended</span>
<span data-label="CPU">8 cores / 16 threads</span>
<span data-label="RAM">32 GB</span>
<span data-label="GPU">RTX 3060 12GB or better</span>
<span data-label="Models">Gemma 4B Q6/Q8, Whisper small/medium.en</span>
</div>
<div class="bf-hw-row" role="row">
<span data-label="Tier">High-performance</span>
<span data-label="CPU">12+ cores</span>
<span data-label="RAM">64 GB</span>
<span data-label="GPU">RTX 4080/4090 class</span>
<span data-label="Models">Gemma 12B variants, Whisper large-v3</span>
</div>
</div>
<p class="section-intro" style="font-size: 0.82rem;">On a low-memory system, turn off "keep model loaded" in settings to cut baseline RAM/VRAM use.</p>
</section>

<section class="section-block">
<div class="section-header">
<div>
<h2 class="section-title" style="font-size: 1.8rem;">PRIVACY</h2>
<p class="section-desc">What leaves your machine, in plain terms.</p>
</div>
</div>

<ul class="trust-anchor-list">
<li><strong>[ NO TELEMETRY ]</strong>Nothing about your usage, voice, or text is collected or phoned home.</li>
<li><strong>[ NO ACCOUNTS ]</strong>There's no sign-up and nothing tied to an identity to run the app.</li>
<li><strong>[ DATA STAYS LOCAL ]</strong>Recordings, transcripts, and settings are stored on your device.</li>
<li><strong>[ NETWORK USE IS OPT-IN ]</strong>The only outbound traffic is model downloads (once) and update/version checks — both avoidable if you install models manually.</li>
</ul>
</section>

<section class="section-block">
<div class="section-header">
<div>
<h2 class="section-title" style="font-size: 1.8rem;">KNOWN ISSUES</h2>
<p class="section-desc">Said plainly, not buried in a changelog.</p>
</div>
</div>

<div class="reading-text">
<ul style="padding-left: 1.4rem;">
<li>Performance depends heavily on your hardware and which local models you pick — see the hardware table above before choosing a large model on a small machine.</li>
<li>Voice blending and some persona/style editor polish (live preview, few-shot examples UI) are still being built out.</li>
<li>TTS loudness normalization and crossfade between audio chunks aren't tuned yet, so review-playback audio can vary in volume between sentences.</li>
<li>Linux support is investigational only — Windows is the only tested, supported platform right now.</li>
</ul>
</div>
</section>

<section class="section-block" style="margin-bottom: 4rem;">
<div class="section-header">
<div>
<h2 class="section-title" style="font-size: 1.8rem;">ROADMAP</h2>
<p class="section-desc">What's next, roughly in order.</p>
</div>
</div>

<div class="bf-roadmap-cols">
<div>
<h5 class="mono" style="color: var(--tech-cyan);">NEAR TERM</h5>
<ul style="padding-left: 1.2rem;">
<li>Community model presets</li>
<li>Stream Deck integration</li>
<li>Enhanced dictation mode</li>
</ul>
</div>
<div>
<h5 class="mono" style="color: var(--accent-gold);">MID TERM</h5>
<ul style="padding-left: 1.2rem;">
<li>Plugin system for custom commands</li>
<li>Multi-language support</li>
<li>Linux port investigation</li>
</ul>
</div>
<div>
<h5 class="mono" style="color: var(--text-muted);">LONG TERM</h5>
<p style="color: var(--text-muted); font-size: 0.95rem;">Make BetterFingers the standard for private, high-performance voice interaction on the desktop — eventually integrating at the OS level.</p>
</div>
</div>
</section>
