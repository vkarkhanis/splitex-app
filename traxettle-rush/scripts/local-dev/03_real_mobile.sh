#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────────────────────
# 03_real_mobile.sh — Run mobile app + API against real Firebase
#
# Usage:
#   ./scripts/local-dev/03_real_mobile.sh [local|staging]
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
REAL_DEVICE_API_HOST="${REAL_DEVICE_API_HOST:-${EXPO_PUBLIC_API_URL:-}}"

DEV_TIER="free"
DEV_REAL_PAYMENTS="false"
if [[ -f "$FLAGS_FILE" ]]; then
  # shellcheck disable=SC1090
  source "$FLAGS_FILE"
fi

echo "[local-dev] mode=real-firebase+mobile env=$FIREBASE_ENV tier=$DEV_TIER real_payments=$DEV_REAL_PAYMENTS"

# ── Bootstrap: validate & copy Firebase config files ──
sh "$ROOT_DIR/scripts/local-dev/bootstrap.sh" "$FIREBASE_ENV"

# ── Detect environment switch → warn about native rebuild ──
LAST_ENV_FILE="$ROOT_DIR/scripts/local-dev/.last-mobile-env"
NEEDS_REBUILD=false
if [[ -f "$LAST_ENV_FILE" ]]; then
  LAST_ENV="$(cat "$LAST_ENV_FILE")"
  if [[ "$LAST_ENV" != "$FIREBASE_ENV" ]]; then
    NEEDS_REBUILD=true
  fi
fi
echo "$FIREBASE_ENV" > "$LAST_ENV_FILE"

if [[ "$NEEDS_REBUILD" == "true" ]]; then
  echo ""
  echo "╔══════════════════════════════════════════════════════════════════╗"
  echo "║  ⚠  ENVIRONMENT SWITCHED ($LAST_ENV → $FIREBASE_ENV)          "
  echo "║                                                                  ║"
  echo "║  google-services.json changed. You MUST rebuild the native app:  ║"
  echo "║    cd apps/mobile && npx expo run:android                        ║"
  echo "║                                                                  ║"
  echo "║  Without a rebuild, Google Sign-In will fail (DEVELOPER_ERROR).  ║"
  echo "╚══════════════════════════════════════════════════════════════════╝"
  echo ""
  read -r -p "Press Enter to continue (Metro only) or Ctrl+C to stop and rebuild first... "
fi

[ -f "$RC_LOADER" ] || { echo "[local-dev] Missing RevenueCat loader: $RC_LOADER"; exit 1; }
source "$RC_LOADER" local

# Source extracted Google client IDs
BOOTSTRAP_ENV="$ROOT_DIR/scripts/local-dev/.bootstrap.env"
if [[ -f "$BOOTSTRAP_ENV" ]]; then
  source "$BOOTSTRAP_ENV"
fi

# Source .env.local for payment keys and other secrets
ENV_LOCAL="$ROOT_DIR/.env.local"
if [[ -f "$ENV_LOCAL" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "$ENV_LOCAL"
  set +a
fi

resolve_api_url() {
  local explicit_url="$1"
  local fallback_url="$2"
  if [[ -n "$explicit_url" ]]; then
    printf "%s" "$explicit_url"
    return
  fi
  if [[ -n "$REAL_DEVICE_API_HOST" ]]; then
    if [[ "$REAL_DEVICE_API_HOST" == http://* || "$REAL_DEVICE_API_HOST" == https://* ]]; then
      printf "%s" "$REAL_DEVICE_API_HOST"
    else
      printf "http://%s:3001" "$REAL_DEVICE_API_HOST"
    fi
    return
  fi
  printf "%s" "$fallback_url"
}

IOS_API_URL="$(resolve_api_url "${EXPO_PUBLIC_API_URL_IOS:-}" "http://localhost:3001")"
ANDROID_API_URL="$(resolve_api_url "${EXPO_PUBLIC_API_URL_ANDROID:-}" "http://10.0.2.2:3001")"

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
  RAZORPAY_KEY_ID="${RAZORPAY_KEY_ID:-}" \
  RAZORPAY_KEY_SECRET="${RAZORPAY_KEY_SECRET:-}" \
  RAZORPAY_LIVE_APPROVED="${RAZORPAY_LIVE_APPROVED:-false}" \
  BILLDESK_LIVE_APPROVED="${BILLDESK_LIVE_APPROVED:-false}" \
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
  EXPO_PUBLIC_APP_ENV=local \
  EXPO_PUBLIC_API_URL_IOS="$IOS_API_URL" \
  EXPO_PUBLIC_API_URL_ANDROID="$ANDROID_API_URL" \
  EXPO_PUBLIC_INTERNAL_FEATURES_ENABLED=true \
  EXPO_PUBLIC_DEFAULT_TIER="$DEV_TIER" \
  EXPO_PUBLIC_USE_REAL_PAYMENTS="$DEV_REAL_PAYMENTS" \
  EXPO_PUBLIC_LOCAL_DEV_OPTIONS_ENABLED=true \
  EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID="${BOOTSTRAP_GOOGLE_IOS_CLIENT_ID:-}" \
  EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID="${BOOTSTRAP_GOOGLE_WEB_CLIENT_ID:-}" \
  EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID="${BOOTSTRAP_GOOGLE_ANDROID_CLIENT_ID:-}" \
  EXPO_PUBLIC_REVENUECAT_APPLE_KEY="${EXPO_PUBLIC_REVENUECAT_APPLE_KEY:-}" \
  EXPO_PUBLIC_REVENUECAT_GOOGLE_KEY="${EXPO_PUBLIC_REVENUECAT_GOOGLE_KEY:-}" \
  EXPO_PUBLIC_REVENUECAT_PRO_ENTITLEMENT="${EXPO_PUBLIC_REVENUECAT_PRO_ENTITLEMENT:-pro}" \
  EXPO_PUBLIC_REVENUECAT_OFFERING="${EXPO_PUBLIC_REVENUECAT_OFFERING:-default}" \
  run_rushx "$ROOT_DIR/apps/mobile" start
) &

wait
