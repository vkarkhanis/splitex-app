#!/usr/bin/env sh
set -eu

MODE="${1:-normal}"
ROOT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)"
REPO_ROOT="$(CDPATH= cd -- "$ROOT_DIR/../.." && pwd)"
MAESTRO_BIN="${MAESTRO_BIN:-$HOME/.maestro/bin/maestro}"
USE_FIREBASE_EMULATOR="${MAESTRO_USE_FIREBASE_EMULATOR:-true}"
EMULATOR_PROJECT_ID="${FIREBASE_PROJECT_ID:-traxettle-local}"
EMULATOR_IMPORT_DIR="${FIREBASE_EMULATOR_IMPORT_DIR:-$ROOT_DIR/maestro/.firebase-data}"
EMULATOR_LOG="$ROOT_DIR/maestro/artifacts/firebase-emulator.log"
API_LOG="$ROOT_DIR/maestro/artifacts/maestro-api.log"
API_PORT="${MAESTRO_API_PORT:-3001}"
MANAGE_API="${MAESTRO_MANAGE_API:-true}"
API_PID=""
EMULATOR_PID=""
METRO_PID=""
METRO_LOG="$ROOT_DIR/maestro/artifacts/maestro-metro.log"
# Metro serves the Debug test app's JavaScript (see build-test-app.sh).
MANAGE_METRO="${MAESTRO_MANAGE_METRO:-true}"

export FIREBASE_USE_EMULATOR="$USE_FIREBASE_EMULATOR"
export FIREBASE_PROJECT_ID="$EMULATOR_PROJECT_ID"
export FIREBASE_AUTH_EMULATOR_HOST="${FIREBASE_AUTH_EMULATOR_HOST:-127.0.0.1:9099}"
export FIRESTORE_EMULATOR_HOST="${FIRESTORE_EMULATOR_HOST:-127.0.0.1:8080}"
export STORAGE_EMULATOR_HOST="${STORAGE_EMULATOR_HOST:-127.0.0.1:9199}"

if [ -n "${MAESTRO_DEVICE:-}" ]; then
  USE_DEVICE=1
else
  USE_DEVICE=0
fi

mkdir -p "$ROOT_DIR/maestro/artifacts" "$EMULATOR_IMPORT_DIR"

command_exists() {
  command -v "$1" >/dev/null 2>&1
}

wait_for_http() {
  URL="$1"
  ATTEMPTS="${2:-30}"
  i=0
  while [ "$i" -lt "$ATTEMPTS" ]; do
    if command_exists curl && curl -sSf "$URL" >/dev/null 2>&1; then
      return 0
    fi
    i=$((i + 1))
    sleep 1
  done
  return 1
}

# Kill a background server with everything it started (npm -> ts-node, firebase -> java), so no
# stale API or emulator is left on the ports for the next run.
kill_tree() {
  for child in $(pgrep -P "$1" 2>/dev/null); do kill_tree "$child"; done
  kill "$1" >/dev/null 2>&1 || true
}

stop_backgrounds() {
  if [ -n "$API_PID" ]; then kill_tree "$API_PID"; fi
  if [ -n "$METRO_PID" ]; then
    kill_tree "$METRO_PID"
    pkill -f "expo start --port 8081" >/dev/null 2>&1 || true
  fi
  # Last, so the emulators can export their data on exit.
  if [ -n "$EMULATOR_PID" ]; then kill_tree "$EMULATOR_PID"; fi
}

trap stop_backgrounds EXIT INT TERM

# A server left over from an earlier run would answer the health checks instead of this run's, and
# the safety check reads this run's API log, so refuse to start over one.
BUSY=""
MANAGED_PORTS=""
if [ "$MANAGE_API" = "true" ]; then MANAGED_PORTS="$API_PORT"; fi
if [ "$MANAGE_METRO" = "true" ]; then MANAGED_PORTS="$MANAGED_PORTS 8081"; fi
for port in $MANAGED_PORTS; do
  if lsof -ti "tcp:$port" -sTCP:LISTEN >/dev/null 2>&1; then BUSY="$BUSY $port"; fi
done
if [ "$USE_FIREBASE_EMULATOR" = "true" ]; then
  for port in 8080 9099 9199; do
    if lsof -ti "tcp:$port" -sTCP:LISTEN >/dev/null 2>&1; then BUSY="$BUSY $port"; fi
  done
fi
if [ -n "$BUSY" ]; then
  echo "[maestro-runner] STOP: something is already listening on port(s)$BUSY (an earlier run or your own servers)."
  echo "[maestro-runner] Stop it first, e.g.: lsof -ti tcp:<port> -sTCP:LISTEN | xargs kill"
  exit 1
fi

# The Firebase emulators need JDK 21+. If the Java on PATH is older and Homebrew's openjdk@21 is
# installed, use that for this run (your JAVA_HOME may point at an older JDK, e.g. Android Studio's).
java_major() { java -version 2>&1 | head -n 1 | sed -E 's/.*version "([0-9]+)(\.[0-9]+.*)?".*/\1/'; }
if [ "$USE_FIREBASE_EMULATOR" = "true" ] && [ -x /opt/homebrew/opt/openjdk@21/bin/java ]; then
  CURRENT_JAVA="$(java_major 2>/dev/null || echo 0)"
  if [ -z "$CURRENT_JAVA" ] || [ "$CURRENT_JAVA" -lt 21 ] 2>/dev/null; then
    export JAVA_HOME=/opt/homebrew/opt/openjdk@21
    export PATH="$JAVA_HOME/bin:$PATH"
  fi
fi

if [ "$USE_FIREBASE_EMULATOR" = "true" ]; then
  if ! command_exists java; then
    echo "[maestro-runner] ERROR: Java is required. Install JDK 21+ and retry."
    exit 1
  fi

  JAVA_VERSION_LINE="$(java -version 2>&1 | head -n 1)"
  JAVA_MAJOR="$(echo "$JAVA_VERSION_LINE" | sed -E 's/.*version "([0-9]+)(\.[0-9]+.*)?".*/\1/')"
  if [ -z "$JAVA_MAJOR" ] || [ "$JAVA_MAJOR" -lt 21 ]; then
    echo "[maestro-runner] ERROR: Detected Java version is not supported: $JAVA_VERSION_LINE"
    echo "[maestro-runner] Firebase emulator requires JDK 21 or newer."
    exit 1
  fi

  echo "[maestro-runner] starting Firebase Local Emulator Suite"
  if command_exists firebase; then
    FIREBASE_BIN="firebase"
  elif command_exists npx; then
    FIREBASE_BIN="npx --yes firebase-tools"
  elif command_exists pnpm; then
    FIREBASE_BIN="pnpm dlx firebase-tools"
  else
    echo "[maestro-runner] ERROR: firebase CLI not found and neither npx nor pnpm is available."
    exit 1
  fi
  (
    cd "$REPO_ROOT"
    sh -c "$FIREBASE_BIN emulators:start --project \"$EMULATOR_PROJECT_ID\" --only auth,firestore,storage --import \"$EMULATOR_IMPORT_DIR\" --export-on-exit \"$EMULATOR_IMPORT_DIR\""
  ) >"$EMULATOR_LOG" 2>&1 &
  EMULATOR_PID=$!

  if ! wait_for_http "http://127.0.0.1:8080/" 45; then
    echo "[maestro-runner] firestore emulator did not start in time"
    exit 1
  fi
  echo "[maestro-runner] firebase emulators ready"
fi

if [ "$MANAGE_API" = "true" ]; then
  echo "[maestro-runner] starting local API for Maestro on port $API_PORT"
  (
    cd "$REPO_ROOT/apps/api"
    APP_ENV=local \
    PORT="$API_PORT" \
    FIREBASE_USE_EMULATOR="$USE_FIREBASE_EMULATOR" \
    FIREBASE_PROJECT_ID="$EMULATOR_PROJECT_ID" \
    FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 \
    FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 \
    STORAGE_EMULATOR_HOST=127.0.0.1:9199 \
    PAYMENT_ALLOW_REAL_IN_NON_PROD=false \
    INTERNAL_TIER_SWITCH_ENABLED=true \
    npm run dev
  ) >"$API_LOG" 2>&1 &
  API_PID=$!

  if ! wait_for_http "http://127.0.0.1:$API_PORT/health" 45; then
    echo "[maestro-runner] API did not become healthy in time"
    exit 1
  fi
fi

if [ "$MANAGE_METRO" = "true" ]; then
  echo "[maestro-runner] starting Metro for the Debug test app"
  (
    cd "$ROOT_DIR"
    CI=1 \
    EXPO_PUBLIC_E2E=true \
    EXPO_PUBLIC_APP_ENV=local \
    EXPO_PUBLIC_API_URL_IOS="http://localhost:$API_PORT" \
    EXPO_PUBLIC_API_URL_ANDROID="http://10.0.2.2:$API_PORT" \
    EXPO_PUBLIC_API_URL_EMULATOR_IOS="http://localhost:$API_PORT" \
    EXPO_PUBLIC_API_URL_EMULATOR_ANDROID="http://10.0.2.2:$API_PORT" \
    EXPO_PUBLIC_FIREBASE_USE_EMULATOR="$USE_FIREBASE_EMULATOR" \
    EXPO_PUBLIC_INTERNAL_FEATURES_ENABLED=true \
    EXPO_PUBLIC_DEFAULT_TIER=free \
    EXPO_PUBLIC_USE_REAL_PAYMENTS=false \
    EXPO_PUBLIC_LOCAL_DEV_OPTIONS_ENABLED=true \
    npx expo start --port 8081
  ) >"$METRO_LOG" 2>&1 &
  METRO_PID=$!
  if ! wait_for_http "http://127.0.0.1:8081/status" 120; then
    echo "[maestro-runner] Metro did not start in time (see $METRO_LOG)"
    exit 1
  fi
fi

DEVICE_ARGS=""
if [ "$USE_DEVICE" -eq 1 ]; then DEVICE_ARGS="--device $MAESTRO_DEVICE"; fi

# Safety check before any flow runs: the app must be talking to the local API. A test app wired to
# staging or production would otherwise create test data there (this happened on 2026-11-24).
# The preflight only tries to sign in as a made-up account, which changes nothing anywhere.
if [ "${MAESTRO_SKIP_BACKEND_CHECK:-false}" != "true" ]; then
  if [ "$MANAGE_API" != "true" ] || [ ! -f "$API_LOG" ]; then
    echo "[maestro-runner] STOP: can't confirm the app uses the local API (the runner didn't start it)."
    echo "[maestro-runner] Let the runner start the API, or set MAESTRO_SKIP_BACKEND_CHECK=true if you're sure."
    exit 1
  fi
  BEFORE=$(grep -c "/api/auth/login" "$API_LOG" || true)
  # shellcheck disable=SC2086
  "$MAESTRO_BIN" test $DEVICE_ARGS -e EMAIL="preflight${RUN_ID:-0}@example.com" "$ROOT_DIR/maestro/preflight.yaml" || true
  AFTER=$(grep -c "/api/auth/login" "$API_LOG" || true)
  if [ "$AFTER" -le "$BEFORE" ]; then
    echo "[maestro-runner] STOP: the app's sign-in attempt didn't reach the local API on port $API_PORT."
    echo "[maestro-runner] The installed app may point at staging or production. Install the Debug test app:"
    echo "[maestro-runner]   bash apps/mobile/maestro/scripts/build-test-app.sh ios   (or android)"
    exit 1
  fi
  echo "[maestro-runner] preflight passed: the app talks to the local API"
fi

echo "[maestro-runner] cleanup before run"
node "$ROOT_DIR/maestro/scripts/cleanup-firebase-maestro.js" || true

STATUS=0
# Every flow under maestro/flows (flows/config.yaml includes the subfolders), or the folders/files
# in MAESTRO_FLOWS, space-separated and relative to maestro/flows.
if [ -n "${MAESTRO_FLOWS:-}" ]; then
  FLOW_ARGS=""
  for f in $MAESTRO_FLOWS; do FLOW_ARGS="$FLOW_ARGS $ROOT_DIR/maestro/flows/$f"; done
else
  FLOW_ARGS="$ROOT_DIR/maestro/flows"
fi
# --config: Maestro only reads flows/config.yaml by itself when given the whole folder, and it holds
# settings every run needs (see the file).
if [ "$MODE" = "artifacts" ]; then
  # shellcheck disable=SC2086
  "$MAESTRO_BIN" test $DEVICE_ARGS -e AUTH_EMULATOR="http://$FIREBASE_AUTH_EMULATOR_HOST" --config "$ROOT_DIR/maestro/flows/config.yaml" $FLOW_ARGS \
    --debug-output "$ROOT_DIR/maestro/artifacts" \
    --format junit \
    --output "$ROOT_DIR/maestro/artifacts/junit.xml" || STATUS=$?
else
  # shellcheck disable=SC2086
  "$MAESTRO_BIN" test $DEVICE_ARGS -e AUTH_EMULATOR="http://$FIREBASE_AUTH_EMULATOR_HOST" --config "$ROOT_DIR/maestro/flows/config.yaml" $FLOW_ARGS || STATUS=$?
fi

echo "[maestro-runner] cleanup after run"
node "$ROOT_DIR/maestro/scripts/cleanup-firebase-maestro.js" || true

exit "$STATUS"
