#!/usr/bin/env python3
"""Stand-in for `tailscale whois --json <ip>`: answers with $FAKE_WHOIS_LOGIN as the
connecting user's LoginName. FAKE_WHOIS_LOGIN=FAIL exits 1 (not a tailnet peer).
Each call is appended to $FAKE_WHOIS_LOG when set."""
import json
import os
import sys


def main(argv):
    log = os.environ.get("FAKE_WHOIS_LOG")
    if log:
        with open(log, "a", encoding="utf-8") as fh:
            fh.write(json.dumps(argv) + "\n")
    login = os.environ.get("FAKE_WHOIS_LOGIN", "")
    if login == "FAIL" or not login:
        print("no peer", file=sys.stderr)
        return 1
    print(json.dumps({"Node": {"Name": "phone"}, "UserProfile": {"LoginName": login, "DisplayName": "Owner"}}))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
