# MIGRATION: Source Arcanum V2 Architecture

## What Changed
Source Arcanum has transitioned from a manual HTML/JSON hybrid system to a fully static, Markdown-driven pipeline. 

The repository structure has been refactored to prioritize readability, maintainability, and clean separation of concerns.

**New Structure:**
- `/content` -> Prose pages. Each section page and each Chronicles entry is a
  `.md` file with a YAML frontmatter block.
- `/data` -> Structured data, authored by hand and read at runtime by
  `scripts/script.js`. `projects.json` drives the project cards, dossier
  modals, and generated project pages; `roadmap.json` drives the roadmap.
- `/src` -> The engine room. Contains raw templates, global components, and the CSS Design System (`/styles/tokens.css`, `base.css`, etc.)
- `/public` -> The deterministic output directory. The build system pulls from `/src`, `/content`, and `/data`, injecting them together into this heavily cacheable folder.
- `/vendor` -> Local, offline-ready dependencies. No external CDNs are permitted.

---

## How to Manage Content (No HTML Required)

### 1. Add a New Chronicle Entry
To write a new devlog or post for The Chronicles:
1. Create a new markdown file: `/content/chronicles/YYYY-MM-DD-title-slug.md`.
2. Add the required YAML Frontmatter at the top of the file:
```yaml
---
title: "Your Post Title"
date: "2026-03-01"
author: "Donaven Crenshaw"
tags: ["update", "design"]
status: "shipped"
project: "voicesource"
summary: "A brief 1-2 sentence excerpt for the feed."
---
```
3. Write your content in standard Markdown below the second `---`.
4. Run the build script to generate the HTML.

### 2. Update the Roadmap
The roadmap is driven by `data/roadmap.json`.

1. `carouselOrder` sets which projects appear in the centre carousel, in order.
2. `nextFocusQueue` and `recentlyShippedFeed` fill the side rails.
3. `projects.<id>` holds the detail block. The carousel renders `name`,
   `focus`, `updatePlans`, `scopeChanges`, and `kanban` — all five are
   required, and `npm run validate` fails if any is missing.

Project ids must resolve in either `roadmap.json`'s own `projects` map or
`data/projects.json`. An id that resolves in neither renders as a raw slug. A
roadmap-only project (one with no card, such as `voicesource`) is fine.

### 3. Add or Edit a Project Card
Artifacts shown in Productivity, Games, or Finance all come from
`data/projects.json`. It is authored by hand and is the single source of truth:
`scripts/script.js` fetches it at runtime for the card grid and dossier modal,
and `buildProjectPages()` in `scripts/build.mjs` generates `/projects/<id>.html`
from the same entries.

1. Open `data/projects.json`.
2. Add or edit the object for the project. `id`, `realName`, `status` and a
   boolean `featured` are required; `npm run validate` enforces them.
3. Leave `links` as `[]` while a project is unreleased — the dossier then shows
   `// ACCESS RESTRICTED` instead of empty buttons.
4. Run `npm run build`. The project page regenerates automatically; there is no
   HTML to edit.

> The V1 pipeline generated this file *from* `project_cards/*.md`. That chain
> was retired on 2026-07-25, because the markdown had drifted from the JSON the
> site actually served. The old worksheets are archived, unread, under
> `docs/project-briefs/`.

---

## Compatibility Warning
Legacy URLs (e.g., `https://.../support.html`) have been deprecated in favor of lore-friendly routing (e.g., `https://.../treasury/index.html`). 

The build system will generate lightweight redirect pages at the old paths for backwards compatibility, ensuring inbound links do not 404.
