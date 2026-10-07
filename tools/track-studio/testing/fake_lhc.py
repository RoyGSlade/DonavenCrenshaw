#!/usr/bin/env python3
"""Stand-in for `lhcmemorys` (request add / inbox approval / board add|note|attach).
Logs every call as one JSON line to $FAKE_LHC_LOG, including the contents of
--prompt-file / --preview-file and the positional arguments.
FAKE_LHC_FAIL=1 makes it exit 1. `board attach` exists only with FAKE_LHC_ATTACH=1
(the real CLI has no attach command yet; see README)."""
import json
import os
import sys

TWO_WORD = {"request", "inbox", "board"}


def main(argv):
    flags = {}
    positional = []
    sub = argv[:2]
    i = 2 if argv[:1] and argv[0] in TWO_WORD else 0
    while i < len(argv):
        if argv[i].startswith("--"):
            key = argv[i][2:]
            if i + 1 < len(argv) and not argv[i + 1].startswith("--"):
                flags[key] = argv[i + 1]
                i += 2
            else:
                flags[key] = True
                i += 1
        else:
            positional.append(argv[i])
            i += 1
    if sub == ["board", "attach"] and not os.environ.get("FAKE_LHC_ATTACH"):
        print("Error: No such command 'attach'.", file=sys.stderr)
        return 2
    if flags.get("help"):
        print("usage")
        return 0
    for key in ("prompt-file", "preview-file"):
        if key in flags:
            flags["_" + key + "-text"] = open(flags[key], encoding="utf-8").read()
    if sub == ["board", "attach"] and positional[1:]:
        flags["_attached-bytes"] = os.path.getsize(positional[1])
    log = os.environ.get("FAKE_LHC_LOG")
    if log:
        with open(log, "a", encoding="utf-8") as fh:
            fh.write(json.dumps({"cmd": sub, "flags": flags, "args": positional}) + "\n")
    if os.environ.get("FAKE_LHC_FAIL"):
        print("boom", file=sys.stderr)
        return 1
    if sub == ["board", "note"]:
        print("comment posted on ab12")
        return 0
    print(json.dumps({"id": "fake-" + "-".join(sub), "shortid": "ab12"}))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
