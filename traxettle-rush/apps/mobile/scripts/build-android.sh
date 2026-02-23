#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────────────────────
# build-android.sh — Seamless Android staging & production builds
#
# Usage:
#   ./scripts/build-android.sh staging      # Internal testing (.aab)
#   ./scripts/build-android.sh production   # Play Store (.aab)
#   ./scripts/build-android.sh debug        # Debug APK (local testing)
#
# What it does automatically:
#   1. Validates prerequisites (google-services.json, keystore, signing creds)
#   2. Copies google-services.json → android/app/
#   3. Sets EXPO_PUBLIC_* env vars for the chosen profile
#   4. Runs the Gradle build (bundleRelease for .aab, assembleDebug for .apk)
#   5. Prints the output path
#
# Prerequisites:
#   - google-services.json in apps/mobile/ (gitignored)
#   - android/app/traxettle-release-key.keystore (gitignored)
#   - android/gradle.properties.local with signing credentials (gitignored)
#   - Node.js, Java 17+, Android SDK
# ──────────────────────────────────────────────────────────────────────────────

set -euo pipefail

PROFILE="${1:-}"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
MOBILE_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
ANDROID_DIR="$MOBILE_DIR/android"

# ── Colors ───────────────────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

info()  { echo -e "${CYAN}ℹ ${NC}$1"; }
ok()    { echo -e "${GREEN}✅${NC} $1"; }
warn()  { echo -e "${YELLOW}⚠️ ${NC}$1"; }
fail()  { echo -e "${RED}❌${NC} $1"; exit 1; }

# ── Validate profile ────────────────────────────────────────────────────────
if [ -z "$PROFILE" ]; then
  echo ""
  echo "Usage: ./scripts/build-android.sh <profile>"
  echo ""
  echo "Profiles:"
  echo "  staging      Internal testing build (.aab)"
  echo "  production   Play Store release build (.aab)"
  echo "  debug        Local debug build (.apk)"
  echo ""
  exit 1
fi

case "$PROFILE" in
  staging|production|debug) ;;
  *) fail "Unknown profile '$PROFILE'. Use: staging, production, or debug" ;;
esac

echo ""
echo "═══════════════════════════════════════════════════════════"
echo "  Traxettle Android Build — $PROFILE"
echo "═══════════════════════════════════════════════════════════"
echo ""

# ── Step 1: Validate prerequisites ──────────────────────────────────────────
info "Checking prerequisites..."

GOOGLE_SERVICES_SRC="$MOBILE_DIR/google-services.json"
GOOGLE_SERVICES_DST="$ANDROID_DIR/app/google-services.json"
KEYSTORE_FILE="$ANDROID_DIR/app/traxettle-release-key.keystore"
LOCAL_PROPS="$ANDROID_DIR/gradle.properties.local"

# google-services.json is required for all builds
if [ ! -f "$GOOGLE_SERVICES_SRC" ]; then
  fail "Missing: google-services.json
       Place your Firebase config at: $GOOGLE_SERVICES_SRC
       See google-services.json.example for the template."
fi

# Release builds need keystore + signing credentials
if [ "$PROFILE" != "debug" ]; then
  if [ ! -f "$KEYSTORE_FILE" ]; then
    fail "Missing: release keystore
         Place your keystore at: $KEYSTORE_FILE"
  fi
  if [ ! -f "$LOCAL_PROPS" ]; then
    fail "Missing: signing credentials
         Copy android/gradle.properties.local.example → android/gradle.properties.local
         and fill in your keystore password and alias."
  fi
  ok "Release keystore found"
  ok "Signing credentials found"
fi

ok "google-services.json found"

# ── Step 2: Copy google-services.json ────────────────────────────────────────
info "Copying google-services.json → android/app/"
cp "$GOOGLE_SERVICES_SRC" "$GOOGLE_SERVICES_DST"
ok "google-services.json placed"

# ── Step 3: Set environment variables ────────────────────────────────────────
info "Setting environment for profile: $PROFILE"

case "$PROFILE" in
  staging)
    export EXPO_PUBLIC_APP_ENV="staging"
    export EXPO_PUBLIC_API_URL="https://traxettle-api-staging-lomxjapdhq-uc.a.run.app"
    ;;
  production)
    export EXPO_PUBLIC_APP_ENV="production"
    if [ "${EXPO_PUBLIC_API_URL:-}" = "" ]; then
      warn "EXPO_PUBLIC_API_URL not set. Using staging API as fallback."
      warn "Set it via: EXPO_PUBLIC_API_URL=https://your-prod-api.run.app ./scripts/build-android.sh production"
      export EXPO_PUBLIC_API_URL="https://traxettle-api-staging-lomxjapdhq-uc.a.run.app"
    fi
    ;;
  debug)
    export EXPO_PUBLIC_APP_ENV="local"
    ;;
esac

ok "EXPO_PUBLIC_APP_ENV=$EXPO_PUBLIC_APP_ENV"
[ "$PROFILE" != "debug" ] && ok "EXPO_PUBLIC_API_URL=$EXPO_PUBLIC_API_URL"

# ── Step 4: Run Gradle build ────────────────────────────────────────────────
echo ""
info "Starting Gradle build..."
echo ""

cd "$ANDROID_DIR"

case "$PROFILE" in
  staging|production)
    GRADLE_TASK="app:bundleRelease"
    OUTPUT_DIR="$ANDROID_DIR/app/build/outputs/bundle/release"
    OUTPUT_FILE="app-release.aab"
    ;;
  debug)
    GRADLE_TASK="app:assembleDebug"
    OUTPUT_DIR="$ANDROID_DIR/app/build/outputs/apk/debug"
    OUTPUT_FILE="app-debug.apk"
    ;;
esac

./gradlew "$GRADLE_TASK" --no-daemon

echo ""
echo "═══════════════════════════════════════════════════════════"
ok "Build complete! ($PROFILE)"
echo ""
echo "  Output: $OUTPUT_DIR/$OUTPUT_FILE"
echo ""

if [ "$PROFILE" = "staging" ]; then
  echo "  Upload to Firebase App Distribution or install directly."
elif [ "$PROFILE" = "production" ]; then
  echo "  Upload to Google Play Console → Production track."
fi

echo "═══════════════════════════════════════════════════════════"
echo ""
