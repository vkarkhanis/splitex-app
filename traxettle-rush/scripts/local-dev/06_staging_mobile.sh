#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────────────────────
# 06_staging_mobile.sh — Run the mobile dev app on a simulator/emulator against
# the DEPLOYED staging API (no local API, no Firebase emulators).
#
# Usage:
#   ./scripts/local-dev/06_staging_mobile.sh [ios|android] [--build]
#   Default: ios.
#   --build reinstalls the development build first. That also happens
#   automatically when the app isn't on the running simulator/emulator.
#   iOS: the app goes on every booted iOS simulator (iPhones and iPads; boot
#   more with `xcrun simctl boot <UDID>`). It's built once and copied to the
#   rest. With none booted, Expo boots its default simulator.
#   STAGING_API_URL overrides the staging API address.
# ──────────────────────────────────────────────────────────────────────────────
set -euo pipefail

usage() { echo "Usage: $0 [ios|android] [--build]"; exit 1; }
PLATFORM="${1:-ios}"
FORCE_BUILD="${2:-}"
case "$PLATFORM" in ios|android) ;; *) usage ;; esac
[[ -z "$FORCE_BUILD" || "$FORCE_BUILD" == "--build" ]] || usage

ROOT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)"
MOBILE_DIR="$ROOT_DIR/apps/mobile"
STAGING_API_URL="${STAGING_API_URL:-https://traxettle-api-staging-943648574702.us-central1.run.app}"
BUNDLE_ID="com.traxettle.app"

echo "[local-dev] mode=deployed-staging+mobile platform=$PLATFORM api=$STAGING_API_URL"

# The app fails to start without its API, so check it before building anything.
curl -fsS -m 20 -o /dev/null "$STAGING_API_URL/health" \
  || { echo "[local-dev] Staging API not reachable: $STAGING_API_URL/health"; exit 1; }

# Staging Firebase files for the native build (plist, google-services.json, keystore)
# and the staging Google client IDs (written to .bootstrap.env).
sh "$ROOT_DIR/scripts/local-dev/bootstrap.sh" staging
BOOTSTRAP_ENV="$ROOT_DIR/scripts/local-dev/.bootstrap.env"
if [[ -f "$BOOTSTRAP_ENV" ]]; then
  # shellcheck disable=SC1090
  source "$BOOTSTRAP_ENV"
fi

# RevenueCat public keys are optional; without them Pro purchases don't work.
if [[ -f "$ROOT_DIR/rc_staging.properties" ]]; then
  # shellcheck disable=SC1090
  source "$ROOT_DIR/scripts/revenuecat/load-rc-config.sh" staging
else
  echo "[local-dev] rc_staging.properties not found; Pro purchases won't work in this run."
fi

# Booted iOS simulators (iPhones and iPads), one "UDID|name (iOS x.y)" line each.
booted_ios_simulators() {
  xcrun simctl list devices booted -j 2>/dev/null | node -e '
    const { devices } = JSON.parse(require("fs").readFileSync(0, "utf8"));
    for (const [runtime, list] of Object.entries(devices)) {
      const os = /SimRuntime\.iOS-(\d+)-(\d+)$/.exec(runtime);
      if (!os) continue;
      for (const d of list) if (d.state === "Booted") console.log(`${d.udid}|${d.name} (iOS ${os[1]}.${os[2]})`);
    }'
}

ios_has_app() {
  xcrun simctl get_app_container "$1" "$BUNDLE_ID" app >/dev/null 2>&1
}

android_app_installed() {
  adb shell pm list packages 2>/dev/null | grep -q "$BUNDLE_ID"
}

# The app is a plain development build (no expo-dev-client), so it is opened
# directly rather than through a dev-client link, which it can't handle. A
# development build loads its JS from the bundler on port 8081 when it starts.
open_app() {
  if [[ "$PLATFORM" == "ios" ]]; then
    local udid name opened=1
    while IFS='|' read -r udid name; do
      [[ -n "$udid" ]] || continue
      if xcrun simctl launch --terminate-running-process "$udid" "$BUNDLE_ID" >/dev/null 2>&1; then
        echo "[local-dev] Opened the app on $name."
        opened=0
      else
        echo "[local-dev] Couldn't open the app on $name."
      fi
    done < <(booted_ios_simulators)
    return "$opened"
  else
    adb reverse tcp:8081 tcp:8081 >/dev/null
    adb shell am start -S -n "$BUNDLE_ID/.MainActivity" >/dev/null
  fi
}

# Builds once (when asked, or when no booted simulator has the app yet), then
# installs that same app on every other booted simulator that needs it.
install_on_ios_simulators() {
  local sims udid name source_udid="" app_path
  sims="$(booted_ios_simulators)"
  if [[ -z "$FORCE_BUILD" ]]; then
    while IFS='|' read -r udid name; do
      if [[ -n "$udid" ]] && ios_has_app "$udid"; then source_udid="$udid"; break; fi
    done <<< "$sims"
  fi

  if [[ -z "$source_udid" ]]; then
    echo "[local-dev] Building the development build for iOS (the first build takes 10–20 min)."
    if [[ -n "$sims" ]]; then
      source_udid="$(head -n 1 <<< "$sims" | cut -d'|' -f1)"
      npx expo run:ios --no-bundler --device "$source_udid"
    else
      npx expo run:ios --no-bundler
      sims="$(booted_ios_simulators)"
      source_udid="$(head -n 1 <<< "$sims" | cut -d'|' -f1)"
    fi
  fi
  [[ -n "$source_udid" ]] || { echo "[local-dev] No booted iOS simulator after the build."; exit 1; }

  app_path="$(xcrun simctl get_app_container "$source_udid" "$BUNDLE_ID" app 2>/dev/null)" \
    || { echo "[local-dev] The app isn't on simulator $source_udid; the build didn't install it."; exit 1; }
  while IFS='|' read -r udid name; do
    [[ -n "$udid" && "$udid" != "$source_udid" ]] || continue
    if [[ -n "$FORCE_BUILD" ]] || ! ios_has_app "$udid"; then
      echo "[local-dev] Installing the app on $name."
      xcrun simctl install "$udid" "$app_path" || echo "[local-dev] Couldn't install the app on $name."
    fi
  done <<< "$sims"
}

install_android_build() {
  # `expo run:android` ends by opening a dev-client link this app can't
  # handle, so build and install with Gradle instead; open_app launches it.
  local abi
  abi="$(adb shell getprop ro.product.cpu.abi 2>/dev/null | tr -d '\r')"
  (cd android && ./gradlew app:installDebug ${abi:+"-PreactNativeArchitectures=$abi"})
}

open_app_when_bundler_ready() {
  for _ in $(seq 1 180); do
    if curl -fsS -m 2 http://localhost:8081/status 2>/dev/null | grep -q "packager-status:running"; then
      open_app && echo "[local-dev] App opened on $PLATFORM. Press r here to reload (every device); don't press i/a (that opens Expo Go)."
      return
    fi
    sleep 1
  done
  echo "[local-dev] The bundler didn't start within 3 minutes; open the app on the $PLATFORM device yourself."
}

# Development builds take the API from EXPO_PUBLIC_API_URL. The per-platform
# variables would override it, so they are set empty (an empty shell value also
# wins over anything in apps/mobile/.env).
export EXPO_PUBLIC_APP_ENV=staging
export EXPO_PUBLIC_API_URL="$STAGING_API_URL"
export EXPO_PUBLIC_API_URL_IOS=""
export EXPO_PUBLIC_API_URL_ANDROID=""
export EXPO_PUBLIC_FIREBASE_USE_EMULATOR=false
export EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID="${BOOTSTRAP_GOOGLE_IOS_CLIENT_ID:-}"
export EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID="${BOOTSTRAP_GOOGLE_WEB_CLIENT_ID:-}"
export EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID="${BOOTSTRAP_GOOGLE_ANDROID_CLIENT_ID:-}"

cd "$MOBILE_DIR"
if [[ "$PLATFORM" == "android" ]] && ! adb get-state >/dev/null 2>&1; then
  echo "[local-dev] Start one Android emulator (Android Studio → Device Manager) or connect one device, then run again."
  echo "[local-dev] With several connected, pick one: export ANDROID_SERIAL=<name from 'adb devices'>"
  exit 1
fi
if [[ "$PLATFORM" == "ios" ]]; then
  install_on_ios_simulators
elif [[ "$FORCE_BUILD" == "--build" ]] || ! android_app_installed; then
  echo "[local-dev] Installing the development build on android (the first build takes 10–20 min)."
  install_android_build
fi

# Open the app once the bundler answers. This runs in the background and never
# reads the terminal, so the bundler below keeps its keyboard shortcuts.
open_app_when_bundler_ready &

# --clear: the bundler caches the API address from earlier runs (e.g. the local API).
exec npx expo start --clear
