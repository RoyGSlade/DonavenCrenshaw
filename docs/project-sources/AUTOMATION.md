# GitHub automation for project sources

Automation begins only after the project package imports and renders locally.
GitHub coordinates the repositories; it does not become a second content
database.

## Flow

1. A project push changes `website/**`.
2. The project's `website-content.yml` calls the reusable validator in
   `RoyGSlade/DonavenCrenshaw`.
3. A validated push to the project's `main` branch sends the
   `project-content-updated` repository dispatch.
4. DonavenCrenshaw checks out its own source and every enabled registered
   project at an explicit repository/ref/path.
5. The central build validates every package again, imports Markdown and
   namespaced assets, builds the site, checks the expected project page, and
   deploys only if all gates pass.

The dispatch is a wake-up signal, not trusted content. The central workflow
ignores fact payloads and reads the checked-out project repository.

## One-time GitHub setup

1. Rename the central repository to `RoyGSlade/DonavenCrenshaw` and publish the
   reusable workflow before enabling a caller workflow.
2. Create a fine-grained token or GitHub App credential that can send
   repository dispatches to `RoyGSlade/DonavenCrenshaw`. Do not use a personal
   broad-scope token when a repository-scoped credential is available.
3. Store the credential in each project as the Actions secret
   `DONAVEN_SITE_TOKEN`. The template deliberately skips dispatch with a visible
   warning when the secret is absent; validation still runs.
4. For private project repositories, create a separate fine-grained token with
   read-only Contents access to the approved private source repositories. Store
   it only in DonavenCrenshaw as the Actions secret `PROJECT_SOURCE_TOKEN`, and
   pass it to each private `actions/checkout` step. Public project checkouts can
   continue to use the workflow's default token.
5. Copy `templates/project-source/.github/workflows/website-content.yml` into
   the project and replace `replace-with-project-id` with the exact manifest ID.
6. Add the project to `data/project-sources.json` and add an explicit checkout
   step in `.github/workflows/pages.yml`. Use the registry `ref` in that step.

## Rollout order

Use this order so a project never calls tooling that is not available yet:

1. validate and render manually;
2. publish the central schemas, validator, registry, and reusable workflow;
3. configure the project secret;
4. publish the project `website/` package and caller workflow;
5. make a harmless project content update and confirm the central run imports
   the new data before it deploys;
6. add remaining projects one at a time.

## Failure behavior

- A pull request validates but never dispatches or deploys.
- A missing dispatch secret warns and exits successfully; content remains
  unannounced until the secret is configured.
- A private project checkout fails closed when `PROJECT_SOURCE_TOKEN` is
  missing or lacks read access; the previous deployed site remains live.
- A required central source failure stops the build. An optional source failure
  is skipped with a visible warning and contributes no partial content.
- Invalid Markdown, unsupported schema versions, duplicate IDs, unsafe links,
  missing assets, traversal, and symlink escapes fail source acceptance.
- A dispatch never bypasses validation, and the central build never fetches an
  unregistered repository on its own.
