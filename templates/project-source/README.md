# Project source starter

Copy the `website/` directory into a project repository and replace the
example values with facts that repository owners can support. The website
consumer reads these files as a package:

- `website/project.json` — required manifest and structured facts.
- `website/page.md` — body-only Markdown for longer context.
- `website/updates.json` — dated updates, including draft and archived state.
- `website/assets/` — local media referenced by the manifest.

The canonical contract and import rules are in
[`docs/project-sources/CONTRACT.md`](../../docs/project-sources/CONTRACT.md)
and [`docs/project-sources/ADOPTION.md`](../../docs/project-sources/ADOPTION.md).

Before asking for import, replace the template timestamp, remove placeholder
copy, verify every link and asset, and run the checks documented in the
adoption guide. Copy `.github/workflows/website-content.yml` as the reusable
GitHub starter, replace `PROJECT_ID`, and configure the dispatch secret only
after the manual import passes.
