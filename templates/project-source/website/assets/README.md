# Project assets

Place only project-owned media referenced by `website/project.json` in this
directory. References must use repo-relative POSIX paths beginning with
`website/assets/`; URLs, absolute paths, backslashes, and `..` traversal are
not accepted. Keep filenames stable and distinctive within the project.

For an optional carousel, create `website/assets/showcase/` and add a
`showcase` block to `website/project.json`. Images may use AVIF, GIF, JPEG,
PNG, or WebP; videos may use MP4, OGG/OGV, or WebM. Projects without reviewed
showcase media should omit the block entirely. See the central
`docs/project-sources/SHOWCASES.md` guide for layouts, captions, posters, and
the optional development watermark.
