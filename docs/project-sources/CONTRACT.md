# Project source contract v1

This is the strict contract for a project repository's `website/` directory.
The JSON Schemas in [`schemas/`](../../schemas/) are normative for structure;
this document defines semantics the schemas cannot express, such as duplicate
IDs and import ordering.

## Package and ownership

Each project repository may provide these files:

| File | Role | Required |
| --- | --- | --- |
| `website/project.json` | Identity, maturity, links, capabilities, screenshots, and roadmap | Yes |
| `website/page.md` | Longer body-only Markdown | Yes |
| `website/updates.json` | Project updates, including unpublished records | Yes |
| `website/assets/` | Project-owned local media | Directory may be empty |

The project repository owns the facts in all four files. The website may
transform, filter, and lay them out, but must not silently fill missing claims
from old website data. Empty arrays and objects are valid when the project has
no verified links, features, screenshots, or roadmap entries yet. Empty prose
is not a substitute for `page.md`; use the starter body and replace it before
import.

Every JSON file must be UTF-8 JSON with no comments, duplicate object keys, or
unknown properties. `schemaVersion` is the integer `1`; an unsupported version
is an import error, not a best-effort parse.

## `project.json`

The required top-level properties are `schemaVersion`, `id`, `name`,
`summary`, `status`, `featured`, `links`, `features`, `screenshots`,
`roadmap`, and `updatedAt`. Objects reject unknown properties.

`status` is one of:

| Status | Meaning |
| --- | --- |
| `concept` | An idea or exploration with no implementation claim. |
| `planned` | Intentionally scheduled or scoped work not yet implemented. |
| `prototype` | An implementation exists for exploration; not a general release. |
| `private-alpha` | Early implementation tested only by a restricted group. |
| `public-alpha` | Early implementation available to a public test audience. |
| `beta` | Public pre-stable testing with known limitations. |
| `stable` | The owner considers the current release generally usable. |
| `maintenance` | Existing implementation is maintained, with no active feature expansion implied. |
| `archived` | No active development or support is claimed. |

The status is descriptive, not inferred from a link, screenshot, or roadmap.
`featured` is editorial placement only and is not evidence of maturity.

`features` is an array of `{id, title, summary, state}` records. Feature
`state` is `available`, `planned`, `in-progress`, or `deprecated`. Only
`available` may be rendered as a current/shipped capability; the other states
must remain visibly labelled. `roadmap` uses the same record shape, with state
`planned`, `in-progress`, `done`, or `cancelled`; a roadmap item is never a
feature merely because its state is `done`.

`links` contains verified `{label, url, type}` records. Link URLs may be
HTTP(S); screenshot URLs may not be used as a substitute for local assets.
`updatedAt` is an RFC 3339 timestamp and should change whenever a fact or
source file is reviewed.

## Asset boundary

Every `screenshots` value is an object with required `path` and accessible
`alt` text and optional `caption`. Its `path` is a repo-relative POSIX path
beginning exactly with `website/assets/`. The v1 safe filename grammar permits ASCII letters,
numbers, `_`, `-`, and dot-separated extensions in directory segments. It
rejects absolute paths, `..`, backslashes, empty segments, URLs, and any path
outside that prefix. The importer must resolve and check the path before
reading it, then reject symlinks that resolve outside `website/assets/`.

The manifest is the allowlist: an unreferenced file may remain in the source
package, but it is not copied or published. A missing referenced file is an
error. Keep media small enough for the website's normal performance budget;
the contract does not pretend an unreviewed binary is evidence of a feature.

## `page.md` and HTML

`page.md` is body-only Markdown. YAML (`---`) and TOML (`+++`) frontmatter are
not allowed; a file beginning with either delimiter is rejected rather than
interpreted. A level-one heading is also rejected because the website layout
owns the single project-page `h1`. Start project sections at `##`. Structured
facts belong in `project.json` and `updates.json`, so frontmatter must not be
used to smuggle a second source of truth into the page.

The consumer renders Markdown and sanitizes the resulting HTML. The portable
safe subset is `a`, `blockquote`, `br`, `code`, `em`, `h2`–`h6`, `hr`, `li`,
`ol`, `p`, `pre`, `strong`, and `ul`. `a` may retain an `href` and `title`;
links must be HTTP(S) or same-site relative links. All event handlers, style
attributes, scripts, forms, frames, embeds, objects, unsafe URL schemes, and
unknown tags/attributes are removed or escaped. If the consumer has no
sanitizer, raw HTML must be escaped and treated as text. Markdown images are
not a way around the asset boundary: use a `website/assets/` path and apply
the same safe-path check before rendering it.

## `updates.json`

The top-level object contains `schemaVersion` and an `items` array. Each item
requires `id`, `date`, `title`, `summary`, `type`, and `state`; `url` is
optional and, when present, follows the same HTTP(S) rule as manifest links.
`type` is `release`, `progress`, `milestone`, `announcement`, `note`, or
`incident`. `state` is `draft`, `published`, or `archived`.

Update IDs must be unique within a source. Duplicate IDs are a hard source
error even if their other fields differ. The importer must not use input array
position as chronology: published output is sorted by `date` descending, then
`id` ascending as a deterministic tie-breaker. Draft items never render in the
public feed; archived items remain available for audit but are excluded from
the default feed. An optional URL does not make a draft public.

## Truth and lifecycle

Contributors write only claims that the project owner can verify from the
project repository, a released artifact, or an explicitly reviewed project
record. Do not invent readiness, users, downloads, credentials, pricing,
performance, testimonials, security guarantees, or launch dates. A missing
fact stays missing: use an empty array, a neutral summary, or an explicit
roadmap state.

The normal lifecycle is `concept` → `planned` → `prototype` → one of the alpha
or beta states → `stable`; `maintenance` and `archived` are terminal editorial
states for active work. This is guidance rather than an automatic transition
rule. A project can move backward when its owner corrects an overstated claim.
Feature and roadmap states are independent of project maturity and must be
updated explicitly.
