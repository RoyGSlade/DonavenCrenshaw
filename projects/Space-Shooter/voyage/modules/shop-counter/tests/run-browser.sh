#!/usr/bin/env bash
# One browser slot for everything: proofs at every size, then the browser test. Usage: tests/run-browser.sh <proofDir>
set -u
cd "$(dirname "$0")/.."
OUT="${1:-/tmp/sc/proof}"
node tests/proofs.mjs "$OUT" "" desktop,phone,laptop,landscape
node --test tests/browser.test.mjs
