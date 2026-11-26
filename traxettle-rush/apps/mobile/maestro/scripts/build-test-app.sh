#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────────────────────
# Build and install the app Maestro tests: a DEBUG build. It loads its JavaScript from the local
# Metro server (started by run-maestro.sh) and its built-in defaults point at the local API
# (localhost:3001 on iOS, 10.0.2.2:3001 on Android), so it can't reach staging or production.
#
#   bash apps/mobile/maestro/scripts/build-test-app.sh ios [simulator name]   # default: iPhone 17 Pro
#   bash apps/mobile/maestro/scripts/build-test-app.sh android                # the running emulator
#
# Rebuild only after native changes (new native modules, app.json); JavaScript comes from Metro.
#
# Don't use a Release build for Maestro: a Release build ignores the EXPO_PUBLIC_* settings
# (src/config/env.ts reads them in a way Release bundles don't inline) and falls back to the
# production API. On 2026-11-24 that sent test runs to production. run-maestro.sh also refuses to
# run flows unless the app's first sign-up reaches the local API.
# ──────────────────────────────────────────────────────────────────────────────
set -euo pipefail

PLATFORM="${1:-}"
MOBILE_DIR="$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)"
cd "$MOBILE_DIR"

if [[ "$PLATFORM" != "ios" && "$PLATFORM" != "android" ]]; then
  echo "Usage: $0 ios [simulator name] | android"
  exit 2
fi

if [[ -z "${JAVA_HOME:-}" && -x /opt/homebrew/opt/openjdk@21/bin/java ]]; then
  export JAVA_HOME=/opt/homebrew/opt/openjdk@21
  export PATH="$JAVA_HOME/bin:$PATH"
fi

if [[ "$PLATFORM" == "ios" ]]; then
  PLIST_DIR="$(dirname "$(find ios -maxdepth 2 -name Info.plist -path '*/Info.plist' | grep -v Pods | head -1)")"
  if [[ ! -f "$PLIST_DIR/GoogleService-Info.plist" ]]; then
    # Only Google Sign-In reads it, and the tests don't use Google Sign-In.
    echo "[test-app] no GoogleService-Info.plist: using GoogleService-Info.plist.example for this test build"
    cp GoogleService-Info.plist.example "$PLIST_DIR/GoogleService-Info.plist"
  fi
  # Xcode runs Node through ios/.xcode.env, which can pin a path that Homebrew has since upgraded
  # away. .xcode.env.local (git-ignored, read after it) points at the Node on PATH now.
  echo "export NODE_BINARY=$(command -v node)" > ios/.xcode.env.local
  # Xcode swaps Hermes, React Native's prebuilt core and its dependencies to match the configuration
  # by downloading them, which can fail inside its script sandbox. Do it here first, with retries.
  # The scripts and versions come from the Pods project's own build phases ("[CP-User] ... replace
  # ... version"), so they follow React Native: since 0.88 Hermes has its own version number.
  RN_DIR="$(node -p "require('path').dirname(require.resolve('react-native/package.json'))")"
  if [[ -d ios/Pods ]]; then
    REPLACE_STEPS="$(node -e '
      const s = require("fs").readFileSync("ios/Pods/Pods.xcodeproj/project.pbxproj", "utf8");
      const re = /\$REACT_NATIVE_PATH\/([\w\/.-]+\.js)\\" -c \\"\$CONFIG\\" -r \\"([^\\"]+)\\"/g;
      console.log([...new Set([...s.matchAll(re)].map((m) => m[1] + " " + m[2]))].join("\n"));
    ')"
    [[ -n "$REPLACE_STEPS" ]] || echo "[test-app] no replace-version build phases found in ios/Pods; Xcode will do them"
    while read -r script version; do
      [[ -n "$script" ]] || continue
      if [[ ! -f "$RN_DIR/$script" ]]; then
        echo "[test-app] skipping $script: not in this React Native version"
        continue
      fi
      for attempt in 1 2 3; do
        # Run them from ios/Pods, as Xcode does: they unpack into the current folder.
        if (cd ios/Pods && node "$RN_DIR/$script" -c Debug -r "$version" -p "$PWD"); then break; fi
        echo "[test-app] $script failed (attempt $attempt); retrying"
        sleep 5
      done
    done <<< "$REPLACE_STEPS"
  fi
  SIM="${2:-iPhone 17 Pro}"
  xcrun simctl boot "$SIM" >/dev/null 2>&1 || true
  # Show the simulator with the selected Xcode's app (xcode-select or DEVELOPER_DIR): Simulator.app,
  # or DeviceHub.app from Xcode 27, which has no Simulator.app.
  DEV_DIR="$(xcode-select -p)"
  if [[ -d "$DEV_DIR/Applications/Simulator.app" ]]; then
    open "$DEV_DIR/Applications/Simulator.app" >/dev/null 2>&1 || true
  elif [[ -d "${DEV_DIR%/Developer}/Applications/DeviceHub.app" ]]; then
    open "${DEV_DIR%/Developer}/Applications/DeviceHub.app" >/dev/null 2>&1 || true
  fi
  echo "[test-app] building Debug for the '$SIM' simulator (first build takes a while)"
  npx expo run:ios --configuration Debug --device "$SIM" --no-bundler
else
  ADB="${ANDROID_HOME:-$HOME/Library/Android/sdk}/platform-tools/adb"
  if ! "$ADB" devices | grep -qE "\sdevice$"; then
    echo "[test-app] start an Android emulator first (see the regression runbook)"
    exit 1
  fi
  if [[ ! -f android/app/debug.keystore ]]; then
    echo "[test-app] creating android/app/debug.keystore (git-ignored)"
    keytool -genkey -v -keystore android/app/debug.keystore -alias androiddebugkey -keyalg RSA -keysize 2048 \
      -validity 10000 -storepass android -keypass android -dname 'CN=Android Debug,O=Android,C=US' >/dev/null
  fi
  echo "[test-app] building Debug for the running emulator (first build takes a while)"
  npx expo run:android --variant debug --no-bundler
  # Android 17 asks before an app reaches the local network ("nearby devices"). React Native 0.88's
  # Debug library declares ACCESS_LOCAL_NETWORK so the app can reach Metro and the local API; grant
  # it here so the prompt doesn't cover the app. Older Android versions don't have the permission.
  "$ADB" shell pm grant com.traxettle.app android.permission.ACCESS_LOCAL_NETWORK >/dev/null 2>&1 || true
fi
echo "[test-app] installed com.traxettle.app (Debug). Run the flows with: rush test:regression:mobile"
