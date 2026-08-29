#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────────────────────
# bump-version.sh — Sync the app version across all sources of truth.
#
# Updates, in one shot:
#   - apps/mobile/package.json        -> "version"
#   - apps/mobile/app.json            -> expo.version
#   - android/app/build.gradle        -> versionName  (+ auto-increments versionCode)
#
# Usage:
#   ./scripts/bump-version.sh 1.0.34            # set explicit version name
#   ./scripts/bump-version.sh patch             # 1.0.33 -> 1.0.34
#   ./scripts/bump-version.sh minor             # 1.0.33 -> 1.1.0
#   ./scripts/bump-version.sh major             # 1.0.33 -> 2.0.0
#   ./scripts/bump-version.sh patch --build     # bump, then run production AAB build
#   ./scripts/bump-version.sh 1.0.34 --code 40  # also set an explicit versionCode
#
# versionCode is ALWAYS increased (current + 1) unless --code is given, because
# Google Play rejects uploads that reuse a versionCode.
# ──────────────────────────────────────────────────────────────────────────────

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
MOBILE_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
GRADLE_FILE="$MOBILE_DIR/android/app/build.gradle"
APP_JSON="$MOBILE_DIR/app.json"
PKG_JSON="$MOBILE_DIR/package.json"

RED='\033[0;31m'; GREEN='\033[0;32m'; CYAN='\033[0;36m'; YELLOW='\033[1;33m'; NC='\033[0m'
info()  { echo -e "${CYAN}ℹ ${NC}$1"; }
ok()    { echo -e "${GREEN}✅${NC} $1"; }
warn()  { echo -e "${YELLOW}⚠️ ${NC}$1"; }
fail()  { echo -e "${RED}❌${NC} $1"; exit 1; }

BUMP_ARG="${1:-}"
[ -z "$BUMP_ARG" ] && fail "Usage: ./scripts/bump-version.sh <version|patch|minor|major> [--build] [--code N]"

DO_BUILD=false
EXPLICIT_CODE=""
shift || true
while [ $# -gt 0 ]; do
  case "$1" in
    --build) DO_BUILD=true ;;
    --code)  shift; EXPLICIT_CODE="${1:-}" ;;
    *) fail "Unknown option: $1" ;;
  esac
  shift || true
done

[ -f "$GRADLE_FILE" ] || fail "Not found: $GRADLE_FILE (run prebuild first)"
[ -f "$APP_JSON" ]    || fail "Not found: $APP_JSON"
[ -f "$PKG_JSON" ]    || fail "Not found: $PKG_JSON"

# ── Read current values from build.gradle (source of truth for native) ────────
CUR_NAME="$(grep -E 'versionName' "$GRADLE_FILE" | head -1 | sed -E 's/.*versionName[[:space:]]+"([^"]+)".*/\1/')"
CUR_CODE="$(grep -E 'versionCode'  "$GRADLE_FILE" | head -1 | sed -E 's/.*versionCode[[:space:]]+([0-9]+).*/\1/')"

[ -n "$CUR_NAME" ] || fail "Could not parse current versionName from build.gradle"
[ -n "$CUR_CODE" ] || fail "Could not parse current versionCode from build.gradle"

info "Current: versionName=$CUR_NAME  versionCode=$CUR_CODE"

# ── Compute new versionName ───────────────────────────────────────────────────
case "$BUMP_ARG" in
  patch|minor|major)
    IFS='.' read -r MA MI PA <<< "$CUR_NAME"
    MA=${MA:-0}; MI=${MI:-0}; PA=${PA:-0}
    case "$BUMP_ARG" in
      patch) PA=$((PA + 1)) ;;
      minor) MI=$((MI + 1)); PA=0 ;;
      major) MA=$((MA + 1)); MI=0; PA=0 ;;
    esac
    NEW_NAME="$MA.$MI.$PA"
    ;;
  *)
    echo "$BUMP_ARG" | grep -Eq '^[0-9]+\.[0-9]+\.[0-9]+$' \
      || fail "Version must be semver (x.y.z) or one of: patch|minor|major"
    NEW_NAME="$BUMP_ARG"
    ;;
esac

# ── Compute new versionCode ───────────────────────────────────────────────────
if [ -n "$EXPLICIT_CODE" ]; then
  echo "$EXPLICIT_CODE" | grep -Eq '^[0-9]+$' || fail "--code must be an integer"
  NEW_CODE="$EXPLICIT_CODE"
else
  NEW_CODE=$((CUR_CODE + 1))
fi

ok "New:     versionName=$NEW_NAME  versionCode=$NEW_CODE"

# ── Apply edits ───────────────────────────────────────────────────────────────
# build.gradle (perl -i for cross-platform in-place edit)
perl -0pi -e "s/versionCode\s+[0-9]+/versionCode $NEW_CODE/" "$GRADLE_FILE"
perl -0pi -e "s/versionName\s+\"[^\"]+\"/versionName \"$NEW_NAME\"/" "$GRADLE_FILE"
ok "Updated android/app/build.gradle"

# app.json and package.json via python (safe JSON edit, preserves structure)
python3 - "$APP_JSON" "$PKG_JSON" "$NEW_NAME" <<'PY'
import json, sys
app_json, pkg_json, new_name = sys.argv[1], sys.argv[2], sys.argv[3]
with open(app_json) as f: app = json.load(f)
app.setdefault("expo", {})["version"] = new_name
with open(app_json, "w") as f: json.dump(app, f, indent=2, ensure_ascii=False); f.write("\n")
with open(pkg_json) as f: pkg = json.load(f)
pkg["version"] = new_name
with open(pkg_json, "w") as f: json.dump(pkg, f, indent=2, ensure_ascii=False); f.write("\n")
PY
ok "Updated app.json (expo.version) and package.json (version)"

echo ""
ok "Version bumped: $CUR_NAME ($CUR_CODE) -> $NEW_NAME ($NEW_CODE)"
echo ""

if [ "$DO_BUILD" = true ]; then
  info "Starting production Android build..."
  bash "$SCRIPT_DIR/build-android.sh" production
else
  echo "Next steps:"
  echo "  - Review changes:  git diff"
  echo "  - Build AAB:       npm run build:android:production"
  echo "  - Or bump+build:   ./scripts/bump-version.sh $BUMP_ARG --build"
fi
