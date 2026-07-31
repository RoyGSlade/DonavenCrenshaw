# Architecture and design contract

## Information architecture

```text
Donaven Crenshaw
├── Now
├── Projects
├── underplain
│   ├── BetterFingers
│   ├── GetFast
│   └── PDFManager
├── Crenshaw Systems
│   └── Process
├── Infinite Ages
├── Work
├── Build Log
├── Support
├── About
├── Contact
├── Privacy
└── Licenses
```

The parent identity owns the mission, current state, cross-branch directory, proof, support, and legal scope. Each branch has a distinct visual skin and promise boundary but inherits the same semantic navigation, footer, accessibility behavior, and evidence discipline.

## Static application flow

```text
content/*.md + current data/*.json + EJS components/layouts
                             │
                             ▼
                    scripts/build.mjs
                             │
            ┌────────────────┴────────────────┐
            ▼                                 ▼
 current canonical HTML/assets     noindex legacy redirects
            │
            ▼
                 scripts/verifySite.mjs
            │
            ▼
             public/ GitHub Pages artifact
```

`public/` is deterministic and disposable. Legacy JSON/HTML stays outside the artifact. Browser JavaScript only marks current navigation and controls the accessible mobile menu.

## Component and data model

| Layer | Responsibility |
| --- | --- |
| `head.ejs` | Title, description, canonical, local styles, viewport, noindex when required |
| `nav.ejs` | Founder brand, primary tree, mobile toggle, Support/GitHub secondary actions |
| `footer.ejs` | Identity restatement and canonical legal/contact links |
| `default.ejs` | One `main`, one page `h1`, branch skin, page metadata, script |
| `home.ejs` | Homepage hero and authored workspace content |
| `script.js` | Current-section state and accessible menu only |
| `site.json` | Parent identity and dated founder state |
| `branches.json` | Branch name/type/route/policy and optional destinations |
| `products.json` | Status, truth, limitations, next proof, and evidence links |
| `support.json` | Channels, labels, tier language, and support boundary |
| `updates.json` | Publishable updates separated from drafts |
| `redirects.json` | One authoritative source-to-canonical map |

Every promoted record carries a stable ID, owner, reviewed date, publication status, and explicit nulls for missing destinations. The verifier rejects empty rendered URLs.

## Desktop wireframe

```text
┌───────────────┬──────────────────────────────────────────────┐
│ Founder brand │ Promise / one H1                             │
│               │ Short founder voice                         │
│ Now           │ [Explore projects] [Bring business problem] │
│ Projects      ├──────────────────────────────────────────────┤
│ underplain    │ Current state: win / difficulty / next step  │
│ Systems       ├──────────────────────────────────────────────┤
│ Infinite Ages │ Mission + economic relationship              │
│ Build Log     ├──────────────────────────────────────────────┤
│ About         │ Active projects                              │
│ Contact       ├──────────────────────────────────────────────┤
│               │ Three branch entrances                      │
│ Support       ├──────────────────────────────────────────────┤
│ GitHub        │ Ways to participate                          │
└───────────────┴──────────────────────────────────────────────┘
```

The persistent sidebar favors orientation and large screens. Content is width-limited for reading, uses a strict type hierarchy, and avoids dashboard density.

## Mobile wireframe

```text
┌────────────────────────────────┐
│ Founder brand             [☰]  │
├────────────────────────────────┤
│ Promise / H1                   │
│ Founder voice                  │
│ [Explore projects]             │
│ [Bring business problem]       │
├────────────────────────────────┤
│ Current state                  │
│ [Win] [Difficulty] [Next step] │
├────────────────────────────────┤
│ Mission                        │
├────────────────────────────────┤
│ One project card per row       │
├────────────────────────────────┤
│ One branch card per row        │
├────────────────────────────────┤
│ Participation + footer         │
└────────────────────────────────┘
```

The menu is collapsed below the responsive breakpoint, announces expanded state, and closes with Escape. The first keyboard focus target is the visible skip link.

## Page contracts

### Homepage

- Promise: “Software that gives your time back.”
- Primary actions: project exploration and Crenshaw Systems problem intake.
- Dated current state with honest missing-video language.
- Mission and economic relationship without a fake donation percentage.
- Status-first project cards.
- Clear entrances to all three branches.
- Participation destinations backed by repository or remote evidence.

### underplain

- Dark, practical free-software skin.
- Lowercase name and explicit free/source-available/MIT policy.
- A comparison table separating status, current truth, and next proof.
- No download buttons until an artifact exists.
- Paid services route to Crenshaw Systems without creating paid editions.

### Crenshaw Systems

- Light professional skin and diagnosis-first hierarchy.
- Nine-stage service order.
- `$100` / up-to-two-hours discovery boundary.
- Public and formal names kept distinct.
- No product catalog or invented commercial fine print.

### Infinite Ages

- Dark creative/editorial skin with a different headline face.
- Restrained doorway rather than a sprawling speculative catalog.
- Two real PDF links.
- Prototype status and explicit limitations/license gap.

## Visual language

- Parent: off-white paper, near-black text, teal actions, restrained cards.
- underplain: near-black workbench, pale text, cyan/teal links, monospace evidence labels.
- Crenshaw Systems: clean light surface, measured spacing, direct professional hierarchy.
- Infinite Ages: charcoal/navy editorial field, warm light type, serif display headline.
- No external font CDN, fake terminal window, typing animation, lore jargon, ornamental video frame, or gratuitous motion.
