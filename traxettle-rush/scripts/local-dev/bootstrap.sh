#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────────────────────
# bootstrap.sh — Validate & prepare prerequisites for local dev
#
# Usage:
#   sh scripts/local-dev/bootstrap.sh <local|staging>
#
# Per-environment files in apps/mobile/:
#   debug.keystore.local               ← keystore for traxettle-test / local emulators
#   debug.keystore.staging             ← keystore for traxettle-staging
#   google-services.local.json         ← Android Firebase config from traxettle-test
#   google-services.staging.json       ← Android Firebase config from traxettle-staging
#   GoogleService-Info.local.plist     ← iOS Firebase config from traxettle-test
#   GoogleService-Info.staging.plist   ← iOS Firebase config from traxettle-staging
#
# What it does:
#   1. Validates Node.js, Java
#   2. Copies the correct debug.keystore.<env> → android/app/debug.keystore
#   3. Copies the correct google-services.<env>.json → android/app/google-services.json
#   4. Copies GoogleService-Info.plist → ios/Traxettle/ (if ios/ exists)
#   5. Validates SHA-1 match between keystore and google-services.json
# ──────────────────────────────────────────────────────────────────────────────
set -euo pipefail

FIREBASE_ENV="${1:-local}"
ROOT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)"
MOBILE_DIR="$ROOT_DIR/apps/mobile"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

ok()   { echo -e "${GREEN}✅${NC} $1"; }
warn() { echo -e "${YELLOW}⚠️ ${NC}$1"; }
fail() { echo -e "${RED}❌${NC} $1"; exit 1; }
info() { echo -e "${CYAN}ℹ ${NC}$1"; }

if [ "$FIREBASE_ENV" != "local" ] && [ "$FIREBASE_ENV" != "staging" ]; then
  fail "Invalid FIREBASE_ENV: '$FIREBASE_ENV'. Use: local | staging"
fi

echo ""
echo "═══════════════════════════════════════════════"
echo "  Traxettle — Bootstrap ($FIREBASE_ENV)"
echo "═══════════════════════════════════════════════"
echo ""

ERRORS=0

# ── 1. Node.js ────────────────────────────────────────────────────────────────
if command -v node >/dev/null 2>&1; then
  NODE_VER="$(node -v | sed 's/^v//')"
  ok "Node.js $NODE_VER"
else
  warn "Node.js not found. Install Node.js >= 24."
  ERRORS=$((ERRORS + 1))
fi

# ── 2. Java (needed for emulator scripts 01 & 02) ────────────────────────────
if command -v java >/dev/null 2>&1; then
  JAVA_VER="$(java -version 2>&1 | head -1)"
  ok "Java: $JAVA_VER"
else
  warn "Java not found. Required for Firebase emulators (JDK 21+)."
fi

# ── 3. Debug keystore ────────────────────────────────────────────────────────
KEYSTORE_SRC="$MOBILE_DIR/debug.keystore.$FIREBASE_ENV"
KEYSTORE_DST="$MOBILE_DIR/android/app/debug.keystore"

if [ -f "$KEYSTORE_SRC" ]; then
  cp "$KEYSTORE_SRC" "$KEYSTORE_DST"
  ok "debug.keystore.$FIREBASE_ENV → android/app/debug.keystore"
  if command -v keytool >/dev/null 2>&1; then
    SHA1=$(keytool -list -v -keystore "$KEYSTORE_DST" -alias androiddebugkey -storepass android 2>/dev/null | grep "SHA1:" | awk '{print $2}')
    if [ -n "$SHA1" ]; then
      info "  SHA-1: $SHA1"
    fi
  fi
else
  warn "Missing: apps/mobile/debug.keystore.$FIREBASE_ENV"
  warn "  Generate with: keytool -genkey -v -keystore apps/mobile/debug.keystore.$FIREBASE_ENV -alias androiddebugkey -keyalg RSA -keysize 2048 -validity 10000 -storepass android -keypass android -dname 'CN=Android Debug,O=Android,C=US'"
  warn "  Then register its SHA-1 in the Firebase Console for the $FIREBASE_ENV project."
  ERRORS=$((ERRORS + 1))
fi

# ── 4. google-services.json (Android) ────────────────────────────────────────
GOOGLE_SERVICES_SRC="$MOBILE_DIR/google-services.$FIREBASE_ENV.json"
GOOGLE_SERVICES_DST="$MOBILE_DIR/android/app/google-services.json"

if [ -f "$GOOGLE_SERVICES_SRC" ]; then
  cp "$GOOGLE_SERVICES_SRC" "$GOOGLE_SERVICES_DST"
  ok "google-services.$FIREBASE_ENV.json → android/app/google-services.json"
else
  # Fallback: try the un-suffixed google-services.json (backward compat)
  GOOGLE_SERVICES_FALLBACK="$MOBILE_DIR/google-services.json"
  if [ -f "$GOOGLE_SERVICES_FALLBACK" ]; then
    cp "$GOOGLE_SERVICES_FALLBACK" "$GOOGLE_SERVICES_DST"
    warn "google-services.$FIREBASE_ENV.json not found — using google-services.json (fallback)"
    warn "  For proper per-env setup, rename it to google-services.$FIREBASE_ENV.json"
  else
    warn "Missing: apps/mobile/google-services.$FIREBASE_ENV.json"
    warn "  Download from Firebase Console → Project Settings → Android app."
    ERRORS=$((ERRORS + 1))
  fi
fi

# ── 5. GoogleService-Info.plist (iOS) ─────────────────────────────────────────
PLIST_SRC="$MOBILE_DIR/GoogleService-Info.$FIREBASE_ENV.plist"
PLIST_FALLBACK="$MOBILE_DIR/GoogleService-Info.plist"
PLIST_DST="$MOBILE_DIR/ios/Traxettle/GoogleService-Info.plist"

if [ -f "$PLIST_SRC" ]; then
  ok "GoogleService-Info.$FIREBASE_ENV.plist found"
  # Also copy as the canonical GoogleService-Info.plist (for Expo config plugin / prebuild)
  cp "$PLIST_SRC" "$PLIST_FALLBACK"
  if [ -d "$MOBILE_DIR/ios/Traxettle" ]; then
    cp "$PLIST_SRC" "$PLIST_DST"
    ok "  → copied to ios/Traxettle/"
  else
    info "  ios/ not found — Expo config plugin will copy on prebuild."
  fi
elif [ -f "$PLIST_FALLBACK" ]; then
  warn "GoogleService-Info.$FIREBASE_ENV.plist not found — using GoogleService-Info.plist (fallback)"
  if [ -d "$MOBILE_DIR/ios/Traxettle" ]; then
    cp "$PLIST_FALLBACK" "$PLIST_DST"
    ok "  → copied to ios/Traxettle/"
  fi
else
  warn "Missing: apps/mobile/GoogleService-Info.$FIREBASE_ENV.plist"
  warn "  Download from Firebase Console → Project Settings → iOS app."
  ERRORS=$((ERRORS + 1))
fi

# ── 6. SHA-1 ↔ google-services.json match check ─────────────────────────────
if [ -f "$GOOGLE_SERVICES_DST" ] && [ -f "$KEYSTORE_DST" ] && command -v keytool >/dev/null 2>&1; then
  SHA1_RAW=$(keytool -list -v -keystore "$KEYSTORE_DST" -alias androiddebugkey -storepass android 2>/dev/null | grep "SHA1:" | awk '{print $2}')
  if [ -n "$SHA1_RAW" ]; then
    SHA1_FLAT=$(echo "$SHA1_RAW" | tr -d ':' | tr '[:upper:]' '[:lower:]')
    CERT_HASH=$(grep -o '"certificate_hash": *"[^"]*"' "$GOOGLE_SERVICES_DST" | head -1 | sed 's/.*: *"//;s/"//')
    if [ -n "$CERT_HASH" ]; then
      if [ "$SHA1_FLAT" = "$CERT_HASH" ]; then
        ok "SHA-1 matches google-services.json ✓"
      else
        warn "SHA-1 MISMATCH!"
        warn "  Keystore       : $SHA1_FLAT"
        warn "  google-services: $CERT_HASH"
        warn ""
        warn "  Google Sign-In will fail (Error 10)."
        warn "  Fix: Add SHA-1 $SHA1_RAW to Firebase Console → Android app → Add fingerprint"
        warn "  Then re-download google-services.$FIREBASE_ENV.json."
      fi
    fi
  fi
fi

# ── 7. Extract Google OAuth client IDs for scripts ───────────────────────────
BOOTSTRAP_ENV="$ROOT_DIR/scripts/local-dev/.bootstrap.env"
ACTIVE_PLIST="$PLIST_FALLBACK"
[ -f "$PLIST_SRC" ] && ACTIVE_PLIST="$PLIST_SRC"

EXTRACTED_IOS_CLIENT_ID=""
EXTRACTED_WEB_CLIENT_ID=""
EXTRACTED_ANDROID_CLIENT_ID=""
EXTRACTED_API_KEY=""
EXTRACTED_APP_ID=""
EXTRACTED_MESSAGING_SENDER_ID=""
EXTRACTED_PROJECT_ID=""
EXTRACTED_STORAGE_BUCKET=""
EXTRACTED_AUTH_DOMAIN=""

if [ -f "$ACTIVE_PLIST" ]; then
  EXTRACTED_IOS_CLIENT_ID=$(grep -A1 '<key>CLIENT_ID</key>' "$ACTIVE_PLIST" | grep '<string>' | sed 's/.*<string>//;s/<\/string>.*//' | head -1)
fi

# Extract web client ID from google-services.json (oauth_client with client_type 3)
ACTIVE_GS="$GOOGLE_SERVICES_DST"
if [ -f "$ACTIVE_GS" ]; then
  EXTRACTED_API_KEY=$(python3 -c "
import json
with open('$ACTIVE_GS') as f:
    data = json.load(f)
client = (data.get('client') or [{}])[0]
api_keys = client.get('api_key') or []
print((api_keys[0] or {}).get('current_key', ''))
" 2>/dev/null || echo "")

  EXTRACTED_APP_ID=$(python3 -c "
import json
with open('$ACTIVE_GS') as f:
    data = json.load(f)
client = (data.get('client') or [{}])[0]
info = client.get('client_info') or {}
print(info.get('mobilesdk_app_id', ''))
" 2>/dev/null || echo "")

  EXTRACTED_MESSAGING_SENDER_ID=$(python3 -c "
import json
with open('$ACTIVE_GS') as f:
    data = json.load(f)
info = data.get('project_info') or {}
print(info.get('project_number', ''))
" 2>/dev/null || echo "")

  EXTRACTED_PROJECT_ID=$(python3 -c "
import json
with open('$ACTIVE_GS') as f:
    data = json.load(f)
info = data.get('project_info') or {}
print(info.get('project_id', ''))
" 2>/dev/null || echo "")

  EXTRACTED_STORAGE_BUCKET=$(python3 -c "
import json
with open('$ACTIVE_GS') as f:
    data = json.load(f)
info = data.get('project_info') or {}
print(info.get('storage_bucket', ''))
" 2>/dev/null || echo "")

  # client_type 3 = web client
  EXTRACTED_WEB_CLIENT_ID=$(python3 -c "
import json, sys
with open('$ACTIVE_GS') as f:
    data = json.load(f)
for client in data.get('client', []):
    for oc in client.get('oauth_client', []):
        if oc.get('client_type') == 3:
            print(oc['client_id'])
            sys.exit(0)
" 2>/dev/null || echo "")

  # client_type 1 = Android client
  EXTRACTED_ANDROID_CLIENT_ID=$(python3 -c "
import json, sys
with open('$ACTIVE_GS') as f:
    data = json.load(f)
for client in data.get('client', []):
    for oc in client.get('oauth_client', []):
        if oc.get('client_type') == 1:
            print(oc['client_id'])
            sys.exit(0)
" 2>/dev/null || echo "")

  if [ -n "$EXTRACTED_PROJECT_ID" ]; then
    EXTRACTED_AUTH_DOMAIN="${EXTRACTED_PROJECT_ID}.firebaseapp.com"
  fi
fi

# --- Load Web-platform Firebase config ---
# The Firebase JS SDK (used by the React Native mobile app) makes REST API
# calls that require the Web API key and Web app ID, which are DIFFERENT from
# the Android values in google-services.json.  Web configs are stored in
# fb-web-configs/<project_id>.env alongside the service-account files.
WEB_CONFIG_EXTRACTED_API_KEY=""
WEB_CONFIG_EXTRACTED_APP_ID=""
WEB_CONFIG_EXTRACTED_AUTH_DOMAIN=""
WEB_CONFIG_EXTRACTED_STORAGE_BUCKET=""
WEB_CONFIG_EXTRACTED_MESSAGING_SENDER_ID=""
WEB_CONFIG_EXTRACTED_MEASUREMENT_ID=""

if [ -n "$EXTRACTED_PROJECT_ID" ]; then
  WEB_CONFIG_FILE="$ROOT_DIR/fb-web-configs/${EXTRACTED_PROJECT_ID}.env"
  if [ -f "$WEB_CONFIG_FILE" ]; then
    # Source the file in a subshell-safe way
    while IFS='=' read -r key value; do
      # Skip comments and empty lines
      [[ "$key" =~ ^#.*$ || -z "$key" ]] && continue
      # Strip surrounding quotes
      value="${value%\"}"
      value="${value#\"}"
      case "$key" in
        FIREBASE_WEB_API_KEY)              WEB_CONFIG_EXTRACTED_API_KEY="$value" ;;
        FIREBASE_WEB_APP_ID)               WEB_CONFIG_EXTRACTED_APP_ID="$value" ;;
        FIREBASE_WEB_AUTH_DOMAIN)           WEB_CONFIG_EXTRACTED_AUTH_DOMAIN="$value" ;;
        FIREBASE_WEB_STORAGE_BUCKET)        WEB_CONFIG_EXTRACTED_STORAGE_BUCKET="$value" ;;
        FIREBASE_WEB_MESSAGING_SENDER_ID)   WEB_CONFIG_EXTRACTED_MESSAGING_SENDER_ID="$value" ;;
        FIREBASE_WEB_MEASUREMENT_ID)        WEB_CONFIG_EXTRACTED_MEASUREMENT_ID="$value" ;;
      esac
    done < "$WEB_CONFIG_FILE"
    ok "Loaded Web Firebase config from ${WEB_CONFIG_FILE##*/}"
  else
    warn "No Web Firebase config at $WEB_CONFIG_FILE — falling back to Android API key"
  fi
fi

# Prefer Web values; fall back to Android-extracted values
FINAL_API_KEY="${WEB_CONFIG_EXTRACTED_API_KEY:-$EXTRACTED_API_KEY}"
FINAL_APP_ID="${WEB_CONFIG_EXTRACTED_APP_ID:-$EXTRACTED_APP_ID}"
FINAL_AUTH_DOMAIN="${WEB_CONFIG_EXTRACTED_AUTH_DOMAIN:-$EXTRACTED_AUTH_DOMAIN}"
FINAL_STORAGE_BUCKET="${WEB_CONFIG_EXTRACTED_STORAGE_BUCKET:-$EXTRACTED_STORAGE_BUCKET}"
FINAL_MESSAGING_SENDER_ID="${WEB_CONFIG_EXTRACTED_MESSAGING_SENDER_ID:-$EXTRACTED_MESSAGING_SENDER_ID}"
FINAL_MEASUREMENT_ID="${WEB_CONFIG_EXTRACTED_MEASUREMENT_ID:-}"

# ── 8. Resolve Firebase service account ──────────────────────────────────────
SA_ENV_NAME="$FIREBASE_ENV"
[ "$SA_ENV_NAME" = "local" ] && SA_ENV_NAME="test"
BOOTSTRAP_SA_FILE="fb-service-accounts/traxettle-fb-sa-${SA_ENV_NAME}.json"
BOOTSTRAP_SA_PATH="$ROOT_DIR/$BOOTSTRAP_SA_FILE"

if [ -f "$BOOTSTRAP_SA_PATH" ]; then
  ok "Service account: $BOOTSTRAP_SA_FILE"
else
  warn "Missing: $BOOTSTRAP_SA_FILE"
  warn "  Download from Firebase Console → Project Settings → Service accounts → Generate new private key"
  ERRORS=$((ERRORS + 1))
fi

{
  echo "# Auto-generated by bootstrap.sh — do not edit"
  echo "BOOTSTRAP_GOOGLE_IOS_CLIENT_ID=\"$EXTRACTED_IOS_CLIENT_ID\""
  echo "BOOTSTRAP_GOOGLE_WEB_CLIENT_ID=\"$EXTRACTED_WEB_CLIENT_ID\""
  echo "BOOTSTRAP_GOOGLE_ANDROID_CLIENT_ID=\"$EXTRACTED_ANDROID_CLIENT_ID\""
  echo "BOOTSTRAP_FIREBASE_API_KEY=\"$FINAL_API_KEY\""
  echo "BOOTSTRAP_FIREBASE_APP_ID=\"$FINAL_APP_ID\""
  echo "BOOTSTRAP_FIREBASE_MESSAGING_SENDER_ID=\"$FINAL_MESSAGING_SENDER_ID\""
  echo "BOOTSTRAP_FIREBASE_PROJECT_ID=\"$EXTRACTED_PROJECT_ID\""
  echo "BOOTSTRAP_FIREBASE_STORAGE_BUCKET=\"$FINAL_STORAGE_BUCKET\""
  echo "BOOTSTRAP_FIREBASE_AUTH_DOMAIN=\"$FINAL_AUTH_DOMAIN\""
  echo "BOOTSTRAP_FIREBASE_MEASUREMENT_ID=\"$FINAL_MEASUREMENT_ID\""
  echo "BOOTSTRAP_FIREBASE_SA_FILE=\"$BOOTSTRAP_SA_FILE\""
} > "$BOOTSTRAP_ENV"

if [ -n "$EXTRACTED_IOS_CLIENT_ID" ]; then
  ok "iOS client ID: ${EXTRACTED_IOS_CLIENT_ID:0:30}…"
fi
if [ -n "$EXTRACTED_WEB_CLIENT_ID" ]; then
  ok "Web client ID: ${EXTRACTED_WEB_CLIENT_ID:0:30}…"
fi
if [ -n "$EXTRACTED_ANDROID_CLIENT_ID" ]; then
  ok "Android client ID: ${EXTRACTED_ANDROID_CLIENT_ID:0:30}…"
fi
if [ -n "$FINAL_API_KEY" ]; then
  ok "Firebase API key: ${FINAL_API_KEY:0:15}…"
fi
if [ -n "$FINAL_APP_ID" ]; then
  ok "Firebase app ID: ${FINAL_APP_ID:0:30}…"
fi

echo ""
if [ "$ERRORS" -gt 0 ]; then
  warn "$ERRORS prerequisite(s) missing. See warnings above."
  echo ""
else
  ok "All prerequisites OK ($FIREBASE_ENV). Ready to develop!"
  echo ""
fi
