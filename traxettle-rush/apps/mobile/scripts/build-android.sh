#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────────────────────
# build-android.sh — Seamless Android staging & production builds
#
# Usage:
#   ./scripts/build-android.sh staging        # Release .aab → staging API
#   ./scripts/build-android.sh production     # Release .aab → production API
#   ./scripts/build-android.sh debug          # Debug APK → local API (needs Metro)
#   ./scripts/build-android.sh debug:staging  # Release APK → staging API (self-contained, no Metro)
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
  echo "  staging         Release .aab pointing to staging API"
  echo "  production      Release .aab pointing to production API"
  echo "  debug           Debug APK pointing to local API (needs Metro running)"
  echo "  debug:staging   Release APK pointing to staging API (self-contained, no Metro)"
  echo ""
  exit 1
fi

case "$PROFILE" in
  staging|production|debug|debug:staging) ;;
  *) fail "Unknown profile '$PROFILE'. Use: staging, production, debug, or debug:staging" ;;
esac

echo ""
echo "═══════════════════════════════════════════════════════════"
echo "  Traxettle Android Build — $PROFILE"
echo "═══════════════════════════════════════════════════════════"
echo ""

# ── Step 1: Validate prerequisites ──────────────────────────────────────────
info "Checking prerequisites..."

# Determine Firebase environment based on profile
case "$PROFILE" in
  debug)          FIREBASE_ENV="local" ;;
  *)              FIREBASE_ENV="staging" ;;
esac

GOOGLE_SERVICES_SRC="$MOBILE_DIR/google-services.$FIREBASE_ENV.json"
GOOGLE_SERVICES_FALLBACK="$MOBILE_DIR/google-services.json"
GOOGLE_SERVICES_DST="$ANDROID_DIR/app/google-services.json"
KEYSTORE_FILE="$ANDROID_DIR/app/traxettle-release-key.keystore"
LOCAL_PROPS="$ANDROID_DIR/gradle.properties.local"

# google-services.json is required for all builds
if [ -f "$GOOGLE_SERVICES_SRC" ]; then
  ok "google-services.$FIREBASE_ENV.json found"
elif [ -f "$GOOGLE_SERVICES_FALLBACK" ]; then
  GOOGLE_SERVICES_SRC="$GOOGLE_SERVICES_FALLBACK"
  warn "google-services.$FIREBASE_ENV.json not found — using google-services.json (fallback)"
else
  fail "Missing: google-services.$FIREBASE_ENV.json (or google-services.json)
       Download from Firebase Console → Project Settings → Android app."
fi

# Copy per-env debug keystore for debug builds
if [ "$PROFILE" = "debug" ]; then
  DEBUG_KS_SRC="$MOBILE_DIR/debug.keystore.$FIREBASE_ENV"
  DEBUG_KS_DST="$ANDROID_DIR/app/debug.keystore"
  if [ -f "$DEBUG_KS_SRC" ]; then
    cp "$DEBUG_KS_SRC" "$DEBUG_KS_DST"
    ok "debug.keystore.$FIREBASE_ENV → android/app/debug.keystore"
  else
    warn "debug.keystore.$FIREBASE_ENV not found — using existing debug.keystore (if any)"
  fi
fi

# Release builds (including debug:staging which uses assembleRelease) need keystore + signing credentials
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

# ── Step 2: Copy google-services.json ────────────────────────────────────────
info "Copying google-services.$FIREBASE_ENV.json → android/app/"
cp "$GOOGLE_SERVICES_SRC" "$GOOGLE_SERVICES_DST"
ok "google-services.json placed"

# ── Step 3: Set environment variables ────────────────────────────────────────
info "Setting environment for profile: $PROFILE"

case "$PROFILE" in
  staging|debug:staging)
    export EXPO_PUBLIC_APP_ENV="staging"
    export EXPO_PUBLIC_API_URL="https://traxettle-api-staging-lomxjapdhq-uc.a.run.app"
    # Google OAuth client IDs for traxettle-staging (943648574702)
    export EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID="943648574702-n7h4msh3iho1187po0dnc8tja7insc89.apps.googleusercontent.com"
    export EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID="943648574702-0qk99r3oql0sv3k4h6cgluffdqs7letj.apps.googleusercontent.com"
    export EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID="943648574702-cvgj086ppdcbqgcagrekjs4pekn0q1ok.apps.googleusercontent.com"
    ;;
  production)
    export EXPO_PUBLIC_APP_ENV="production"
    if [ "${EXPO_PUBLIC_API_URL:-}" = "" ]; then
      warn "EXPO_PUBLIC_API_URL not set. Using staging API as fallback."
      warn "Set it via: EXPO_PUBLIC_API_URL=https://your-prod-api.run.app ./scripts/build-android.sh production"
      export EXPO_PUBLIC_API_URL="https://traxettle-api-staging-lomxjapdhq-uc.a.run.app"
    fi
    # Google OAuth client IDs for traxettle-staging (943648574702) — update when production Firebase project is ready
    export EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID="943648574702-n7h4msh3iho1187po0dnc8tja7insc89.apps.googleusercontent.com"
    export EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID="943648574702-0qk99r3oql0sv3k4h6cgluffdqs7letj.apps.googleusercontent.com"
    export EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID="943648574702-cvgj086ppdcbqgcagrekjs4pekn0q1ok.apps.googleusercontent.com"
    ;;
  debug)
    export EXPO_PUBLIC_APP_ENV="local"
    # Google OAuth client IDs for traxettle-test (603084161476) — matches env.ts defaults
    export EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID="603084161476-igddelh46pe5l2t0hajsl52da0rici6o.apps.googleusercontent.com"
    export EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID="603084161476-ii602klf0go223a0ve690kopl7u5e7a0.apps.googleusercontent.com"
    export EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID="603084161476-j4ht8hs7kk6tqqh273q2ks89udmdc3pe.apps.googleusercontent.com"
    ;;
esac

ok "EXPO_PUBLIC_APP_ENV=$EXPO_PUBLIC_APP_ENV"
[ "$PROFILE" != "debug" ] && ok "EXPO_PUBLIC_API_URL=$EXPO_PUBLIC_API_URL"

# Write .env so Metro/Expo inlines EXPO_PUBLIC_* at bundle time
ENV_FILE="$MOBILE_DIR/.env"
ENV_FILE_EXISTED=false
[ -f "$ENV_FILE" ] && ENV_FILE_EXISTED=true && cp "$ENV_FILE" "$ENV_FILE.build-backup"

cat > "$ENV_FILE" <<EOF
EXPO_PUBLIC_APP_ENV=$EXPO_PUBLIC_APP_ENV
EXPO_PUBLIC_API_URL=${EXPO_PUBLIC_API_URL:-}
EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID=$EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID
EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID=$EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID
EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID=$EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID
EOF
ok ".env written for Metro bundler"

# Ensure .env is cleaned up after build (restore previous or remove)
cleanup_env() {
  if [ "$ENV_FILE_EXISTED" = true ]; then
    mv "$ENV_FILE.build-backup" "$ENV_FILE"
  else
    rm -f "$ENV_FILE"
  fi
}
trap cleanup_env EXIT

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
  debug:staging)
    GRADLE_TASK="app:assembleRelease"
    OUTPUT_DIR="$ANDROID_DIR/app/build/outputs/apk/release"
    OUTPUT_FILE="app-release.apk"
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

# Auto-install debug APK on connected device/emulator
if [ "$PROFILE" = "debug" ] || [ "$PROFILE" = "debug:staging" ]; then
  APK_PATH="$OUTPUT_DIR/$OUTPUT_FILE"
  if command -v adb >/dev/null 2>&1 && adb get-state >/dev/null 2>&1; then
    echo ""
    info "Installing APK on connected device..."
    adb install -r "$APK_PATH"
    ok "Installed! Launching app..."
    adb shell am start -n com.traxettle.app/.MainActivity
  else
    warn "No device/emulator detected. Install manually:"
    echo "  adb install -r $APK_PATH"
  fi
fi

echo "═══════════════════════════════════════════════════════════"
echo ""
