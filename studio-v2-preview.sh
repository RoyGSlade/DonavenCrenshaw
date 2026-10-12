#!/usr/bin/env bash
# Track Studio v2 phone preview (not committed). Runs the v2 server from this
# worktree against a fresh COPY of the live studio data, bound to the tailnet IP,
# so the owner can open http://100.125.226.51:8790/studio/ on his phone.
#
# - The live checkout and its .studio-data are only read (copied), never written.
# - Off loopback the server checks every client with `tailscale whois` (--owner).
# - --preview: approvals are refused (this is a copy; nothing ships from here).
# - Requested 3D assets go to a temp queue unless KAUTO_QUEUE is set
#   (e.g. KAUTO_QUEUE=~/kauto-3d/queue to queue for real).
# - Board cards and refine requests use the real lhcmemorys (LHC=off disables).
#
# Stop it with Ctrl-C (or kill the PID it prints). Env overrides:
#   HOST PORT OWNER LIVE LHC REPO_TARGET KAUTO_QUEUE
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HOST="${HOST:-100.125.226.51}"
PORT="${PORT:-8790}"
OWNER="${OWNER:-donavencrenshaw@gmail.com}"
LIVE="${LIVE:-$HOME/homelab/apps/track-studio-site}"
LHC="${LHC:-$HOME/homelab/apps/LHCmemoryS/.venv/bin/lhcmemorys}"
REPO_TARGET="${REPO_TARGET:-$LIVE}"   # cards land on the board the owner already watches
CARD="${CARD:-bd0c263b}"

WORK="$(mktemp -d "${TMPDIR:-/tmp}/studio-v2-preview.XXXXXX")"
DATA="$WORK/studio-data"
QUEUE="${KAUTO_QUEUE:-$WORK/kauto-queue}"

if [ -d "$LIVE/.studio-data" ]; then
  cp -a "$LIVE/.studio-data" "$DATA"          # a copy: the live data is never touched
  rm -f "$DATA/.lock"
else
  mkdir -p "$DATA"
fi

args=(--root "$HERE" --data "$DATA" --host "$HOST" --port "$PORT" --owner "$OWNER"
      --repo-target "$REPO_TARGET" --card "$CARD" --refine-agent codex
      --asset-queue "$QUEUE" --preview)
if [ "$LHC" != "off" ] && [ -x "$LHC" ]; then args+=(--lhc "$LHC"); fi

echo "Track Studio v2 preview"
echo "  open:   http://$HOST:$PORT/studio/  (tailnet, owner $OWNER)"
echo "  data:   $DATA  (copy of $LIVE/.studio-data)"
echo "  queue:  $QUEUE"
echo "  lhc:    $([ "$LHC" != off ] && [ -x "$LHC" ] && echo "$LHC" || echo off)"
exec python3 "$HERE/tools/track-studio/server.py" "${args[@]}"
