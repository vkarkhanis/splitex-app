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

if [ -f "$ACTIVE_PLIST" ]; then
  EXTRACTED_IOS_CLIENT_ID=$(grep -A1 '<key>CLIENT_ID</key>' "$ACTIVE_PLIST" | grep '<string>' | sed 's/.*<string>//;s/<\/string>.*//' | head -1)
fi

# Extract web client ID from google-services.json (oauth_client with client_type 3)
ACTIVE_GS="$GOOGLE_SERVICES_DST"
if [ -f "$ACTIVE_GS" ]; then
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
fi

{
  echo "# Auto-generated by bootstrap.sh — do not edit"
  echo "BOOTSTRAP_GOOGLE_IOS_CLIENT_ID=\"$EXTRACTED_IOS_CLIENT_ID\""
  echo "BOOTSTRAP_GOOGLE_WEB_CLIENT_ID=\"$EXTRACTED_WEB_CLIENT_ID\""
} > "$BOOTSTRAP_ENV"

if [ -n "$EXTRACTED_IOS_CLIENT_ID" ]; then
  ok "iOS client ID: ${EXTRACTED_IOS_CLIENT_ID:0:30}…"
fi
if [ -n "$EXTRACTED_WEB_CLIENT_ID" ]; then
  ok "Web client ID: ${EXTRACTED_WEB_CLIENT_ID:0:30}…"
fi

echo ""
if [ "$ERRORS" -gt 0 ]; then
  warn "$ERRORS prerequisite(s) missing. See warnings above."
  echo ""
else
  ok "All prerequisites OK ($FIREBASE_ENV). Ready to develop!"
  echo ""
fi
