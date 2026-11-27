# Traxettle — command reference

Every command needed to run, test, build and deploy Traxettle, in one place. Each section is a set of
building blocks. [§2](#2-environments-and-recipes) shows how to combine them for common situations.

**Where to run things:**
- `traxettle-rush/` is the Rush root. Commands run there unless the block starts with `cd`.
- The mobile build scripts run from `traxettle-rush/apps/mobile`.
- `<…>` is a placeholder to fill in. `$WT` and similar are shell variables you set yourself.

Related runbooks: [XCODE_27_AND_MACOS_27.md](XCODE_27_AND_MACOS_27.md) (working with Xcode 27, what to
rerun after a pull, moving a Mac to macOS 27), [LOCAL_DEVELOPMENT.md](LOCAL_DEVELOPMENT.md) (the run modes in more detail),
[REGRESSION_SUITE.md](REGRESSION_SUITE.md), [DEPLOYMENT_RUNBOOK.md](../deployment/DEPLOYMENT_RUNBOOK.md),
[DEPLOYMENT_CHANNELS.md](../deployment/DEPLOYMENT_CHANNELS.md).

---

## Contents

1. [Safety rules](#1-safety-rules)
2. [Environments and recipes](#2-environments-and-recipes)
3. [Rush, Node and the workspace](#3-rush-node-and-the-workspace)
4. [iOS simulators](#4-ios-simulators)
5. [Xcode, SDKs and CocoaPods](#5-xcode-sdks-and-cocoapods)
6. [Android emulators and devices](#6-android-emulators-and-devices)
7. [API (backend) on this Mac](#7-api-backend-on-this-mac)
8. [Web app](#8-web-app)
9. [Mobile app: development and Release builds](#9-mobile-app-development-and-release-builds)
10. [Tests](#10-tests)
11. [Store builds and versions](#11-store-builds-and-versions)
12. [Deploying the API and web](#12-deploying-the-api-and-web)
13. [Firebase, data and RevenueCat tools](#13-firebase-data-and-revenuecat-tools)
14. [Git: branches, worktrees and tags](#14-git-branches-worktrees-and-tags)
15. [Troubleshooting](#15-troubleshooting)
16. [Files you need that aren't in git](#16-files-you-need-that-arent-in-git)

---

## 1. Safety rules

- **Release builds open on production.** That covers TestFlight and App Store builds, `expo run:ios
  --configuration Release`, and Android `debug:staging`, `staging` and `production` builds. To use staging
  in one, tap "Traxettle" 7 times on the sign-in screen. The app reloads on staging.
- **Never run Maestro against a Release build.** It signs up test users on the production API. Install
  the Debug test app first ([§10.3](#103-maestro-mobile-ui-flows)).
- **These change what users get:**
  - `deploy-prod.sh` and `deploy-web-prod.sh`;
  - `build-ios.sh testflight` / `xcode`, and `build-android.sh production`;
  - anything run with production credentials.
- **`android/` is tracked in git.** Never run `expo prebuild --clean` for Android. `ios/` is generated
  and git-ignored, so regenerate it freely.
- **Never commit** `rc_*.properties`, keystores, `gradle.properties.local`, `.env*`, Firebase config
  files or service-account keys ([§16](#16-files-you-need-that-arent-in-git)). Don't edit
  `rc_prod.properties`.
- **`rc_prod.properties` is not git-ignored.** Only `rc_local`, `rc_staging` and `rc_production` are, so
  check `git status` before every commit.
- **Staging data is shared.** A local API pointed at `traxettle-staging` writes real staging data.
- **Commands that do more than their name says:**
  - `bash scripts/doctor.sh` ends by running `build-android.sh production` when the Android SDK is set,
    which bumps the app version and `versionCode`.
  - `rushx build:android` (in `apps/mobile`) is the **production** Play build and bumps the version.
    `rush build:mobile` only type-checks.
  - `rushx prebuild:android` and `rush mobile:prebuild:android` run `expo prebuild --clean` on the
    tracked `android/` folder.
  - `deploy-staging.sh` and `deploy-prod.sh` replace every Cloud Run environment variable and destroy old
    secret versions ([§12](#12-deploying-the-api-and-web)).

---

## 2. Environments and recipes

### 2.1 The pieces

**Where the data lives (the backend):**

| Backend | Data | Start it with |
|---|---|---|
| In-memory API on this Mac | Inside the API process. Gone on restart. No Firebase sign-in | [§7.1](#71-in-memory-no-firebase) |
| Local API + Firebase emulators | Emulated project `traxettle-local` on this Mac | `01_emulator_mobile.sh` / `02_emulator_web.sh`, or [§7.2](#72-with-the-firebase-emulators) |
| Local API + real Firebase `traxettle-test` | The test project | `03_real_mobile.sh local` / `04_real_web.sh local`, or [§7.3](#73-with-real-firebase-test-or-staging) |
| Local API + real Firebase `traxettle-staging` | Staging data, shared | `03_real_mobile.sh staging` / `04_real_web.sh staging`, or [§7.3](#73-with-real-firebase-test-or-staging) |
| Deployed staging API (Cloud Run) | Staging | Already running: `https://traxettle-api-staging-943648574702.us-central1.run.app` |
| Deployed production API (Cloud Run) | Production | Already running: `https://traxettle-api-prod-ncwutlgtga-uc.a.run.app` |

"Local code against staging data" means a local API on real `traxettle-staging` (rows 4 and 6 below). It
runs your changes and reads and writes the staging database. "In-memory backend" means there is no
database at all, so it can't be combined with staging data.

**Who talks to it (the client):**

| Client | Which API it uses |
|---|---|
| Web dev server (`localhost:3000`) | `NEXT_PUBLIC_API_URL`, set when the dev server starts |
| Mobile **Debug** build + Metro | `EXPO_PUBLIC_API_URL*`, read when Metro bundles. Set them in Metro's terminal |
| Mobile **Release** build (simulator, emulator, TestFlight, Play) | Production. Staging after the 7-tap switch. Ignores `EXPO_PUBLIC_API_URL` |

### 2.2 Recipes

| # | I want to… | Do this |
|---|---|---|
| 1 | Check web UI quickly, no Firebase | In-memory API ([§7.1](#71-in-memory-no-firebase)) + web against it ([§8.2](#82-web-only-against-an-api-that-is-already-running)), signed in with a fake token |
| 2 | Work on web with emulated Firebase | `bash scripts/local-dev/02_emulator_web.sh` |
| 3 | Work on web, my API code, `traxettle-test` data | `bash scripts/local-dev/04_real_web.sh local` |
| 4 | Work on web, my API code, **staging data** | `bash scripts/local-dev/04_real_web.sh staging` |
| 5 | Run my web code against the **deployed** staging API | [§8.3](#83-web-dev-server-against-the-deployed-staging-api) |
| 6 | Work on mobile, my API code, **staging data** | Dev build on the simulator or emulator ([§9.1](#91-development-debug-builds)), then `bash scripts/local-dev/03_real_mobile.sh staging` |
| 7 | Work on mobile with emulated Firebase | Dev build installed, then `bash scripts/local-dev/01_emulator_mobile.sh` |
| 8 | Run my mobile code against the **deployed** staging API | `bash scripts/local-dev/06_staging_mobile.sh ios` (or `android`) |
| 9 | Web + iOS + Android together on staging data | Terminal 1: `03_real_mobile.sh staging`. Terminal 2: `04_real_web.sh staging`. The second API fails with `EADDRINUSE` (harmless); all three use the first |
| 10 | See Release behaviour (bundling, signing, the 7-tap switch) without a store | iOS: [§9.4](#94-release-builds-on-a-simulator-or-emulator). Android: `debug:staging` APK ([§9.4](#94-release-builds-on-a-simulator-or-emulator)) |
| 11 | Run the automated tests | [§10](#10-tests). Before a pull request: `bash scripts/regression/run.sh full` |
| 12 | Make store builds | [§11](#11-store-builds-and-versions). Order: API, then web, then the apps |
| 13 | Deploy the API or web | [§12](#12-deploying-the-api-and-web). Staging first |
| 14 | Test a deep link | iOS [§4.4](#44-apps-on-a-simulator), Android [§6.4](#64-apps-on-an-emulator-or-device) |

Notes on the `01`–`06` scripts:
- `01`–`04` read tier and payment flags from `scripts/local-dev/.runtime.env`
  ([§7.5](#75-tier-and-payment-flags-for-local-runs)).
- `01`–`04` all need `rc_local.properties` ([§16](#16-files-you-need-that-arent-in-git)) and stop without
  it, even the emulator modes.
- `03`/`04` default to `local`, which means the `traxettle-test` project. They need that environment's
  service-account key in `fb-service-accounts/`. Without it, the API quietly falls back to in-memory mock
  data. Check its log: you want real credentials, never "using mock services".
- `03` asks you to rebuild the Android app when you switch between `local` and `staging`, because the
  Google sign-in files differ.
- On Android, run `adb reverse tcp:8081 tcp:8081` and `adb reverse tcp:3001 tcp:3001` so the emulator
  reaches Metro and the local API.

---

## 3. Rush, Node and the workspace

The repo pins Rush 5.167.0, pnpm 9.15.9 and Node `>=24.11.1 <25` (`rush.json`). With any other Node, put
`RUSH_ALLOW_UNSUPPORTED_NODEJS=1` in front of every Rush command. No global Rush is needed: the
`install-run-rush.js` wrapper fetches the pinned version.

```bash
cd traxettle-rush
node common/scripts/install-run-rush.js install    # after cloning, switching branch, or pulling package changes
node common/scripts/install-run-rush.js update     # after editing a package.json (updates pnpm-lock.yaml)
node common/scripts/install-run-rush.js build      # build every project
node common/scripts/install-run-rush.js build --to @traxettle/shared --to @traxettle/ui   # only what the apps import
node common/scripts/install-run-rush.js rebuild    # build everything from scratch
node common/scripts/install-run-rush.js purge      # delete Rush's installs and caches; run install afterwards
```

With a global Rush, the same commands are `rush install`, `rush update`, `rush build` and so on.

```bash
npm install -g @microsoft/rush@5.167.0              # global Rush (optional)
npm ls -g @microsoft/rush                           # the global version
grep rushVersion rush.json                          # the version the repo uses
node -v
```

Rush's own shortcuts (`common/config/rush/command-line.json`). Run them as `rush <name>` or
`node common/scripts/install-run-rush.js <name>`, never with npm:

```bash
rush dev                          # API (:3001) + web (:3000)
rush dev:api:emulator             # API on :3002 against the Firebase emulators
rush dev:web:emulator             # that API + web
rush dev:mobile:emulator          # that API + Metro
rush dev:firebase:emulators       # the emulators in the background (log: nohup.out)
rush dev:firebase:emulators:stop  # check afterwards with: lsof -i :8080
rush test:regression              # = scripts/regression/run.sh full; also :quick, :mobile, :all
rush test:e2e                     # Playwright; ports 3200 and 3201 must be free
rush test:maestro:ios             # or :android
```

Run one project's npm script (its `package.json` → `scripts`):

```bash
cd apps/api && node ../../common/scripts/install-run-rushx.js dev    # or: rushx dev
cd apps/web && npx next dev --webpack                                # the web dev server must use webpack
```

The apps read `@traxettle/shared` from its built `dist/`. After changing `libraries/shared`, rebuild it
before running the API, web or mobile:

```bash
cd libraries/shared && npx tsc
```

Type checks, as the regression suite runs them:

```bash
(cd apps/api && npx tsc --noEmit) && (cd apps/web && npx tsc --noEmit) && (cd apps/mobile && npx tsc --noEmit)
```

---

## 4. iOS simulators

`booted` means "the booted simulator". With several booted, use a name or UDID instead.

### 4.1 Find and list

```bash
xcrun simctl list devices available                 # every simulator: name (UDID) (state)
xcrun simctl list devices booted
xcrun simctl list devices | grep -E '^-- iOS|Expo58|iOS27'   # which iOS version each one runs
xcrun simctl list runtimes                          # installed iOS versions; "unavailable" shows the reason
xcrun simctl runtime list                           # the runtime disk images
xcrun simctl list devicetypes                       # the models you can create
```

Which models an iOS version supports (for example the iPhone Duo needs its own iOS 27.2 build):

```bash
xcrun simctl list -j runtimes | python3 -c 'import json,sys; [print(r["identifier"], "available" if r.get("isAvailable") else "UNAVAILABLE", "Duo: yes" if any("Duo" in d["identifier"] for d in r.get("supportedDeviceTypes", [])) else "Duo: no") for r in json.load(sys.stdin)["runtimes"] if "iOS-" in r["identifier"]]'
```

The UDID of a simulator by name:

```bash
xcrun simctl list devices | grep "<name>" | grep -oE '[0-9A-F-]{36}'
```

### 4.2 Create and delete

```bash
xcrun simctl create "<name>" <device type id> <runtime id>
xcrun simctl create "iPhone 17 Pro iOS27" com.apple.CoreSimulator.SimDeviceType.iPhone-17-Pro com.apple.CoreSimulator.SimRuntime.iOS-27-2
xcrun simctl create "iPad iOS27" com.apple.CoreSimulator.SimDeviceType.iPad-Pro-13-inch-M5-12GB com.apple.CoreSimulator.SimRuntime.iOS-27-2
xcrun simctl create "iPhone Duo iOS27" com.apple.CoreSimulator.SimDeviceType.iPhone-Duo   # no runtime: picks the newest that supports it
xcrun simctl delete "<name or UDID>"
xcrun simctl delete unavailable                     # simulators whose iOS version is no longer installed
```

The newest installed runtime for a major version, skipping unavailable ones:

```bash
RT=$(xcrun simctl list runtimes | awk '/^iOS 27/ && !/unavailable/ {print $NF}' | tail -1); echo "$RT"
```

### 4.3 Start and stop

```bash
xcrun simctl boot "<name or UDID>"
open -a Simulator                                                  # Xcode 26: show the simulator window
open /Applications/Xcode.app/Contents/Applications/DeviceHub.app   # Xcode 27: DeviceHub replaces Simulator.app
xcrun simctl shutdown "<name or UDID>"
xcrun simctl shutdown all
xcrun simctl erase "<name or UDID>"                 # factory reset; shut it down first
```

New simulators start shut down. `build-test-app.sh`, `expo run:ios` and `06_staging_mobile.sh` boot them
when needed.

### 4.4 Apps on a simulator

```bash
xcrun simctl get_app_container booted com.traxettle.app      # prints a path if the app is installed
xcrun simctl install booted <path to .app>
xcrun simctl launch booted com.traxettle.app
xcrun simctl terminate booted com.traxettle.app
xcrun simctl uninstall booted com.traxettle.app
xcrun simctl openurl booted "com.traxettle.app://events/<eventId>"   # deep link
```

A simulator build's `.app` is at
`~/Library/Developer/Xcode/DerivedData/TraxettleappbyKarkhanisLabs-*/Build/Products/<Debug|Release>-iphonesimulator/TraxettleappbyKarkhanisLabs.app`.

### 4.5 Screenshots, logs and settings

```bash
xcrun simctl io booted screenshot ~/Desktop/sim.png
xcrun simctl io booted recordVideo ~/Desktop/sim.mov            # Control+C stops
xcrun simctl spawn booted log stream --level debug --predicate 'process == "TraxettleappbyKarkhanisLabs"'
xcrun simctl privacy booted grant photos com.traxettle.app      # also: camera; "reset all" clears them
xcrun simctl ui booted appearance dark                          # or light
xcrun simctl status_bar booted override --time 9:41 --batteryState charged --batteryLevel 100   # clean screenshots
xcrun simctl status_bar booted clear
```

### 4.6 Test devices

| Mac | Simulator | iOS | Used for |
|---|---|---|---|
| This Mac | `iPhone 17 Pro` | 26.5 | `stage` (Expo 54) |
| This Mac | `iPhone 17 Pro Expo58` (`4D3A0FFD-03A4-4195-864B-B22CFD77B955`) | 26.5 | `chore/expo-58` |
| Other Mac | `iPhone 17 Pro iOS27`, `iPad iOS27`, `iPhone Duo iOS27` | 27.x | Milestone B (Xcode 27) |

---

## 5. Xcode, SDKs and CocoaPods

### 5.1 Which Xcode, and switching

| Mac | Xcode 26 | Xcode 27.2 |
|---|---|---|
| This Mac | `/Applications/Xcode_26.5.app` (selected) | `/Applications/Xcode.app` (App Store copy, updates itself) |
| Other Mac | `/Applications/Xcode_26.app` (26.6, selected) | `/Applications/Xcode.app` (App Store copy) |

- **1.1.x hotfixes** (`stage`, Expo 54): Xcode 26.
- **App Store uploads from April 2027** must be built with the iOS 27 SDK, which means Xcode 27.
- Keep `xcode-select` on Xcode 26 and choose Xcode 27 per terminal with `DEVELOPER_DIR`.

```bash
xcode-select -p                                     # the selected Xcode
for x in /Applications/Xcode*.app; do echo "$x → $(DEVELOPER_DIR=$x/Contents/Developer xcodebuild -version | head -1)"; done
export DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer        # this terminal only (preferred)
unset DEVELOPER_DIR                                                    # back to the selected Xcode
sudo xcode-select -s /Applications/Xcode_26.5.app/Contents/Developer   # change the default for everything
xcodebuild -version && xcrun --sdk iphoneos --show-sdk-version         # check before every store build
xcodebuild -showsdks
```

`DEVELOPER_DIR` applies to everything started from that terminal: `xcodebuild`, `xcrun`, `pod`,
`expo run:ios`, Maestro's driver build and `build-ios.sh`. A new terminal window loses it. To set it
automatically inside one folder, and to check which Xcode and SDK a finished build used, see
[XCODE_27_AND_MACOS_27.md §3–4](XCODE_27_AND_MACOS_27.md#3-using-xcode-27-every-time).

### 5.2 First launch, licence and simulator runtimes

```bash
xcodebuild -checkFirstLaunchStatus || { sudo DEVELOPER_DIR="$DEVELOPER_DIR" xcodebuild -license accept && sudo DEVELOPER_DIR="$DEVELOPER_DIR" xcodebuild -runFirstLaunch; }
xcodebuild -downloadPlatform iOS                    # the iOS simulator runtime for the selected Xcode (several GB)
```

### 5.3 CocoaPods

Expo 58 needs CocoaPods 1.17.0.

```bash
pod --version
which pod; brew list --versions cocoapods; gem list '^cocoapods$'   # how it was installed
brew upgrade cocoapods                              # Homebrew install
sudo gem install cocoapods -v 1.17.0                # gem install with macOS's Ruby
cd apps/mobile/ios && pod install
cd apps/mobile/ios && pod install --repo-update     # when a pod version isn't found
```

### 5.4 The iOS native project

`apps/mobile/ios/` is generated from `app.json` and the config plugins, and git ignores it. Fixes belong
in a config plugin or a package version, never in hand edits to `ios/`.

```bash
cd apps/mobile && npx expo prebuild --platform ios --clean    # regenerate ios/ and run pod install
cd apps/mobile && echo "export NODE_BINARY=$(command -v node)" > ios/.xcode.env.local   # Xcode can't find node
cd apps/mobile && open -a "$(dirname "$(dirname "$(xcode-select -p)")")" ios/TraxettleappbyKarkhanisLabs.xcworkspace   # open in the selected Xcode
rm -rf ~/Library/Developer/Xcode/DerivedData/TraxettleappbyKarkhanisLabs-*   # clear Xcode's build cache
```

The Xcode project is named `TraxettleappbyKarkhanisLabs`, after `app.json`'s name.

### 5.5 Signing

```bash
security find-identity -v -p codesigning            # should list "Apple Distribution: …"
ls ~/Library/Developer/Xcode/UserData/Provisioning\ Profiles/ ~/Library/MobileDevice/Provisioning\ Profiles/ 2>/dev/null
security cms -D -i <file>.mobileprovision | plutil -p - | grep -E '"Name"|application-identifier|applesignin|ExpirationDate'
ls ~/Library/Developer/Xcode/Archives/              # archives; re-upload from Xcode → Window → Organizer
```

---

## 6. Android emulators and devices

Put the SDK tools on your path (add these lines to `~/.zshrc` to keep them):

```bash
export ANDROID_HOME=~/Library/Android/sdk
export PATH="$ANDROID_HOME/platform-tools:$ANDROID_HOME/emulator:$ANDROID_HOME/cmdline-tools/latest/bin:$PATH"
```

### 6.1 Find and list

```bash
emulator -list-avds                                 # the emulators (AVDs) you can start
avdmanager list avd                                 # the same, with device and Android version
adb devices -l                                      # what's running or plugged in, with its serial
adb -s emulator-5556 emu avd name                   # which AVD runs on a serial
```

### 6.2 Start and stop

```bash
emulator -avd Expo58_Pixel -port 5556 &             # serial emulator-5556
emulator -avd Traxettle_PlayTest -gpu swiftshader_indirect &   # Play Store image; Google sign-in's WebView crashes without -gpu
emulator -avd <name> -no-snapshot-load &            # cold boot
emulator -avd <name> -wipe-data &                   # factory reset
adb -s emulator-5556 wait-for-device shell getprop sys.boot_completed   # prints 1 once booted
adb -s emulator-5556 emu kill                       # stop one
adb devices | awk '/^emulator-/{print $1}' | xargs -I{} adb -s {} emu kill   # stop all
```

`export ANDROID_SERIAL=emulator-5556` makes `adb`, the build scripts and Maestro use that one device.

| AVD | Used for |
|---|---|
| `Pixel_10_Pro_XL` | `stage` (Expo 54) |
| `Expo58_Pixel` (port 5556, Pixel 8 Pro profile, Android 17) | `chore/expo-58` |
| `Traxettle_PlayTest` | Play Store builds |

### 6.3 Connecting a debug app to this Mac

```bash
adb reverse tcp:8081 tcp:8081                       # Metro
adb reverse tcp:3001 tcp:3001                       # local API (or use 10.0.2.2:3001 from the emulator)
adb reverse --list
```

### 6.4 Apps on an emulator or device

```bash
adb install -r <path to .apk>
adb shell am start -n com.traxettle.app/.MainActivity
adb shell am force-stop com.traxettle.app
adb shell pm clear com.traxettle.app                # wipe the app's data (signs out)
adb uninstall com.traxettle.app
adb shell dumpsys package com.traxettle.app | grep -E 'versionName|versionCode'
adb shell am start -W -a android.intent.action.VIEW -d "com.traxettle.app://events/<eventId>" com.traxettle.app   # deep link
adb shell pm grant com.traxettle.app android.permission.ACCESS_LOCAL_NETWORK   # Android 17, Debug builds
adb logcat '*:S' ReactNative:V ReactNativeJS:V      # the app's JavaScript logs
adb exec-out screencap -p > ~/Desktop/android.png
```

### 6.5 Java, Gradle and the Android project

Gradle 9 needs JDK 17 or later; the Firebase emulators need JDK 21. The build scripts fall back to
Homebrew's `openjdk@21` when `JAVA_HOME` isn't set.

```bash
/usr/libexec/java_home -V                           # installed JDKs
brew install openjdk@21
export JAVA_HOME=/opt/homebrew/opt/openjdk@21
cd apps/mobile/android && ./gradlew --stop          # stop Gradle daemons
cd apps/mobile/android && ./gradlew clean
rm -rf apps/mobile/android/app/build apps/mobile/android/app/.cxx apps/mobile/android/build apps/mobile/android/.gradle   # stale output after an Expo upgrade
```

`android/` is tracked in git. To apply an `app.json` change to it:

```bash
cd apps/mobile && npx expo prebuild --platform android --no-clean
git diff -- android/
```

Then restore what prebuild overwrites: `versionCode`, the launcher label `app_name` = "Traxettle", and
`rootProject.name = 'Traxettle'` (see the upgrade plan §10).

Signing fingerprints:

```bash
"$(ls -d ~/Library/Android/sdk/build-tools/* | tail -1)/apksigner" verify --print-certs <path to .apk> | grep -i 'SHA-1'
keytool -list -v -keystore apps/mobile/android/app/debug.keystore -storepass android | grep SHA1
```

Use `apksigner`, not `keytool -printcert -jarfile`. The app's minimum Android version is 7.0 or newer, so
Gradle signs only with the APK signature schemes v2/v3, and keytool, which reads JAR (v1) signatures,
finds nothing. `apksigner` prints the SHA-1 in lowercase without colons.

---

## 7. API (backend) on this Mac

The API runs on port 3001 and loads `traxettle-rush/.env.local` and `traxettle-rush/.env` for any
variable not already set. Relative key-file paths resolve against `traxettle-rush/`.

### 7.1 In memory (no Firebase)

```bash
cd apps/api && APP_ENV=local PORT=3001 npx ts-node src/index.ts
```

- The log must say "using mock services". If it found Firebase credentials (for example in `.env.local`),
  it isn't in memory.
- It accepts `Authorization: Bearer mock-<id>`.
- The mobile app can't use it: the app always signs in through Firebase.
- For web, sign in with a fake token ([§8.2](#82-web-only-against-an-api-that-is-already-running)).

### 7.2 With the Firebase emulators

```bash
bash scripts/firebase/start-emulators.sh            # Auth 9099, Firestore 8080, Storage 9199, UI http://localhost:4000
```

In a second terminal:

```bash
cd apps/api && APP_ENV=local PORT=3001 INTERNAL_TIER_SWITCH_ENABLED=true \
  FIREBASE_USE_EMULATOR=true FIREBASE_PROJECT_ID=traxettle-local \
  FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 STORAGE_EMULATOR_HOST=127.0.0.1:9199 \
  node ../../common/scripts/install-run-rushx.js dev
```

Create users with `POST /api/auth/register` and use the `accessToken` it returns.

### 7.3 With real Firebase (test or staging)

`bootstrap.sh` copies that environment's Firebase files into place and writes
`scripts/local-dev/.bootstrap.env`. `local` means the `traxettle-test` project.

```bash
bash scripts/local-dev/bootstrap.sh staging         # or: local
set -a; source scripts/local-dev/.bootstrap.env; set +a
cd apps/api && APP_ENV=local PORT=3001 INTERNAL_TIER_SWITCH_ENABLED=true FIREBASE_USE_EMULATOR=false \
  FIREBASE_PRIVATE_KEY_FILE="$BOOTSTRAP_FIREBASE_SA_FILE" FIREBASE_PROJECT_ID="$BOOTSTRAP_FIREBASE_PROJECT_ID" \
  FIREBASE_STORAGE_BUCKET="$BOOTSTRAP_FIREBASE_STORAGE_BUCKET" \
  node ../../common/scripts/install-run-rushx.js dev
```

`03_real_mobile.sh` and `04_real_web.sh` do exactly this, plus Metro or the web server.

### 7.4 Health, ports and stopping

```bash
curl -s http://localhost:3001/health
curl -s https://traxettle-api-staging-943648574702.us-central1.run.app/health
curl -s https://traxettle-api-prod-ncwutlgtga-uc.a.run.app/health
lsof -nP -iTCP -sTCP:LISTEN | grep -E ':(3000|3001|3011|8081|8080|9099|9199|4000) '   # what's running
lsof -ti tcp:3001 -sTCP:LISTEN | xargs kill         # stop whatever holds a port
```

| Port | Service |
|---|---|
| 3000 | Web dev server |
| 3001 | API |
| 3011 | API started by the Maestro runner (`MAESTRO_API_PORT=3011`) |
| 3200 / 3201 | Web / API started by Playwright |
| 8081 | Metro |
| 9099 / 8080 / 9199 | Firebase Auth / Firestore / Storage emulators |
| 4000 | Firebase emulator UI |

### 7.5 Tier and payment flags for local runs

```bash
bash scripts/local-dev/05_set-flags.sh --tier free --payments mock   # use this for hand tests
bash scripts/local-dev/05_set-flags.sh --tier pro --payments mock
cat scripts/local-dev/.runtime.env
```

The file is tracked in git and is often left at `pro` / real payments. Check it before a hand test.

---

## 8. Web app

### 8.1 With a local API (one command)

```bash
bash scripts/local-dev/02_emulator_web.sh           # emulators + API + web
bash scripts/local-dev/04_real_web.sh staging       # API on real staging Firebase + web (or: local)
```

The web app is at http://localhost:3000.

### 8.2 Web only, against an API that is already running

```bash
cd apps/web && NEXT_PUBLIC_APP_ENV=local NEXT_PUBLIC_API_URL=http://localhost:3001 NEXT_PUBLIC_ALLOW_LOCAL_TIER_SWITCH=true npx next dev --webpack
```

With the in-memory API, sign in from the browser console, then reload:

```js
localStorage.setItem('traxettle.authToken', 'mock-alice'); localStorage.setItem('traxettle.uid', 'mock-alice'); location.reload();
```

### 8.3 Web dev server against the deployed staging API

The web app signs in with Firebase in the browser, so it needs staging's Firebase web settings as well
as the API address. `bootstrap.sh staging` extracts them.

```bash
bash scripts/local-dev/bootstrap.sh staging
set -a; source scripts/local-dev/.bootstrap.env; set +a
cd apps/web && NEXT_PUBLIC_APP_ENV=staging \
  NEXT_PUBLIC_API_URL=https://traxettle-api-staging-943648574702.us-central1.run.app \
  NEXT_PUBLIC_FIREBASE_API_KEY="$BOOTSTRAP_FIREBASE_API_KEY" NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN="$BOOTSTRAP_FIREBASE_AUTH_DOMAIN" \
  NEXT_PUBLIC_FIREBASE_PROJECT_ID="$BOOTSTRAP_FIREBASE_PROJECT_ID" NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET="$BOOTSTRAP_FIREBASE_STORAGE_BUCKET" \
  NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID="$BOOTSTRAP_FIREBASE_MESSAGING_SENDER_ID" NEXT_PUBLIC_FIREBASE_APP_ID="$BOOTSTRAP_FIREBASE_APP_ID" \
  npx next dev --webpack
```

This is assembled from `04_real_web.sh`, not a script of its own. Sign in with a staging account.

### 8.4 A production build on this Mac

```bash
cd apps/web && npx next build --webpack && npx next start    # http://localhost:3000
```

---

## 9. Mobile app: development and Release builds

The app has no `expo-dev-client`. Development builds open directly, never through
`expo start --dev-client`.

### 9.1 Development (Debug) builds

A Debug build loads its JavaScript from Metro, so rebuild only after native changes (a new native
package, `app.json`, Expo upgrade). Afterwards, Metro is enough.

```bash
cd apps/mobile && npx expo run:ios --device "<simulator name or UDID>" --no-bundler   # build + install
cd apps/mobile && npx expo run:android --variant debug --no-bundler                   # build + install on the running emulator
cd apps/mobile && bash scripts/build-ios.sh debug           # build + install + Metro, with local-API settings (Expo's default simulator)
cd apps/mobile && bash scripts/build-android.sh debug       # Debug APK: android/app/build/outputs/apk/debug/app-debug.apk
```

`06_staging_mobile.sh` installs on every booted simulator or running emulator for you:

```bash
bash scripts/local-dev/06_staging_mobile.sh ios --build --no-bundler    # build and install, no Metro
bash scripts/local-dev/06_staging_mobile.sh ios --bundler-only          # Metro + open the app
STAGING_API_URL=<url> bash scripts/local-dev/06_staging_mobile.sh android
```

### 9.2 Metro (the JavaScript server)

Metro reads `EXPO_PUBLIC_*` when it bundles, so set them in the same command:

```bash
cd apps/mobile && EXPO_PUBLIC_APP_ENV=local EXPO_PUBLIC_API_URL_IOS=http://localhost:3001 EXPO_PUBLIC_API_URL_ANDROID=http://10.0.2.2:3001 npx expo start --clear
rm -rf "$TMPDIR"/metro-*                            # clear Metro's cache when switching API targets
```

Then open the installed app: iOS `xcrun simctl launch booted com.traxettle.app`. On Android, run
`adb reverse tcp:8081 tcp:8081` first, then `adb shell am start -n com.traxettle.app/.MainActivity`.

| Variable | Meaning |
|---|---|
| `EXPO_PUBLIC_API_URL_IOS` / `_ANDROID` | API for a Debug build on a simulator / emulator. Preferred over `EXPO_PUBLIC_API_URL` |
| `EXPO_PUBLIC_API_URL` | API fallback; the staging URL for `06_staging_mobile.sh` |
| `EXPO_PUBLIC_APP_ENV` | `local`, `staging` or `production`; also tags RevenueCat user ids |
| `EXPO_PUBLIC_FIREBASE_USE_EMULATOR` | `true` with the Firebase emulators. Needs `EXPO_PUBLIC_LOCAL_DEV_OPTIONS_ENABLED=true` |
| `EXPO_PUBLIC_DEFAULT_TIER`, `EXPO_PUBLIC_USE_REAL_PAYMENTS` | Tier and payment flags |

### 9.3 The Maestro test app

```bash
bash apps/mobile/maestro/scripts/build-test-app.sh ios "<simulator name or UDID>"   # default: iPhone 17 Pro
bash apps/mobile/maestro/scripts/build-test-app.sh android                          # the running emulator
```

It's a Debug build pointed at the local API, so it can't reach staging or production. On launch it shows
"Failed to load Firebase configuration" until the Maestro runner starts the API and Metro. That is
expected. Control+C stops Expo's log view after installing; the app stays installed.

### 9.4 Release builds on a simulator or emulator

These open on production. Look, but sign in only after switching to staging with the 7 taps.

```bash
cd apps/mobile && npx expo run:ios --configuration Release --device "<simulator name or UDID>" --no-bundler
cd apps/mobile && bash scripts/build-android.sh debug:staging     # Release APK, no Metro needed
adb install -r apps/mobile/android/app/build/outputs/apk/release/app-release.apk
```

Despite the name, the `debug:staging` APK is a Release build. It opens on production too.

**Switching environment in a Release build:**
- tap "Traxettle" 7 times on Login, Register or Forgot password; or
- Profile → tap the version → Developer (Hidden).

The app reloads each time.

After a Release or TestFlight build, a simulator Debug build can fail with
`Undefined symbols … facebook::react::Sealable::Sealable()`. Regenerate `ios/` and clear DerivedData
([§5.4](#54-the-ios-native-project)); `06_staging_mobile.sh` does this itself.

### 9.5 Checks

```bash
cd apps/mobile && npx expo install --check          # package versions match the Expo SDK
cd apps/mobile && npx expo-doctor
cd apps/mobile && npx expo export --platform ios --output-dir "$TMPDIR/expo-export-check"   # does the bundle build?
cd apps/mobile && npx tsc --noEmit
```

---

## 10. Tests

### 10.1 The regression suite

```bash
bash scripts/regression/run.sh quick                # type checks + every unit suite (~3 min)
bash scripts/regression/run.sh full                 # quick + Playwright (~7 min); the default
bash scripts/regression/run.sh mobile               # Maestro on a booted simulator or emulator
bash scripts/regression/run.sh all                  # full + mobile
bash scripts/regression/run.sh --only api,web       # steps: build typecheck shared ui api web mobile e2e maestro
```

Logs and a summary go to `artifacts/regression/<timestamp>/`. Its first step builds `shared` and `ui`, so
no separate `rush build` is needed.

### 10.2 One project or one test

```bash
cd apps/api && npx jest <path or name pattern>
cd apps/web && npx jest <path or name pattern>
cd apps/mobile && npx jest src/screens/__tests__/LoginScreen.test.tsx
cd apps/mobile && npx jest --coverage
cd e2e && npx playwright test                       # starts its own API (:3201) and web (:3200)
cd e2e && npx playwright test tests/<spec>.spec.ts
cd e2e && npx playwright show-report
```

Without Playwright's own browsers, `run.sh` uses Google Chrome (`PLAYWRIGHT_CHANNEL=chrome`).

### 10.3 Maestro (mobile UI flows)

You need Maestro 2.12 or later, JDK 21, and the Debug test app installed ([§9.3](#93-the-maestro-test-app)).
The runner starts the Firebase emulators, an API and Metro. It first checks that the app reaches that
local API.

```bash
~/.maestro/bin/maestro --version
curl -Ls "https://get.maestro.mobile.dev" | bash    # install or upgrade
MAESTRO_DEVICE=<UDID or emulator-5556> MAESTRO_API_PORT=3011 bash scripts/regression/run.sh mobile
MAESTRO_DEVICE=<…> MAESTRO_API_PORT=3011 MAESTRO_FLOWS="auth events/create-and-manage.yaml" bash scripts/regression/run.sh mobile   # some flows
MAESTRO_MODE=artifacts MAESTRO_DEVICE=<…> MAESTRO_API_PORT=3011 bash scripts/regression/run.sh mobile   # also screenshots and a JUnit report in apps/mobile/maestro/artifacts/
```

- `MAESTRO_FLOWS` names folders or files under `apps/mobile/maestro/flows`: `auth`, `events`, `groups`,
  `navigation`, `pools`, `settlement`.
- **App Store screenshots** use the same runner, on throwaway emulators with seeded demo data:
  `MAESTRO_API_PORT=3011 bash apps/mobile/maestro/scripts/capture-screenshots.sh "<simulator>"`.
  The output goes to `<repo root>/app-store-assets/<size class>/`. See
  [REGRESSION_SUITE.md §6.1](REGRESSION_SUITE.md#61-app-store-screenshots).
- The runner stops if ports 3011, 8081, 8080, 9099 or 9199 are taken ([§7.4](#74-health-ports-and-stopping)).
- A single-flow run prints no "Flows Passed" line. Look for `FAILED` lines instead.
- On iOS, a flow can fail once on a late "Save Password?" prompt, or on a driver crash
  (`viewHierarchy failed, code: 500`). Rerun that flow.

---

## 11. Store builds and versions

Release order: deploy the API, then the web, then build the apps.

### 11.1 Versions

iOS and Android share one version. `release-versions.json` records what each store last got.

```bash
cd apps/mobile && bash scripts/version.sh                   # current version and what the next builds get
cd apps/mobile && npm run version:bump -- minor             # start a feature release (patch | minor | major | x.y.z)
cd apps/mobile && bash scripts/version.sh record ios <build number>   # after uploading by hand from Organizer
```

The store build scripts run `prepare` and `record` themselves. Commit `app.json`, `package.json`,
`android/app/build.gradle` and `release-versions.json` afterwards.

### 11.2 iOS: TestFlight and the App Store

```bash
cd apps/mobile
export DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer   # Xcode 27 for uploads from April 2027
IOS_PROVISIONING_PROFILE="<App Store profile name>" APPLE_TEAM_ID=<team id> bash scripts/build-ios.sh testflight
```

- **What it does:** prebuild, archive with the production settings, upload, then record the version.
- **Check the Xcode:** it prints `Xcode: … iOS SDK …` near the start. Stop if it shows the wrong one.
- **Signing:** without `IOS_PROVISIONING_PROFILE`, it signs automatically, which needs a registered device.
- **Upload login:** the Apple account in Xcode → Settings → Accounts, or `ASC_KEY_PATH`, `ASC_KEY_ID`
  and `ASC_KEY_ISSUER_ID`.
- **Other settings:** `IOS_BUILD_NUMBER` overrides the build number (default `yymmddHHMM`), and
  `IOS_SIGNING_IDENTITY` the certificate (default "Apple Distribution").
- **If the upload fails:** the archive stays in Organizer. Upload from there, then run
  `version.sh record ios <build>`.

To archive in Xcode by hand instead:

```bash
bash scripts/build-ios.sh xcode                     # prepares everything and opens the selected Xcode
bash scripts/build-ios.sh xcode-done                # after uploading: records the version, restores files
bash scripts/build-ios.sh xcode-done --not-uploaded # if you didn't upload
```

While an `xcode` build is pending (`.xcode-build-pending`), other iOS and Android builds refuse to start.

### 11.3 Android: Google Play

```bash
cd apps/mobile && bash scripts/build-android.sh production   # Release .aab with production settings; sets and records the version
```

- **Output:** `android/app/build/outputs/bundle/release/app-release.aab`. Upload it to Play internal
  testing, then promote it.
- **Every Play upload uses `production`.** A Play build is promoted from track to track, so it must have
  production settings.
- **`staging` profile:** builds an AAB with staging settings. Don't upload it.
- **Order:** build the AAB after the final iOS candidate, from the same commit, so both platforms ship
  the same version.

Check the release signing (the upload key):

```bash
cd apps/mobile && bash scripts/build-android.sh debug:staging
"$(ls -d ~/Library/Android/sdk/build-tools/* | tail -1)/apksigner" verify --print-certs android/app/build/outputs/apk/release/app-release.apk | grep -i 'SHA-1'
```

Expect `Signer #1 certificate SHA-1 digest: 6a773af78044df9049776440891527ab8d10ae26`, which is
`6A:77:3A:F7:80:44:DF:90:49:77:64:40:89:15:27:AB:8D:10:AE:26` in the format Play Console shows.

---

## 12. Deploying the API and web

Deploy staging first, then production. Release order: API, then web, then the apps. Every script here
uploads your **working tree**, committed or not, so deploy from a clean checkout of the branch you mean.

| | Staging | Production |
|---|---|---|
| GCP / Firebase project | `traxettle-staging` | `traxettle-prod` |
| API service | `traxettle-api-staging` | `traxettle-api-prod` (always one instance, always billed) |
| API URL | `https://traxettle-api-staging-943648574702.us-central1.run.app` | `https://traxettle-api-prod-ncwutlgtga-uc.a.run.app` |
| Web service | `traxettle-web-staging` | `traxettle-web-prod` |
| Web URL | `https://traxettle-staging.web.app` | `https://traxettle.app` |
| Region | `us-central1` | `us-central1` |

### 12.1 Before deploying

```bash
gcloud auth login                                   # needs rights on traxettle-staging and traxettle-prod
firebase login                                      # web deploys
which gcloud firebase jq                            # jq is required; see the warning below
gcloud config get-value project
```

The deploy scripts also need files that aren't in git
([§16](#16-files-you-need-that-arent-in-git)): `.traxettle/api-<env>.env`, `rc_<env>.properties`, the
service-account key, and for the `-gmail` variants the SMTP file.

### 12.2 API

```bash
bash scripts/api-deployment/configure-staging.sh       # once per Mac: writes .traxettle/api-staging.env (interactive)
bash scripts/api-deployment/deploy-staging-gmail.sh    # deploy with email sending
bash scripts/api-deployment/deploy-staging.sh          # deploy with email turned off
bash scripts/api-deployment/verify-deployed-api-env.sh staging   # reads only
curl -s https://traxettle-api-staging-943648574702.us-central1.run.app/health
gcloud run services logs read traxettle-api-staging --project traxettle-staging --region us-central1 --limit 100 | grep -i firebase
```

For production, the same with `configure-prod.sh`, `deploy-prod-gmail.sh` or `deploy-prod.sh`,
`verify-deployed-api-env.sh production`, and service `traxettle-api-prod` in project `traxettle-prod`.

What to know before running a deploy:
- **Check the logs every time.** You want "Initializing Firebase with real credentials", never "using mock
  services".
- **`jq` is required but never checked.** Without it, the Firebase key is stored as `null` and the API
  silently runs on in-memory mock data.
- **Reuse the existing JWT secrets** when `configure-*.sh` asks. New ones sign every user out.
- **Settings made by hand in the Cloud Run console are lost.** The scripts replace every environment
  variable on each deploy.
- **Old secret versions are destroyed.** Each deploy writes new versions of `traxettle-<stg|prod>-api-config`
  and `-mobile-config` and destroys the old ones, so rolling back a revision doesn't bring old secrets
  back.
- **`deploy-*.sh` runs `gcloud config set project`**, which changes your default project.
- **`verify-deployed-api-env.sh` always shows two false alarms:** a missing `FIREBASE_PROJECT_ID` (now
  inside the secret) and a missing `…-firebase-project-id` secret (deleted on purpose).

### 12.3 Web

```bash
bash scripts/web-deployment/deploy-web-staging.sh    # staging; its settings are written into the script
bash scripts/web-deployment/configure-prod.sh        # once per Mac: writes .traxettle/web-prod.env
bash scripts/web-deployment/deploy-web-prod.sh       # production
```

Each one builds the web container on Cloud Run, then points Firebase Hosting at it.

### 12.4 Inspect and roll back

```bash
gcloud run services describe traxettle-api-prod --project traxettle-prod --region us-central1 --format='value(status.url)'
gcloud run revisions list --service traxettle-api-prod --project traxettle-prod --region us-central1
gcloud run services update-traffic traxettle-api-prod --project traxettle-prod --region us-central1 --to-revisions <previous revision>=100
gcloud secrets list --project traxettle-prod
```

`gcloud secrets versions access latest --secret traxettle-prod-api-config --project traxettle-prod` prints
every API secret, including the Firebase private key. Don't run it where others can see your screen.

### 12.5 Firestore and Storage rules

No script deploys them. Paste `firestore.rules` and `storage.rules` into the Firebase console, or run:

```bash
firebase deploy --only firestore:rules,storage --project traxettle-staging    # always pass --project
```

`.firebaserc` defaults to `traxettle-local`, so leaving out `--project` targets the emulator project.
Don't deploy `firestore:indexes`: `firestore.indexes.json` is empty, so Firebase would offer to delete the
indexes made in the console.

---

## 13. Firebase, data and RevenueCat tools

### 13.1 Firebase emulators

```bash
bash scripts/firebase/start-emulators.sh            # project traxettle-local; data in .firebase/emulator-data
FIREBASE_EMULATOR_IMPORT_DIR=<folder> bash scripts/firebase/start-emulators.sh   # another data folder
```

- **Ports:** Auth 9099, Firestore 8080, Storage 9199, UI http://localhost:4000.
- **Requirements:** JDK 21, and the `firebase` CLI or `npx firebase-tools`.
- **Data is saved only on a clean stop** (Control+C).
- **Maestro keeps its own data** in `apps/mobile/maestro/.firebase-data`.
- **Test users:** create them with `POST http://localhost:3001/api/auth/register`.
- **Ids for Maestro:** `apps/mobile/maestro/scripts/user-id.js` finds a test user's id, for Maestro's
  `spender-<id>` test ids.

### 13.2 Local API checks

```bash
node scripts/local-dev/pool-smoke.mjs                         # money-pooling smoke test against http://localhost:3001
API=http://localhost:3201 node scripts/local-dev/pool-smoke.mjs
```

It needs an API started with `APP_ENV=local INTERNAL_TIER_SWITCH_ENABLED=true`
([§7.1](#71-in-memory-no-firebase)).

### 13.3 Android debug keystores

```bash
bash scripts/firebase/create-debug-keystore.sh local     # or: staging; writes apps/mobile/debug.keystore.<env>
```

It overwrites the existing one, which changes its SHA-1. Google sign-in then fails until you add the new
SHA-1 to that Firebase project's Android app and download `google-services.<env>.json` again.

### 13.4 RevenueCat

```bash
bash scripts/revenuecat/configure.sh staging             # writes rc_staging.properties (interactive); local | staging | production
bash -lc 'source scripts/revenuecat/load-rc-config.sh staging && env | grep REVENUECAT'   # what a build would get
bash scripts/revenuecat/check-config.sh                  # checks .env.local + rc_local.properties
API_BASE=http://localhost:3001 bash scripts/revenuecat/smoke-webhook.sh   # fake purchase webhook
```

`smoke-webhook.sh` makes the user it asks for Pro. Point it only at a local API.

### 13.5 Doctor

```bash
bash scripts/doctor.sh staging -n                    # local | staging | production; -n = no questions
```

It checks tools, settings and the deployed `/api/config`. At the end it builds the API and web and, if
the Android SDK is set, runs `build-android.sh production`, which bumps the version. Run it only when you
mean to. `tools/doctor-tool/scripts/doctor-apple-team.sh` explains how to find your Apple Team ID.

### 13.6 Data scripts

| Command | What it does | Safety |
|---|---|---|
| `node apps/api/scripts/cleanup-prod-test-accounts-2026-11-24.js --project traxettle-prod --from-secret traxettle-prod-api-config` | Lists the 31 known test accounts in production | Dry run. `--apply` deletes them |
| `cd apps/api && node ../../scripts/check-traxettle-smtp.js` | Checks the SMTP login (`SMTP_*` from the environment or flags) | `--sendTo <address>` sends a real email |
| `scripts/check-specific-users.js`, `cleanup-test-users.js`, `merge-duplicate-users.js` | Old one-off scripts | Each needs its service-account path edited. The last two **delete user documents with no confirmation**. `check-users.js` doesn't work |

---

## 14. Git: branches, worktrees and tags

```bash
git fetch origin && git switch <branch>
git merge --no-ff origin/stage                      # bring stage into a pushed branch; never rebase a pushed branch
git tag -l 'ios-v*' 'android-v*'                    # release tags, e.g. ios-v1.1.0 (hotfixes branch from these)
git log --oneline origin/stage..HEAD                # what a branch adds
```

A second checkout of another branch, for example to keep `stage` ready for a hotfix:

```bash
MAIN=<path to your checkout>; WT="$MAIN-<suffix>"
git -C "$MAIN" fetch origin && git -C "$MAIN" worktree add "$WT" <branch>
git worktree list
git -C "$MAIN" worktree remove "$WT"
```

A new worktree has none of the files that aren't in git ([§16](#16-files-you-need-that-arent-in-git)).
List the ones in the main checkout, check the list, then copy them across:

```bash
cd "$MAIN" && FILES=$(git ls-files -o -- 'traxettle-rush/rc_*.properties' 'traxettle-rush/apps/mobile/GoogleService-Info*.plist' 'traxettle-rush/apps/mobile/google-services*.json' 'traxettle-rush/apps/mobile/debug.keystore.*' traxettle-rush/apps/mobile/keystore traxettle-rush/apps/mobile/android/gradle.properties.local traxettle-rush/fb-service-accounts traxettle-rush/fb-web-configs traxettle-rush/.traxettle traxettle-rush/.env.local traxettle-rush/apps/api/.env traxettle-rush/apps/web/.env.local traxettle-rush/apps/mobile/.env.local 'traxettle-rush/scripts/api-deployment/smtp_*.local.properties'); echo "$FILES"
echo "$FILES" | while read -r f; do mkdir -p "$WT/$(dirname "$f")" && cp -p "$f" "$WT/$f"; done; git -C "$WT" status --short
```

`git ls-files -o` lists untracked files, ignored or not, so it also finds `rc_prod.properties`.
`git status` in the worktree should then show only `rc_prod.properties`, if you have it.

Then run `rush install` in the worktree's `traxettle-rush/`. Switching an existing checkout between
`stage` (Expo 54) and `chore/expo-58` also needs `rush install`. `build-ios.sh` regenerates `ios/`
itself.

---

## 15. Troubleshooting

| Problem | Fix |
|---|---|
| `Unable to find rush.json` | Run Rush from `traxettle-rush/`, not the repo root |
| Rush refuses your Node version | Put `RUSH_ALLOW_UNSUPPORTED_NODEJS=1` in front, or use Node 24 |
| A new terminal "forgot" Xcode 27 or `$WT` | Set `DEVELOPER_DIR` and the variables again |
| Simulator: "runtime is not available" | Wrong Xcode selected ([§5.1](#51-which-xcode-and-switching)), or download the runtime for this Xcode ([§5.2](#52-first-launch-licence-and-simulator-runtimes)) |
| `simctl create`: "Invalid device type" | That iOS version doesn't support the model ([§4.1](#41-find-and-list)); leave out the runtime |
| Expo: "Couldn't install Pods. Updating the Pods project…" | Normal retry with a fresh spec list. If it fails again: `pod --version` (need 1.17.0), then `pod install` in `ios/` to see the error |
| `Undefined symbols … Sealable` after a Release build | `npx expo prebuild --platform ios --clean` + clear DerivedData ([§5.4](#54-the-ios-native-project)) |
| Xcode can't find `node` | Write `ios/.xcode.env.local` ([§5.4](#54-the-ios-native-project)) |
| App: "Failed to load Firebase configuration" | No API at the address the app uses. Start one ([§7](#7-api-backend-on-this-mac)), or run Maestro, which starts its own |
| Android app can't reach Metro or the API | `adb reverse tcp:8081 tcp:8081` and `adb reverse tcp:3001 tcp:3001` |
| Android 17 asks about "nearby devices" | `adb shell pm grant com.traxettle.app android.permission.ACCESS_LOCAL_NETWORK` (Debug builds only) |
| Google Sign-In `DEVELOPER_ERROR` / Error 10 on Android | The SHA-1 doesn't match Firebase. Run `bash scripts/local-dev/bootstrap.sh <env>`, and rebuild after switching environment |
| Google sign-in crashes on the Play emulator | Start it with `-gpu swiftshader_indirect` |
| Port already in use | [§7.4](#74-health-ports-and-stopping) |
| App still talks to the old API | Restart Metro with `--clear` and `rm -rf "$TMPDIR"/metro-*` |
| Gradle build fails after an upgrade | `./gradlew --stop`, then remove the old build folders ([§6.5](#65-java-gradle-and-the-android-project)) |
| Data gone from the Firebase emulators | They save only on a clean stop (Control+C), not when killed |

---

## 16. Files you need that aren't in git

Keep these only on the Macs that build or deploy. Never commit them. To copy them into a second checkout,
see [§14](#14-git-branches-worktrees-and-tags). Paths are relative to `traxettle-rush/`.

Firebase projects: `traxettle-local` (emulators only), `traxettle-test` (what the scripts call `local`),
`traxettle-staging`, `traxettle-prod`.

### 16.1 What each job needs

| Job | Needs |
|---|---|
| Unit tests, Playwright, Maestro, `rush dev:*:emulator`, in-memory API | Nothing private |
| `01_emulator_mobile.sh`, `02_emulator_web.sh` | `rc_local.properties` |
| `03`/`04 … local` | `rc_local.properties`, `fb-service-accounts/traxettle-fb-sa-test.json`, `apps/mobile/google-services.local.json`, `apps/mobile/GoogleService-Info.local.plist`; for Google sign-in on Android also `apps/mobile/debug.keystore.local` |
| `03`/`04 … staging` | The same with `staging`: `traxettle-fb-sa-staging.json`, `google-services.staging.json`, `GoogleService-Info.staging.plist`, `debug.keystore.staging`, plus `rc_local.properties` |
| `06_staging_mobile.sh` | The staging Firebase files. `rc_staging.properties` is optional (without it, purchases don't work) |
| `build-ios.sh debug` | `rc_local.properties`, `GoogleService-Info.local.plist` (or `GoogleService-Info.plist`) |
| `build-ios.sh testflight` / `xcode` | `rc_prod.properties` (or `rc_production.properties`), `GoogleService-Info.staging.plist` (store builds use the staging one), `APPLE_TEAM_ID`, signing and upload login ([§16.3](#163-credentials-that-arent-files)) |
| `build-android.sh debug` | `rc_local.properties`, `google-services.local.json` (or `google-services.json`) |
| `build-android.sh debug:staging` / `staging` | `rc_staging.properties`, `google-services.staging.json`, the release keystore, `android/gradle.properties.local` |
| `build-android.sh production` | `rc_production.properties` (or `rc_prod.properties`), `google-services.prod.json` (or `google-services.json`), the release keystore, `android/gradle.properties.local` |
| `deploy-staging.sh` / `deploy-prod.sh` | `gcloud` login, `jq`, `.traxettle/api-<staging\|prod>.env`, `rc_<staging\|production>.properties`, the service-account key it names; `-gmail` variants also `scripts/api-deployment/smtp_<staging\|prod>.local.properties` |
| `deploy-web-staging.sh` | `gcloud` and `firebase` logins, `rc_staging.properties` |
| `deploy-web-prod.sh` | The same, plus `.traxettle/web-prod.env` and `rc_production.properties` (or `rc_prod.properties`) |

### 16.2 The files

| File | What it is | Where it comes from |
|---|---|---|
| `rc_local.properties`, `rc_staging.properties`, `rc_production.properties` (older name `rc_prod.properties`) | RevenueCat public keys (`appl_…`, `goog_…`), entitlement `traxettle-pro`, offering `default`, webhook secret | `bash scripts/revenuecat/configure.sh <env>`, values from RevenueCat → API keys. Template: `rc_env.properties.example` |
| `apps/mobile/GoogleService-Info.<local\|staging>.plist` | iOS Firebase config; only Google Sign-In reads it | Firebase console → project → iOS app `com.traxettle.app`. Template: `GoogleService-Info.plist.example` |
| `apps/mobile/google-services.<local\|staging\|prod>.json` | Android Firebase config; the scripts read client ids and keys from it | Firebase console → project → Android app, after adding the SHA-1s. Template: `google-services.json.example` |
| `apps/mobile/debug.keystore.<local\|staging>` | Debug signing key whose SHA-1 is registered in that Firebase project | `bash scripts/firebase/create-debug-keystore.sh <env>` ([§13.3](#133-android-debug-keystores)) |
| `apps/mobile/keystore/traxettle-release-key.keystore` | The Play **upload key** (SHA-1 `6A:77:3A:F7:…:AE:26`) | A backup only. If it's lost, Play Console has to reset the upload key |
| `apps/mobile/android/gradle.properties.local` | Signing settings; `build-android.sh` refuses release builds without it | Kept with the keystore |
| `fb-service-accounts/traxettle-fb-sa-<test\|staging>.json` | Firebase Admin key for a local API on real Firebase | Firebase console → Project settings → Service accounts → Generate new private key |
| `fb-web-configs/<project id>.env` | Firebase web settings for `bootstrap.sh` (optional) | Firebase console → web app config |
| `.traxettle/api-staging.env`, `.traxettle/api-prod.env`, `.traxettle/web-prod.env` | Deploy settings: project ids, key path, JWT secrets, webhook secret, Firebase web config | `configure-staging.sh` / `configure-prod.sh` ([§12](#12-deploying-the-api-and-web)) |
| `scripts/api-deployment/smtp_<staging\|prod>.local.properties` | SMTP login (a Gmail app password) for the `-gmail` deploys | Template: `smtp_local.properties.example` |
| `.env.local`, `apps/api/.env`, `apps/web/.env.local`, `apps/mobile/.env.local` | Optional local overrides. The API reads `.env.local`, then `apps/api/.env`, for anything not already set | Templates: `.env.example`, `apps/api/.env.example`, `apps/mobile/.env.local.example` |

### 16.3 Credentials that aren't files

| What | Used by | Notes |
|---|---|---|
| `APPLE_TEAM_ID` (10 characters) | `build-ios.sh testflight` / `xcode` | developer.apple.com → Membership |
| **Apple Distribution** certificate with its private key, in the login keychain | Manual signing (`IOS_PROVISIONING_PROFILE`) | Move it between Macs as a `.p12`: Keychain Access → export, then double-click on the other Mac. Check with `security find-identity -v -p codesigning` |
| **App Store provisioning profile** for `com.traxettle.app`, with Sign in with Apple | Manual signing, named in `IOS_PROVISIONING_PROFILE` | developer.apple.com → Profiles. `build-ios.sh` checks its type, App ID and entitlement |
| Apple account in Xcode → Settings → Accounts, or an App Store Connect API key (`ASC_KEY_PATH` `.p8`, `ASC_KEY_ID`, `ASC_KEY_ISSUER_ID`) | The TestFlight upload | App Store Connect → Users and Access → Integrations |
| Sign in with Apple key (`AuthKey_<id>.p8`, `APPLE_SIGNIN_KEY_ID`, `APPLE_SIGNIN_PRIVATE_KEY_FILE`) | API deploys, so account deletion can revoke Apple sign-in | Add the lines to `.traxettle/api-<env>.env` by hand. `configure-*.sh` doesn't ask for them, and rewriting the file drops them |
| `gcloud` and `firebase` logins | Deploys, logs, `--from-secret` | [§12.1](#121-before-deploying) |
| Play App Signing SHA-1 / SHA-256 | Google sign-in on Play-installed builds | Play Console → App integrity, copied into the Firebase Android app |
| Secret Manager `traxettle-<stg\|prod>-api-config` and `-mobile-config` | The deployed API | Written by every deploy. Don't edit them by hand |

### 16.4 Copies the scripts make (don't edit or commit them)

| Copy | Made from | By |
|---|---|---|
| `apps/mobile/android/app/google-services.json` | `google-services.<env>.json` | `build-android.sh`, `bootstrap.sh` |
| `apps/mobile/android/app/debug.keystore` | `debug.keystore.<env>` | `build-android.sh debug`, `bootstrap.sh`; `build-test-app.sh` creates one if missing |
| `apps/mobile/GoogleService-Info.plist` and `ios/<project>/GoogleService-Info.plist` | `GoogleService-Info.<env>.plist` | `build-ios.sh`, the prebuild plugin; `build-test-app.sh` uses the `.example` if none exists |
| `apps/mobile/.env` and `apps/mobile/src/config/buildEnv.ts` | `rc_<env>.properties` and the script's settings | `build-ios.sh` and `build-android.sh`, restored when they finish. `buildEnv.ts` is tracked: during a `build-ios.sh xcode` build it stays changed until `xcode-done` |
| `scripts/local-dev/.bootstrap.env` | The Firebase files above | `bootstrap.sh` |
| `apps/mobile/ios/.xcode.env.local` | The Node on your path | `build-ios.sh`, `build-test-app.sh` |

**Where a doc disagrees, trust the scripts.** Some older docs put the release keystore in
`android/app/`; the scripts use `apps/mobile/keystore/`. `gradle.properties.local` must exist, but
Gradle takes the signing values from the tracked `android/gradle.properties`.
