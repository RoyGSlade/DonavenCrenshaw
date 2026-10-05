#!/usr/bin/env python3
"""Stand-in for scripts/stardust/sketch-to-weekly.mjs (same CLI and output contract).

Used by test_server.py and for local screenshots. Not the real converter.
Behaviour: fewer than 5 points -> exit 2; a sketch with a mark note containing
"BAD" -> report.ok false with a plain-words problem; otherwise ok.
"""
import json
import sys


def main(argv):
    if not argv:
        print("usage: fake_converter.py sketch.json [--title T] [--landmark L] [--version N] [--id ID]", file=sys.stderr)
        return 2
    sketch = json.load(open(argv[0], encoding="utf-8"))
    opts = {}
    i = 1
    while i < len(argv):
        if argv[i].startswith("--") and i + 1 < len(argv):
            opts[argv[i][2:]] = argv[i + 1]
            i += 2
        else:
            i += 1
    pts = sketch.get("points", [])
    if len(pts) < 5:
        print("sketch needs at least 5 points", file=sys.stderr)
        return 2
    bad = any("BAD" in (m.get("note") or "") for m in sketch.get("marks", []))
    path = " ".join(("M" if k == 0 else "L") + f"{p[0] * 400:.1f},{p[1] * 240:.1f}" for k, p in enumerate(pts)) + " Z"
    svg = (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 240"><rect width="400" height="240" fill="#101013"/>'
           f'<path d="{path}" fill="none" stroke="#e6c56a" stroke-width="10" stroke-linejoin="round"/></svg>')
    event = {"id": opts.get("id", "w2"), "version": int(opts.get("version", 1)), "title": opts.get("title", "Untitled"),
             "landmark": opts.get("landmark", ""), "track": {"points": len(pts), "difficulty": sketch.get("difficulty")}}
    report = {"ok": not bad, "problems": ["Corner 3 is too tight for the ship to turn."] if bad else [],
              "lengthCells": 240, "corners": 9, "shards": 12, "mines": 4, "bouncers": 2,
              "pilot": {"finished": not bad, "ms": None if bad else 71500}, "estimatedHumanMs": 82000}
    if bad:
        report["fixes"] = ["Widened corner 3."]
    json.dump({"event": event, "report": report, "svg": svg}, sys.stdout)
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
