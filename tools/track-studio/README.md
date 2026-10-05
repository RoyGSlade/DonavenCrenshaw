# Track Studio

A private, phone-first tool for turning a finger sketch into a Stardust weekly
track, playtesting it on the laptop, refining it with notes, and approving a
version. It is not part of the public site: `scripts/build.mjs` copies named
folders into `public/` and never walks `tools/`, and the privacy, sitemap and
security checks only read `public/`, `src/`, `content/`, `scripts/`, `data/`,
`.github/`. Nothing here is deployed with the site.

Python 3.12, standard library only. One server file, one page (no external
resources, no inline scripts).

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
| `--port` | Default 8767. Binds `127.0.0.1` only. |
| `--owner` | Tailscale login that may use the studio. Required unless `--dev-no-auth`. |
| `--dev-no-auth` | Local testing only. Skips the owner check. |
| `--lhc` | The `lhcmemorys` command. A path, a shell-style string, or a JSON list (`'["python3","fake.py"]'`). Omit it and refine, names and approve answer "LHC is not configured" (sketching and playtesting still work). |
| `--repo-target` | Registered LHC repo path (or `home`) for requests. Defaults to `--root`. |
| `--card` | LHC card id, quoted in agent prompts (the CLI has no card flag). |
| `--converter` | Converter command. Default `node scripts/stardust/sketch-to-weekly.mjs`. |

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

`testing/fake_converter.py` and `testing/fake_lhc.py` are stand-ins that follow the
contracts above; they are not the real converter or LHC.
