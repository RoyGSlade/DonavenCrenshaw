#!/usr/bin/env python3
"""Track Studio: a private, phone-first sketch-to-track tool for Stardust weekly races.

Single file, Python 3.12 stdlib only. Binds 127.0.0.1; Tailscale `serve` fronts it
with HTTPS and stamps the `Tailscale-User-Login` header that this server checks.

    python3 server.py --root <site checkout> --data <dir> --port 8767 --owner <login>
    python3 server.py add-version --data <dir> --from-file event.json --source agent --notes "..."

See README.md next to this file.
"""
from __future__ import annotations

import argparse
import contextlib
import hashlib
import http.server
import json
import mimetypes
import os
import re
import secrets
import shlex
import socketserver
import subprocess
import sys
import tempfile
import threading
import time
import traceback
import urllib.parse
from datetime import datetime, timezone
from pathlib import Path

HERE = Path(__file__).resolve().parent
STATIC_DIR = HERE / "static"

DRAFT_ID_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_-]{0,39}$")
DRAFT_FILE_RE = re.compile(r"^([A-Za-z0-9][A-Za-z0-9_-]{0,39})\.(json|svg)$")
MARK_KINDS = {"landmark", "fast", "tight", "hazard", "calm"}
DIFFICULTIES = {"easy", "normal", "hard"}

SMALL_BODY = 256 * 1024
RUN_BODY = 3 * 1024 * 1024
RUN_LOG_FILE_CAP = 40 * 1024 * 1024
CONVERTER_TIMEOUT = 60
LHC_TIMEOUT = 30
PENDING_CAP = 3
APPROVAL_LINE = "Ship this as Week 2 (launch Tue Oct 6, 3 PM PT)"

MIME = {
    ".html": "text/html; charset=utf-8", ".htm": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8",
    ".mjs": "text/javascript; charset=utf-8", ".json": "application/json; charset=utf-8",
    ".webmanifest": "application/manifest+json; charset=utf-8", ".svg": "image/svg+xml",
    ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".gif": "image/gif",
    ".webp": "image/webp", ".avif": "image/avif", ".ico": "image/x-icon",
    ".wasm": "application/wasm", ".woff": "font/woff", ".woff2": "font/woff2",
    ".ttf": "font/ttf", ".otf": "font/otf", ".mp3": "audio/mpeg", ".ogg": "audio/ogg",
    ".oga": "audio/ogg", ".wav": "audio/wav", ".m4a": "audio/mp4", ".opus": "audio/ogg",
    ".mp4": "video/mp4", ".webm": "video/webm", ".txt": "text/plain; charset=utf-8",
    ".map": "application/json", ".xml": "application/xml; charset=utf-8",
    ".glb": "model/gltf-binary", ".gltf": "model/gltf+json",
}

# Top-level directories of the checkout that are never served.
BLOCKED_TOP = {"node_modules", "tools"}


def log(msg: str) -> None:
    print(f"[studio] {msg}", file=sys.stderr, flush=True)


def now_iso() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def fmt_ms(ms) -> str:
    if not isinstance(ms, (int, float)) or ms <= 0:
        return "none"
    total = int(round(ms))
    m, rest = divmod(total, 60000)
    s, milli = divmod(rest, 1000)
    return f"{m}:{s:02d}.{milli:03d}"


class ApiError(Exception):
    def __init__(self, status: int, message: str, **extra):
        super().__init__(message)
        self.status = status
        self.message = message
        self.extra = extra


# ---------------------------------------------------------------------------
# External commands (converter, LHC)
# ---------------------------------------------------------------------------

def parse_command(value: str | None) -> list[str] | None:
    """A command is a JSON list or a shell-style string. None/'' means not configured."""
    if not value:
        return None
    value = value.strip()
    if value.startswith("["):
        parsed = json.loads(value)
        if not (isinstance(parsed, list) and parsed and all(isinstance(p, str) for p in parsed)):
            raise ValueError("command JSON must be a non-empty list of strings")
        return parsed
    return shlex.split(value, posix=(os.name != "nt") or "\\" not in value)


class Config:
    def __init__(self, *, root: Path, data: Path, owner: str | None, dev_no_auth: bool = False,
                 converter=None, lhc=None, card: str | None = None, repo_target: str | None = None,
                 refine_agent: str = "codex"):
        self.root = Path(root).resolve()
        self.data = Path(data).resolve()
        self.owner = (owner or "").strip().lower() or None
        self.dev_no_auth = dev_no_auth
        self.converter = converter or ["node", "scripts/stardust/sketch-to-weekly.mjs"]
        self.lhc = lhc
        self.card = card
        self.repo_target = repo_target
        # Codex's edit sandbox can run the converter; Claude's edit tier only allows git commands.
        self.refine_agent = refine_agent if refine_agent in ("codex", "claude") else "codex"


# ---------------------------------------------------------------------------
# Storage
# ---------------------------------------------------------------------------

def atomic_write(path: Path, data: bytes) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp = tempfile.mkstemp(prefix=f".{path.name}.", suffix=".tmp", dir=str(path.parent))
    try:
        with os.fdopen(fd, "wb") as fh:
            fh.write(data)
            fh.flush()
            os.fsync(fh.fileno())
        os.replace(tmp, path)
    except BaseException:
        with contextlib.suppress(OSError):
            os.unlink(tmp)
        raise


def atomic_write_json(path: Path, obj) -> None:
    atomic_write(path, (json.dumps(obj, indent=2, ensure_ascii=False) + "\n").encode("utf-8"))


_thread_lock = threading.RLock()


@contextlib.contextmanager
def data_lock(data: Path, wait: float = 90.0):
    """Cross-thread and cross-process lock (the add-version CLI runs as another process)."""
    data.mkdir(parents=True, exist_ok=True)
    lock_path = data / ".lock"
    deadline = time.monotonic() + wait
    with _thread_lock:
        while True:
            try:
                fd = os.open(lock_path, os.O_CREAT | os.O_EXCL | os.O_WRONLY)
                os.write(fd, str(os.getpid()).encode())
                os.close(fd)
                break
            except FileExistsError:
                try:  # a lock older than 3 minutes belongs to a dead process
                    if time.time() - lock_path.stat().st_mtime > 180:
                        os.unlink(lock_path)
                        continue
                except OSError:
                    continue
                if time.monotonic() > deadline:
                    raise ApiError(503, "Studio data is busy, try again in a moment.")
                time.sleep(0.05)
        try:
            yield
        finally:
            with contextlib.suppress(OSError):
                os.unlink(lock_path)


def read_json_file(path: Path, default):
    for attempt in range(20):
        try:
            return json.loads(path.read_text(encoding="utf-8"))
        except FileNotFoundError:
            return default
        except PermissionError:  # Windows: briefly locked while another thread replaces it
            if attempt == 19:
                raise
            time.sleep(0.01)


def clean_text(value, limit: int, *, strip_dashes: bool = False) -> str:
    if value is None:
        return ""
    if not isinstance(value, str):
        raise ApiError(400, "Text fields must be strings.")
    value = re.sub(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]", "", value).strip()
    if strip_dashes:
        value = value.lstrip("-").strip()
    return value[:limit]


def summarize_report(report) -> dict:
    """Keep only the converter-report fields the studio shows; bound every list."""
    if not isinstance(report, dict):
        return {"ok": False, "problems": ["The converter returned no report."]}
    out: dict = {"ok": report.get("ok") is True}
    for key in ("lengthCells", "corners", "shards", "mines", "bouncers", "estimatedHumanMs"):
        v = report.get(key)
        if isinstance(v, (int, float)) and not isinstance(v, bool):
            out[key] = v
    pilot = report.get("pilot")
    if isinstance(pilot, dict):
        out["pilot"] = {"finished": pilot.get("finished") is True,
                        "ms": pilot.get("ms") if isinstance(pilot.get("ms"), (int, float)) else None}
    for key in ("problems", "fixes"):
        v = report.get(key)
        if isinstance(v, list):
            out[key] = [str(x)[:300] for x in v[:30]]
    out.setdefault("problems", [])
    return out


class Store:
    def __init__(self, data: Path):
        self.data = Path(data).resolve()
        for sub in ("drafts", "sketches", "runs"):
            (self.data / sub).mkdir(parents=True, exist_ok=True)
        self.versions_path = self.data / "versions.json"
        self.reserved: set[int] = set()

    # -- reads (no lock needed: files are replaced atomically) --
    def versions(self) -> list[dict]:
        data = read_json_file(self.versions_path, [])
        return data if isinstance(data, list) else []

    def get(self, versions: list[dict], draft_id: str) -> dict | None:
        return next((v for v in versions if v.get("id") == draft_id), None)

    def by_number(self, versions: list[dict], number: int) -> dict | None:
        return next((v for v in versions if v.get("version") == number), None)

    # -- numbering --
    def next_number(self, versions: list[dict]) -> int:
        used = {v.get("version") for v in versions if isinstance(v.get("version"), int)}
        return max(used | self.reserved | {0}) + 1

    def reserve(self) -> int:
        with data_lock(self.data):
            n = self.next_number(self.versions())
            self.reserved.add(n)
            return n

    def release(self, n: int) -> None:
        self.reserved.discard(n)

    def next_sketch_number(self) -> int:
        nums = [int(p.stem) for p in (self.data / "sketches").glob("*.json") if p.stem.isdigit()]
        return max(nums + [0]) + 1

    def save_sketch(self, sketch: dict) -> str:
        with data_lock(self.data):
            n = self.next_sketch_number()
            rel = f"sketches/{n}.json"
            atomic_write_json(self.data / rel, sketch)
            return rel

    # -- writes --
    def add_version(self, *, event: dict, report, svg: str | None, source: str, sketch: str | None,
                    title: str = "", landmark: str = "", difficulty: str | None = None,
                    notes: str = "", name_ideas: str = "", from_version: int | None = None,
                    wanted_number: int | None = None) -> dict:
        if not isinstance(event, dict):
            raise ApiError(400, "The event must be a JSON object.")
        with data_lock(self.data):
            versions = self.versions()
            n = wanted_number
            if n is None or self.by_number(versions, n):
                n = self.next_number(versions)  # someone else took the wanted number: renumber
            draft_id = f"w2-v{n}"
            event = dict(event)
            event["id"] = draft_id
            event["version"] = n
            if title and not event.get("title"):
                event["title"] = title
            draft_bytes = (json.dumps(event, indent=2, ensure_ascii=False) + "\n").encode("utf-8")
            if len(draft_bytes) > 4 * 1024 * 1024:
                raise ApiError(413, "The event JSON is too large.")
            summary = summarize_report(report)
            svg_text = svg if isinstance(svg, str) and svg.strip() else (
                '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 120">'
                '<rect width="200" height="120" fill="#101013"/>'
                '<text x="100" y="64" fill="#9a9aa0" font-size="12" text-anchor="middle" '
                'font-family="sans-serif">No preview</text></svg>')
            atomic_write(self.data / "drafts" / f"{draft_id}.svg", svg_text.encode("utf-8"))
            atomic_write(self.data / "drafts" / f"{draft_id}.json", draft_bytes)
            title_final = title or str(event.get("title") or f"Track v{n}")
            version = {
                "id": draft_id,
                "version": n,
                "created": now_iso(),
                "source": source,
                "sketch": sketch,
                "title": title_final[:80],
                "landmark": landmark or str(event.get("landmark") or "")[:80],
                "difficulty": difficulty,
                "notes": notes,
                "nameIdeas": name_ideas,
                "fromVersion": from_version,
                "sha256": hashlib.sha256(draft_bytes).hexdigest(),
                "report": summary,
                "runs": {"count": 0, "finished": 0, "bestMs": None, "lastMs": None,
                         "lastAt": None, "lastFinished": None, "lastReason": None},
                "approval": None,
                "requests": [],
            }
            if from_version is not None:
                src = self.by_number(versions, from_version)
                if src:
                    for req in src.get("requests", []):
                        if req.get("kind") == "refine" and req.get("status") == "pending":
                            req["status"] = "done"
                            req["doneAt"] = now_iso()
                            req["resultVersion"] = n
                if not title and src:
                    version["title"] = src.get("title", version["title"])
                    version["landmark"] = version["landmark"] or src.get("landmark", "")
            versions.append(version)
            atomic_write_json(self.versions_path, versions)
            self.release(n)
            return version

    def update_version(self, draft_id: str, fn) -> dict:
        with data_lock(self.data):
            versions = self.versions()
            v = self.get(versions, draft_id)
            if v is None:
                raise ApiError(404, "No such version.")
            fn(v)
            atomic_write_json(self.versions_path, versions)
            return v

    def record_run(self, draft_id: str, run: dict) -> dict:
        path = self.data / "runs" / f"{draft_id}.jsonl"
        with data_lock(self.data):
            versions = self.versions()
            v = self.get(versions, draft_id)
            if v is None:
                raise ApiError(404, "Unknown draft.")
            if path.exists() and path.stat().st_size > RUN_LOG_FILE_CAP:
                run = {k: val for k, val in run.items() if k != "log"}
                run["logDropped"] = True
            line = json.dumps(run, ensure_ascii=False, separators=(",", ":")) + "\n"
            with open(path, "ab") as fh:
                fh.write(line.encode("utf-8"))
                fh.flush()
                os.fsync(fh.fileno())
            r = v.setdefault("runs", {})
            r["count"] = int(r.get("count") or 0) + 1
            r["lastMs"] = run.get("ms") if run["finished"] else r.get("lastMs")
            r["lastAt"] = run["at"]
            r["lastFinished"] = run["finished"]
            r["lastReason"] = run.get("reason")
            if run["finished"]:
                r["finished"] = int(r.get("finished") or 0) + 1
                best = r.get("bestMs")
                if not isinstance(best, (int, float)) or run["ms"] < best:
                    r["bestMs"] = run["ms"]
                    r["bestAt"] = run["at"]
            atomic_write_json(self.versions_path, versions)
            return v["runs"]

    # -- misc request log (name requests) --
    def add_name_request(self, entry: dict) -> None:
        with data_lock(self.data):
            path = self.data / "requests.json"
            items = read_json_file(path, [])
            items.append(entry)
            atomic_write_json(path, items[-50:])

    def name_requests(self) -> list[dict]:
        items = read_json_file(self.data / "requests.json", [])
        return items if isinstance(items, list) else []


# ---------------------------------------------------------------------------
# Validation
# ---------------------------------------------------------------------------

def validate_sketch(raw) -> dict:
    if not isinstance(raw, dict):
        raise ApiError(400, "The sketch must be an object.")
    pts = raw.get("points")
    if not isinstance(pts, list) or not (3 <= len(pts) <= 3000):
        raise ApiError(400, "The sketch needs between 3 and 3000 points. Draw a longer loop.")
    points = []
    for p in pts:
        if (not isinstance(p, (list, tuple)) or len(p) != 2
                or any(isinstance(c, bool) or not isinstance(c, (int, float)) for c in p)
                or any(not (-0.001 <= c <= 1.001) for c in p)):
            raise ApiError(400, "Sketch points must be [x, y] numbers between 0 and 1.")
        points.append([round(min(1.0, max(0.0, float(p[0]))), 5), round(min(1.0, max(0.0, float(p[1]))), 5)])
    start = raw.get("start", 0)
    if isinstance(start, bool) or not isinstance(start, int) or not (0 <= start < len(points)):
        raise ApiError(400, "The start point must be one of the sketch points.")
    aspect = raw.get("aspect", 1)
    if isinstance(aspect, bool) or not isinstance(aspect, (int, float)) or not (0.1 <= aspect <= 10):
        raise ApiError(400, "The sketch aspect looks wrong.")
    marks = []
    raw_marks = raw.get("marks", [])
    if not isinstance(raw_marks, list) or len(raw_marks) > 200:
        raise ApiError(400, "Too many marks.")
    for m in raw_marks:
        if not isinstance(m, dict) or m.get("kind") not in MARK_KINDS:
            raise ApiError(400, "A mark has an unknown kind.")
        at = m.get("at")
        if isinstance(at, bool) or not isinstance(at, int) or not (0 <= at < len(points)):
            raise ApiError(400, "A mark points at a spot that is not on the stroke.")
        mark = {"at": at, "kind": m["kind"]}
        note = clean_text(m.get("note"), 140)
        if note:
            mark["note"] = note
        marks.append(mark)
    difficulty = raw.get("difficulty", "normal")
    if difficulty not in DIFFICULTIES:
        raise ApiError(400, "Difficulty must be easy, normal or hard.")
    out = {"version": 1, "points": points, "start": start, "aspect": float(aspect),
           "marks": marks, "difficulty": difficulty}
    scale = raw.get("scale")
    if scale is not None:
        if isinstance(scale, bool) or not isinstance(scale, (int, float)) or not (0 < scale <= 100):
            raise ApiError(400, "The scale looks wrong.")
        out["scale"] = scale
    return out


def validate_run(raw) -> dict:
    if not isinstance(raw, dict):
        raise ApiError(400, "Run must be an object.")
    draft_id = raw.get("draftId")
    if not isinstance(draft_id, str) or not DRAFT_ID_RE.match(draft_id):
        raise ApiError(400, "Run needs a valid draftId.")
    finished = raw.get("finished")
    if not isinstance(finished, bool):
        raise ApiError(400, "Run needs finished: true or false.")
    ms = raw.get("ms")
    if isinstance(ms, bool) or not isinstance(ms, (int, float)) or not (0 <= ms <= 3_600_000):
        raise ApiError(400, "Run needs ms between 0 and 3600000.")
    if finished and ms <= 0:
        raise ApiError(400, "A finished run needs a positive ms.")
    run = {"at": now_iso(), "draftId": draft_id, "finished": finished, "ms": ms}
    ver = raw.get("version")
    if ver is not None:
        if isinstance(ver, bool) or not isinstance(ver, int):
            raise ApiError(400, "version must be an integer.")
        run["version"] = ver
    if raw.get("reason") is not None:
        run["reason"] = clean_text(raw.get("reason"), 200)
    if "build" in raw and raw["build"] is not None:
        if len(json.dumps(raw["build"])) <= 100_000:
            run["build"] = raw["build"]
        else:
            run["buildDropped"] = True
    if "log" in raw and raw["log"] is not None:
        run["log"] = raw["log"]
    return run


# ---------------------------------------------------------------------------
# Converter + LHC
# ---------------------------------------------------------------------------

def run_converter(cfg: Config, sketch_path: Path, *, title: str, landmark: str, version: int, draft_id: str) -> dict:
    cmd = list(cfg.converter) + [str(sketch_path)]
    if title:
        cmd += ["--title", title]
    if landmark:
        cmd += ["--landmark", landmark]
    cmd += ["--version", str(version), "--id", draft_id]
    try:
        proc = subprocess.run(cmd, cwd=str(cfg.root), capture_output=True, timeout=CONVERTER_TIMEOUT)
    except subprocess.TimeoutExpired:
        raise ApiError(504, "The track converter took longer than 60 seconds. Try a simpler loop.")
    except FileNotFoundError:
        raise ApiError(503, "The track converter is not installed on the studio machine.")
    out = proc.stdout.decode("utf-8", "replace")
    err = proc.stderr.decode("utf-8", "replace").strip()[:500]
    if proc.returncode == 2:
        raise ApiError(400, "The converter rejected that sketch: " + (err or "invalid input."))
    if proc.returncode != 0:
        log(f"converter exit {proc.returncode}: {err}")
        raise ApiError(502, "The track converter crashed: " + (err or f"exit code {proc.returncode}"))
    try:
        result = json.loads(out)
    except ValueError:
        raise ApiError(502, "The track converter printed something that is not JSON.")
    if not isinstance(result, dict) or not isinstance(result.get("event"), dict) or not isinstance(result.get("report"), dict):
        raise ApiError(502, "The track converter output is missing event or report.")
    return result


class LhcUnavailable(ApiError):
    def __init__(self, why: str):
        super().__init__(503, why, hint="Your sketch and notes are still on screen. Retry once LHC is set up.")


def run_lhc(cfg: Config, args: list[str]) -> dict:
    if not cfg.lhc:
        raise LhcUnavailable("LHC is not configured on the studio server (start it with --lhc).")
    try:
        proc = subprocess.run(list(cfg.lhc) + args, capture_output=True, timeout=LHC_TIMEOUT, cwd=str(cfg.root))
    except FileNotFoundError:
        raise LhcUnavailable("The LHC command was not found on the studio machine.")
    except subprocess.TimeoutExpired:
        raise LhcUnavailable("LHC did not answer within 30 seconds.")
    out = proc.stdout.decode("utf-8", "replace").strip()
    err = proc.stderr.decode("utf-8", "replace").strip()
    if proc.returncode != 0:
        log(f"lhc exit {proc.returncode}: {err[:300]}")
        raise LhcUnavailable(f"LHC refused the request (exit {proc.returncode}): {(err or out)[:200]}")
    try:
        parsed = json.loads(out)
    except ValueError:
        parsed = {}
    return parsed if isinstance(parsed, dict) else {}


def lhc_with_text_file(cfg: Config, args_before: list[str], flag: str, text: str, args_after: list[str] | None = None) -> dict:
    fd, tmp = tempfile.mkstemp(prefix="studio-lhc-", suffix=".txt")
    try:
        with os.fdopen(fd, "wb") as fh:
            fh.write(text.encode("utf-8"))
        return run_lhc(cfg, args_before + [flag, tmp] + (args_after or []))
    finally:
        with contextlib.suppress(OSError):
            os.unlink(tmp)


def lhc_ref(parsed: dict):
    for key in ("id", "shortid", "request_id"):
        if parsed.get(key):
            return str(parsed[key])[:80]
    req = parsed.get("request")
    if isinstance(req, dict) and req.get("id"):
        return str(req["id"])[:80]
    return None


# ---------------------------------------------------------------------------
# Prompts
# ---------------------------------------------------------------------------

def command_text(cmd: list[str]) -> str:
    return " ".join(shlex.quote(c) for c in cmd)


def refine_prompt(cfg: Config, store: Store, version: dict, notes: str, new_sketch_rel: str | None, next_n: int) -> str:
    did = version["id"]
    runs = version.get("runs") or {}
    report = version.get("report") or {}
    results = (f"best finished lap {fmt_ms(runs.get('bestMs'))}, last {fmt_ms(runs.get('lastMs'))}, "
               f"{runs.get('count', 0)} laps flown, {runs.get('finished', 0)} finished"
               + (f", last attempt ended: {runs.get('lastReason')}" if runs.get("lastFinished") is False and runs.get("lastReason") else ""))
    pilot = report.get("pilot") or {}
    server = HERE / "server.py"
    sketch_line = f"- {version['sketch']}: the owner's sketch for this version." if version.get("sketch") else "- (this version has no sketch: an earlier agent edit.)"
    if new_sketch_rel:
        sketch_line += f"\n- {new_sketch_rel}: a NEW sketch the owner drew with this request; treat it as the primary input."
    return f"""Track Studio refinement request. The owner is on his phone on the road, so work fast and keep the result simple.
{('Card: ' + cfg.card) if cfg.card else ''}

Owner's notes on "{version.get('title')}" v{version['version']} (draft {did}), in his own words:
<<<
{notes}
>>>

Studio data dir: {store.data}
- drafts/{did}.json: the current event JSON exactly as the game flies it.
- versions.json: every version with converter report and laptop-run summaries. Read it; never edit it by hand.
- runs/{did}.jsonl: laptop playtest results, one JSON per lap (ms, finished, reason, log).
{sketch_line}
Laptop results so far: {results}.
Converter check on this version: ok={report.get('ok')}, autopilot {fmt_ms(pilot.get('ms')) if pilot.get('finished') else 'did not finish'}, problems: {'; '.join(report.get('problems') or []) or 'none'}.

Do this:
1. Read drafts/{did}.json, versions.json, the notes above and the laptop run results.
2. Produce the next version (it will be v{next_n}). Either (a) edit the sketch or parameters and re-run the converter from the site checkout:
     cd {cfg.root} && {command_text(cfg.converter)} <sketch.json> --title "<title>" --id w2-v{next_n} --version {next_n} > <out.json>
   or (b) edit the event JSON directly. Keep it valid and finishable by the autopilot, and re-check it with the converter's checks (attach its report). Prefer (a).
3. Save it as a new version with the studio's own CLI (the file may be the converter's full {{event, report, svg}} output, or a bare event plus --report-file / --svg-file):
     python3 {server} add-version --data {store.data} --root {cfg.root} --from-file <out.json> --source agent --from-version {version['version']} --notes "<one line: what you changed>"
4. Do not commit, push, deploy or edit any other file. The studio re-reads the new version by itself.
5. Reply in exactly 3 short lines: what changed, the new version number, anything the owner must decide.
"""


def names_prompt(cfg: Config, ideas: str) -> str:
    return f"""Track Studio naming request (read-only; do not edit files).
{('Card: ' + cfg.card) if cfg.card else ''}
Stardust weekly race tracks have a name plus a landmark, for example "Gantry Drop" / "The Long Drop". The owner's rough ideas, in his own words:
<<<
{ideas}
>>>
Reply with exactly 8 suggestions, one per line, formatted "Track name / Landmark name: one short reason". Build on his ideas, keep the Gantry Drop / The Long Drop feel (short, physical, a place you could point at), no repeats, no trademarks. Nothing else in the reply.
"""


def approval_preview(version: dict) -> str:
    report = version.get("report") or {}
    pilot = report.get("pilot") or {}
    runs = version.get("runs") or {}
    return "\n".join([
        f"Track: {version.get('title')}",
        f"Version: v{version['version']}",
        f"Draft id: {version['id']}",
        f"Draft sha256: {version['sha256']}",
        f"Best laptop lap: {fmt_ms(runs.get('bestMs')) if runs.get('bestMs') else 'not flown on the laptop yet'}",
        f"Autopilot time: {fmt_ms(pilot.get('ms')) if pilot.get('finished') else 'did not finish'}",
        "",
        APPROVAL_LINE,
        "",
    ])


# ---------------------------------------------------------------------------
# State view
# ---------------------------------------------------------------------------

def version_status(v: dict) -> str:
    if v.get("approval"):
        return "approval-requested"
    if any(r.get("status") == "pending" for r in v.get("requests", [])):
        return "agent-working"
    if not (v.get("report") or {}).get("ok"):
        return "needs-work"
    return "ready"


def public_version(v: dict) -> dict:
    did = v["id"]
    report = v.get("report") or {}
    pilot = report.get("pilot") or {}
    runs = v.get("runs") or {}
    return {
        "id": did, "version": v.get("version"), "sketch": v.get("sketch"), "created": v.get("created"), "source": v.get("source"),
        "title": v.get("title"), "landmark": v.get("landmark"), "difficulty": v.get("difficulty"),
        "notes": v.get("notes"), "nameIdeas": v.get("nameIdeas"), "fromVersion": v.get("fromVersion"),
        "sha256": v.get("sha256"),
        "status": version_status(v),
        "report": report,
        "problems": report.get("problems", []),
        "autopilotMs": pilot.get("ms") if pilot.get("finished") else None,
        "runs": runs,
        "bestMs": runs.get("bestMs"), "lastMs": runs.get("lastMs"),
        "approval": v.get("approval"),
        "requests": v.get("requests", []),
        "previewUrl": f"/studio/drafts/{did}.svg",
        "draftUrl": f"/studio/drafts/{did}.json",
        "playUrl": f"/projects/Space-Shooter/?preview=weekly&draft=/studio/drafts/{did}.json",
    }


# ---------------------------------------------------------------------------
# Static helpers
# ---------------------------------------------------------------------------

def guess_mime(path: Path) -> str:
    ext = path.suffix.lower()
    if ext in MIME:
        return MIME[ext]
    return mimetypes.guess_type(str(path))[0] or "application/octet-stream"


def safe_resolve(root: Path, url_path: str) -> Path | None:
    """Map a URL path to a file under root, or None. No dotfiles, no traversal, no symlink escape."""
    try:
        raw = urllib.parse.unquote(url_path, errors="strict")
    except UnicodeDecodeError:
        return None
    if "\x00" in raw or "\\" in raw:
        return None
    parts = [p for p in raw.split("/") if p]
    for p in parts:
        if p.startswith(".") or ":" in p:
            return None
    if parts and parts[0] in BLOCKED_TOP:
        return None
    root_real = Path(os.path.realpath(root))
    full = Path(os.path.realpath(root_real.joinpath(*parts)))
    if full != root_real and root_real not in full.parents:
        return None
    return full


# ---------------------------------------------------------------------------
# HTTP
# ---------------------------------------------------------------------------

class StudioServer(socketserver.ThreadingMixIn, http.server.HTTPServer):
    daemon_threads = True
    allow_reuse_address = True

    def __init__(self, addr, cfg: Config):
        self.cfg = cfg
        self.store = Store(cfg.data)
        super().__init__(addr, Handler)


STUDIO_CSP = ("default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; "
              "connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'")


class Handler(http.server.BaseHTTPRequestHandler):
    server_version = "TrackStudio/1"
    protocol_version = "HTTP/1.1"
    timeout = 60

    def log_message(self, fmt, *args):  # never log headers or query strings
        path = self.path.split("?", 1)[0] if hasattr(self, "path") else "-"
        log(f"{self.command} {path} -> {args[1] if len(args) > 1 else '?'}")

    # -- plumbing --
    @property
    def cfg(self) -> Config:
        return self.server.cfg

    @property
    def store(self) -> Store:
        return self.server.store

    def _send(self, status: int, body: bytes, ctype: str, headers: dict | None = None, head_only: bool = False):
        self.send_response(status)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Referrer-Policy", "no-referrer")
        for k, v in (headers or {}).items():
            self.send_header(k, v)
        if self.close_connection:
            self.send_header("Connection", "close")
        self.end_headers()
        if not head_only:
            self.wfile.write(body)

    def _json(self, status: int, obj, head_only: bool = False):
        body = json.dumps(obj, ensure_ascii=False).encode("utf-8")
        self._send(status, body, "application/json; charset=utf-8", {"Cache-Control": "no-store"}, head_only)

    def _error(self, status: int, message: str, **extra):
        if self.command == "POST":  # the body may be unread; do not reuse the connection
            self.close_connection = True
        payload = {"ok": False, "error": message}
        payload.update(extra)
        self._json(status, payload)

    def _authorized(self) -> bool:
        if self.cfg.dev_no_auth:
            return True
        login = (self.headers.get("Tailscale-User-Login") or "").strip().lower()
        return bool(self.cfg.owner) and login == self.cfg.owner

    def _origin_ok(self) -> bool:
        origin = self.headers.get("Origin")
        if origin is None:
            return True
        host = self.headers.get("Host", "")
        try:
            return urllib.parse.urlparse(origin).netloc.lower() == host.lower() and bool(host)
        except ValueError:
            return False

    def _read_body(self, limit: int) -> bytes:
        if self.headers.get("Transfer-Encoding"):
            raise ApiError(411, "Send a Content-Length (chunked bodies are not accepted).")
        length = self.headers.get("Content-Length")
        if length is None or not length.isdigit():
            raise ApiError(411, "Content-Length is required.")
        n = int(length)
        if n > limit:
            self.close_connection = True
            if n <= 32 * 1024 * 1024:  # drain so the client sees the 413 instead of a reset
                left = n
                while left > 0:
                    chunk = self.rfile.read(min(65536, left))
                    if not chunk:
                        break
                    left -= len(chunk)
            raise ApiError(413, f"That is too large (limit {limit // 1024} KB).")
        return self.rfile.read(n)

    def _read_json(self, limit: int = SMALL_BODY):
        ctype = (self.headers.get("Content-Type") or "").split(";")[0].strip().lower()
        if ctype != "application/json":
            raise ApiError(415, "Content-Type must be application/json.")
        try:
            return json.loads(self._read_body(limit).decode("utf-8"))
        except (ValueError, UnicodeDecodeError):
            raise ApiError(400, "The request body is not valid JSON.")

    # -- dispatch --
    def _handle(self, method: str):
        try:
            if not self._authorized():
                return self._error(403, "Forbidden.")
            parsed = urllib.parse.urlsplit(self.path)
            path = parsed.path
            if method == "POST":
                if not self._origin_ok():
                    return self._error(403, "Cross-origin request refused.")
                # The game posts laps without a custom header; JSON content type + origin check covers it.
                if path != "/studio/api/runs" and self.headers.get("X-Studio") != "1":
                    return self._error(403, "Missing X-Studio header.")
            if path.startswith("/studio/api/"):
                return self._api(method, path[len("/studio/api/"):])
            if method == "POST":
                return self._error(404, "Not found.")
            if path == "/studio":
                return self._send(301, b"", "text/plain", {"Location": "/studio/"}, head_only=True)
            if path.startswith("/studio/"):
                return self._studio_static(path[len("/studio/"):], method == "HEAD")
            return self._site_static(path, method == "HEAD")
        except ApiError as e:
            self._error(e.status, e.message, **e.extra)
        except (BrokenPipeError, ConnectionResetError):
            pass
        except Exception:
            log("unhandled error:\n" + traceback.format_exc())
            with contextlib.suppress(Exception):
                self._error(500, "Something broke inside the studio. Check the server log.")

    def do_GET(self): self._handle("GET")
    def do_HEAD(self): self._handle("HEAD")
    def do_POST(self): self._handle("POST")
    def do_OPTIONS(self): self._error(405, "Not allowed.")
    do_PUT = do_DELETE = do_PATCH = do_OPTIONS

    # -- static --
    def _studio_static(self, rel: str, head_only: bool):
        if rel in ("", "index.html", "studio.html"):
            return self._file(STATIC_DIR / "studio.html", head_only, csp=STUDIO_CSP, no_cache=True)
        if rel in ("studio.js", "studio.css"):
            return self._file(STATIC_DIR / rel, head_only, csp=STUDIO_CSP, no_cache=True)
        if rel.startswith("drafts/"):
            m = DRAFT_FILE_RE.match(rel[len("drafts/"):])
            if not m:
                return self._error(404, "Not found.")
            path = self.cfg.data / "drafts" / f"{m.group(1)}.{m.group(2)}"
            csp = "default-src 'none'; style-src 'unsafe-inline'; sandbox" if m.group(2) == "svg" else None
            return self._file(path, head_only, csp=csp, no_cache=True)
        return self._error(404, "Not found.")

    def _site_static(self, url_path: str, head_only: bool):
        target = safe_resolve(self.cfg.root, url_path)
        if target is None:
            return self._error(404, "Not found.")
        # Never serve the studio's own data directory if it lives inside the checkout.
        data_real = Path(os.path.realpath(self.cfg.data))
        if target == data_real or data_real in target.parents:
            return self._error(404, "Not found.")
        if target.is_dir():
            if not url_path.endswith("/"):
                return self._send(301, b"", "text/plain", {"Location": url_path + "/"}, head_only=True)
            target = target / "index.html"
        return self._file(target, head_only, no_cache=True)

    def _file(self, path: Path, head_only: bool, csp: str | None = None, no_cache: bool = False):
        try:
            st = path.stat()
            if not path.is_file():
                raise FileNotFoundError
            fh = open(path, "rb")
        except (FileNotFoundError, NotADirectoryError, PermissionError):
            return self._error(404, "Not found.")
        with fh:
            size = st.st_size
            start, end, status = 0, size - 1, 200
            rng = self.headers.get("Range")
            extra = {"Accept-Ranges": "bytes"}
            if rng:
                m = re.match(r"^bytes=(\d*)-(\d*)$", rng.strip())
                if m and (m.group(1) or m.group(2)):
                    if m.group(1):
                        start = int(m.group(1))
                        end = int(m.group(2)) if m.group(2) else size - 1
                    else:
                        start = max(0, size - int(m.group(2)))
                    end = min(end, size - 1)
                    if start > end or start >= size:
                        return self._send(416, b"", "text/plain", {"Content-Range": f"bytes */{size}"})
                    status = 206
                    extra["Content-Range"] = f"bytes {start}-{end}/{size}"
            if no_cache:
                extra["Cache-Control"] = "no-cache"
            if csp:
                extra["Content-Security-Policy"] = csp
            length = end - start + 1 if size else 0
            self.send_response(status)
            self.send_header("Content-Type", guess_mime(path))
            self.send_header("Content-Length", str(length))
            self.send_header("X-Content-Type-Options", "nosniff")
            self.send_header("Referrer-Policy", "no-referrer")
            for k, v in extra.items():
                self.send_header(k, v)
            self.end_headers()
            if head_only or not size:
                return
            fh.seek(start)
            remaining = length
            while remaining > 0:
                chunk = fh.read(min(65536, remaining))
                if not chunk:
                    break
                self.wfile.write(chunk)
                remaining -= len(chunk)

    # -- API --
    def _api(self, method: str, name: str):
        routes = {
            ("GET", "state"): self.api_state,
            ("POST", "sketches"): self.api_sketches,
            ("POST", "refine"): self.api_refine,
            ("POST", "names"): self.api_names,
            ("POST", "runs"): self.api_runs,
            ("POST", "approve"): self.api_approve,
        }
        fn = routes.get(("GET" if method == "HEAD" else method, name))
        if fn is None:
            known = {n for (_, n) in routes}
            return self._error(405 if name in known else 404, "Not found." if name not in known else "Wrong method.")
        fn()

    def api_state(self):
        versions = self.store.versions()
        views = [public_version(v) for v in sorted(versions, key=lambda x: x.get("version", 0), reverse=True)]
        pending = [dict(r, draftId=v["id"], version=v["version"]) for v in versions
                   for r in v.get("requests", []) if r.get("status") == "pending"]
        names = [r for r in self.store.name_requests() if r.get("status") == "pending"][-5:]
        self._json(200, {
            "ok": True, "now": now_iso(), "versions": views, "pending": pending, "nameRequests": names,
            "lhcConfigured": bool(self.cfg.lhc),
        })

    def api_sketches(self):
        body = self._read_json()
        if not isinstance(body, dict):
            raise ApiError(400, "Send a JSON object.")
        sketch_in = body.get("sketch")
        if isinstance(sketch_in, dict) and "difficulty" not in sketch_in and body.get("difficulty"):
            sketch_in = dict(sketch_in, difficulty=body["difficulty"])
        sketch = validate_sketch(sketch_in)
        title = clean_text(body.get("title"), 60, strip_dashes=True)
        landmark = clean_text(body.get("landmark"), 60, strip_dashes=True)
        notes = clean_text(body.get("notes"), 4000)
        ideas = clean_text(body.get("nameIdeas"), 1500)
        number = self.store.reserve()
        try:
            draft_id = f"w2-v{number}"
            sketch_rel = self.store.save_sketch(sketch)
            result = run_converter(self.cfg, self.cfg.data / sketch_rel, title=title, landmark=landmark,
                                   version=number, draft_id=draft_id)
            version = self.store.add_version(
                event=result["event"], report=result["report"], svg=result.get("svg"), source="sketch",
                sketch=sketch_rel, title=title, landmark=landmark, difficulty=sketch["difficulty"],
                notes=notes, name_ideas=ideas, wanted_number=number)
        finally:
            self.store.release(number)
        self._json(200, {"ok": True, "version": public_version(version)})

    def api_refine(self):
        body = self._read_json()
        if not isinstance(body, dict):
            raise ApiError(400, "Send a JSON object.")
        from_v = body.get("fromVersion")
        if isinstance(from_v, bool) or not isinstance(from_v, int):
            raise ApiError(400, "fromVersion must be a version number.")
        notes = clean_text(body.get("notes"), 4000)
        sketch = validate_sketch(body["sketch"]) if body.get("sketch") else None
        if not notes and not sketch:
            raise ApiError(400, "Write a note or draw a new sketch first.")
        versions = self.store.versions()
        version = self.store.by_number(versions, from_v)
        if version is None:
            raise ApiError(404, "No such version.")
        if sum(1 for r in version.get("requests", []) if r.get("status") == "pending") >= PENDING_CAP:
            raise ApiError(409, f"v{from_v} already has {PENDING_CAP} requests waiting for the agent.")
        if not self.cfg.lhc:  # fail before saving a sketch we cannot hand over
            raise LhcUnavailable("LHC is not configured on the studio server (start it with --lhc).")
        sketch_rel = self.store.save_sketch(sketch) if sketch else None
        next_n = self.store.next_number(versions)
        prompt = refine_prompt(self.cfg, self.store, version, notes or "(no written notes; see the new sketch)", sketch_rel, next_n)
        args = ["request", "add", "--to", self.cfg.refine_agent, "--tier", "edit",
                "--repo", self.cfg.repo_target or str(self.cfg.root)]
        parsed = lhc_with_text_file(self.cfg, args, "--prompt-file", prompt, ["--json"])
        req = {"id": "r" + secrets.token_hex(4), "kind": "refine", "status": "pending", "created": now_iso(),
               "notes": notes, "newSketch": sketch_rel, "lhcId": lhc_ref(parsed)}
        updated = self.store.update_version(version["id"], lambda v: v.setdefault("requests", []).append(req))
        self._json(200, {"ok": True, "request": req, "version": public_version(updated)})

    def api_names(self):
        body = self._read_json()
        ideas = clean_text(body.get("ideas") if isinstance(body, dict) else None, 1500)
        if not ideas:
            raise ApiError(400, "Type a few name ideas first.")
        args = ["request", "add", "--to", "codex", "--tier", "read", "--repo", self.cfg.repo_target or str(self.cfg.root)]
        parsed = lhc_with_text_file(self.cfg, args, "--prompt-file", names_prompt(self.cfg, ideas), ["--json"])
        entry = {"id": "n" + secrets.token_hex(4), "kind": "names", "status": "pending", "created": now_iso(),
                 "ideas": ideas, "lhcId": lhc_ref(parsed)}
        self.store.add_name_request(entry)
        self._json(200, {"ok": True, "request": entry,
                         "message": "Asked. The suggestions will land in your Focus Inbox."})

    def api_runs(self):
        run = validate_run(self._read_json(RUN_BODY))
        stats = self.store.record_run(run["draftId"], run)
        self._json(200, {"ok": True, "runs": stats})

    def api_approve(self):
        body = self._read_json()
        number = body.get("version") if isinstance(body, dict) else None
        if isinstance(number, bool) or not isinstance(number, int):
            raise ApiError(400, "version must be a version number.")
        versions = self.store.versions()
        version = self.store.by_number(versions, number)
        if version is None:
            raise ApiError(404, "No such version.")
        if not (version.get("report") or {}).get("ok"):
            raise ApiError(409, "That version still has problems. Fix them before approving.")
        if version.get("approval"):
            raise ApiError(409, "Approval for this version is already waiting in your Focus Inbox.")
        draft_path = self.cfg.data / "drafts" / f"{version['id']}.json"
        try:
            sha = hashlib.sha256(draft_path.read_bytes()).hexdigest()
        except FileNotFoundError:
            raise ApiError(500, "The draft file is missing on the studio machine.")
        version = dict(version, sha256=sha)
        preview = approval_preview(version)
        title = f"Approve track: {version.get('title')} v{version['version']}"
        parsed = lhc_with_text_file(
            self.cfg,
            ["inbox", "approval", "--from", "claude", "--system", "track-studio",
             "--ref", f"{version['id']}@{sha[:12]}", "--digest", sha, "--title", title],
            "--preview-file", preview, ["--json"])
        approval = {"status": "requested", "at": now_iso(), "sha256": sha, "lhcId": lhc_ref(parsed)}
        updated = self.store.update_version(version["id"], lambda v: v.update(approval=approval, sha256=sha))
        self._json(200, {"ok": True, "version": public_version(updated), "preview": preview})


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def cmd_add_version(args) -> int:
    data = Path(args.data).resolve()
    try:
        raw = json.loads(Path(args.from_file).read_text(encoding="utf-8"))
    except (OSError, ValueError) as e:
        print(f"Cannot read {args.from_file}: {e}", file=sys.stderr)
        return 2
    report = svg = None
    if isinstance(raw, dict) and isinstance(raw.get("event"), dict):  # converter's full output
        event, report, svg = raw["event"], raw.get("report"), raw.get("svg")
    elif isinstance(raw, dict):
        event = raw
    else:
        print("The file must contain an event object or the converter's {event, report, svg}.", file=sys.stderr)
        return 2
    if args.report_file:
        try:
            report = json.loads(Path(args.report_file).read_text(encoding="utf-8"))
        except (OSError, ValueError) as e:
            print(f"Cannot read {args.report_file}: {e}", file=sys.stderr)
            return 2
    if args.svg_file:
        svg = Path(args.svg_file).read_text(encoding="utf-8")
    if report is None:
        report = {"ok": False, "problems": ["Edited by an agent without a converter check; re-run the converter checks and attach the report."]}
    store = Store(data)
    try:
        version = store.add_version(
            event=event, report=report, svg=svg, source=args.source, sketch=None,
            title=clean_text(args.title, 80), notes=clean_text(args.notes, 4000), name_ideas="",
            from_version=args.from_version)
    except ApiError as e:
        print(e.message, file=sys.stderr)
        return 1
    print(json.dumps({"ok": True, "id": version["id"], "version": version["version"],
                      "status": version_status(version), "problems": version["report"].get("problems", [])}))
    return 0


def build_serve_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(description="Track Studio server")
    p.add_argument("--root", required=True, help="site checkout (served at / and used as converter cwd)")
    p.add_argument("--data", required=True, help="studio data directory")
    p.add_argument("--port", type=int, default=8767)
    p.add_argument("--owner", help="Tailscale login allowed in (Tailscale-User-Login header)")
    p.add_argument("--dev-no-auth", action="store_true", help="LOCAL TESTING ONLY: skip the owner check")
    p.add_argument("--lhc", help="lhcmemorys command (path, or JSON list for extra args)")
    p.add_argument("--card", help="LHC card id to cite in requests")
    p.add_argument("--repo-target", help="LHC registered repo path/id for requests (default: --root)")
    p.add_argument("--converter", help="converter command (default: node scripts/stardust/sketch-to-weekly.mjs)")
    return p


def main(argv=None) -> int:
    argv = list(sys.argv[1:] if argv is None else argv)
    if argv and argv[0] == "add-version":
        p = argparse.ArgumentParser(prog="server.py add-version", description="Add a version from an event JSON file")
        p.add_argument("--data", required=True)
        p.add_argument("--root", help="accepted for symmetry with the server; unused")
        p.add_argument("--from-file", required=True)
        p.add_argument("--source", default="agent", choices=["agent", "sketch"])
        p.add_argument("--notes", default="")
        p.add_argument("--title")
        p.add_argument("--from-version", type=int)
        p.add_argument("--svg-file")
        p.add_argument("--report-file")
        return cmd_add_version(p.parse_args(argv[1:]))
    if argv and argv[0] == "serve":
        argv = argv[1:]
    args = build_serve_parser().parse_args(argv)
    if not args.dev_no_auth and not args.owner:
        print("--owner is required (or --dev-no-auth for local testing).", file=sys.stderr)
        return 2
    root = Path(args.root)
    if not root.is_dir():
        print(f"--root {root} is not a directory.", file=sys.stderr)
        return 2
    cfg = Config(root=root, data=Path(args.data), owner=args.owner, dev_no_auth=args.dev_no_auth,
                 converter=parse_command(args.converter), lhc=parse_command(args.lhc),
                 card=args.card, repo_target=args.repo_target, refine_agent=args.refine_agent)
    server = StudioServer(("127.0.0.1", args.port), cfg)
    if cfg.dev_no_auth:
        log("WARNING: --dev-no-auth is on; anyone who can reach this port is the owner.")
    log(f"listening on http://127.0.0.1:{server.server_address[1]} root={cfg.root} data={cfg.data} "
        f"owner={'(dev)' if cfg.dev_no_auth else cfg.owner} lhc={'yes' if cfg.lhc else 'no'}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
