# Xcode 27 day to day, and moving a Mac to macOS 27

How to work with Xcode 27 after the Expo SDK 58 upgrade, how to be sure a build really uses the iOS 27
SDK, and how to move a Mac to macOS 27 without losing the ability to ship.

- Background and decisions: [EXPO_58_IOS_27_UPGRADE_PLAN.md](../utility/EXPO_58_IOS_27_UPGRADE_PLAN.md),
  §2, §5 and §10.
- Every other command: [COMMAND_REFERENCE.md](COMMAND_REFERENCE.md).
- Commands run from `traxettle-rush/` unless a block starts with `cd`.

This file is in git, so it's on both Macs once it's pushed. Pull it on a Mac before you upgrade it.

---

## Contents

1. [The two Macs and the three phases](#1-the-two-macs-and-the-three-phases)
2. [After pulling or switching branch: what to rerun](#2-after-pulling-or-switching-branch-what-to-rerun)
3. [Using Xcode 27 every time](#3-using-xcode-27-every-time)
4. [Proving which Xcode and SDK a build used](#4-proving-which-xcode-and-sdk-a-build-used)
5. [Testing on the right iOS version](#5-testing-on-the-right-ios-version)
6. [A normal day on the other Mac](#6-a-normal-day-on-the-other-mac)
7. [Upgrading the other Mac to macOS 27](#7-upgrading-the-other-mac-to-macos-27)
8. [This Mac](#8-this-mac)

---

## 1. The two Macs and the three phases

**The Macs on 2026-11-27:**

| | This Mac | Other Mac |
|---|---|---|
| macOS | 26.7.2 | 26.7.2 |
| Xcode 26 | `/Applications/Xcode_26.5.app` (selected) | `/Applications/Xcode_26.app`, 26.6 (selected) |
| Xcode 27.2 | `/Applications/Xcode.app`, App Store copy, not opened yet | `/Applications/Xcode.app`, App Store copy, set up |
| Release files ([COMMAND_REFERENCE §16](COMMAND_REFERENCE.md#16-files-you-need-that-arent-in-git)) | none | all |
| Builds for the stores | no | yes |
| `chore/expo-58` | main checkout | its own worktree (`<checkout>-expo58`); the main checkout stays on `stage` |

**The phases:**

| Phase | Until | Xcode 26 is for | Xcode 27 is for |
|---|---|---|---|
| **A** (now) | 1.2.0 is live on both stores **and** `chore/expo-58` is merged into `stage` | a 1.1.x hotfix from `stage` (Expo 54) | everything on `chore/expo-58` |
| **B** | the other Mac moves to macOS 27 | nothing; keep it only as a spare | everything |
| **C** | – | gone from the other Mac (it doesn't open on macOS 27) | everything |

**On 2026-11-29 the other Mac moved to Xcode 27 as its default early,** while still in phase A. Xcode 26
stays installed for 1.1.x work and is switched on per terminal ([§3.4](#34-the-setup-in-use-xcode-27-by-default-xcode-26-when-needed)).

Why Xcode 26 stays during phase A: `stage` is still Expo 54. Expo 54 apps built with the iOS 27 SDK don't
launch, because they don't use the UIScene life cycle. So a 1.1.x hotfix has to be built with Xcode 26
until Expo 58 is on `stage`. From April 2027, App Store uploads need the iOS 27 SDK, so by then everything
must have moved to Expo 58 and Xcode 27.

---

## 2. After pulling or switching branch: what to rerun

### 2.1 See what changed

Right after `git pull`, `HEAD@{1}` is where you were before it:

```bash
git diff --name-only HEAD@{1} HEAD
```

Or let this tell you what to rerun:

```bash
CHANGED=$(git diff --name-only HEAD@{1} HEAD)
echo "$CHANGED" | grep -qE '(^|/)package\.json$|pnpm-lock\.yaml$|^traxettle-rush/common/config/' && echo "→ rush install"
echo "$CHANGED" | grep -qE '^traxettle-rush/libraries/(shared|ui)/' && echo "→ rebuild shared and ui"
echo "$CHANGED" | grep -qE '^traxettle-rush/apps/mobile/(app\.json|plugins/|package\.json)' && echo "→ regenerate ios/ and rebuild the iOS app"
echo "$CHANGED" | grep -qE '^traxettle-rush/apps/mobile/(android/|app\.json|package\.json)' && echo "→ rebuild the Android app"
true
```

### 2.2 What to run for each change

| If the change touches… | Run | Why |
|---|---|---|
| any `package.json`, `common/config/rush/pnpm-lock.yaml` or another `common/config/rush/*` file | `node common/scripts/install-run-rush.js install` | New or changed packages |
| `libraries/shared` or `libraries/ui` | `node common/scripts/install-run-rush.js build --to @traxettle/shared --to @traxettle/ui` | The apps read their compiled output. `run.sh` does this for you |
| `apps/mobile/app.json`, `apps/mobile/plugins/*`, or a native package | `cd apps/mobile && npx expo prebuild --platform ios --clean`, then a new Debug build | The iOS project is generated from these. `build-ios.sh testflight` regenerates it itself |
| `apps/mobile/android/*` or a native package | a new Android Debug build | The Android project is tracked in git; no prebuild |
| only JavaScript/TypeScript in `apps/mobile/src` | nothing native. Restart Metro (`--clear` if it seems stale) | A Debug build loads JavaScript from Metro |
| only docs | nothing | |

Version bumps change the `version` fields in `app.json` and `package.json`. They don't need
`rush install`.

### 2.3 Switching between `stage` (Expo 54) and `chore/expo-58`

Switching an existing checkout between the two always needs all of this:

```bash
git switch <branch>
node common/scripts/install-run-rush.js install
cd apps/mobile && npx expo prebuild --platform ios --clean && cd ../..
rm -rf apps/mobile/android/app/build apps/mobile/android/app/.cxx apps/mobile/android/build apps/mobile/android/.gradle
find ~/Library/Developer/Xcode/DerivedData -maxdepth 1 -name 'TraxettleappbyKarkhanisLabs-*' -exec rm -rf {} +
```

Then build with the right Xcode: 26 for `stage` during phase A, 27 for `chore/expo-58`. The worktree on the
other Mac avoids all this: each folder keeps its own branch, packages and Xcode.

---

## 3. Using Xcode 27 every time

### 3.1 Phase A: Xcode 27 inside the worktree, Xcode 26 everywhere else

The other Mac uses [§3.4](#34-the-setup-in-use-xcode-27-by-default-xcode-26-when-needed) instead,
since 2026-11-29. This section stays as the alternative.

`xcode-select` stays on Xcode 26. Every terminal that is inside the `chore/expo-58` worktree switches to
Xcode 27 by itself. Add this once to `~/.zshrc` on the other Mac, with your worktree's path in the
second line:

```bash
cat >> ~/.zshrc <<'EOF'
# >>> traxettle xcode 27 >>>
TRAXETTLE_XCODE27_DIR="$HOME/regular-workspace/Traxettle-expo58"   # the chore/expo-58 worktree
autoload -U add-zsh-hook
traxettle_xcode() {
  if [[ "$PWD" == "$TRAXETTLE_XCODE27_DIR"* ]]; then
    export DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer
  else
    unset DEVELOPER_DIR
  fi
}
add-zsh-hook chpwd traxettle_xcode
traxettle_xcode
# <<< traxettle xcode 27 <<<
EOF
```

Open a new terminal, then check both folders:

```bash
cd "$HOME/regular-workspace/Traxettle-expo58" && xcodebuild -version | head -1    # Xcode 27.2
cd "$HOME/regular-workspace/Traxettle" && xcodebuild -version | head -1           # Xcode 26.6
```

Everything started from a terminal in the worktree uses Xcode 27: `xcodebuild`, `xcrun`, `simctl`, `pod`,
`expo run:ios`, `build-test-app.sh`, Maestro and `build-ios.sh`.

**What the hook doesn't cover:**
- **Xcode's own window.** Xcode opened from the Dock, Finder or Spotlight ignores `DEVELOPER_DIR`. Open the
  workspace with the Xcode you mean:
  ```bash
  cd apps/mobile && open -a /Applications/Xcode.app ios/TraxettleappbyKarkhanisLabs.xcworkspace
  ```
- **The simulator window.** Xcode 27 uses DeviceHub, not Simulator.app:
  ```bash
  open /Applications/Xcode.app/Contents/Applications/DeviceHub.app
  ```
- **A terminal where you set `DEVELOPER_DIR` by hand.** The hook resets it on the next `cd`.

### 3.2 Keep the App Store from changing Xcode 27 under you

`/Applications/Xcode.app` is the App Store copy, which updates itself. A silent update to 27.3 or 28 would
change the SDK of the next build. Either:
- turn off automatic app updates: System Settings → General → Software Update → the ⓘ next to Automatic
  updates → "Install application updates from the App Store" off; or
- note the version before every store build (`xcodebuild -version`) and accept that it moves.

For a fixed copy, download `Xcode_27.2.xip` from developer.apple.com/download/all, put it at
`/Applications/Xcode_27.2.app`, and use that path instead of `/Applications/Xcode.app` everywhere in this
file.

### 3.3 Phase B: make Xcode 27 the default

Do this once 1.2.0 is live on both stores and `chore/expo-58` is merged into `stage`. Check both:

```bash
git fetch origin && git merge-base --is-ancestor origin/chore/expo-58 origin/stage && echo "merged into stage"
git show origin/stage:traxettle-rush/apps/mobile/release-versions.json
```

The second command should show 1.2.0 for both iOS and Android. If `chore/expo-58` was deleted on GitHub
after the merge, the first command fails; check the merged pull request instead. Then:

```bash
sudo xcode-select -s /Applications/Xcode.app/Contents/Developer
sed -i '' '/# >>> traxettle xcode 27 >>>/,/# <<< traxettle xcode 27 <<</d' ~/.zshrc
```

Open a new terminal and check that you get Xcode 27.2 from any folder:

```bash
xcode-select -p && xcodebuild -version | head -1 && xcrun --sdk iphoneos --show-sdk-version
```

The worktree is no longer needed. Work in the main checkout on `stage` and on feature branches:

```bash
git -C "$HOME/regular-workspace/Traxettle" worktree remove "$HOME/regular-workspace/Traxettle-expo58"
```

`worktree remove` refuses if the worktree has changes. Commit or move them first. Its git-ignored
release files go with it, and the main checkout has its own copies.

### 3.4 The setup in use: Xcode 27 by default, Xcode 26 when needed

**Chosen on 2026-11-29 for the other Mac**, in place of the phase A hook in §3.1. Xcode 27.2 (and with it
the iOS 27.2 SDK) is the default for everything. One word switches a terminal to Xcode 26 for 1.1.x work.

**1. Make Xcode 27.2 the default:**

```bash
sudo xcode-select -s /Applications/Xcode.app/Contents/Developer
xcode-select -p; xcodebuild -version | head -1; xcrun --sdk iphoneos --show-sdk-version
```

Expect the `Xcode.app` path, `Xcode 27.2` and `27.2`.

**2. Remove the phase A hook,** if you added it from §3.1:

```bash
sed -i '' '/# >>> traxettle xcode 27 >>>/,/# <<< traxettle xcode 27 <<</d' ~/.zshrc
```

**3. Add the switches** (once):

```bash
cat >> ~/.zshrc <<'EOF'
# >>> xcode switch >>>
xcode26() { export DEVELOPER_DIR=/Applications/Xcode_26.app/Contents/Developer; xcodebuild -version | head -1; }
xcode27() { unset DEVELOPER_DIR; xcodebuild -version | head -1; }
# <<< xcode switch <<<
EOF
```

Open a new terminal. Typing `xcode26` switches that terminal to Xcode 26, and `xcode27` (or a new terminal)
switches it back.

**4. When to use `xcode26`:** for building or testing **Expo 54 code**. That means `stage` before
`chore/expo-58` is merged, or a hotfix from the `ios-v1.1.0` tag. An Expo 54 app built with the iOS 27 SDK
doesn't launch, because it doesn't use the UIScene life cycle. `build-ios.sh` prints the Xcode version
near the start, so stop it if the version is wrong. Android builds don't depend on Xcode.

**A 1.1.x hotfix, start to finish:**

```bash
git -C "$HOME/regular-workspace/Traxettle" fetch origin --tags
git -C "$HOME/regular-workspace/Traxettle" worktree add "$HOME/regular-workspace/Traxettle-hotfix" -b hotfix/1.1.1 ios-v1.1.0
cd "$HOME/regular-workspace/Traxettle-hotfix/traxettle-rush" && node common/scripts/install-run-rush.js install
xcode26
```

Copy the git-ignored files into the new worktree, as in
[COMMAND_REFERENCE §14](COMMAND_REFERENCE.md#14-git-branches-worktrees-and-tags). Then fix the problem and
build as usual (`build-ios.sh testflight` builds 1.1.1). Test on the `iPhone 17 Pro iOS26` simulator (step 6).

**5. Xcode's window:** open the right one explicitly. Xcode 27.2 is the normal one:

```bash
open -a /Applications/Xcode_26.app <path>/ios/TraxettleappbyKarkhanisLabs.xcworkspace
```

That command is for Expo 54 work only.

**6. Make the scripts' default simulator iOS 27.2.** `build-test-app.sh` and others default to a simulator
named `iPhone 17 Pro`. This renames the old iOS 26 one to `iPhone 17 Pro iOS26` and creates a new
`iPhone 17 Pro` on iOS 27.2:

```bash
OLD=$(xcrun simctl list devices | awk '/^-- iOS 26/{f=1;next} /^-- /{f=0} f && /iPhone 17 Pro \(/' | grep -oE '[0-9A-F-]{36}' | head -1); [ -n "$OLD" ] && xcrun simctl rename "$OLD" "iPhone 17 Pro iOS26"; xcrun simctl create "iPhone 17 Pro" com.apple.CoreSimulator.SimDeviceType.iPhone-17-Pro com.apple.CoreSimulator.SimRuntime.iOS-27-2
```

**7. Keep Xcode 26** until 1.2.0 is live on both stores and merged into `stage`. After that nothing
needs it, and from April 2027 its builds can't be uploaded anyway. Then remove the switches with
`sed -i '' '/# >>> xcode switch >>>/,/# <<< xcode switch <<</d' ~/.zshrc`, and delete
`/Applications/Xcode_26.app` when you like.

---

## 4. Proving which Xcode and SDK a build used

Every built app records it in its `Info.plist`. `DTXcode` is the Xcode version without dots (`2720` =
27.2) and `DTSDKName` is the SDK.

**The last simulator build:**

```bash
APP=$(ls -td ~/Library/Developer/Xcode/DerivedData/TraxettleappbyKarkhanisLabs-*/Build/Products/*-iphonesimulator/TraxettleappbyKarkhanisLabs.app | head -1); plutil -p "$APP/Info.plist" | grep -E '"DT(Xcode|SDKName|PlatformVersion)"'
```

Expect `"DTXcode" => "2720"` and `"DTSDKName" => "iphonesimulator27.2"`.

**The last TestFlight archive**, before or after uploading:

```bash
A=$(ls -td ~/Library/Developer/Xcode/Archives/*/Traxettle-*.xcarchive | head -1); echo "$A"; plutil -p "$A"/Products/Applications/*.app/Info.plist | grep -E '"DT(Xcode|SDKName)"|CFBundleShortVersionString|"CFBundleVersion"'
```

Expect `"DTSDKName" => "iphoneos27.2"`, plus the version and build number you uploaded.
`build-ios.sh testflight` also prints `Xcode: … iOS SDK …` near the start. Stop it with Control+C if it
shows 26. In Xcode → Window → Organizer, the archive's details also name the Xcode that built it.

---

## 5. Testing on the right iOS version

**The SDK and the iOS version you test on are separate.** Building with the iOS 27 SDK doesn't mean your
users run iOS 27. The app supports iOS 16.4 and later.

### 5.1 The simulators to keep on the other Mac

| Simulator | iOS | Use |
|---|---|---|
| `iPhone 17 Pro iOS27` | 27.x | Everyday testing and Maestro |
| `iPad iOS27` | 27.x | iPad layout; App Review tests on iPad |
| `iPhone Duo iOS27` | 27.2, its own runtime | Duo postures; screenshots from April 2027 |
| `iPhone 17 Pro iOS26` (create it) | 26.x | Users who haven't updated, and 1.1.x work with `xcode26` |
| `iPhone 17 Pro` | 27.2 | The scripts' default; [§3.4](#34-the-setup-in-use-xcode-27-by-default-xcode-26-when-needed) step 6 makes it iOS 27.2 |

Create the iOS 26 one if you don't have it. Run this in a terminal inside the worktree, so Xcode 27 does
it; Xcode 27 runs iOS 26 simulators too:

```bash
xcrun simctl list runtimes | grep '^iOS 26' || xcodebuild -downloadPlatform iOS -buildVersion 26.5
RT26=$(xcrun simctl list runtimes | awk '/^iOS 26/ && !/unavailable/ {print $NF}' | tail -1); echo "$RT26"
xcrun simctl create "iPhone 17 Pro iOS26" com.apple.CoreSimulator.SimDeviceType.iPhone-17-Pro "$RT26"
```

Which iOS version each simulator runs:

```bash
xcrun simctl list devices | grep -E '^-- iOS|iOS2[67]'
```

### 5.2 Always name the simulator

Without a name, Expo and the scripts pick a default, which may be on another iOS version.

```bash
bash apps/mobile/maestro/scripts/build-test-app.sh ios "iPhone 17 Pro iOS27"
cd apps/mobile && npx expo run:ios --device "iPhone 17 Pro iOS27" --no-bundler
cd apps/mobile && npx expo run:ios --configuration Release --device "iPad iOS27" --no-bundler
```

`06_staging_mobile.sh` installs on every booted simulator, so shut down the ones you don't want first:

```bash
xcrun simctl list devices booted
xcrun simctl shutdown all && xcrun simctl boot "iPhone 17 Pro iOS27"
```

Maestro takes the UDID:

```bash
SIM_UDID=$(xcrun simctl list devices | grep "iPhone 17 Pro iOS27" | grep -oE '[0-9A-F-]{36}'); MAESTRO_DEVICE="$SIM_UDID" MAESTRO_API_PORT=3011 bash scripts/regression/run.sh mobile
```

### 5.3 When to test on which

| Change | iOS 27 iPhone | iOS 27 iPad / Duo | iOS 26 iPhone |
|---|---|---|---|
| JavaScript only | yes | if the layout changed | before a release |
| Native (new package, `app.json`, Expo upgrade) | yes, Debug + Maestro | yes, Release check | yes |
| Before a store build | Release check | Release check | Release check |

---

## 6. A normal day on the other Mac

In the worktree during phase A, or the main checkout from phase B on:

```bash
cd "$HOME/regular-workspace/Traxettle-expo58/traxettle-rush"
git pull
git diff --name-only HEAD@{1} HEAD                  # then §2.2
xcodebuild -version | head -1                       # Xcode 27.2?
```

Run the app against what you need ([COMMAND_REFERENCE §2.2](COMMAND_REFERENCE.md#22-recipes)), for example
your code on staging data:

```bash
bash scripts/local-dev/03_real_mobile.sh staging
```

Before you push:

```bash
bash scripts/regression/run.sh quick                # or full
SIM_UDID=$(xcrun simctl list devices | grep "iPhone 17 Pro iOS27" | grep -oE '[0-9A-F-]{36}'); MAESTRO_DEVICE="$SIM_UDID" MAESTRO_API_PORT=3011 bash scripts/regression/run.sh mobile   # after native or screen changes
git status                                          # rc_prod.properties must never be staged
```

Before a store build: the Release check on the iPhone, iPad and Duo
([COMMAND_REFERENCE §9.4](COMMAND_REFERENCE.md#94-release-builds-on-a-simulator-or-emulator)), then
[COMMAND_REFERENCE §11](COMMAND_REFERENCE.md#11-store-builds-and-versions), then §4 above.

---

## 7. Upgrading the other Mac to macOS 27

**Plainly:** after the upgrade, Xcode 26 doesn't open on that Mac. It can only build with Xcode 27, so it
can no longer build an Expo 54 (`stage` before the merge) app. That's fine once the gates below are met.

### 7.1 Gates: all must be true

| Gate | How to check |
|---|---|
| 1.2.0 is **live** on the App Store and Google Play (not just approved) | The App Store and Play listings show 1.2.0 |
| `chore/expo-58` is merged into `stage` | `git fetch origin && git merge-base --is-ancestor origin/chore/expo-58 origin/stage && echo merged` |
| `stage` records 1.2.0 for both stores | `git show origin/stage:traxettle-rush/apps/mobile/release-versions.json` |
| The release tags exist | `git ls-remote --tags origin 'ios-v1.2.0' 'android-v1.2.0'` |
| Nothing is waiting on 1.1.x | No open hotfix, nothing in App Review except 1.2.x |
| No unfinished local work | `git status`, `git worktree list`, `git stash list` on that Mac |
| The Mac is Apple silicon (macOS 27 needs it) | `uname -m` prints `arm64` |
| Xcode 27 supports the macOS 27 version you'll install | Xcode 27's release notes on developer.apple.com |

### 7.2 Before upgrading: record and back up

**1. Record the current tool versions**, to compare afterwards:

```bash
{ sw_vers; xcodebuild -version; pod --version; node -v; java -version 2>&1 | head -1; ~/.maestro/bin/maestro --version; ls ~/Library/Android/sdk/build-tools; } > ~/Desktop/toolchain-before-macos27.txt 2>&1
brew list --versions > ~/Desktop/brew-before-macos27.txt
```

**2. Back up the release files to an encrypted disk image.** These can't be replaced if lost: the Play
upload keystore, the RevenueCat and deploy settings, the service-account keys, the signing certificate
and the profiles. Copy them into a folder, preserving their paths:

```bash
MAIN="$HOME/regular-workspace/Traxettle"; SAFE="$HOME/traxettle-secrets-$(date +%Y%m%d)"
cd "$MAIN" && git ls-files -o -- 'traxettle-rush/rc_*.properties' 'traxettle-rush/apps/mobile/GoogleService-Info*.plist' 'traxettle-rush/apps/mobile/google-services*.json' 'traxettle-rush/apps/mobile/debug.keystore.*' traxettle-rush/apps/mobile/keystore traxettle-rush/apps/mobile/android/gradle.properties.local traxettle-rush/fb-service-accounts traxettle-rush/fb-web-configs traxettle-rush/.traxettle traxettle-rush/.env.local traxettle-rush/apps/api/.env traxettle-rush/apps/web/.env.local traxettle-rush/apps/mobile/.env.local 'traxettle-rush/scripts/api-deployment/smtp_*.local.properties' | while read -r f; do mkdir -p "$SAFE/repo/$(dirname "$f")" && cp -p "$f" "$SAFE/repo/$f"; done
cp -Rp ~/Library/Developer/Xcode/UserData/"Provisioning Profiles" "$SAFE/provisioning-profiles" 2>/dev/null
cp -Rp ~/Library/MobileDevice/"Provisioning Profiles" "$SAFE/provisioning-profiles-mobiledevice" 2>/dev/null
cp -Rp ~/.appstoreconnect "$SAFE/appstoreconnect" 2>/dev/null; cp -Rp ~/.traxettle "$SAFE/home-traxettle" 2>/dev/null
find "$SAFE" -type f | sed "s|$SAFE/||"
```

Check that the list includes `repo/traxettle-rush/apps/mobile/keystore/traxettle-release-key.keystore` and
your `rc_*.properties` files.

Add the signing certificate. In Keychain Access → login → My Certificates, right-click **Apple
Distribution: …** → Export → save as `apple-distribution.p12` in that folder, with a password. Then make
the disk image, which asks for a password, and delete the plain folder:

```bash
hdiutil create -encryption AES-256 -srcfolder "$SAFE" -volname TraxettleSecrets "$SAFE.dmg" && rm -rf "$SAFE"
```

Store the `.dmg` off the Mac (another drive or a password manager) and keep both passwords somewhere
safe.

**3. Make a Time Machine backup** to an APFS-formatted drive. macOS 27 deprecates encrypted HFS+ backups,
and this backup is the only way back to macOS 26.

```bash
tmutil destinationinfo                              # the backup drive is set up
tmutil startbackup --block                          # back up now and wait
tmutil latestbackup                                 # today's date?
```

**4. Push everything** you want to keep: `git push` on every branch with unpushed commits.

### 7.3 Upgrade

System Settings → General → Software Update → macOS 27.x. To see what's offered from the terminal:

```bash
softwareupdate --list
```

### 7.4 After upgrading: the toolchain

```bash
sw_vers                                             # 27.x
xcode-select --install                              # command-line tools for macOS 27
sudo xcode-select -s /Applications/Xcode.app/Contents/Developer
xcodebuild -checkFirstLaunchStatus || { sudo xcodebuild -license accept && sudo xcodebuild -runFirstLaunch; }
xcodebuild -version && xcrun --sdk iphoneos --show-sdk-version
xcrun simctl list runtimes                          # the iOS 27 runtimes, still available?
```

If a runtime shows `unavailable`:

```bash
xcodebuild -downloadPlatform iOS
```

Homebrew tools:

```bash
brew update && brew upgrade
brew reinstall cocoapods && pod --version           # 1.17.0 or later
brew reinstall openjdk@21 && /opt/homebrew/opt/openjdk@21/bin/java -version
node -v                                             # 24.x
curl -Ls "https://get.maestro.mobile.dev" | bash && ~/.maestro/bin/maestro --version
```

Android: open Android Studio once and let it update. Then:

```bash
~/Library/Android/sdk/emulator/emulator -list-avds
~/Library/Android/sdk/cmdline-tools/latest/bin/sdkmanager --update
```

Signing and deploy tools:

```bash
security find-identity -v -p codesigning            # "Apple Distribution: …"
ls ~/Library/Developer/Xcode/UserData/"Provisioning Profiles"
gcloud --version; firebase --version                # only if this Mac deploys
```

Then:
- In Xcode → Settings → Accounts, check you're still signed in.
- Remove the phase A hook from `~/.zshrc` if it's still there ([§3.3](#33-phase-b-make-xcode-27-the-default)).
- Xcode 26 no longer opens. Remove it when you like, which frees several GB:
  `sudo rm -rf /Applications/Xcode_26.app`.

Compare with what you recorded:

```bash
cat ~/Desktop/toolchain-before-macos27.txt
```

### 7.5 After upgrading: prove the Mac can still ship

From the main checkout on `stage`:

```bash
cd "$HOME/regular-workspace/Traxettle" && git switch stage && git pull
cd traxettle-rush && node common/scripts/install-run-rush.js install
bash scripts/regression/run.sh quick
cd apps/mobile && npx expo prebuild --platform ios --clean && cd ../..
bash apps/mobile/maestro/scripts/build-test-app.sh ios "iPhone 17 Pro iOS27"
SIM_UDID=$(xcrun simctl list devices | grep "iPhone 17 Pro iOS27" | grep -oE '[0-9A-F-]{36}'); MAESTRO_DEVICE="$SIM_UDID" MAESTRO_API_PORT=3011 bash scripts/regression/run.sh mobile
```

Then:
1. Do the Release check on the iPhone, iPad and Duo
   ([COMMAND_REFERENCE §9.4](COMMAND_REFERENCE.md#94-release-builds-on-a-simulator-or-emulator)).
2. Android. The Android tools change with the OS too:
   ```bash
   ~/Library/Android/sdk/emulator/emulator -avd <your AVD> &
   bash apps/mobile/maestro/scripts/build-test-app.sh android
   MAESTRO_DEVICE=<serial from adb devices, e.g. emulator-5554> MAESTRO_API_PORT=3011 bash scripts/regression/run.sh mobile
   cd apps/mobile && bash scripts/build-android.sh debug:staging
   "$(ls -d ~/Library/Android/sdk/build-tools/* | tail -1)/apksigner" verify --print-certs android/app/build/outputs/apk/release/app-release.apk | grep -i 'SHA-1'
   ```
   The last line should print `6a773af78044df9049776440891527ab8d10ae26`.
3. If all of that passes, the Mac is ready for the next release. Check its first archive with §4.

### 7.6 If something goes wrong

- **A tool broke:** compare with `~/Desktop/toolchain-before-macos27.txt` and reinstall that tool.
- **Signing is gone:** mount the disk image, double-click `apple-distribution.p12`, and copy the profiles
  back to `~/Library/Developer/Xcode/UserData/Provisioning Profiles/`.
- **Release files are gone:** copy them back from `repo/` in the disk image, keeping the paths.
- **You must go back to macOS 26:**
  1. Restart into Recovery (hold the power button).
  2. Erase the disk and reinstall macOS 26.
  3. Restore with Migration Assistant from the Time Machine backup made in §7.2.
- **You need to ship before it's fixed:** build on this Mac ([§8](#8-this-mac)).

---

## 8. This Mac

- **Keep macOS 26 and both Xcodes** until the other Mac has shipped one release on macOS 27. This Mac is
  the fallback.
- **Don't open Xcode 27.2 here until 1.1.0 is out**, so nothing new touches the release setup mid-release
  (plan §2). Then set it up once:
  ```bash
  export DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer
  xcodebuild -checkFirstLaunchStatus || { sudo DEVELOPER_DIR="$DEVELOPER_DIR" xcodebuild -license accept && sudo DEVELOPER_DIR="$DEVELOPER_DIR" xcodebuild -runFirstLaunch; }
  xcodebuild -downloadPlatform iOS
  ```
- **To use it as a fallback for store builds,** it needs:
  - the release files, from the disk image in §7.2;
  - the signing certificate (`.p12`) and the App Store profile.
- **Its own move to macOS 27** follows §7, once the other Mac has proven it.
