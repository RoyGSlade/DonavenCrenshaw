# Project sources

Project repositories own their project facts. The website consumes a small,
versioned package under `website/` instead of asking the website repository to
maintain a second copy of each project's claims.

The v1 package is:

- `website/project.json` — required structured manifest.
- `website/page.md` — body-only Markdown.
- `website/updates.json` — dated updates with publication state.
- `website/assets/` — local media referenced by the manifest.

Start with [HOW_TO_ADD_A_PROJECT.md](HOW_TO_ADD_A_PROJECT.md) for the complete
copy, edit, validate, register, review, and automation sequence.

Read [CONTRACT.md](CONTRACT.md) for normative field and rendering rules,
[SHOWCASES.md](SHOWCASES.md) for the optional project-owned image/video
carousel and development watermark,
[ADOPTION.md](ADOPTION.md) for contributor and operator workflows, and
[AUTOMATION.md](AUTOMATION.md) for the GitHub validation/dispatch/deploy flow.
The registry at [`data/project-sources.json`](../../data/project-sources.json)
contains the enabled BetterFingers pilot plus a disabled bundled fixture used
only by contract tests.
