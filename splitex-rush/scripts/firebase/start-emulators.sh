#!/usr/bin/env sh
set -eu

ROOT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)"
PROJECT_ID="${FIREBASE_PROJECT_ID:-splitex-local}"
IMPORT_DIR="${FIREBASE_EMULATOR_IMPORT_DIR:-$ROOT_DIR/.firebase/emulator-data}"

mkdir -p "$IMPORT_DIR"

if ! command -v java >/dev/null 2>&1; then
  echo "[firebase-emulators] ERROR: Java is required. Install JDK 21+ and retry."
  exit 1
fi

JAVA_VERSION_LINE="$(java -version 2>&1 | head -n 1)"
JAVA_MAJOR="$(echo "$JAVA_VERSION_LINE" | sed -E 's/.*version "([0-9]+)(\.[0-9]+.*)?".*/\1/')"
if [ -z "$JAVA_MAJOR" ] || [ "$JAVA_MAJOR" -lt 21 ]; then
  echo "[firebase-emulators] ERROR: Detected Java version is not supported: $JAVA_VERSION_LINE"
  echo "[firebase-emulators] Firebase emulator requires JDK 21 or newer."
  exit 1
fi

if command -v firebase >/dev/null 2>&1; then
  FIREBASE_CMD="firebase"
elif command -v npx >/dev/null 2>&1; then
  FIREBASE_CMD="npx --yes firebase-tools"
elif command -v pnpm >/dev/null 2>&1; then
  FIREBASE_CMD="pnpm dlx firebase-tools"
else
  echo "[firebase-emulators] ERROR: firebase CLI not found and neither npx nor pnpm is available."
  echo "[firebase-emulators] Install Firebase CLI or Node.js tooling, then retry."
  exit 1
fi

echo "[firebase-emulators] project=$PROJECT_ID import=$IMPORT_DIR"
cd "$ROOT_DIR"
sh -c "$FIREBASE_CMD emulators:start --project \"$PROJECT_ID\" --only auth,firestore,storage --import \"$IMPORT_DIR\" --export-on-exit \"$IMPORT_DIR\""
