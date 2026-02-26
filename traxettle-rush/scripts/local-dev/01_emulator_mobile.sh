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

echo "[local-dev] mode=emulator+mobile tier=$DEV_TIER real_payments=$DEV_REAL_PAYMENTS"

# ── Bootstrap: validate & copy Firebase config files ──
sh "$ROOT_DIR/scripts/local-dev/bootstrap.sh" local

# Source extracted Google client IDs
BOOTSTRAP_ENV="$ROOT_DIR/scripts/local-dev/.bootstrap.env"
if [[ -f "$BOOTSTRAP_ENV" ]]; then
  source "$BOOTSTRAP_ENV"
fi

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
  NODE_ENV=development \
  JWT_SECRET="${JWT_SECRET:-local-dev-jwt-secret-change-me}" \
  JWT_REFRESH_SECRET="${JWT_REFRESH_SECRET:-local-dev-jwt-refresh-secret-change-me}" \
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
  EXPO_PUBLIC_APP_ENV=local \
  EXPO_PUBLIC_API_URL_IOS=http://localhost:3001 \
  EXPO_PUBLIC_API_URL_ANDROID=http://10.0.2.2:3001 \
  EXPO_PUBLIC_API_URL_EMULATOR_IOS=http://localhost:3001 \
  EXPO_PUBLIC_API_URL_EMULATOR_ANDROID=http://10.0.2.2:3001 \
  EXPO_PUBLIC_INTERNAL_FEATURES_ENABLED=true \
  EXPO_PUBLIC_DEFAULT_TIER="$DEV_TIER" \
  EXPO_PUBLIC_USE_REAL_PAYMENTS="$DEV_REAL_PAYMENTS" \
  EXPO_PUBLIC_LOCAL_DEV_OPTIONS_ENABLED=true \
  EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID="${BOOTSTRAP_GOOGLE_IOS_CLIENT_ID:-}" \
  EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID="${BOOTSTRAP_GOOGLE_WEB_CLIENT_ID:-}" \
  run_rushx "$ROOT_DIR/apps/mobile" start
) &

wait
