#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────────────────────
# Capture the App Store screenshots on one iOS simulator:
#
#   bash apps/mobile/maestro/scripts/capture-screenshots.sh "<simulator name or UDID>" [portrait|landscape]
#
# 1. Checks the simulator has the Debug test app (build-test-app.sh), never a Release build.
# 2. Sets a clean status bar (9:41, full signal and battery); clears it again at the end.
# 3. Runs run-maestro.sh with the screenshot flows (maestro/screenshots), which starts the Firebase
#    emulators (on a fresh, throwaway data folder), the local API and Metro, runs the safety check that
#    the app talks to the local API, seeds the demo data (seed-screenshots.js), and takes the shots.
# 4. Works out the App Store size class from the images' pixel size, and copies them to
#    <repo root>/app-store-assets/<class>/ (an existing set there is moved to <class>.previous-<time>).
#
# Classes (App Store Connect "Screenshot specifications"):
#   iphone-6.3          1206×2622, 1179×2556   iPhone with Dynamic Island (medium display) — required
#   iphone-6.9          1320×2868, 1290×2796, 1260×2736   (large display) — optional
#   ipad-13             2064×2752, 2048×2732   iPad 13" — required when the app runs on iPad
#   iphone-duo-closed   1398×2034              iPhone Duo outer display
#   iphone-duo-open     2007×2853              iPhone Duo inner display
#   (landscape sizes are the same, swapped)
#
# Orientation: iPads default to landscape (as the 2026-11-04 set), everything else to portrait.
# Env: SCREENSHOTS_OUT (default <repo root>/app-store-assets), MAESTRO_API_PORT (default 3001),
# MAESTRO_MODE=artifacts (keep Maestro's logs in maestro/artifacts).
# ──────────────────────────────────────────────────────────────────────────────
set -euo pipefail

DEVICE_ARG="${1:-}"
ORIENTATION="${2:-}"
MAESTRO_DIR="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
REPO_TOP="$(git -C "$MAESTRO_DIR" rev-parse --show-toplevel)"
OUT_ROOT="${SCREENSHOTS_OUT:-$REPO_TOP/app-store-assets}"
APP_ID="com.traxettle.app"

if [[ -z "$DEVICE_ARG" ]]; then
  echo "Usage: $0 \"<simulator name or UDID>\" [portrait|landscape]"
  echo "Simulators:"; xcrun simctl list devices available | grep -E "iPhone|iPad" || true
  exit 2
fi
if [[ -n "$ORIENTATION" && "$ORIENTATION" != "portrait" && "$ORIENTATION" != "landscape" ]]; then
  echo "[screenshots] orientation must be portrait or landscape, not '$ORIENTATION'"
  exit 2
fi

# Name or UDID → UDID, name. The first available match.
DEVICE_LINE="$(xcrun simctl list devices available -j | node -e '
  const want = process.argv[1];
  const all = Object.values(JSON.parse(require("fs").readFileSync(0, "utf8")).devices).flat();
  const d = all.find((x) => x.udid === want) || all.find((x) => x.name === want);
  if (d) console.log(d.udid + "\t" + d.name);
' "$DEVICE_ARG")"
if [[ -z "$DEVICE_LINE" ]]; then
  echo "[screenshots] no available simulator named or with UDID '$DEVICE_ARG'"
  exit 1
fi
UDID="${DEVICE_LINE%%$'\t'*}"
DEVICE_NAME="${DEVICE_LINE#*$'\t'}"
if [[ -z "$ORIENTATION" ]]; then
  if [[ "$DEVICE_NAME" == *iPad* ]]; then ORIENTATION=landscape; else ORIENTATION=portrait; fi
fi
echo "[screenshots] $DEVICE_NAME ($UDID), $ORIENTATION"

# Maestro and the Firebase emulators need Java (21+ for the emulators), as in build-test-app.sh.
if [[ -z "${JAVA_HOME:-}" && -x /opt/homebrew/opt/openjdk@21/bin/java ]]; then
  export JAVA_HOME=/opt/homebrew/opt/openjdk@21
  export PATH="$JAVA_HOME/bin:$PATH"
fi

xcrun simctl bootstatus "$UDID" -b >/dev/null

# The app must be the Debug test app: a Release build talks to the production API. A Release build
# carries its JavaScript (main.jsbundle); the Debug test app loads it from Metro. run-maestro.sh's
# preflight checks again that the app reaches the local API.
APP_PATH="$(xcrun simctl get_app_container "$UDID" "$APP_ID" 2>/dev/null || true)"
if [[ -z "$APP_PATH" ]]; then
  echo "[screenshots] STOP: $APP_ID isn't installed on '$DEVICE_NAME'. Install the Debug test app first:"
  echo "[screenshots]   bash apps/mobile/maestro/scripts/build-test-app.sh ios \"$DEVICE_NAME\""
  exit 1
fi
if [[ -f "$APP_PATH/main.jsbundle" ]]; then
  echo "[screenshots] STOP: '$DEVICE_NAME' has a Release build of the app (it would use the production API)."
  echo "[screenshots] Install the Debug test app first:"
  echo "[screenshots]   bash apps/mobile/maestro/scripts/build-test-app.sh ios \"$DEVICE_NAME\""
  exit 1
fi

WORK="$(mktemp -d "${TMPDIR:-/tmp}/traxettle-screenshots.XXXXXX")"
clear_status_bar() { xcrun simctl status_bar "$UDID" clear >/dev/null 2>&1 || true; }
trap clear_status_bar EXIT
trap 'exit 130' INT TERM

# `simctl status_bar override` sometimes hangs (seen once on iOS 26.5; a retry worked): give each try
# 30 seconds.
override_status_bar() {
  xcrun simctl status_bar "$UDID" override \
    --time "9:41" \
    --dataNetwork wifi --wifiMode active --wifiBars 3 \
    --cellularMode active --cellularBars 4 --operatorName "" \
    --batteryState discharging --batteryLevel 100 &
  local pid=$! i
  for i in $(seq 1 30); do
    kill -0 "$pid" 2>/dev/null || { wait "$pid"; return $?; }
    sleep 1
  done
  kill "$pid" 2>/dev/null || true
  return 1
}
STATUS_BAR_SET=""
for attempt in 1 2 3; do
  if override_status_bar; then STATUS_BAR_SET=1; break; fi
  echo "[screenshots] setting the status bar timed out (attempt $attempt); retrying"
done
if [[ -z "$STATUS_BAR_SET" ]]; then
  echo "[screenshots] STOP: couldn't set the status bar (xcrun simctl status_bar). Try again, or restart the simulator."
  exit 1
fi

STATUS=0
MAESTRO_DEVICE="$UDID" \
MAESTRO_FLOWS_ROOT="$MAESTRO_DIR/screenshots" \
MAESTRO_TEST_OUTPUT_DIR="$WORK/maestro" \
MAESTRO_BEFORE_FLOWS="node '$MAESTRO_DIR/scripts/seed-screenshots.js'" \
MAESTRO_SHOTS_ORIENTATION="$ORIENTATION" \
FIREBASE_EMULATOR_IMPORT_DIR="$WORK/firebase-data" \
  sh "$MAESTRO_DIR/scripts/run-maestro.sh" "${MAESTRO_MODE:-normal}" || STATUS=$?

SHOTS=()
while IFS= read -r f; do SHOTS+=("$f"); done < <(find "$WORK/maestro" -path '*/takeScreenshot/*.png' 2>/dev/null | sort)
if [[ "$STATUS" -ne 0 || "${#SHOTS[@]}" -eq 0 ]]; then
  echo "[screenshots] FAILED (exit $STATUS, ${#SHOTS[@]} screenshots). Maestro's output: $WORK/maestro"
  exit 1
fi

# Upright pixels: a landscape screenshot comes with portrait pixels and an EXIF tag to turn them.
for f in "${SHOTS[@]}"; do
  case "$(node "$MAESTRO_DIR/scripts/png-orientation.js" "$f")" in
    1) ;;
    3) sips -r 180 "$f" >/dev/null ;;
    6) sips -r 90 "$f" >/dev/null ;;
    8) sips -r 270 "$f" >/dev/null ;;
    *) echo "[screenshots] STOP: $(basename "$f") has an EXIF orientation this script doesn't handle. Files: $WORK/maestro"; exit 1 ;;
  esac
done

# Size class from the pixel size; every image must be in the same one.
size_class() {
  case "$1" in
    1206x2622|2622x1206|1179x2556|2556x1179) echo iphone-6.3 ;;
    1320x2868|2868x1320|1290x2796|2796x1290|1260x2736|2736x1260) echo iphone-6.9 ;;
    2064x2752|2752x2064|2048x2732|2732x2048) echo ipad-13 ;;
    1398x2034|2034x1398) echo iphone-duo-closed ;;
    2007x2853|2853x2007) echo iphone-duo-open ;;
    *) echo "" ;;
  esac
}
CLASS=""
for f in "${SHOTS[@]}"; do
  W="$(sips -g pixelWidth "$f" | awk '/pixelWidth/ {print $2}')"
  H="$(sips -g pixelHeight "$f" | awk '/pixelHeight/ {print $2}')"
  C="$(size_class "${W}x${H}")"
  if [[ -z "$C" ]]; then
    echo "[screenshots] STOP: $(basename "$f") is ${W}x${H}, which isn't an App Store screenshot size. Files: $WORK/maestro"
    exit 1
  fi
  if [[ -n "$CLASS" && "$C" != "$CLASS" ]]; then
    echo "[screenshots] STOP: $(basename "$f") is $C but earlier shots are $CLASS (did the screen change mid-run?). Files: $WORK/maestro"
    exit 1
  fi
  CLASS="$C"
  if sips -g hasAlpha "$f" | grep -q "hasAlpha: yes"; then
    echo "[screenshots] STOP: $(basename "$f") has an alpha channel, which App Store Connect rejects. Files: $WORK/maestro"
    exit 1
  fi
done

DEST="$OUT_ROOT/$CLASS"
if [[ -d "$DEST" ]] && ls "$DEST"/*.png >/dev/null 2>&1; then
  KEEP="$DEST.previous-$(date +%Y%m%d-%H%M%S)"
  mv "$DEST" "$KEEP"
  echo "[screenshots] moved the earlier set to $KEEP"
fi
mkdir -p "$DEST"
for f in "${SHOTS[@]}"; do cp "$f" "$DEST/"; done
rm -rf "$WORK"
echo "[screenshots] ${#SHOTS[@]} screenshots ($CLASS, ${W}x${H}) in $DEST:"
ls -1 "$DEST"
