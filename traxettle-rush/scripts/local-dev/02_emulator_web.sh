#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)"
FLAGS_FILE="$ROOT_DIR/scripts/local-dev/.runtime.env"

DEV_TIER="free"
DEV_REAL_PAYMENTS="false"
if [[ -f "$FLAGS_FILE" ]]; then
  # shellcheck disable=SC1090
  source "$FLAGS_FILE"
fi

echo "[local-dev] mode=emulator+web tier=$DEV_TIER real_payments=$DEV_REAL_PAYMENTS"

if ! command -v java >/dev/null 2>&1; then
  echo "[local-dev] Java is required for Firebase emulators (JDK 21+)."
  exit 1
fi

run_rushx() {
  local project_dir="$1"
  local script_name="$2"
  cd "$project_dir"
  node "$ROOT_DIR/common/scripts/install-run-rushx.js" "$script_name"
}

cleanup() {
  kill 0 >/dev/null 2>&1 || true
}
trap cleanup EXIT INT TERM

(
  cd "$ROOT_DIR"
  sh scripts/firebase/start-emulators.sh
) &

(
  APP_ENV=local \
  PORT=3001 \
  INTERNAL_TIER_SWITCH_ENABLED=true \
  PAYMENT_ALLOW_REAL_IN_NON_PROD="$DEV_REAL_PAYMENTS" \
  FIREBASE_USE_EMULATOR=true \
  FIREBASE_PROJECT_ID=traxettle-local \
  FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 \
  FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 \
  STORAGE_EMULATOR_HOST=127.0.0.1:9199 \
  run_rushx "$ROOT_DIR/apps/api" dev
) &

(
  NEXT_PUBLIC_APP_ENV=local \
  NEXT_PUBLIC_API_URL=http://localhost:3001 \
  NEXT_PUBLIC_API_URL_EMULATOR=http://localhost:3001 \
  NEXT_PUBLIC_ALLOW_LOCAL_TIER_SWITCH=true \
  NEXT_PUBLIC_USE_REAL_PAYMENTS="$DEV_REAL_PAYMENTS" \
  run_rushx "$ROOT_DIR/apps/web" dev
) &

wait
