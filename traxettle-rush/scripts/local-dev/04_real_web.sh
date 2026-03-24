#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────────────────────
# 04_real_web.sh — Run web app + API against real Firebase
#
# Usage:
#   ./scripts/local-dev/04_real_web.sh [local|staging]
#   Default: local
# ──────────────────────────────────────────────────────────────────────────────
set -euo pipefail

FIREBASE_ENV="${1:-local}"
if [[ "$FIREBASE_ENV" != "local" && "$FIREBASE_ENV" != "staging" ]]; then
  echo "Usage: $0 [local|staging]"
  exit 1
fi

ROOT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)"
FLAGS_FILE="$ROOT_DIR/scripts/local-dev/.runtime.env"
RC_LOADER="$ROOT_DIR/scripts/revenuecat/load-rc-config.sh"

DEV_TIER="free"
DEV_REAL_PAYMENTS="false"
if [[ -f "$FLAGS_FILE" ]]; then
  # shellcheck disable=SC1090
  source "$FLAGS_FILE"
fi

echo "[local-dev] mode=real-firebase+web env=$FIREBASE_ENV tier=$DEV_TIER real_payments=$DEV_REAL_PAYMENTS"

# ── Bootstrap: validate & copy Firebase config files ──
sh "$ROOT_DIR/scripts/local-dev/bootstrap.sh" "$FIREBASE_ENV"

[ -f "$RC_LOADER" ] || { echo "[local-dev] Missing RevenueCat loader: $RC_LOADER"; exit 1; }
source "$RC_LOADER" local

# Source bootstrap-extracted config
BOOTSTRAP_ENV_FILE="$ROOT_DIR/scripts/local-dev/.bootstrap.env"
if [[ -f "$BOOTSTRAP_ENV_FILE" ]]; then
  source "$BOOTSTRAP_ENV_FILE"
fi

run_rushx() {
  local project_dir="$1"
  local script_name="$2"
  cd "$project_dir"
  node "$ROOT_DIR/tools/doctor-tool/scripts/install-run-rushx.js" "$script_name"
}

cleanup() {
  kill 0 >/dev/null 2>&1 || true
}
trap cleanup EXIT INT TERM

(
  APP_ENV=local \
  PORT=3001 \
  JWT_SECRET="${JWT_SECRET:-local-dev-jwt-secret-change-me}" \
  JWT_REFRESH_SECRET="${JWT_REFRESH_SECRET:-local-dev-jwt-refresh-secret-change-me}" \
  INTERNAL_TIER_SWITCH_ENABLED=true \
  PAYMENT_ALLOW_REAL_IN_NON_PROD="$DEV_REAL_PAYMENTS" \
  REVENUECAT_WEBHOOK_SECRET="${REVENUECAT_WEBHOOK_SECRET:-}" \
  REVENUECAT_PRO_ENTITLEMENT_ID="${REVENUECAT_PRO_ENTITLEMENT_ID:-pro}" \
  FIREBASE_USE_EMULATOR=false \
  FIREBASE_PRIVATE_KEY_FILE="${BOOTSTRAP_FIREBASE_SA_FILE:-fb-service-accounts/traxettle-fb-sa-test.json}" \
  FIREBASE_PROJECT_ID="${BOOTSTRAP_FIREBASE_PROJECT_ID:-traxettle-test}" \
  FIREBASE_STORAGE_BUCKET="${BOOTSTRAP_FIREBASE_STORAGE_BUCKET:-}" \
  FIREBASE_WEB_API_KEY="${BOOTSTRAP_FIREBASE_API_KEY:-}" \
  FIREBASE_AUTH_DOMAIN="${BOOTSTRAP_FIREBASE_AUTH_DOMAIN:-}" \
  FIREBASE_MESSAGING_SENDER_ID="${BOOTSTRAP_FIREBASE_MESSAGING_SENDER_ID:-}" \
  FIREBASE_APP_ID="${BOOTSTRAP_FIREBASE_APP_ID:-}" \
  run_rushx "$ROOT_DIR/apps/api" dev
) &

(
  NEXT_PUBLIC_APP_ENV=local \
  NEXT_PUBLIC_API_URL=http://localhost:3001 \
  NEXT_PUBLIC_ALLOW_LOCAL_TIER_SWITCH=true \
  NEXT_PUBLIC_USE_REAL_PAYMENTS="$DEV_REAL_PAYMENTS" \
  NEXT_PUBLIC_FIREBASE_API_KEY="${BOOTSTRAP_FIREBASE_API_KEY:-}" \
  NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN="${BOOTSTRAP_FIREBASE_AUTH_DOMAIN:-}" \
  NEXT_PUBLIC_FIREBASE_PROJECT_ID="${BOOTSTRAP_FIREBASE_PROJECT_ID:-}" \
  NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET="${BOOTSTRAP_FIREBASE_STORAGE_BUCKET:-}" \
  NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID="${BOOTSTRAP_FIREBASE_MESSAGING_SENDER_ID:-}" \
  NEXT_PUBLIC_FIREBASE_APP_ID="${BOOTSTRAP_FIREBASE_APP_ID:-}" \
  NEXT_PUBLIC_REVENUECAT_APPLE_KEY="${NEXT_PUBLIC_REVENUECAT_APPLE_KEY:-}" \
  NEXT_PUBLIC_REVENUECAT_GOOGLE_KEY="${NEXT_PUBLIC_REVENUECAT_GOOGLE_KEY:-}" \
  NEXT_PUBLIC_REVENUECAT_PRO_ENTITLEMENT="${NEXT_PUBLIC_REVENUECAT_PRO_ENTITLEMENT:-pro}" \
  NEXT_PUBLIC_REVENUECAT_OFFERING="${NEXT_PUBLIC_REVENUECAT_OFFERING:-default}" \
  run_rushx "$ROOT_DIR/apps/web" dev
) &

wait
