#!/usr/bin/env bash
# build-ios.sh — iOS staging/production/debug builds with RevenueCat + env injection.
#
# Usage:
#   ./scripts/build-ios.sh staging
#   ./scripts/build-ios.sh production
#   ./scripts/build-ios.sh debug
#
# Notes:
# - `staging` / `production` use EAS Build (recommended for signed distribution).
# - `debug` builds and runs locally via Expo dev client.

set -euo pipefail

PROFILE="${1:-}"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
MOBILE_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
IOS_DIR="$MOBILE_DIR/ios"
RC_LOADER="$MOBILE_DIR/../../scripts/revenuecat/load-rc-config.sh"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

info()  { echo -e "${CYAN}ℹ ${NC}$1"; }
ok()    { echo -e "${GREEN}✅${NC} $1"; }
warn()  { echo -e "${YELLOW}⚠️ ${NC}$1"; }
fail()  { echo -e "${RED}❌${NC} $1"; exit 1; }

if [ -z "$PROFILE" ]; then
  echo "Usage: ./scripts/build-ios.sh <profile>"
  echo "Profiles: staging | production | debug"
  exit 1
fi

case "$PROFILE" in
  staging|production|debug) ;;
  *) fail "Unknown profile '$PROFILE'. Use: staging, production, or debug" ;;
esac

case "$PROFILE" in
  debug) RC_ENV="local" ;;
  staging) RC_ENV="staging" ;;
  production) RC_ENV="prod" ;;
esac

echo ""
echo "═══════════════════════════════════════════════════════════"
echo "  Traxettle iOS Build — $PROFILE"
echo "═══════════════════════════════════════════════════════════"
echo ""

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || fail "Missing command: $1"
}

require_cmd node
require_cmd bash
[ -f "$RC_LOADER" ] || fail "Missing RevenueCat loader: $RC_LOADER"
source "$RC_LOADER" "$RC_ENV"

if [ "$PROFILE" = "debug" ]; then
  if [ -z "${EXPO_PUBLIC_REVENUECAT_APPLE_KEY:-}" ]; then
    warn "EXPO_PUBLIC_REVENUECAT_APPLE_KEY is empty in rc_${RC_ENV}.properties — iOS Pro purchases won't work in this build."
  fi
else
  rc_require_nonempty EXPO_PUBLIC_REVENUECAT_APPLE_KEY
fi

case "$PROFILE" in
  staging)
    export EXPO_PUBLIC_APP_ENV="staging"
    export EXPO_PUBLIC_API_URL="https://traxettle-api-staging-lomxjapdhq-uc.a.run.app"
    export EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID="943648574702-n7h4msh3iho1187po0dnc8tja7insc89.apps.googleusercontent.com"
    export EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID="943648574702-0qk99r3oql0sv3k4h6cgluffdqs7letj.apps.googleusercontent.com"
    export EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID="943648574702-cvgj086ppdcbqgcagrekjs4pekn0q1ok.apps.googleusercontent.com"
    FIREBASE_ENV="staging"
    EAS_PROFILE="staging"
    ;;
  production)
    export EXPO_PUBLIC_APP_ENV="production"
    if [ -z "${EXPO_PUBLIC_API_URL:-}" ]; then
      warn "EXPO_PUBLIC_API_URL not set. Using staging API fallback."
      warn "Set it via: EXPO_PUBLIC_API_URL=https://your-prod-api.run.app ./scripts/build-ios.sh production"
      export EXPO_PUBLIC_API_URL="https://traxettle-api-staging-lomxjapdhq-uc.a.run.app"
    fi
    # Update with production OAuth client IDs once prod Firebase app is ready.
    export EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID="943648574702-n7h4msh3iho1187po0dnc8tja7insc89.apps.googleusercontent.com"
    export EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID="943648574702-0qk99r3oql0sv3k4h6cgluffdqs7letj.apps.googleusercontent.com"
    export EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID="943648574702-cvgj086ppdcbqgcagrekjs4pekn0q1ok.apps.googleusercontent.com"
    FIREBASE_ENV="staging"
    EAS_PROFILE="production"
    ;;
  debug)
    export EXPO_PUBLIC_APP_ENV="local"
    export EXPO_PUBLIC_API_URL_IOS="http://localhost:3001"
    export EXPO_PUBLIC_API_URL="http://localhost:3001"
    export EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID="603084161476-igddelh46pe5l2t0hajsl52da0rici6o.apps.googleusercontent.com"
    export EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID="603084161476-ii602klf0go223a0ve690kopl7u5e7a0.apps.googleusercontent.com"
    export EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID="603084161476-j4ht8hs7kk6tqqh273q2ks89udmdc3pe.apps.googleusercontent.com"
    FIREBASE_ENV="local"
    ;;
esac

PLIST_SRC="$MOBILE_DIR/GoogleService-Info.$FIREBASE_ENV.plist"
PLIST_FALLBACK="$MOBILE_DIR/GoogleService-Info.plist"
PLIST_DST="$IOS_DIR/Traxettle/GoogleService-Info.plist"

if [ -f "$PLIST_SRC" ]; then
  cp "$PLIST_SRC" "$PLIST_DST"
  cp "$PLIST_SRC" "$PLIST_FALLBACK"
  ok "GoogleService-Info.$FIREBASE_ENV.plist → ios/Traxettle/GoogleService-Info.plist"
elif [ -f "$PLIST_FALLBACK" ]; then
  cp "$PLIST_FALLBACK" "$PLIST_DST"
  warn "GoogleService-Info.$FIREBASE_ENV.plist not found — using GoogleService-Info.plist"
else
  fail "Missing iOS Firebase plist for env '$FIREBASE_ENV'"
fi

ENV_FILE="$MOBILE_DIR/.env"
ENV_FILE_EXISTED=false
[ -f "$ENV_FILE" ] && ENV_FILE_EXISTED=true && cp "$ENV_FILE" "$ENV_FILE.build-backup"
BUILD_ENV_TS="$MOBILE_DIR/src/config/buildEnv.ts"
BUILD_ENV_TS_EXISTED=false
[ -f "$BUILD_ENV_TS" ] && BUILD_ENV_TS_EXISTED=true && cp "$BUILD_ENV_TS" "$BUILD_ENV_TS.build-backup"

cat > "$ENV_FILE" <<EOF
EXPO_PUBLIC_APP_ENV=${EXPO_PUBLIC_APP_ENV}
EXPO_PUBLIC_API_URL=${EXPO_PUBLIC_API_URL:-}
EXPO_PUBLIC_API_URL_IOS=${EXPO_PUBLIC_API_URL_IOS:-}
EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID=${EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID}
EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID=${EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID}
EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID=${EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID}
EXPO_PUBLIC_REVENUECAT_GOOGLE_KEY=${EXPO_PUBLIC_REVENUECAT_GOOGLE_KEY:-}
EXPO_PUBLIC_REVENUECAT_APPLE_KEY=${EXPO_PUBLIC_REVENUECAT_APPLE_KEY:-}
EXPO_PUBLIC_REVENUECAT_PRO_ENTITLEMENT=${EXPO_PUBLIC_REVENUECAT_PRO_ENTITLEMENT:-pro}
EXPO_PUBLIC_REVENUECAT_OFFERING=${EXPO_PUBLIC_REVENUECAT_OFFERING:-default}
EOF
ok ".env written for iOS build"

cat > "$BUILD_ENV_TS" <<EOF
/**
 * Auto-generated by build-ios.sh for profile: $PROFILE
 * DO NOT COMMIT.
 */
export const BUILD_ENV = {
  REVENUECAT_APPLE_API_KEY: "${EXPO_PUBLIC_REVENUECAT_APPLE_KEY:-}",
  REVENUECAT_GOOGLE_API_KEY: "${EXPO_PUBLIC_REVENUECAT_GOOGLE_KEY:-}",
  REVENUECAT_PRO_ENTITLEMENT_ID: "${EXPO_PUBLIC_REVENUECAT_PRO_ENTITLEMENT:-pro}",
  REVENUECAT_OFFERING_ID: "${EXPO_PUBLIC_REVENUECAT_OFFERING:-default}",
} as const;
EOF
ok "buildEnv.ts written for release bundle fallback"

cleanup_env() {
  if [ "$ENV_FILE_EXISTED" = true ]; then
    mv "$ENV_FILE.build-backup" "$ENV_FILE"
  else
    rm -f "$ENV_FILE"
  fi
  if [ "$BUILD_ENV_TS_EXISTED" = true ]; then
    mv "$BUILD_ENV_TS.build-backup" "$BUILD_ENV_TS"
  else
    rm -f "$BUILD_ENV_TS"
  fi
}
trap cleanup_env EXIT

echo ""
if [ "$PROFILE" = "debug" ]; then
  require_cmd npx
  info "Starting local iOS debug build (Expo run:ios)."
  (
    cd "$MOBILE_DIR"
    npx expo run:ios --configuration Debug
  )
else
  require_cmd eas
  info "Starting EAS iOS build with profile '$EAS_PROFILE'."
  (
    cd "$MOBILE_DIR"
    eas build --platform ios --profile "$EAS_PROFILE"
  )
fi

echo ""
ok "iOS build command completed for profile: $PROFILE"
echo "═══════════════════════════════════════════════════════════"
echo ""
