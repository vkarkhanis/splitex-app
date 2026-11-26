#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────────────────────
# 06_staging_mobile.sh — Run the mobile dev app on a simulator/emulator against
# the DEPLOYED staging API (no local API, no Firebase emulators).
#
# Usage:
#   ./scripts/local-dev/06_staging_mobile.sh [ios|android] [--build] [--no-bundler | --bundler-only]
#   Default: ios; installs the app where needed, starts the bundler and opens the app.
#   --build reinstalls the development build first. That also happens
#   automatically when the app isn't on the running simulator/emulator.
#   --no-bundler installs (and builds if needed) without starting the bundler,
#   then exits; it opens the app if a bundler is already running.
#   --bundler-only starts the bundler and opens the app, without installing.
#   Together: one terminal runs --bundler-only, another runs --build --no-bundler
#   (again after booting another simulator, without restarting the bundler).
#   iOS: the app goes on every booted iOS simulator (iPhones and iPads; boot
#   more with `xcrun simctl boot <UDID>`). It's built once and copied to the
#   rest. With none booted, Expo boots its default simulator. After a TestFlight
#   build, the iOS project and Xcode's build cache are reset before building.
#   Android: the app goes on every running emulator/device (only ANDROID_SERIAL's,
#   if set). One Gradle build for their CPU types, installed with adb on each
#   that lacks it or has a different build; adb reverse connects each to the bundler.
#   STAGING_API_URL overrides the staging API address.
# ──────────────────────────────────────────────────────────────────────────────
set -euo pipefail

usage() { echo "Usage: $0 [ios|android] [--build] [--no-bundler | --bundler-only]"; exit 1; }
PLATFORM="ios"
FORCE_BUILD=""
START_BUNDLER=1
INSTALL_APP=1
for arg in "$@"; do
  case "$arg" in
    ios|android) PLATFORM="$arg" ;;
    --build) FORCE_BUILD="--build" ;;
    --no-bundler) START_BUNDLER=0 ;;
    --bundler-only) INSTALL_APP=0 ;;
    *) echo "Unknown option: '$arg'"; usage ;;
  esac
done
# --bundler-only installs nothing, so it can't be combined with the install options.
if [[ "$INSTALL_APP" == 0 && ( -n "$FORCE_BUILD" || "$START_BUNDLER" == 0 ) ]]; then
  echo "--bundler-only only starts the bundler (no build or install), so it can't go with --build or --no-bundler."
  echo "  Build, then start the bundler here:  $0 $PLATFORM --build"
  echo "  Or build in another terminal:        $0 $PLATFORM --build --no-bundler"
  exit 1
fi

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

# Fingerprint of the app's native code on a simulator (empty if it isn't installed). A
# simulator still on an older build gets a different one; JavaScript comes from the bundler.
ios_app_fingerprint() {
  local app_path exe
  app_path="$(xcrun simctl get_app_container "$1" "$BUNDLE_ID" app 2>/dev/null)" || return 0
  exe="$(/usr/libexec/PlistBuddy -c 'Print :CFBundleExecutable' "$app_path/Info.plist" 2>/dev/null)" || return 0
  shasum "$app_path/$exe" 2>/dev/null | cut -d' ' -f1 || true
}

# The booted simulator with the most recent install of the app: where expo run:ios just put it.
newest_ios_install() {
  local udid name app_path mtime best="" best_mtime=0
  while IFS='|' read -r udid name; do
    [[ -n "$udid" ]] || continue
    app_path="$(xcrun simctl get_app_container "$udid" "$BUNDLE_ID" app 2>/dev/null)" || continue
    mtime="$(stat -f %m "$app_path" 2>/dev/null || echo 0)"
    if (( mtime > best_mtime )); then best="$udid"; best_mtime="$mtime"; fi
  done <<< "$(booted_ios_simulators)"
  echo "$best"
}

# A TestFlight/Release build leaves the iOS project (its precompiled React Native) and
# Xcode's build cache set up for Release, and a simulator (Debug) build on top of that
# can fail to link ("Undefined symbols … facebook::react::Sealable::Sealable()"). In that
# case, start the Debug build from a fresh project and cache. Signs of a Release build:
# the marker build-ios.sh testflight leaves, or React Native's own record of the last build.
reset_ios_after_release_build() {
  local marker="ios/.release-build" rncore="ios/Pods/React-Core-prebuilt/.last_build_configuration" ws
  if [[ -f "$marker" ]] || { [[ -f "$rncore" ]] && [[ "$(cat "$rncore")" == "Release" ]]; }; then
    echo "[local-dev] The iOS project was last built for TestFlight/Release. Clearing Xcode's build cache and regenerating it (a few extra minutes)."
    for ws in ios/*.xcworkspace; do
      if [[ -d "$ws" ]]; then
        rm -rf "$HOME/Library/Developer/Xcode/DerivedData/$(basename "$ws" .xcworkspace)"-*
      fi
    done
    EXPO_NO_GIT_STATUS=1 npx expo prebuild --platform ios --clean
  fi
}

ANDROID_APK="android/app/build/outputs/apk/debug/app-debug.apk"

# Running Android emulators/devices (state "device" in `adb devices`), one serial per line.
# ANDROID_SERIAL, if set, limits it to that one.
android_devices() {
  local serial state
  adb devices 2>/dev/null | tail -n +2 | while read -r serial state; do
    if [[ "$state" == "device" ]] && [[ -z "${ANDROID_SERIAL:-}" || "$serial" == "$ANDROID_SERIAL" ]]; then
      echo "$serial"
    fi
  done
}

# A readable name: the emulator's AVD name, or the device's model.
android_device_name() {
  local name
  name="$(adb -s "$1" emu avd name 2>/dev/null | head -n 1 | tr -d '\r' || true)"
  if [[ -z "$name" || "$name" == "OK" ]]; then
    name="$(adb -s "$1" shell getprop ro.product.model 2>/dev/null | tr -d '\r' || true)"
  fi
  echo "${name:-$1} ($1)"
}

android_has_app() {
  adb -s "$1" shell pm list packages "$BUNDLE_ID" 2>/dev/null | tr -d '\r' | grep -qx "package:$BUNDLE_ID"
}

# SHA-256 of the installed APK on a device (empty if it isn't installed). A device still
# on an older build gets a different one; JavaScript comes from the bundler.
android_app_fingerprint() {
  local apk_path
  apk_path="$(adb -s "$1" shell pm path "$BUNDLE_ID" 2>/dev/null | tr -d '\r' | awk 'sub(/^package:/, "") { print; exit }' || true)"
  [[ -n "$apk_path" ]] || return 0
  adb -s "$1" shell sha256sum "$apk_path" 2>/dev/null | tr -d '\r' | cut -d' ' -f1 || true
}

# CPU types of these devices, comma-separated (e.g. arm64-v8a), so one build runs on all.
android_abis() {
  local serial abi abis=""
  for serial in "$@"; do
    abi="$(adb -s "$serial" shell getprop ro.product.cpu.abi 2>/dev/null | tr -d '\r' || true)"
    if [[ -n "$abi" && ",$abis," != *",$abi,"* ]]; then abis="${abis:+$abis,}$abi"; fi
  done
  echo "$abis"
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
    local serial name opened=1
    while read -r serial; do
      [[ -n "$serial" ]] || continue
      name="$(android_device_name "$serial")"
      # adb reverse lets each device reach the bundler at its own localhost:8081.
      if android_has_app "$serial" \
        && adb -s "$serial" reverse tcp:8081 tcp:8081 >/dev/null 2>&1 \
        && adb -s "$serial" shell am start -S -n "$BUNDLE_ID/.MainActivity" >/dev/null 2>&1; then
        echo "[local-dev] Opened the app on $name."
        opened=0
      else
        echo "[local-dev] Couldn't open the app on $name."
      fi
    done < <(android_devices)
    return "$opened"
  fi
}

# Builds once (when asked, or when no booted simulator has the app yet), then
# installs that same app on every other booted simulator that lacks it or has an
# older build (whose native code wouldn't match the bundler's JavaScript).
install_on_ios_simulators() {
  local sims udid name source_udid="" app_path source_print
  sims="$(booted_ios_simulators)"
  if [[ -z "$FORCE_BUILD" ]]; then
    source_udid="$(newest_ios_install)"
  fi

  if [[ -z "$source_udid" ]]; then
    reset_ios_after_release_build
    echo "[local-dev] Building the development build for iOS (the first build takes 10–20 min)."
    # No --device: given a UDID, Expo also looks it up with Xcode's physical-device tool
    # (devicectl), and if that lists the simulator it installs as if to an iPhone and hangs
    # at "Connecting to: …". Without it, Expo uses its first booted simulator (or boots one).
    npx expo run:ios --no-bundler
    sims="$(booted_ios_simulators)"
    source_udid="$(newest_ios_install)"
  fi
  [[ -n "$source_udid" ]] || { echo "[local-dev] No booted iOS simulator has the app after the build."; exit 1; }

  app_path="$(xcrun simctl get_app_container "$source_udid" "$BUNDLE_ID" app 2>/dev/null)" \
    || { echo "[local-dev] The app isn't on simulator $source_udid; the build didn't install it."; exit 1; }
  source_print="$(ios_app_fingerprint "$source_udid")"
  while IFS='|' read -r udid name; do
    [[ -n "$udid" && "$udid" != "$source_udid" ]] || continue
    if [[ -n "$FORCE_BUILD" ]] || ! ios_has_app "$udid" || [[ "$(ios_app_fingerprint "$udid")" != "$source_print" ]]; then
      if ios_has_app "$udid"; then
        echo "[local-dev] Updating the app on $name (it had a different build)."
      else
        echo "[local-dev] Installing the app on $name."
      fi
      xcrun simctl install "$udid" "$app_path" || echo "[local-dev] Couldn't install the app on $name."
    fi
  done <<< "$sims"
}

# Builds the debug APK once (when asked, or when a device lacks the app and there's no build
# yet), then installs it on every running device that lacks it or has a different build.
install_on_android_devices() {
  local devices serial name abis apk_print missing=0
  devices="$(android_devices)"
  if [[ -z "$devices" ]]; then
    echo "[local-dev] Start an Android emulator (Android Studio → Device Manager) or connect a device, then run again."
    exit 1
  fi
  while read -r serial; do
    if ! android_has_app "$serial"; then missing=1; fi
  done <<< "$devices"

  if [[ -n "$FORCE_BUILD" ]] || { [[ "$missing" == 1 ]] && [[ ! -f "$ANDROID_APK" ]]; }; then
    # shellcheck disable=SC2086 # one serial per word
    abis="$(android_abis $devices)"
    echo "[local-dev] Building the development build for Android${abis:+ ($abis)} (the first build takes 10–20 min)."
    # `expo run:android` ends by opening a dev-client link this app can't handle, so build
    # with Gradle and install with adb; open_app launches it.
    (cd android && ./gradlew app:assembleDebug ${abis:+"-PreactNativeArchitectures=$abis"})
  fi
  # Every device already has the app, and there's no local build to compare it with.
  [[ -f "$ANDROID_APK" ]] || return 0

  apk_print="$(shasum -a 256 "$ANDROID_APK" | cut -d' ' -f1)"
  while read -r serial; do
    [[ -n "$serial" ]] || continue
    if [[ -n "$FORCE_BUILD" ]] || [[ "$(android_app_fingerprint "$serial")" != "$apk_print" ]]; then
      name="$(android_device_name "$serial")"
      if android_has_app "$serial"; then
        echo "[local-dev] Updating the app on $name (it had a different build)."
      else
        echo "[local-dev] Installing the app on $name."
      fi
      adb -s "$serial" install -r "$ANDROID_APK" >/dev/null \
        || echo "[local-dev] Couldn't install the app on $name. If it says INSTALL_FAILED_UPDATE_INCOMPATIBLE (a differently signed copy is installed), run: adb -s $serial uninstall $BUNDLE_ID"
    fi
  done <<< "$devices"
}

bundler_running() {
  curl -fsS -m 2 http://localhost:8081/status 2>/dev/null | grep -q "packager-status:running"
}

open_app_when_bundler_ready() {
  for _ in $(seq 1 180); do
    if bundler_running; then
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
if [[ "$INSTALL_APP" == 0 ]]; then
  : # --bundler-only
elif [[ "$PLATFORM" == "ios" ]]; then
  install_on_ios_simulators
else
  install_on_android_devices
fi

if [[ "$START_BUNDLER" == 0 ]]; then
  if bundler_running; then
    open_app || true
  else
    echo "[local-dev] Installed. Start the bundler in another terminal:"
    echo "  bash scripts/local-dev/06_staging_mobile.sh $PLATFORM --bundler-only"
  fi
  exit 0
fi

# Open the app once the bundler answers. This runs in the background and never
# reads the terminal, so the bundler below keeps its keyboard shortcuts.
open_app_when_bundler_ready &

# --clear: the bundler caches the API address from earlier runs (e.g. the local API).
exec npx expo start --clear
