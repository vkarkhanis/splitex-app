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

echo "[local-dev] mode=real-firebase+mobile tier=$DEV_TIER real_payments=$DEV_REAL_PAYMENTS"

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
  APP_ENV=local \
  PORT=3001 \
  INTERNAL_TIER_SWITCH_ENABLED=true \
  PAYMENT_ALLOW_REAL_IN_NON_PROD="$DEV_REAL_PAYMENTS" \
  FIREBASE_USE_EMULATOR=false \
  run_rushx "$ROOT_DIR/apps/api" dev
) &

(
  EXPO_PUBLIC_APP_ENV=local \
  EXPO_PUBLIC_API_URL_IOS=http://localhost:3001 \
  EXPO_PUBLIC_API_URL_ANDROID=http://10.0.2.2:3001 \
  EXPO_PUBLIC_INTERNAL_FEATURES_ENABLED=true \
  EXPO_PUBLIC_DEFAULT_TIER="$DEV_TIER" \
  EXPO_PUBLIC_USE_REAL_PAYMENTS="$DEV_REAL_PAYMENTS" \
  EXPO_PUBLIC_LOCAL_DEV_OPTIONS_ENABLED=true \
  run_rushx "$ROOT_DIR/apps/mobile" start
) &

wait
