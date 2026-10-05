#!/usr/bin/env python3
"""Stand-in for `lhcmemorys` (request add / inbox approval). Logs every call as one
JSON line to $FAKE_LHC_LOG, including the contents of --prompt-file / --preview-file.
FAKE_LHC_FAIL=1 makes it exit 1."""
import json
import os
import sys


def main(argv):
    flags = {}
    i = 2 if argv[:1] == ["request"] or argv[:1] == ["inbox"] else 0
    sub = argv[:2]
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
            i += 1
    for key in ("prompt-file", "preview-file"):
        if key in flags:
            flags["_" + key + "-text"] = open(flags[key], encoding="utf-8").read()
    log = os.environ.get("FAKE_LHC_LOG")
    if log:
        with open(log, "a", encoding="utf-8") as fh:
            fh.write(json.dumps({"cmd": sub, "flags": flags}) + "\n")
    if os.environ.get("FAKE_LHC_FAIL"):
        print("boom", file=sys.stderr)
        return 1
    print(json.dumps({"id": "fake-" + "-".join(sub), "shortid": "ab12"}))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
