#!/usr/bin/env bash
set -euo pipefail

# Creates per-environment Android debug keystore files used by local-dev scripts.
#
# Output:
#   apps/mobile/debug.keystore.local
#   apps/mobile/debug.keystore.staging
#
# Usage:
#   bash scripts/firebase/create-debug-keystore.sh local
#   bash scripts/firebase/create-debug-keystore.sh staging

ENV_RAW="${1:-}"
if [[ -z "$ENV_RAW" ]]; then
  echo "Usage: $0 <local|staging>"
  exit 1
fi

case "$ENV_RAW" in
  local|staging) ENV="$ENV_RAW" ;;
  *) echo "Invalid env: $ENV_RAW (use: local|staging)" ; exit 1 ;;
esac

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
MOBILE_DIR="$ROOT_DIR/apps/mobile"
OUT_FILE="$MOBILE_DIR/debug.keystore.${ENV}"

if ! command -v keytool >/dev/null 2>&1; then
  echo "ERROR: keytool not found. Install a JDK (Java) and try again."
  exit 1
fi

if [[ -f "$OUT_FILE" ]]; then
  read -r -p "File already exists: $OUT_FILE. Overwrite? (y/n): " yn
  case "${yn:-n}" in
    y|Y) rm -f "$OUT_FILE" ;;
    *) echo "Keeping existing file." ; exit 0 ;;
  esac
fi

mkdir -p "$MOBILE_DIR"

echo ""
echo "Creating Android debug keystore for env: $ENV"
echo "Output: $OUT_FILE"
echo "Password: android"
echo ""

keytool -genkeypair -v \
  -keystore "$OUT_FILE" \
  -storepass android \
  -alias androiddebugkey \
  -keypass android \
  -keyalg RSA \
  -keysize 2048 \
  -validity 10000 \
  -dname "CN=Android Debug,O=Android,C=US" >/dev/null

echo "Keystore created."
echo ""
echo "SHA-1 and SHA-256 (add these in Firebase Console → Android app → Add fingerprint):"
keytool -list -v -keystore "$OUT_FILE" -alias androiddebugkey -storepass android \
  | awk '/SHA1:|SHA256:/{print}'
echo ""
echo "Next:"
echo "1) Add the SHA-1 + SHA-256 to the correct Firebase project’s Android app settings"
echo "2) Download a fresh google-services.json and save it as apps/mobile/google-services.${ENV}.json"
echo "3) Run: sh scripts/local-dev/bootstrap.sh ${ENV}"
echo ""

