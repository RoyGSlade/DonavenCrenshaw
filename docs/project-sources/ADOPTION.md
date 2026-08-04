# Adopting the project source contract

V1 uses a manual import first. This keeps the first integration reviewable:
an operator checks out or copies a project repository, validates its
`website/` package locally, inspects the rendered result, and only then adds
it to the website import set. `repository` and `ref` in the registry record
provenance and future automation intent; v1 does not silently clone or fetch
them.

## Contributor workflow

1. Copy `templates/project-source/website/` into the project repository.
2. Replace every placeholder in `project.json`, including the timestamp. Keep
   `status` and each feature/roadmap `state` honest.
3. Write approved body-only Markdown in `page.md`; do not add frontmatter.
4. Add only project-owned screenshots under `website/assets/` and reference
   them with `{path: "website/assets/...", alt: "..."}` objects. Do not use
   remote image URLs.
5. Add updates with stable IDs. Leave unreleased work as `draft`; never rely
   on array position for ordering.
6. Run the central validator below. Ask the operator for
   a manual import review when the package is ready.

## Operator workflow

1. Confirm the source is checked out at the registry `localPath`. Read
   `website/project.json`, `website/page.md`, and `website/updates.json` from
   that checkout; do not substitute legacy website data.
2. Parse and validate all JSON against the draft 2020-12 schemas. Also reject
   duplicate update IDs, frontmatter, unsafe asset paths, missing referenced
   files, and symlinks that escape the asset directory.
3. Inspect the Markdown after sanitization and verify every public claim and
   link against the project repository or reviewed artifact.
4. Import transactionally. A source either contributes its complete accepted
   package or contributes nothing; do not publish a partially accepted source.
5. Keep the source's `id` stable across imports. A duplicate project ID from a
   second enabled source is a hard collision requiring a human decision.

## Registry

`data/project-sources.json` is a v1 registry with `schemaVersion` and a
`sources` array. Each entry has `id`, `localPath`, `repository`, `ref`, `enabled`,
and `required`. The repository may be `null` for a bundled/local source. The
checked-in entry for `fixtures/projects/example-project` is deliberately
disabled and optional. The bundled fixture is a contract-test fixture; leave it
disabled in production and do not treat its example facts as a real project.

Disabled entries are ignored. An enabled optional source that fails validation
is skipped with a visible warning and does not alter its previously imported
content. An enabled required source failure fails the import run and leaves the
previous complete website content in place. Unknown registry fields, malformed
paths, unsupported schema versions, duplicate IDs, unsafe Markdown, missing
assets, and asset collisions are errors rather than warnings. Error messages
must identify the source and relative file, but must not expose credentials.

## Asset collision strategy

Source paths are never flattened. During website import, a source asset at
`website/assets/screens/home.png` is mapped to a destination namespace such as
`assets/projects/<project-id>/screens/home.png`. This preserves directories and
prevents two projects' same-named files from overwriting one another. The
importer must reject a destination collision with different bytes; identical
bytes may be reused and logged. A duplicate project ID is rejected before any
asset is written. No overwrite is allowed during a failed or partial import.

`localPath` is resolved beneath the website checkout by default. Set
`PROJECT_SOURCE_ROOT` to a trusted workspace or CI checkout root when project
repositories live elsewhere. For example, sibling checkouts use:

```sh
PROJECT_SOURCE_ROOT=.. SITE_BASE=/ npm run verify
```

The importer never clones or fetches a registry URL.

## Contract checks

From the website repository, validate the bundled fixture and run importer
regressions with:

```sh
npm ci
npm run test:projects
npm run validate:projects
```

Validate any project checkout directly with:

```sh
node scripts/validateProjectSource.mjs --source /path/to/project
```

The CLI runs the same Ajv 2020 schemas and semantic/path checks used by the
site build. Follow [AUTOMATION.md](AUTOMATION.md) only after a manual import and
render pass succeeds.
