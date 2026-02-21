#!/usr/bin/env sh
set -eu

MODE="${1:-normal}"
ROOT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)"
REPO_ROOT="$(CDPATH= cd -- "$ROOT_DIR/../.." && pwd)"
MAESTRO_BIN="${MAESTRO_BIN:-$HOME/.maestro/bin/maestro}"
USE_FIREBASE_EMULATOR="${MAESTRO_USE_FIREBASE_EMULATOR:-true}"
EMULATOR_PROJECT_ID="${FIREBASE_PROJECT_ID:-splitex-local}"
EMULATOR_IMPORT_DIR="${FIREBASE_EMULATOR_IMPORT_DIR:-$ROOT_DIR/maestro/.firebase-data}"
EMULATOR_LOG="$ROOT_DIR/maestro/artifacts/firebase-emulator.log"
API_LOG="$ROOT_DIR/maestro/artifacts/maestro-api.log"
API_PORT="${MAESTRO_API_PORT:-3001}"
MANAGE_API="${MAESTRO_MANAGE_API:-true}"
API_PID=""
EMULATOR_PID=""

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

stop_backgrounds() {
  if [ -n "$API_PID" ]; then
    kill "$API_PID" >/dev/null 2>&1 || true
  fi
  if [ -n "$EMULATOR_PID" ]; then
    kill "$EMULATOR_PID" >/dev/null 2>&1 || true
  fi
}

trap stop_backgrounds EXIT INT TERM

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
    rushx dev
  ) >"$API_LOG" 2>&1 &
  API_PID=$!

  if ! wait_for_http "http://127.0.0.1:$API_PORT/health" 45; then
    echo "[maestro-runner] API did not become healthy in time"
    exit 1
  fi
fi

echo "[maestro-runner] cleanup before run"
node "$ROOT_DIR/maestro/scripts/cleanup-firebase-maestro.js" || true

STATUS=0
if [ "$MODE" = "artifacts" ]; then
  if [ "$USE_DEVICE" -eq 1 ]; then
    "$MAESTRO_BIN" test --device "$MAESTRO_DEVICE" "$ROOT_DIR/maestro/flows/auth" "$ROOT_DIR/maestro/flows/settlement" \
      --debug-output "$ROOT_DIR/maestro/artifacts" \
      --format junit \
      --output "$ROOT_DIR/maestro/artifacts/junit.xml" || STATUS=$?
  else
    "$MAESTRO_BIN" test "$ROOT_DIR/maestro/flows/auth" "$ROOT_DIR/maestro/flows/settlement" \
      --debug-output "$ROOT_DIR/maestro/artifacts" \
      --format junit \
      --output "$ROOT_DIR/maestro/artifacts/junit.xml" || STATUS=$?
  fi
else
  if [ "$USE_DEVICE" -eq 1 ]; then
    "$MAESTRO_BIN" test --device "$MAESTRO_DEVICE" "$ROOT_DIR/maestro/flows/auth" "$ROOT_DIR/maestro/flows/settlement" || STATUS=$?
  else
    "$MAESTRO_BIN" test "$ROOT_DIR/maestro/flows/auth" "$ROOT_DIR/maestro/flows/settlement" || STATUS=$?
  fi
fi

echo "[maestro-runner] cleanup after run"
node "$ROOT_DIR/maestro/scripts/cleanup-firebase-maestro.js" || true

exit "$STATUS"
