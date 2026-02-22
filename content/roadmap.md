---
title: "ROADMAP"
layout: "roadmap"
---

<p class="section-desc">The path forward.</p>
<div class="mono page-sector">// PROJECT STATUS</div>

<div class="roadmap-shell">

<!-- LEFT GUTTER -->
<div class="roadmap-gutter left"></div>

<!-- LEFT RAIL: QUEUE -->
<div class="roadmap-rail left">
<div class="sidebar-header">
<div class="sidebar-title">UPCOMING PROJECTS</div>
<div class="mono" style="font-size: 0.68rem; color: var(--text-muted);">// UP NEXT</div>
</div>
<div id="next-focus-list" class="sidebar-list">
<!-- JS INJECTED -->
</div>
</div>

<!-- CENTER STAGE -->
<div class="roadmap-stage">

<!-- CAROUSEL -->
<div class="carousel-container">
<button id="btn-prev" class="carousel-nav-btn prev-btn" style="visibility:hidden;">&#10094;</button>

<h2 id="rm-project-title" class="project-title">LOADING...</h2>
<div id="rm-focus-summary" class="focus-summary">// LOADING PROJECT DATA</div>

<div class="mono" style="font-size: 0.66rem; color: var(--text-muted); letter-spacing: 0.12em; margin-bottom: 1.25rem;">
<span id="rm-status-summary"></span>
</div>

<div class="dossier-actions" style="display:flex; justify-content: center; gap: 0.8rem; margin-bottom: 1.5rem; flex-wrap: wrap;">
    <button class="btn btn-primary" onclick="window.location.href='https://github.com/sourcearcanum/voicesource/issues'">VIEW ROADMAP DETAILS</button>
    <button class="btn btn-primary" onclick="window.location.href='https://github.com/sourcearcanum/voicesource/milestones'">VIEW PROJECT MILESTONES</button>
</div>

<div id="rm-dots" class="dots-container" style="display:none;"></div>

<button id="btn-next" class="carousel-nav-btn next-btn" style="visibility:hidden;">&#10095;</button>
</div>

<!-- UPDATE PLANS & SCOPE -->
<div class="split-panel">
<div>
<div class="panel-header">// KEY MILESTONES</div>
<div id="rm-updates"></div>
</div>
<div>
<div class="panel-header" style="color: var(--tech-cyan);">// UPDATES & CHANGES</div>
<div id="rm-scope"></div>
</div>
</div>

<!-- KANBAN -->
<div class="kanban-board">
<div>
<div class="kb-col-header" style="color: var(--accent-gold);">IN PROGRESS / TO DO</div>
<div id="kb-todo"></div>
</div>
<div>
<div class="kb-col-header" style="color: var(--tech-cyan);">COMPLETED</div>
<div id="kb-done"></div>
</div>
</div>

<!-- UPCOMING ARCHITECTURE ACCORDION -->
<div style="margin-top: 2rem; border-top: 1px solid var(--stone-light); padding-top: 1rem;">
<div class="accordion-header mono" style="font-size: 0.68rem; color: var(--text-muted); cursor: pointer; display: flex; justify-content: space-between; align-items: center;">
<span>// UPCOMING FEATURES: SERVER STATE | VOICE STREAMS | MULTI-USER UI | ALWAYS-ON SEEDER</span>
<span class="icon">+</span>
</div>
<div class="accordion-content">
<div class="reading-text" style="font-size: 0.9rem; margin-top: 1rem; color: var(--text-secondary);">
<h5 style="color: var(--tech-cyan); margin-bottom: 0.2rem;">CRDT Server State</h5>
<p style="margin-bottom: 1rem;">(Iroh Docs): server_state.proto, doc ID mapping, OCaps</p>

<h5 style="color: var(--tech-cyan); margin-bottom: 0.2rem;">Voice Streaming</h5>
<p style="margin-bottom: 1rem;">discovery via doc sync, direct QUIC streams, no-PCM-egress validation</p>

<h5 style="color: var(--tech-cyan); margin-bottom: 0.2rem;">UI/UX</h5>
<p style="margin-bottom: 1rem;">server nav rail, Scout SQLCipher cache sync, presence via gossip</p>

<h5 style="color: var(--tech-cyan); margin-bottom: 0.2rem;">Seeder</h5>
<p style="margin-bottom: 0;">headless Citadel target, Docker/systemd deployment</p>
</div>
</div>
</div>

</div>

<!-- RIGHT RAIL: FEED -->
<div class="roadmap-rail right">
<div class="sidebar-header">
<div class="sidebar-title">RECENTLY SHIPPED</div>
<div class="mono" style="font-size: 0.68rem; color: var(--text-muted);">// LATEST RELEASES</div>
</div>
<div id="recently-shipped-list" class="sidebar-list">
<!-- JS INJECTED -->
</div>
</div>

<!-- RIGHT GUTTER -->
<div class="roadmap-gutter right"></div>

</div>
