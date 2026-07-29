# MIGRATION: Donaven Crenshaw personal site

The public domain now represents **Donaven Crenshaw**. Source Arcanum remains the independent software lab and project umbrella.

The static Markdown/EJS architecture is preserved. Global identity is centralized in `data/site.json`; generated pages receive it through the builder. New primary routes are `/projects/`, `/betterfingers/`, `/writing/`, `/about/`, `/source-arcanum/`, and `/contact/`.

Preserved routes: Chronicle URLs, generated project/demo paths, BetterFingers release/download URLs, and the old `/chronicles/` page. Old `/productivity/`, `/games/`, and `/financial/` pages redirect to `/projects/`; `/treasury/` redirects to `/source-arcanum/`.

For future contributors: change public identity values in `data/site.json`, not shared templates.

## Earlier architecture notes

## What Changed
Source Arcanum has transitioned from a manual HTML/JSON hybrid system to a fully static, Markdown-driven pipeline. 

The repository structure has been refactored to prioritize readability, maintainability, and clean separation of concerns.

**New Structure:**
- `/content` -> All data lives here. Chronicles, Roadmap items, and Project cards are purely `.md` files equipped with YAML Frontmatter blocks.
- `/src` -> The engine room. Contains raw templates, global components, and the CSS Design System (`/styles/tokens.css`, `base.css`, etc.)
- `/public` -> The deterministic output directory. The build system pulls from `/src` and `/content`, injecting them together into this heavily cacheable folder.
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
The roadmap no longer uses `roadmap.json`.
1. Navigate to `/content/roadmap/`.
2. Locate the corresponding markdown file for the feature (or create a new one).
3. Update its frontmatter `status` to move it between queues (e.g., "Current Focus", "Next Focus", "Recently Shipped").
4. Add or resolve checklist items within the body of the markdown document.

### 3. Add or Edit a Project Card
Artifacts shown in Productivity, Games, or Finance are handled identically:
1. Navigate to `/content/projects/`.
2. Open the relevant `[project-id].md`.
3. Update the frontmatter data to change the title, tagline, status, or download links.
4. Modify the `## Features` or `## Limitations` sections in the markdown body.

---

## Compatibility Warning
Legacy URLs (e.g., `https://.../support.html`) have been deprecated in favor of lore-friendly routing (e.g., `https://.../treasury/index.html`). 

The build system will generate lightweight redirect pages at the old paths for backwards compatibility, ensuring inbound links do not 404.
