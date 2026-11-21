#!/usr/bin/env bash
# One browser slot for everything. Usage: tests/run-browser.sh <proofDir>
set -u
cd "$(dirname "$0")/.."
OUT="${1:-/tmp/ralph/proof}"
node tests/proofs.mjs "$OUT" "" desktop,phone
node --test tests/browser.test.mjs
