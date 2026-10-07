# Track Studio

A private, phone-first tool for turning a finger sketch into a Stardust weekly
track, playtesting it on the laptop, refining it with notes, and approving a
version. It is not part of the public site: `scripts/build.mjs` copies named
folders into `public/` and never walks `tools/`, and the privacy, sitemap and
security checks only read `public/`, `src/`, `content/`, `scripts/`, `data/`,
`.github/`. Nothing here is deployed with the site.

Python 3.12, standard library only. One server file, one page (no external
resources, no inline scripts).

## v2: the phone design tool

`/studio/` is a full-bleed canvas with a tool dock (Lane, Width, Obstacle,
Shards, Landmark, Zone, Note, Stamp, Select) and a sub-toolbar for the active
tool. The lane renders as you draw with the game's own skin code
(`gfx/trackSkin.js`), closes near its start, and pink markers flag overlaps,
crossings, too-tight turns and zig-zags live. Checks (top bar) runs the real
converter and autopilot in a web worker on every edit. Designs autosave to
`designs/`; **Make** posts the design to `POST /studio/api/make`. **Tracks**
holds the version cards (playtest, refine, approve, compare, open in editor)
and requested items. Draft format: `projects/Space-Shooter/studio/draftV2.js`;
geometry: `studio/studioGeometry.js`; what the game can fly vs design intent:
`docs/stardust/TRACK-STUDIO-V2-GAME-SUPPORT.md`.

True to the game's scale: the lane, stamps, shards, obstacle rows, zones and
the ship are all drawn on one world-to-screen scale, at the sizes the game uses
(`studio/gameSizes.js`, read from the game code; `tests/stardust-studio-sizes.test.mjs`
fails if a game constant changes). Sizes the game fixes (mine, sentry, shard,
fuel dock, gate and start = the lane width) have a locked handle marked "fixed
in game"; rocks and shard clusters snap inside the range the converter flies;
design-intent items are free and labelled in cells. A scale bar in the corner
reads "1 lane width = X cells", and the ship's silhouette shows once it is big
enough to see. Widths stop at the game's 5.8–8; older drafts wider than 8 load
as saved and clamp on the first edit (with a one-time note). The Checks sheet
flags mine rows that block the lane at real size and shards out of real pickup
reach, and lists the in-game size table.

Gestures: one finger draws; two fingers pan and pinch; a big contact (palm) or
a late second finger is ignored while drawing; with a stylus the pen draws and
a finger pans. Long-press a stamp for its properties.

## Flow

1. Phone: open `/studio/`, draw a loop, add marks, tap **Make track**. The server
   runs the converter (`scripts/stardust/sketch-to-weekly.mjs`) and saves a version.
2. Laptop: open the same page, tap **Playtest on laptop** (it opens
   `/projects/Space-Shooter/?preview=weekly&draft=/studio/drafts/w2-vN.json`). The
   game posts each lap to `/studio/api/runs`; best and last lap show on the card.
3. **Refine with notes** files an LHC request for Claude (edit tier). The agent
   writes the next version with `server.py add-version`; the page picks it up
   within 15 seconds.
4. **Approve this version** files an LHC Inbox approval. Nothing ships from here.

Deadline: approve by Tue Oct 6, 12 PM PT for the 3 PM PT launch.

## Run

```bash
python3 tools/track-studio/server.py \
  --root /path/to/site-checkout \
  --data /var/lib/track-studio \
  --port 8767 \
  --owner you@example.com \
  --lhc /home/you/.local/bin/lhcmemorys \
  --repo-target /path/to/site-checkout \
  --card '#TRACK-1'
```

| Flag | Meaning |
| --- | --- |
| `--root` | The site checkout. Served at `/`, and the converter runs with it as cwd. |
| `--data` | Studio data directory (created if missing). |
| `--port` | Default 8767. Binds `127.0.0.1` unless `--host` says otherwise. |
| `--owner` | Tailscale login that may use the studio. Required unless `--dev-no-auth`. |
| `--dev-no-auth` | Local testing only. Skips the owner check. |
| `--lhc` | The `lhcmemorys` command. A path, a shell-style string, or a JSON list (`'["python3","fake.py"]'`). Omit it and refine, names and approve answer "LHC is not configured" (sketching and playtesting still work). |
| `--repo-target` | Registered LHC repo path (or `home`) for requests. Defaults to `--root`. |
| `--card` | LHC card id, quoted in agent prompts (the CLI has no card flag). |
| `--converter` | Converter command. Default `node scripts/stardust/sketch-to-weekly.mjs`. |
| `--host` | Bind address, default `127.0.0.1`. Off loopback (a phone preview on the tailnet IP) the header is ignored and every client is identified with `tailscale whois --json <ip>` against `--owner`; `--dev-no-auth` and `0.0.0.0` are refused there. |
| `--whois` | The whois command (default `tailscale whois --json`). |
| `--asset-queue` | kauto-3d queue root (`~/kauto-3d/queue`) for visual requests; omit to never queue. |
| `--asset-game` | Queue entry `game` (default `stardust`). |
| `--preview` | Running on a copy of the data: approvals are refused. |

### systemd --user unit

`~/.config/systemd/user/track-studio.service`

```ini
[Unit]
Description=Track Studio
After=network-online.target

[Service]
ExecStart=/usr/bin/python3 %h/DonavenCrenshaw/tools/track-studio/server.py \
  --root %h/DonavenCrenshaw --data %h/track-studio-data --port 8767 \
  --owner you@example.com --lhc %h/.local/bin/lhcmemorys \
  --repo-target %h/DonavenCrenshaw --card "#TRACK-1"
Restart=on-failure
RestartSec=3

[Install]
WantedBy=default.target
```

```bash
systemctl --user daemon-reload && systemctl --user enable --now track-studio
journalctl --user -u track-studio -f          # logs (no secrets, no query strings)
loginctl enable-linger "$USER"                # keep it running when logged out
```

### Tailscale

```bash
tailscale serve --https=8444 --bg http://127.0.0.1:8767
tailscale serve status
```

Open `https://<machine>.<tailnet>.ts.net:8444/studio/` on the phone and the laptop.
`tailscale serve` adds the `Tailscale-User-Login` header and strips any copy a client
sends; the server returns 403 unless it equals `--owner`. Do not use `tailscale funnel`
and do not bind the server to anything but loopback: the header is only trustworthy
behind `serve`.

## Data layout (`--data`)

```
drafts/<draftId>.json   event JSON exactly as the game flies it (draftId = w2-v<N>)
drafts/<draftId>.svg    preview picture
versions.json           list of versions (below)
sketches/<n>.json       the owner's sketches, as posted
runs/<draftId>.jsonl    one JSON line per laptop lap (ms, finished, reason, log, build)
requests.json           filed name-idea requests
designs/<id>.json       autosaved v2 designs ({savedAt, doc})
requests/<qid>/         a request's sketch.png and photo
item-requests.json      "Request something new" records (card, queue status)
.lock                   short-lived lock file (safe to delete when the server is stopped)
```

Every write is temp file + `fsync` + `rename`, under a lock shared with the
`add-version` CLI. Versions are immutable: a refinement is always a new version.

A `versions.json` entry: `id`, `version`, `created`, `source` (`sketch` | `agent`),
`sketch` (path or null), `title`, `landmark`, `difficulty`, `notes`, `nameIdeas`,
`fromVersion`, `sha256` (of the draft file), `report` (converter report summary),
`runs` (`count`, `finished`, `bestMs`, `lastMs`, `lastAt`, `lastFinished`, `lastReason`),
`approval` (`null` or `{status:"requested", at, sha256, lhcId}`), `requests`
(refine requests: `id`, `status` pending | done, `notes`, `lhcId`, `resultVersion`).

Status chip: Approval requested, else Agent working (a pending request), else Needs
work (`report.ok` false), else Ready.

## API

All JSON. Every request needs `Tailscale-User-Login`. POSTs need
`Content-Type: application/json`, a same-origin `Origin` if one is sent, and
`X-Studio: 1`, except `POST /studio/api/runs` (the game does not send the custom
header; JSON content type plus the Origin check cover it). Errors are
`{ok:false, error, hint?}`. Bodies: 256 KB, runs 3 MB.

| Route | What |
| --- | --- |
| `GET /studio/api/state` | `{versions (newest first), pending, nameRequests, lhcConfigured}` |
| `POST /studio/api/sketches` | `{sketch, title?, landmark?, notes?, nameIdeas?, difficulty?}`: validates, runs the converter (60 s), saves the next version. A report with `ok:false` is still saved as "needs work". 400 if the converter rejects the sketch. |
| `POST /studio/api/refine` | `{fromVersion, notes, sketch?}`: files `lhcmemorys request add --to claude --tier edit --repo <target> --prompt-file <tmp> --json`, records the pending request. 503 with a plain message if LHC is missing or refuses (nothing recorded). |
| `POST /studio/api/names` | `{ideas}`: files a `--to codex --tier read` request for 8 name + landmark ideas. |
| `POST /studio/api/runs` | `{draftId, version, ms, finished, log, build}` or `{draftId, version, finished:false, ms, reason}`. Appends to `runs/<id>.jsonl`, keeps best finished ms. |
| `POST /studio/api/make` | Like `sketches`, for a v2 design (`{sketch: <design>}`, body up to 1.5 MB). The version records `draftVersion`, `skin`, `design` and the converter's `intent`. |
| `GET /studio/api/sketches/<n>` | The sketch or design a version was made from (Open in editor). |
| `GET/POST /studio/api/designs`, `GET /studio/api/designs/<id>` | Autosaved designs (open lanes allowed); keeps the newest 200. |
| `POST /studio/api/requests` | `{request:{title, description, effect, need, type, behavior, form:{size,shape,look}, needs3d, where:{x,y,lap,design,track,stampId}}, sketchPng, photo}` (base64, 3 MB each). Saves to `requests/<id>/`, then `lhcmemorys board add … --kind task --category track-studio --json` and `board note` with the details. The CLI has no image attach yet (only the MCP tool `lhc_board_attach`), so the note says where the sketch PNG is; if `board attach --help` ever succeeds the server attaches it. Visual types also get a kauto-3d queue file (`<YYYYMMDD-HHMMSS>-<slug>.json`, status `queued`, flock on `.lock`). Always 200 once saved; card/queue status is in the record. |
| `POST /studio/api/requests-retry` | `{id}`: retries the card and/or queue entry. |
| `POST /studio/api/approve` | `{version}`: files `lhcmemorys inbox approval --from claude --system track-studio --ref <draftId>@<sha12> --digest <sha256 of the draft file> --title ... --preview-file <tmp> --json`. The preview is: title, version, draft id, sha256, best laptop lap, autopilot time, and `Ship this as Week 2 (launch Tue Oct 6, 3 PM PT)`. Refused (409) for versions that need work or already have a request. |

Also served: `/studio/` (page), `/studio/drafts/<id>.json|.svg`, and the site checkout at `/`
(dotfiles, `node_modules/`, `tools/` and the data dir are never served).

### Sketch JSON

```json
{ "version": 1, "points": [[x, y], ...], "start": 0, "aspect": 1.333,
  "marks": [{ "at": 12, "kind": "hazard", "note": "mines" }],
  "difficulty": "normal" }
```

`points` are normalised 0..1 canvas coordinates (y down), a closed loop with the
closing segment implied (the first point is not repeated at the end), evenly spaced,
in the direction drawn. `kind` is `landmark|fast|tight|hazard|calm`.

### Agent hand-off: `add-version`

```bash
python3 tools/track-studio/server.py add-version --data DIR --from-file out.json \
  --source agent --from-version N --notes "what changed" [--svg-file p.svg] [--report-file r.json] [--title T]
```

`out.json` is either the converter's full `{event, report, svg}` output or a bare
event. A bare event with no report is saved as "needs work" until a converter report
is attached, so it cannot be approved unchecked. The id and version are set to the
next `w2-v<N>`; the matching pending refine request is marked done.

## Tests and local run

```bash
python3 tools/track-studio/test_server.py                # fake converter + fake lhc in testing/
python3 tools/track-studio/server.py --root . --data /tmp/ts --dev-no-auth \
  --converter '["python3","tools/track-studio/testing/fake_converter.py"]'
```

v2 tests: `node --test tests/stardust-studio-v2.test.mjs` (geometry, taper,
draft schema, converter v2, skin field). UI smoke in a phone-sized headless
Chromium: `node tools/track-studio/testing/ui_smoke.mjs <work dir> <path to playwright/index.mjs>`.

`testing/fake_converter.py`, `testing/fake_lhc.py` and `testing/fake_whois.py` are stand-ins that follow the
contracts above; they are not the real converter or LHC.
