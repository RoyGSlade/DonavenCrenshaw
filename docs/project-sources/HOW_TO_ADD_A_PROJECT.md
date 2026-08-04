# How to add a project to DonavenCrenshaw.com

Use this guide when a project repository should become the source of truth for
its DonavenCrenshaw.com project page. The project owns the facts; the website
validates, imports, and presents them.

Do the manual import and rendering check before enabling GitHub automation.

## 1. Create the project package

From a terminal, set the two paths and copy the starter files:

```sh
DONAVEN_SITE_REPO=/home/roygslade/Desktop/DonavenCrenshaw
PROJECT_REPO=/path/to/your-project

mkdir -p "$PROJECT_REPO/website" "$PROJECT_REPO/.github/workflows"
cp -R "$DONAVEN_SITE_REPO/templates/project-source/website/." "$PROJECT_REPO/website/"
cp "$DONAVEN_SITE_REPO/templates/project-source/.github/workflows/website-content.yml" \
  "$PROJECT_REPO/.github/workflows/website-content.yml"
```

The project now has this package:

```text
website/
├── project.json
├── page.md
├── updates.json
└── assets/
```

If the project already has a `website/` directory, review it before copying so
you do not overwrite unrelated files.

## 2. Fill in `website/project.json`

Use a stable lowercase ID with hyphens. The ID becomes the route at
`/projects/<id>/` and must match the central registry and workflow value.

```json
{
  "schemaVersion": 1,
  "id": "my-project",
  "name": "My Project",
  "summary": "A short description supported by the project repository.",
  "status": "prototype",
  "featured": false,
  "links": [
    {
      "label": "Repository",
      "url": "https://github.com/RoyGSlade/my-project",
      "type": "repository"
    }
  ],
  "features": [
    {
      "id": "local-workflow",
      "title": "Local workflow",
      "summary": "The implemented workflow currently available in the repository.",
      "state": "available"
    }
  ],
  "screenshots": [
    {
      "path": "website/assets/project-overview.png",
      "alt": "Project overview screen",
      "caption": "Current project overview."
    }
  ],
  "roadmap": [
    {
      "id": "public-preview",
      "title": "Public preview",
      "summary": "Prepare a reviewed public preview after local validation.",
      "state": "planned"
    }
  ],
  "updatedAt": "2026-08-03T12:00:00-07:00"
}
```

Allowed project statuses are `concept`, `planned`, `prototype`,
`private-alpha`, `public-alpha`, `beta`, `stable`, `maintenance`, and
`archived`.

Keep these rules in mind:

- Use only facts that can be verified from the repository, a released
  artifact, or an explicitly reviewed record.
- Only a feature with `state: "available"` is a current capability. Other
  feature states are `planned`, `in-progress`, and `deprecated`.
- Roadmap states are `planned`, `in-progress`, `done`, and `cancelled`.
- Use only verified HTTP(S) links. Valid link types are `repository`, `demo`,
  `download`, `documentation`, `issue-tracker`, and `other`.
- Put screenshots under `website/assets/`. Use `screenshots: []` when there are
  no real project-owned images; never add placeholder artwork.
- For an optional multi-image/video carousel, follow
  [SHOWCASES.md](SHOWCASES.md). Omit `showcase` until real media is ready; it
  is never required for a valid project source.
- Use the optional `developmentLabel` for a truthful unfinished-product
  watermark. It works with or without a showcase.
- Empty arrays are valid. Do not invent links, screenshots, features, dates,
  readiness, users, pricing, or performance claims to fill the page.
- Update `updatedAt` whenever the project facts are reviewed or changed.

## 3. Write `website/page.md`

This is the longer project narrative. Start sections at `##` because the
website layout creates the page's single level-one heading.

```md
## What it does

Explain the implemented project in plain language.

## Current state

Describe what is working now, who can access it, and any important limits.

## Running or accessing it

Provide verified setup, demo, or release details. Omit this section when there
is no supported access path yet.
```

Do not add YAML or TOML frontmatter, another `#` heading, embedded scripts,
forms, remote images, or claims that duplicate and contradict `project.json`.

## 4. Add `website/updates.json`

Updates can be releases, progress notes, milestones, announcements, notes, or
incidents. Only `published` items appear publicly; `draft` and `archived` items
remain out of the default public feed.

```json
{
  "schemaVersion": 1,
  "items": [
    {
      "id": "project-package-added",
      "date": "2026-08-03",
      "title": "Project package added",
      "summary": "The repository now provides validated website source files.",
      "body": "## What changed\n\nThe project now owns its reviewed website source.\n\n- The central validator accepts the package.\n- The public page reads from this repository.",
      "type": "milestone",
      "state": "published",
      "url": "https://github.com/RoyGSlade/my-project"
    }
  ]
}
```

Each update ID must be unique and stable. The importer sorts published updates
by date, so their order in the JSON file is not significant. `body` is optional
body-only Markdown for the update's expandable long-form view. It supports
headings beginning at `##`, paragraphs, lists, emphasis, blockquotes, code,
and safe links. Omit it when the summary is the complete update.

## 5. Validate the project locally

Run the central validator against the project checkout:

```sh
node /home/roygslade/Desktop/DonavenCrenshaw/scripts/validateProjectSource.mjs \
  --source /path/to/your-project
```

Fix every reported problem before registering the project. The validator
checks both JSON schemas, duplicate update IDs, Markdown safety, asset paths,
missing files, and symlinks that escape `website/assets/`.

## 6. Register the project in the website

Add one entry to
[`data/project-sources.json`](../../data/project-sources.json):

```json
{
  "id": "my-project",
  "localPath": "my-project",
  "repository": "https://github.com/RoyGSlade/my-project",
  "ref": "main",
  "enabled": true,
  "required": false
}
```

The registry ID must exactly match `website/project.json`. `localPath` is
resolved beneath `PROJECT_SOURCE_ROOT`; for sibling local repositories, it is
normally the checkout directory name. Start with `required: false` so one
project cannot block the entire site while its integration is being proven.

The importer never clones repositories itself. The project checkout must exist
at the registered path.

## 7. Prove the manual import

From the website repository, point `PROJECT_SOURCE_ROOT` at the directory that
contains the project checkout:

```sh
cd /home/roygslade/Desktop/DonavenCrenshaw
PROJECT_SOURCE_ROOT=/path/to/projects SITE_BASE=/ npm run verify
PROJECT_SOURCE_ROOT=/path/to/projects SITE_BASE=/ npm run dev
```

In the browser, verify:

- `/projects/<id>/` exists and uses the manifest name, summary, and status;
- a featured project appears on the intended listing or homepage;
- only available capabilities appear as current features, while future work
  remains in the roadmap workflow;
- screenshots load from the project's namespaced asset path;
- an optional showcase changes slides with its buttons, dots, and keyboard
  arrows; images and videos load without blocking projects that omit it;
- published updates expand to their summary or formatted Markdown body, while
  draft and archived updates do not appear;
- repository, demo, documentation, and download links go only to verified
  destinations; and
- the browser console has no errors or missing-asset requests.

Do not continue to automation until the manual import, full verification, and
browser review all pass.

## 8. Add the project to the central GitHub build

In
[`pages.yml`](../../.github/workflows/pages.yml), add an explicit checkout
before Node setup. The checkout path must match the registry `localPath` under
the workflow's `project-sources` root:

```yaml
- name: Checkout My Project source
  uses: actions/checkout@v4
  with:
    repository: RoyGSlade/my-project
    ref: main
    path: project-sources/my-project
    persist-credentials: false
```

For a private project repository, create a separate fine-grained token with
read-only Contents access to the approved private source repositories, store it
in DonavenCrenshaw as `PROJECT_SOURCE_TOKEN`, and add this checkout input:

```yaml
    token: ${{ secrets.PROJECT_SOURCE_TOKEN }}
```

Do not broaden `DONAVEN_SITE_TOKEN` across private project repositories. It is
the project-to-site dispatch credential; the read-only source token is a
separate trust boundary.

Optionally add a direct validation step and a final `test -f` assertion for
the generated page, following the BetterFingers pilot already in that file.

## 9. Enable project-to-site automation

In the copied project workflow, replace:

```yaml
PROJECT_ID: replace-with-project-id
```

with the exact manifest ID:

```yaml
PROJECT_ID: my-project
```

After the central schemas, reusable validator, registry, and deployment
workflow are published, create a repository-scoped credential that can send a
repository dispatch to `RoyGSlade/DonavenCrenshaw`. Store it in the project
repository as the Actions secret `DONAVEN_SITE_TOKEN`.

The resulting flow is:

1. A project push changes `website/**`.
2. The project workflow runs the reusable central validator.
3. A validated push to `main` dispatches `project-content-updated`.
4. DonavenCrenshaw checks out every registered source, validates again, builds,
   and deploys.

The dispatch is only a wake-up signal. The website always reads the facts from
the checked-out project repository. If `DONAVEN_SITE_TOKEN` is missing,
validation still runs and dispatch is skipped with a warning.

## 10. Publish in the safe order

1. Commit and publish the central contract, validator, reusable workflow,
   registry entry, and checkout step.
2. Configure the project's `DONAVEN_SITE_TOKEN` secret.
3. Commit and publish the project's `website/` package and caller workflow.
4. Make a harmless project content update.
5. Confirm the project validation succeeds, the dispatch reaches
   DonavenCrenshaw, and the central build imports the new content before it
   deploys.

Add projects one at a time. The planned migration order after BetterFingers is
Infinite Ages, Concourse or the CPSI assistant, GetFast, PDFManager, and then
other experiments.

## Definition of done

- [ ] The project owns `website/project.json`, `page.md`, `updates.json`, and
  any referenced assets.
- [ ] All public claims, links, status values, and media are verified.
- [ ] No baseline or placeholder design images are referenced.
- [ ] The direct project validator passes.
- [ ] The central registry ID, project ID, workflow ID, checkout path, and
  generated route all agree.
- [ ] `npm run verify` passes with the real project checkout.
- [ ] The project page and updates pass a browser review.
- [ ] The central workflow is published before the project calls it.
- [ ] The project secret is scoped and configured.
- [ ] A real `website/**` update completes the validation, dispatch, import,
  build, and deployment chain.
- [ ] Duplicate project copy is removed from the website's legacy content only
  after the imported page is confirmed.

## Troubleshooting

| Symptom | Check |
| --- | --- |
| Registry or duplicate-ID error | Make the manifest, registry, and workflow IDs identical and unique. |
| Source missing or skipped | Confirm `PROJECT_SOURCE_ROOT/localPath` exists and contains `website/project.json`. |
| Unsafe asset path | Use a POSIX path beginning with `website/assets/`; do not use `..`, backslashes, URLs, or external symlinks. |
| Markdown rejected | Remove frontmatter, the level-one heading, raw scripts, forms, and unsafe links. |
| Screenshot missing | Confirm the file exists with the same case and is explicitly listed in `screenshots`. |
| Project page not generated | Confirm the source is enabled, valid, and located at the registered path. |
| Reusable workflow cannot be found | Publish `.github/workflows/validate-project-source.yml` in DonavenCrenshaw before publishing the project caller. |
| Dispatch skipped | Add `DONAVEN_SITE_TOKEN`; validation deliberately succeeds without dispatch when it is absent. |
| Central CI cannot find a public project | Add the explicit checkout to `pages.yml` and make its `path` match the registry `localPath`. |
| Private checkout returns 403 or repository not found | Add or repair the central `PROJECT_SOURCE_TOKEN` with read-only Contents access to that private repository. |

For exact field semantics, see [CONTRACT.md](CONTRACT.md). For importer failure
rules, see [ADOPTION.md](ADOPTION.md). For credential and dispatch details, see
[AUTOMATION.md](AUTOMATION.md).
