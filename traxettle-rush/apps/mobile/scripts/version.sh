#!/usr/bin/env bash
# version.sh — one app version for iOS and Android. See scripts/version.mts for the rules.
#
#   bash scripts/version.sh                  # what's current and what the next builds get
#   bash scripts/version.sh bump minor       # start a feature release (or patch | major | x.y.z)
#
# build-ios.sh testflight and build-android.sh production run `prepare` and `record` themselves.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

# Node runs the TypeScript directly (type stripping): 22.18+ or 23.6+; the repo pins Node 24.
if ! node -e 'process.exit(process.features.typescript ? 0 : 1)' 2>/dev/null; then
  echo "❌ Node $(node -v) can't run scripts/version.mts. Use Node 22.18 or newer (the repo pins Node 24)." >&2
  exit 1
fi

exec node --disable-warning=ExperimentalWarning "$SCRIPT_DIR/version.mts" "$@"
