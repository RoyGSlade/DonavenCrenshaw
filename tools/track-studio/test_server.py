"""Track Studio server tests (stdlib unittest, fake converter and fake lhc).

    python3 -m unittest tools/track-studio/test_server.py
"""
import hashlib
import http.client
import json
import os
import shutil
import subprocess
import sys
import tempfile
import threading
import unittest
from pathlib import Path
from unittest import mock

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import server as studio  # noqa: E402

studio.log = lambda msg: None  # keep test output readable

FAKE_CONVERTER = [sys.executable, str(HERE / "testing" / "fake_converter.py")]
FAKE_LHC = [sys.executable, str(HERE / "testing" / "fake_lhc.py")]
OWNER = "owner@example.com"


def square_sketch(n=12, **over):
    pts = []
    for i in range(n):
        a = i / n
        pts.append([round(0.5 + 0.35 * __import__("math").cos(a * 6.2832), 4),
                    round(0.5 + 0.35 * __import__("math").sin(a * 6.2832), 4)])
    sketch = {"version": 1, "points": pts, "start": 0, "aspect": 1.7, "marks": [], "difficulty": "normal"}
    sketch.update(over)
    return sketch


class Harness:
    def __init__(self, *, lhc=True, owner=OWNER, dev=False, data_inside_root=False):
        self.tmp = Path(tempfile.mkdtemp(prefix="studio-test-"))
        self.root = self.tmp / "site"
        (self.root / "projects" / "Space-Shooter").mkdir(parents=True)
        (self.root / "projects" / "Space-Shooter" / "index.html").write_text("<h1>game</h1>", encoding="utf-8")
        (self.root / "projects" / "Space-Shooter" / "main.js").write_text("export default 1;", encoding="utf-8")
        (self.root / "projects" / "Space-Shooter" / "mod.mjs").write_text("export default 2;", encoding="utf-8")
        (self.root / "projects" / "Space-Shooter" / "x.wasm").write_bytes(b"\x00asm")
        (self.root / "projects" / "Space-Shooter" / "a.svg").write_text("<svg/>", encoding="utf-8")
        (self.root / "projects" / "Space-Shooter" / "a.woff2").write_bytes(b"wOF2")
        (self.root / "projects" / "Space-Shooter" / "a.mp3").write_bytes(b"ID3" + b"x" * 100)
        (self.root / ".git").mkdir()
        (self.root / ".git" / "config").write_text("secret", encoding="utf-8")
        (self.root / ".env").write_text("TOKEN=1", encoding="utf-8")
        (self.root / "tools").mkdir()
        (self.root / "tools" / "private.txt").write_text("nope", encoding="utf-8")
        (self.tmp / "outside.txt").write_text("outside", encoding="utf-8")
        self.data = (self.root / "studio-data") if data_inside_root else (self.tmp / "data")
        self.lhc_log = self.tmp / "lhc.log"
        cfg = studio.Config(root=self.root, data=self.data, owner=owner, dev_no_auth=dev,
                            converter=FAKE_CONVERTER, lhc=FAKE_LHC if lhc else None,
                            card="#SAVE-01", repo_target="studio-repo")
        self.server = studio.StudioServer(("127.0.0.1", 0), cfg)
        self.port = self.server.server_address[1]
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()
        self._env = mock.patch.dict(os.environ, {"FAKE_LHC_LOG": str(self.lhc_log)})
        self._env.start()

    def close(self):
        self._env.stop()
        self.server.shutdown()
        self.server.server_close()
        shutil.rmtree(self.tmp, ignore_errors=True)

    def request(self, method, path, body=None, headers=None, auth=True, studio_hdr=None, raw_body=None):
        h = {}
        if auth:
            h["Tailscale-User-Login"] = OWNER
        if body is not None or raw_body is not None:
            h["Content-Type"] = "application/json"
        if studio_hdr is None:
            studio_hdr = method == "POST"
        if studio_hdr:
            h["X-Studio"] = "1"
        h.update(headers or {})
        conn = http.client.HTTPConnection("127.0.0.1", self.port, timeout=30)
        try:
            payload = raw_body if raw_body is not None else (json.dumps(body).encode() if body is not None else None)
            conn.putrequest(method, path, skip_accept_encoding=True)
            for k, v in h.items():
                conn.putheader(k, v)
            if payload is not None:
                conn.putheader("Content-Length", str(len(payload)))
            conn.endheaders(payload)
            resp = conn.getresponse()
            data = resp.read()
            return resp.status, dict((k.lower(), v) for k, v in resp.getheaders()), data
        finally:
            conn.close()

    def json(self, method, path, body=None, **kw):
        status, headers, data = self.request(method, path, body, **kw)
        try:
            return status, json.loads(data)
        except ValueError:
            return status, data

    def make_version(self, **over):
        body = {"sketch": square_sketch(), "title": "Test Drop", "landmark": "The Long Drop"}
        body.update(over)
        status, out = self.json("POST", "/studio/api/sketches", body)
        assert status == 200, (status, out)
        return out["version"]

    def lhc_calls(self):
        if not self.lhc_log.exists():
            return []
        return [json.loads(line) for line in self.lhc_log.read_text(encoding="utf-8").splitlines()]


class Base(unittest.TestCase):
    harness_kwargs = {}

    def setUp(self):
        self.h = Harness(**self.harness_kwargs)
        self.addCleanup(self.h.close)


class AuthTests(Base):
    def test_missing_and_wrong_header_are_403(self):
        self.assertEqual(self.h.request("GET", "/studio/api/state", auth=False)[0], 403)
        self.assertEqual(self.h.request("GET", "/studio/", auth=False)[0], 403)
        self.assertEqual(self.h.request("GET", "/studio/api/state", headers={"Tailscale-User-Login": "evil@example.com"}, auth=False)[0], 403)
        self.assertEqual(self.h.request("POST", "/studio/api/runs", {"draftId": "w2-v1"}, auth=False)[0], 403)

    def test_owner_gets_in_case_insensitively(self):
        self.assertEqual(self.h.request("GET", "/studio/api/state", auth=False, headers={"Tailscale-User-Login": OWNER.upper()})[0], 200)
        self.assertEqual(self.h.request("GET", "/studio/")[0], 200)

    def test_forbidden_is_json(self):
        status, body = self.h.json("GET", "/studio/api/state", auth=False)
        self.assertEqual(status, 403)
        self.assertFalse(body["ok"])


class DevNoAuthTests(Base):
    harness_kwargs = {"dev": True, "owner": None}

    def test_dev_flag_skips_owner_check(self):
        self.assertEqual(self.h.request("GET", "/studio/api/state", auth=False)[0], 200)


class NoOwnerTests(Base):
    harness_kwargs = {"owner": None}

    def test_no_owner_and_no_dev_flag_locks_everyone_out(self):
        self.assertEqual(self.h.request("GET", "/studio/api/state")[0], 403)


class StaticTests(Base):
    def test_game_files_and_mime_types(self):
        cases = {
            "/projects/Space-Shooter/": "text/html",
            "/projects/Space-Shooter/main.js": "text/javascript",
            "/projects/Space-Shooter/mod.mjs": "text/javascript",
            "/projects/Space-Shooter/x.wasm": "application/wasm",
            "/projects/Space-Shooter/a.svg": "image/svg+xml",
            "/projects/Space-Shooter/a.woff2": "font/woff2",
            "/projects/Space-Shooter/a.mp3": "audio/mpeg",
        }
        for path, mime in cases.items():
            status, headers, _ = self.h.request("GET", path)
            self.assertEqual(status, 200, path)
            self.assertTrue(headers["content-type"].startswith(mime), (path, headers["content-type"]))
            self.assertEqual(headers["x-content-type-options"], "nosniff")

    def test_directory_redirects_to_slash(self):
        status, headers, _ = self.h.request("GET", "/projects/Space-Shooter")
        self.assertEqual(status, 301)
        self.assertEqual(headers["location"], "/projects/Space-Shooter/")

    def test_range_requests(self):
        status, headers, data = self.h.request("GET", "/projects/Space-Shooter/a.mp3", headers={"Range": "bytes=0-2"})
        self.assertEqual(status, 206)
        self.assertEqual(data, b"ID3")
        self.assertEqual(headers["content-range"], "bytes 0-2/103")

    def test_traversal_and_private_paths_are_refused(self):
        bad = [
            "/../outside.txt", "/%2e%2e/outside.txt", "/%2E%2E%2Foutside.txt", "/projects/../../outside.txt",
            "/projects/%2e%2e/%2e%2e/outside.txt", "/..%5coutside.txt", "/projects\\..\\..\\outside.txt",
            "/.git/config", "/.env", "/projects/Space-Shooter/%2e%2e/%2e%2egit/config",
            "/tools/private.txt", "/tools/track-studio/server.py", "/%00", "/c:/windows/win.ini",
            "/studio/drafts/../../versions.json", "/studio/drafts/%2e%2e%2fversions.json",
            "/studio/drafts/.json", "/studio/drafts/w2-v1.json.bak", "/studio/static/studio.js",
        ]
        for path in bad:
            status, _, data = self.h.request("GET", path)
            self.assertIn(status, (400, 404), (path, status))
            self.assertNotIn(b"outside", data, path)
            self.assertNotIn(b"secret", data, path)

    def test_symlink_escape_is_refused(self):
        link = self.h.root / "escape"
        try:
            os.symlink(self.h.tmp, link, target_is_directory=True)
        except (OSError, NotImplementedError):
            self.skipTest("symlinks unavailable here")
        self.assertEqual(self.h.request("GET", "/escape/outside.txt")[0], 404)

    def test_studio_page_headers(self):
        status, headers, body = self.h.request("GET", "/studio/")
        self.assertEqual(status, 200)
        self.assertIn("script-src 'self'", headers["content-security-policy"])
        self.assertTrue(headers["content-type"].startswith("text/html"))
        self.assertEqual(self.h.request("GET", "/studio/studio.js")[1]["content-type"].split(";")[0], "text/javascript")
        self.assertEqual(self.h.request("GET", "/studio")[0], 301)

    def test_other_methods_refused(self):
        self.assertEqual(self.h.request("DELETE", "/studio/api/state")[0], 405)
        self.assertEqual(self.h.request("PUT", "/studio/api/state")[0], 405)


class DataInsideRootTests(Base):
    harness_kwargs = {"data_inside_root": True}

    def test_data_dir_inside_checkout_is_not_served_raw(self):
        self.h.make_version()
        self.assertEqual(self.h.request("GET", "/studio-data/versions.json")[0], 404)
        self.assertEqual(self.h.request("GET", "/studio/drafts/w2-v1.json")[0], 200)


class CsrfTests(Base):
    def test_post_needs_x_studio_header(self):
        status, _ = self.h.json("POST", "/studio/api/sketches", {"sketch": square_sketch()}, studio_hdr=False)
        self.assertEqual(status, 403)
        self.assertEqual(self.h.json("GET", "/studio/api/state")[1]["versions"], [])

    def test_cross_origin_post_is_refused(self):
        status, _ = self.h.json("POST", "/studio/api/sketches", {"sketch": square_sketch()},
                                headers={"Origin": "https://evil.example", "Host": f"127.0.0.1:{self.h.port}"})
        self.assertEqual(status, 403)

    def test_same_origin_post_is_accepted(self):
        status, _ = self.h.json("POST", "/studio/api/sketches", {"sketch": square_sketch()},
                                headers={"Origin": f"http://127.0.0.1:{self.h.port}"})
        self.assertEqual(status, 200)

    def test_post_needs_json_content_type(self):
        status, _ = self.h.json("POST", "/studio/api/sketches", raw_body=b"x", headers={"Content-Type": "text/plain"})
        self.assertEqual(status, 415)

    def test_runs_accepts_the_game_without_custom_header_but_still_checks_origin(self):
        self.h.make_version()
        run = {"draftId": "w2-v1", "version": 1, "ms": 80000, "finished": True, "log": []}
        self.assertEqual(self.h.json("POST", "/studio/api/runs", run, studio_hdr=False)[0], 200)
        self.assertEqual(self.h.json("POST", "/studio/api/runs", run, studio_hdr=False,
                                     headers={"Origin": "https://evil.example"})[0], 403)
        self.assertEqual(self.h.json("POST", "/studio/api/runs", raw_body=json.dumps(run).encode(), studio_hdr=False,
                                     headers={"Content-Type": "text/plain"})[0], 415)

    def test_oversize_body_is_413(self):
        status, body = self.h.json("POST", "/studio/api/sketches", raw_body=b"{" + b" " * (300 * 1024) + b"}")
        self.assertEqual(status, 413)

    def test_bad_json_is_400_with_json_error(self):
        status, body = self.h.json("POST", "/studio/api/sketches", raw_body=b"{nope")
        self.assertEqual(status, 400)
        self.assertFalse(body["ok"])


class SketchTests(Base):
    def test_sketch_becomes_a_version_with_files(self):
        v = self.h.make_version(notes="  fast opening  ", nameIdeas="drop, gantry")
        self.assertEqual(v["id"], "w2-v1")
        self.assertEqual(v["version"], 1)
        self.assertEqual(v["status"], "ready")
        self.assertEqual(v["title"], "Test Drop")
        self.assertEqual(v["notes"], "fast opening")
        self.assertEqual(v["autopilotMs"], 71500)
        self.assertEqual(v["sketch"], "sketches/1.json")
        data = self.h.data
        event = json.loads((data / "drafts" / "w2-v1.json").read_text(encoding="utf-8"))
        self.assertEqual(event["id"], "w2-v1")
        self.assertEqual(event["version"], 1)
        self.assertEqual(event["landmark"], "The Long Drop")
        self.assertTrue((data / "drafts" / "w2-v1.svg").read_text(encoding="utf-8").startswith("<svg"))
        self.assertEqual(json.loads((data / "sketches" / "1.json").read_text(encoding="utf-8"))["points"][0], v and square_sketch()["points"][0])
        stored = json.loads((data / "versions.json").read_text(encoding="utf-8"))
        self.assertEqual(stored[0]["sha256"], hashlib.sha256((data / "drafts" / "w2-v1.json").read_bytes()).hexdigest())
        self.assertEqual(list(data.glob("**/*.tmp")), [])

    def test_drafts_are_served_for_the_game(self):
        self.h.make_version()
        status, headers, data = self.h.request("GET", "/studio/drafts/w2-v1.json")
        self.assertEqual((status, headers["content-type"].split(";")[0]), (200, "application/json"))
        self.assertEqual(json.loads(data)["id"], "w2-v1")
        status, headers, _ = self.h.request("GET", "/studio/drafts/w2-v1.svg")
        self.assertEqual((status, headers["content-type"]), (200, "image/svg+xml"))
        self.assertIn("sandbox", headers["content-security-policy"])

    def test_needs_work_is_saved_and_flagged(self):
        sketch = square_sketch(marks=[{"at": 2, "kind": "tight", "note": "BAD corner"}])
        v = self.h.make_version(sketch=sketch)
        self.assertEqual(v["status"], "needs-work")
        self.assertEqual(v["problems"], ["Corner 3 is too tight for the ship to turn."])
        self.assertIsNone(v["autopilotMs"])
        self.assertTrue((self.h.data / "drafts" / "w2-v1.json").exists())

    def test_versions_increment_and_list_newest_first(self):
        self.h.make_version()
        self.h.make_version(title="Second")
        state = self.h.json("GET", "/studio/api/state")[1]
        self.assertEqual([v["version"] for v in state["versions"]], [2, 1])
        self.assertEqual(state["versions"][0]["playUrl"], "/projects/Space-Shooter/?preview=weekly&draft=/studio/drafts/w2-v2.json")

    def test_converter_exit_2_is_a_400_and_saves_no_version(self):
        status, body = self.h.json("POST", "/studio/api/sketches", {"sketch": square_sketch(n=4)})
        self.assertEqual(status, 400)
        self.assertIn("rejected", body["error"])
        self.assertEqual(self.h.json("GET", "/studio/api/state")[1]["versions"], [])
        self.assertEqual(self.h.make_version()["version"], 1)  # number was not burned

    def test_invalid_sketches_are_400(self):
        bad = [
            {"points": [[0, 0]] * 2, "start": 0, "aspect": 1},
            {"points": [[0.1, 0.1], [2, 0.5], [0.2, 0.9]], "start": 0, "aspect": 1},
            {"points": [[0.1, 0.1], [0.5, 0.5], [0.2, 0.9]], "start": 7, "aspect": 1},
            {"points": [[0.1, 0.1], [0.5, 0.5], [0.2, 0.9]], "start": 0, "aspect": 1, "marks": [{"at": 1, "kind": "lava"}]},
            {"points": [[0.1, 0.1], [0.5, 0.5], [0.2, 0.9]], "start": 0, "aspect": 1, "difficulty": "nightmare"},
            {"points": [["a", 0.1], [0.5, 0.5], [0.2, 0.9]], "start": 0, "aspect": 1},
            "nope",
        ]
        for sketch in bad:
            self.assertEqual(self.h.json("POST", "/studio/api/sketches", {"sketch": sketch})[0], 400, sketch)

    def test_title_cannot_inject_converter_flags(self):
        v = self.h.make_version(title="--version 99 evil")
        self.assertEqual(v["version"], 1)
        self.assertEqual(v["title"], "version 99 evil")

    def test_converter_crash_and_garbage_are_502(self):
        for script in ("import sys; sys.exit(1)", "print('not json')", "print('{\"event\": {}}')"):
            self.h.server.cfg.converter = [sys.executable, "-c", script]
            self.assertEqual(self.h.json("POST", "/studio/api/sketches", {"sketch": square_sketch()})[0], 502, script)

    def test_missing_converter_is_503(self):
        self.h.server.cfg.converter = ["definitely-not-installed-xyz"]
        self.assertEqual(self.h.json("POST", "/studio/api/sketches", {"sketch": square_sketch()})[0], 503)

    def test_converter_timeout_is_504(self):
        self.h.server.cfg.converter = [sys.executable, "-c", "import time; time.sleep(5)"]
        with mock.patch.object(studio, "CONVERTER_TIMEOUT", 0.3):
            self.assertEqual(self.h.json("POST", "/studio/api/sketches", {"sketch": square_sketch()})[0], 504)


class RunTests(Base):
    def post_run(self, **over):
        body = {"draftId": "w2-v1", "version": 1, "ms": 80000, "finished": True, "log": [1, 2, 3], "build": {"hull": "x"}}
        body.update(over)
        return self.h.json("POST", "/studio/api/runs", body, studio_hdr=False)

    def test_runs_append_and_best_is_kept(self):
        self.h.make_version()
        self.assertEqual(self.post_run(ms=90000)[0], 200)
        self.assertEqual(self.post_run(ms=75500)[0], 200)
        self.assertEqual(self.post_run(ms=82000)[0], 200)
        status, body = self.post_run(finished=False, ms=12000, reason="mine", log=None)
        self.assertEqual(status, 200)
        lines = (self.h.data / "runs" / "w2-v1.jsonl").read_text(encoding="utf-8").splitlines()
        self.assertEqual(len(lines), 4)
        self.assertEqual(json.loads(lines[0])["log"], [1, 2, 3])
        runs = body["runs"]
        self.assertEqual((runs["count"], runs["finished"], runs["bestMs"], runs["lastMs"]), (4, 3, 75500, 82000))
        self.assertIs(runs["lastFinished"], False)
        self.assertEqual(runs["lastReason"], "mine")
        v = self.h.json("GET", "/studio/api/state")[1]["versions"][0]
        self.assertEqual((v["bestMs"], v["lastMs"]), (75500, 82000))

    def test_unfinished_only_never_sets_best(self):
        self.h.make_version()
        self.post_run(finished=False, ms=5000, reason="crashed")
        self.assertIsNone(self.h.json("GET", "/studio/api/state")[1]["versions"][0]["bestMs"])

    def test_validation(self):
        self.h.make_version()
        self.assertEqual(self.post_run(draftId="w2-v9")[0], 404)
        self.assertEqual(self.post_run(draftId="../x")[0], 400)
        self.assertEqual(self.post_run(finished="yes")[0], 400)
        self.assertEqual(self.post_run(ms=-5)[0], 400)
        self.assertEqual(self.post_run(ms=0)[0], 400)
        self.assertEqual(self.post_run(ms="fast")[0], 400)
        self.assertEqual(self.post_run(ms=99999999)[0], 400)
        self.assertEqual(self.post_run(version="one")[0], 400)
        self.assertEqual(self.h.json("POST", "/studio/api/runs", ["no"], studio_hdr=False)[0], 400)

    def test_big_log_up_to_1mb_is_stored_and_huge_is_413(self):
        self.h.make_version()
        big = ["x" * 100] * 10000  # about 1 MB
        self.assertEqual(self.post_run(log=big)[0], 200)
        self.assertGreater((self.h.data / "runs" / "w2-v1.jsonl").stat().st_size, 1_000_000)
        status, _, _ = self.h.request("POST", "/studio/api/runs", raw_body=b'{"log":"' + b"a" * (4 * 1024 * 1024) + b'"}')
        self.assertEqual(status, 413)

    def test_concurrent_runs_do_not_lose_updates(self):
        self.h.make_version()
        results = []

        def go(i):
            results.append(self.post_run(ms=70000 + i)[0])

        threads = [threading.Thread(target=go, args=(i,)) for i in range(20)]
        [t.start() for t in threads]
        [t.join() for t in threads]
        self.assertEqual(results, [200] * 20)
        v = json.loads((self.h.data / "versions.json").read_text(encoding="utf-8"))[0]
        self.assertEqual((v["runs"]["count"], v["runs"]["bestMs"]), (20, 70000))
        self.assertEqual(len((self.h.data / "runs" / "w2-v1.jsonl").read_text(encoding="utf-8").splitlines()), 20)


class RefineTests(Base):
    def test_refine_files_an_edit_request_with_the_full_instructions(self):
        v = self.h.make_version()
        self.h.json("POST", "/studio/api/runs", {"draftId": "w2-v1", "ms": 81234, "finished": True}, studio_hdr=False)
        status, body = self.h.json("POST", "/studio/api/refine", {"fromVersion": 1, "notes": "Corner 3 is brutal, widen it."})
        self.assertEqual(status, 200, body)
        self.assertEqual(body["version"]["status"], "agent-working")
        self.assertEqual(body["request"]["lhcId"], "fake-request-add")
        call = self.h.lhc_calls()[-1]
        self.assertEqual(call["cmd"], ["request", "add"])
        f = call["flags"]
        self.assertEqual((f["to"], f["tier"], f["repo"]), ("codex", "edit", "studio-repo"))
        prompt = f["_prompt-file-text"]
        for needle in ("Corner 3 is brutal, widen it.", "drafts/w2-v1.json", "versions.json", "runs/w2-v1.jsonl",
                       "add-version", "--source agent", "--from-version 1", "3 short lines", "#SAVE-01",
                       "1:21.234", "sketches/1.json", "w2-v2", "Do not commit, push"):
            self.assertIn(needle, prompt)
        self.assertFalse(Path(f["prompt-file"]).exists())  # temp file cleaned
        state = self.h.json("GET", "/studio/api/state")[1]
        self.assertEqual([p["draftId"] for p in state["pending"]], ["w2-v1"])
        self.assertEqual(json.loads((self.h.data / "versions.json").read_text(encoding="utf-8"))[0]["requests"][0]["status"], "pending")

    def test_refine_with_new_sketch_saves_it_and_cites_it(self):
        self.h.make_version()
        status, body = self.h.json("POST", "/studio/api/refine", {"fromVersion": 1, "notes": "", "sketch": square_sketch(n=9)})
        self.assertEqual(status, 200, body)
        self.assertEqual(body["request"]["newSketch"], "sketches/2.json")
        self.assertTrue((self.h.data / "sketches" / "2.json").exists())
        self.assertIn("sketches/2.json", self.h.lhc_calls()[-1]["flags"]["_prompt-file-text"])

    def test_refine_validation_and_cap(self):
        self.h.make_version()
        self.assertEqual(self.h.json("POST", "/studio/api/refine", {"fromVersion": 1, "notes": ""})[0], 400)
        self.assertEqual(self.h.json("POST", "/studio/api/refine", {"fromVersion": "1", "notes": "x"})[0], 400)
        self.assertEqual(self.h.json("POST", "/studio/api/refine", {"fromVersion": 9, "notes": "x"})[0], 404)
        for _ in range(studio.PENDING_CAP):
            self.assertEqual(self.h.json("POST", "/studio/api/refine", {"fromVersion": 1, "notes": "x"})[0], 200)
        self.assertEqual(self.h.json("POST", "/studio/api/refine", {"fromVersion": 1, "notes": "x"})[0], 409)

    def test_add_version_cli_completes_the_loop(self):
        self.h.make_version()
        self.h.json("POST", "/studio/api/refine", {"fromVersion": 1, "notes": "widen"})
        out_file = self.h.tmp / "out.json"
        conv = subprocess.run(FAKE_CONVERTER + [str(self.h.data / "sketches" / "1.json"), "--title", "Test Drop", "--id", "w2-v2", "--version", "2"],
                              capture_output=True, check=True)
        out_file.write_bytes(conv.stdout)
        proc = subprocess.run([sys.executable, str(HERE / "server.py"), "add-version", "--data", str(self.h.data),
                               "--from-file", str(out_file), "--source", "agent", "--from-version", "1",
                               "--notes", "Widened corner 3"], capture_output=True, text=True)
        self.assertEqual(proc.returncode, 0, proc.stderr)
        info = json.loads(proc.stdout)
        self.assertEqual((info["id"], info["version"], info["status"]), ("w2-v2", 2, "ready"))
        state = self.h.json("GET", "/studio/api/state")[1]
        self.assertEqual([v["version"] for v in state["versions"]], [2, 1])
        self.assertEqual(state["versions"][0]["source"], "agent")
        self.assertEqual(state["versions"][0]["notes"], "Widened corner 3")
        self.assertEqual(state["versions"][0]["title"], "Test Drop")
        self.assertEqual(state["versions"][1]["status"], "ready")  # pending request resolved
        self.assertEqual(state["pending"], [])
        self.assertEqual(state["versions"][1]["requests"][0]["resultVersion"], 2)

    def test_add_version_cli_bare_event_without_report_needs_work(self):
        self.h.make_version()
        ev = self.h.tmp / "event.json"
        ev.write_text(json.dumps({"id": "whatever", "title": "Edited", "track": {}}), encoding="utf-8")
        proc = subprocess.run([sys.executable, str(HERE / "server.py"), "add-version", "--data", str(self.h.data),
                               "--from-file", str(ev), "--source", "agent"], capture_output=True, text=True)
        self.assertEqual(proc.returncode, 0, proc.stderr)
        self.assertEqual(json.loads(proc.stdout)["status"], "needs-work")
        event = json.loads((self.h.data / "drafts" / "w2-v2.json").read_text(encoding="utf-8"))
        self.assertEqual((event["id"], event["version"]), ("w2-v2", 2))
        rep = self.h.tmp / "report.json"
        rep.write_text(json.dumps({"ok": True, "problems": [], "pilot": {"finished": True, "ms": 70000}}), encoding="utf-8")
        proc = subprocess.run([sys.executable, str(HERE / "server.py"), "add-version", "--data", str(self.h.data),
                               "--from-file", str(ev), "--report-file", str(rep)], capture_output=True, text=True)
        self.assertEqual(json.loads(proc.stdout)["status"], "ready")

    def test_add_version_cli_rejects_garbage(self):
        bad = self.h.tmp / "bad.json"
        bad.write_text("[1,2]", encoding="utf-8")
        proc = subprocess.run([sys.executable, str(HERE / "server.py"), "add-version", "--data", str(self.h.data),
                               "--from-file", str(bad)], capture_output=True, text=True)
        self.assertEqual(proc.returncode, 2)

    def test_number_collision_renumbers_instead_of_overwriting(self):
        self.h.make_version()
        store = self.h.server.store
        v = store.add_version(event={"x": 1}, report={"ok": True}, svg=None, source="agent", sketch=None, wanted_number=1)
        self.assertEqual(v["version"], 2)
        self.assertEqual(json.loads((self.h.data / "drafts" / "w2-v1.json").read_text(encoding="utf-8"))["id"], "w2-v1")

    def test_names_request_goes_to_codex_read_tier(self):
        status, body = self.h.json("POST", "/studio/api/names", {"ideas": "something with cranes, vertigo"})
        self.assertEqual(status, 200)
        f = self.h.lhc_calls()[-1]["flags"]
        self.assertEqual((f["to"], f["tier"]), ("codex", "read"))
        self.assertIn("Gantry Drop", f["_prompt-file-text"])
        self.assertIn("cranes, vertigo", f["_prompt-file-text"])
        self.assertIn("8", f["_prompt-file-text"])
        self.assertEqual(self.h.json("POST", "/studio/api/names", {"ideas": "  "})[0], 400)
        self.assertEqual(len(self.h.json("GET", "/studio/api/state")[1]["nameRequests"]), 1)


class NoLhcTests(Base):
    harness_kwargs = {"lhc": False}

    def test_refine_names_approve_fail_soft_with_clear_message(self):
        self.h.make_version()
        for path, body in (("/studio/api/refine", {"fromVersion": 1, "notes": "x"}),
                           ("/studio/api/names", {"ideas": "x"}),
                           ("/studio/api/approve", {"version": 1})):
            status, out = self.h.json("POST", path, body)
            self.assertEqual(status, 503, path)
            self.assertIn("LHC is not configured", out["error"])
            self.assertIn("hint", out)
        v = self.h.json("GET", "/studio/api/state")[1]["versions"][0]
        self.assertEqual(v["status"], "ready")
        self.assertEqual(v["requests"], [])
        self.assertFalse(self.h.json("GET", "/studio/api/state")[1]["lhcConfigured"])


class LhcFailureTests(Base):
    def test_lhc_failure_is_soft_and_records_nothing(self):
        self.h.make_version()
        with mock.patch.dict(os.environ, {"FAKE_LHC_FAIL": "1"}):
            status, out = self.h.json("POST", "/studio/api/refine", {"fromVersion": 1, "notes": "x"})
            self.assertEqual(status, 503)
            self.assertIn("refused", out["error"])
            self.assertEqual(self.h.json("POST", "/studio/api/approve", {"version": 1})[0], 503)
        v = self.h.json("GET", "/studio/api/state")[1]["versions"][0]
        self.assertEqual((v["status"], v["requests"], v["approval"]), ("ready", [], None))

    def test_missing_lhc_binary_is_soft(self):
        self.h.make_version()
        self.h.server.cfg.lhc = ["definitely-not-installed-xyz"]
        status, out = self.h.json("POST", "/studio/api/names", {"ideas": "x"})
        self.assertEqual(status, 503)
        self.assertIn("not found", out["error"])


class ApproveTests(Base):
    def test_approval_preview_is_exact_and_digest_matches(self):
        v = self.h.make_version()
        self.h.json("POST", "/studio/api/runs", {"draftId": "w2-v1", "ms": 77654, "finished": True}, studio_hdr=False)
        status, out = self.h.json("POST", "/studio/api/approve", {"version": 1})
        self.assertEqual(status, 200, out)
        sha = hashlib.sha256((self.h.data / "drafts" / "w2-v1.json").read_bytes()).hexdigest()
        call = self.h.lhc_calls()[-1]
        self.assertEqual(call["cmd"], ["inbox", "approval"])
        f = call["flags"]
        self.assertEqual((f["from"], f["system"], f["digest"]), ("claude", "track-studio", sha))
        self.assertEqual(f["ref"], f"w2-v1@{sha[:12]}")
        self.assertEqual(f["title"], "Approve track: Test Drop v1")
        self.assertEqual(f["_preview-file-text"], "\n".join([
            "Track: Test Drop", "Version: v1", "Draft id: w2-v1", f"Draft sha256: {sha}",
            "Best laptop lap: 1:17.654", "Autopilot time: 1:11.500", "",
            "Ship this as Week 2 (launch Tue Oct 6, 3 PM PT)", ""]))
        self.assertEqual(out["version"]["status"], "approval-requested")
        self.assertEqual(out["version"]["approval"]["sha256"], sha)
        self.assertEqual(self.h.json("POST", "/studio/api/approve", {"version": 1})[0], 409)  # no duplicates

    def test_unflown_version_says_so(self):
        self.h.make_version()
        self.h.json("POST", "/studio/api/approve", {"version": 1})
        self.assertIn("Best laptop lap: not flown on the laptop yet", self.h.lhc_calls()[-1]["flags"]["_preview-file-text"])

    def test_needs_work_and_unknown_versions_cannot_be_approved(self):
        self.h.make_version(sketch=square_sketch(marks=[{"at": 1, "kind": "tight", "note": "BAD"}]))
        self.assertEqual(self.h.json("POST", "/studio/api/approve", {"version": 1})[0], 409)
        self.assertEqual(self.h.json("POST", "/studio/api/approve", {"version": 5})[0], 404)
        self.assertEqual(self.h.json("POST", "/studio/api/approve", {"version": "1"})[0], 400)
        self.assertEqual(self.h.lhc_calls(), [])


class AtomicWriteTests(Base):
    def test_failed_replace_keeps_the_old_file_and_leaves_no_temp(self):
        target = self.h.tmp / "thing.json"
        studio.atomic_write(target, b"old")
        with mock.patch.object(studio.os, "replace", side_effect=OSError("disk gone")):
            with self.assertRaises(OSError):
                studio.atomic_write(target, b"new")
        self.assertEqual(target.read_bytes(), b"old")
        self.assertEqual([p.name for p in self.h.tmp.glob(".thing.json.*")], [])

    def test_versions_json_is_always_valid_while_writing(self):
        self.h.make_version()
        stop = threading.Event()
        bad = []

        def reader():
            while not stop.is_set():
                try:
                    json.loads((self.h.data / "versions.json").read_text(encoding="utf-8"))
                except PermissionError:
                    pass  # Windows locks a file for an instant during os.replace
                except (ValueError, FileNotFoundError) as e:
                    bad.append(e)

        t = threading.Thread(target=reader)
        t.start()
        for i in range(30):
            self.h.json("POST", "/studio/api/runs", {"draftId": "w2-v1", "ms": 70000 + i, "finished": True}, studio_hdr=False)
        stop.set()
        t.join()
        self.assertEqual(bad, [])

    def test_stale_lock_from_a_dead_process_is_broken(self):
        lock = self.h.data / ".lock"
        lock.write_text("123", encoding="utf-8")
        old = lock.stat().st_mtime - 1000
        os.utime(lock, (old, old))
        self.assertEqual(self.h.json("POST", "/studio/api/sketches", {"sketch": square_sketch()})[0], 200)


class HelperTests(unittest.TestCase):
    def test_fmt_ms(self):
        self.assertEqual(studio.fmt_ms(71500), "1:11.500")
        self.assertEqual(studio.fmt_ms(None), "none")

    def test_parse_command(self):
        self.assertEqual(studio.parse_command('["a b", "c"]'), ["a b", "c"])
        self.assertEqual(studio.parse_command("lhcmemorys"), ["lhcmemorys"])
        self.assertIsNone(studio.parse_command(""))

    def test_safe_resolve(self):
        root = Path(tempfile.mkdtemp())
        try:
            self.assertEqual(studio.safe_resolve(root, "/"), Path(os.path.realpath(root)))
            self.assertIsNone(studio.safe_resolve(root, "/a/../../b"))
            self.assertIsNone(studio.safe_resolve(root, "/.hidden"))
            self.assertIsNone(studio.safe_resolve(root, "/node_modules/x"))
        finally:
            shutil.rmtree(root, ignore_errors=True)


if __name__ == "__main__":
    unittest.main()
