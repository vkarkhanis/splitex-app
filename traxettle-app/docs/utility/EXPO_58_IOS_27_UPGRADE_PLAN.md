# Expo SDK 58 and iOS 27 SDK upgrade plan

**Status:** approved 2026-11-26 with recommendations D1–D8. Milestone A in progress on `chore/expo-58`
(from `stage` at `4b656fa`, after 1.1.0's version files and tags). Deviations from this plan are listed in
[§10](#10-as-built-milestone-a).

**Scope:** the mobile app (`traxettle-rush/apps/mobile`) moves from Expo SDK 54 (React Native 0.81.5) to
SDK 58 (React Native 0.88.1), then builds with Xcode 27 and the iOS 27 SDK. The API, web app and shared
library don't change.

**Facts were checked on 2026-11-26** against:
- Apple's and Expo's pages (sources in [§9](#9-sources));
- the npm packages themselves (`expo@58.0.26`, the SDK 54 and 58 prebuild templates, `react-native@0.88.1`,
  `@react-native-google-signin/google-signin` 12.2.1 and 17.0.0);
- this Mac's `/Applications`.

---

## 0. Summary

**Why.** Apps built with the iOS 27 SDK must use the UIScene life cycle, or they don't launch. Expo
generates that only from SDK 58; in SDK 57 it's opt-in. From **April 2027**, App Store Connect accepts only
apps built with the iOS 27 SDK. So: Expo 58 first, then Xcode 27.

**What I found that changes the earlier picture:**

1. **Neither Mac needs macOS 27.**
   - Xcode 27 needs macOS 26.6 or later, so it runs on your macOS 26.7.2 Macs.
   - **This Mac already has Xcode 27.2.** The Mac App Store installed it on 31 Oct as
     `/Applications/Xcode.app`. Its license isn't accepted and its first launch hasn't run.
   - `xcode-select` still points at `/Applications/Xcode_26.5.app`, and Finder opens `.xcworkspace` files
     with Xcode 26.5. So the 1.1.0 builds are unaffected.
   - Your earlier research holds the other way round: Xcode 26 doesn't run on macOS 27.
2. **Google Sign-In's AppDelegate patch has to go.**
   - The SDK 58 `AppDelegate.swift` has no `application(_:open:options:)` any more. So
     `plugins/copy-google-service-plist.js` finds nothing to patch, and only prints a warning.
   - The patch isn't needed. The Google Sign-In package has shipped its own Expo subscriber that calls
     `GIDSignIn.sharedInstance.handle(url)` since 12.2.1, and Expo 58 forwards scene URLs to subscribers.
3. **`android/` is tracked in git, and `build-android.sh` never runs prebuild.** The SDK 58 template brings
   Gradle 9.4.1, Android Gradle Plugin 9, a new `MainApplication.kt` and R8 code shrinking on by default.
   Regenerating `android/` wipes our release signing config and the `versionCode`, so it needs a careful
   regenerate-and-reapply step.
4. **Four library majors are required:**
   - React Navigation 6 → 7 (react-native-screens 4 supports only 7);
   - Firebase JS 10 → 12 (Expo supports only 12 and later);
   - Google Sign-In 12 → 17 (its iOS SDK 10 is the version that supports Xcode 27);
   - RevenueCat 10 → 11.
5. **The minimum iOS version rises from 15.1 to 16.4** (since SDK 56). iPhones on iOS 15 or 16.0–16.3 keep
   1.1.x and get no further updates.

**Recommendation.** One branch (`chore/expo-58`) and one implementation plan, in two milestones with
separate commits:
- **A:** Expo 58 working and fully tested on this Mac, with Xcode 26.5.
- **B:** the same branch built with Xcode 27.2.

Ship both as **one release, 1.2.0**, built with Xcode 27.2. Milestone A built with Xcode 26.5 is the fallback
if B stalls.

### Decisions I need from you

| # | Decision | My recommendation |
|---|---|---|
| D1 | One branch and one plan with milestones A and B, or two branches | **One branch**, as before ([§2](#2-branching-order-and-releases)) |
| D2 | Ship A and B as one release or two | **One release (1.2.0) built with Xcode 27.2.** A alone is the fallback ([§2](#2-branching-order-and-releases)) |
| D3 | The other Mac: macOS 27, or stay on macOS 26 and add Xcode 27.2 next to Xcode 26.5 | **Stay on macOS 26.7.x and add Xcode 27.2.** Then that Mac can still build with Xcode 26.5 ([§5](#5-the-other-mac)) |
| D4 | Go straight to SDK 58, or one SDK at a time | **Straight to 58**, working through every SDK's breaking changes as a checklist. Step back through 56 only if a native build fails for no clear reason ([§3.2](#32-a1-dependencies)) |
| D5 | Android native project: keep it tracked and regenerate it, or move signing into a config plugin and untrack `android/` | **Keep it tracked** for this upgrade. A signing plugin can be a later, separate change ([§3.6](#36-a5-android-native-project-tracked-in-git)) |
| D6 | R8 code shrinking in Android release builds (SDK 58's new default) | **Keep it off** for 1.2.0 (as today), so the upgrade doesn't also change what ships. Turn it on later with its own testing |
| D7 | Library majors: React Navigation 7, Firebase **12.19** (not 13), Google Sign-In 17, RevenueCat 11 | **As listed** ([§1.4](#14-dependencies)) |
| D8 | Minimum iOS 16.4 | **Accept it**: Expo 56 and later don't support lower |

---

## 1. Facts, with sources

### 1.1 Apple: Xcode, the SDK deadline, UIScene and macOS

| Fact | Detail | Source |
|---|---|---|
| **App Store deadline** | "Starting April 2027, apps and games uploaded to App Store Connect need to meet the following minimum requirements: iOS and iPadOS apps must be built with the iOS 27 & iPadOS 27 SDK or later." Announced 9 Sept 2026. No exact day is given; last year's equivalent took effect on 28 April 2026. | [A1], [A14] |
| Upload warning | You've seen App Store Connect's warning. I found no public report of the upload warning yet; last cycle it appeared about 3 months before the deadline. | [A1] |
| **UIScene requirement** | "Apps built with the latest SDK must adopt the scene-based life cycle or they fail to launch." (iOS 27 release notes, UIKit). TN3187: "UIScene lifecycle will be required when building with the latest SDK; otherwise, your app won't launch." It applies to every UIKit app, iPhone and iPad. | [A3], [A2], [A4], [A5] |
| Older builds on iOS 27 | The rule is tied to the SDK the app is **built with**. One developer reports that an Xcode 26 build only logs a warning on iOS 27, while the same app built with Xcode 27 crashes at launch. So 1.1.0 (Xcode 26.5) keeps running on iOS 27 devices. Apple doesn't promise this explicitly. | [A2], forum 840957 |
| URL delivery under scenes | A cold start gets its URL in `scene(_:willConnectTo:options:)` (`connectionOptions.urlContexts`). A running app gets it in `scene(_:openURLContexts:)`. `application(_:open:options:)` is deprecated since iOS 26. | [A12] |
| **Xcode 27.2** | Current release: 27B52, 29 Oct 2026. 27.3 is in beta. Includes the iOS 27.2 SDK and Swift 6.4. **Apple silicon only.** iOS deployment targets 15–27; the simulator and device debugging need iOS 17 or later. | [A6], [A7] |
| **Xcode 27 on macOS 26** | "Xcode 27 requires a Mac running macOS Tahoe 26.6 or later." Verified on this Mac: Xcode 27.2's `LSMinimumSystemVersion` is 26.6, and `xcodebuild -version` runs on macOS 26.7.2. Apple DTS: "We also support you keeping Xcode 26 installed, so you can switch between the two." | [A6], [A8] |
| **Xcode 26 on macOS 27** | **Not usable.** Apple's table lists Xcode 26.4.1–26.6 for macOS 26.2–26.x only. On macOS 27, Xcode 26 refuses to start ("not compatible with this version of macOS"). DTS: "Xcode 26 is not supported on macOS 27." An unofficial workaround (starting the binary inside the app bundle) exists; don't rely on it for releases. | [A7], [A8] |
| Xcode 27 changes that affect us | **Simulator.app is replaced by DeviceHub.app.** Verified in this Mac's Xcode 27.2. Xcode 27 also fails the build, rather than warning, for pod targets below iOS 15. RevenueCat documents this for Expo SDK 56 and older; SDK 58 targets 16.4. | [L9], [L2] |
| Uploading with a new Xcode | App Store Connect enables each new Xcode separately. Xcode 27.2 uploads failed with ITMS-90534 for about 19 hours, until "You can now upload apps built with Xcode 27.2" on 30 Oct. Check the App Store Connect release notes before uploading with a new Xcode. | [A11] |
| Also from April 2027 | New submissions need **iPhone Duo screenshots**. | [A11] |
| **macOS 27** | Released 14 Sept 2026; 27.2.1 on 9 Nov. Apple silicon only. It can't be downgraded in place: going back means erasing and reinstalling macOS 26, then restoring a backup made before the upgrade. The latest macOS 26 is 26.7.3 (9 Nov). | [A9] |
| CocoaPods | 1.17.0 is current, and it's installed on this Mac. It fails on projects that Xcode 27 creates in its newer formats: `objectVersion = 110`, and the JSON `.xcproj` format that is the default for new projects in 27.2. **Expo's template uses `objectVersion = 54`**, which works. So never accept Xcode's "update project format" suggestion. | [L8], [A6] |

### 1.2 Expo SDK 55–58

| | SDK 55 | SDK 56 | SDK 57 | **SDK 58** |
|---|---|---|---|---|
| Released | 25 Feb 2026 | 21 May 2026 | 30 Jun 2026 | 15 Oct 2026 (`58.0.26` is current) |
| React Native / React | 0.83 / 19.2.0 | 0.85 / 19.2.3 | 0.86 / 19.2.3 | **0.88.1 / 19.3.0** |
| Minimum Xcode | 26.2 | 26.4 | 26.4 | **26.4** (so Xcode 26.5 works for milestone A). Built for Xcode 27 |
| iOS deployment target | 15.1 | **16.4** | 16.4 | 16.4 |
| Android min / compile / target SDK | 24 / 36 / 36 | 24 / 36 / 36 | 24 / 36 / 36 | 24 / **37** / 36 |
| Gradle / Android Gradle Plugin / Kotlin | 9.0 / 8.12 / 2.1 | 9.3.1 / 8.12 / 2.1 | 9.3.1 / 8.12 / 2.1 | **9.4.1 / 9.2.1 / 2.2.0** |
| Node | ≥20.19 | ≥20.19 | ≥22.13 | ^22.13 / ^24.3 / ≥26. Rush's pin (≥24.11.1 <25) and CI's Node 24 fit |
| UIScene | no | no | opt-in (`expo-build-properties` → `ios.enableSceneSupport`) | **always on.** Prebuild generates `SceneDelegate.swift` and a `UIApplicationSceneManifest` |

Sources: [E1]–[E6], [E12], [E13], [R4]. SDK 54's baseline was Xcode 16.1+, Gradle 8.14.3, AGP 8.11 and
iOS 15.1.

### 1.3 Breaking changes that touch this app

Checked against the code on `stage` (4897280).

| SDK | Change | Effect on Traxettle | Source |
|---|---|---|---|
| 55 | Legacy Architecture removed; `newArchEnabled` dropped from app.json | None: we already run the New Architecture (`newArchEnabled=true` in gradle.properties) | [E1] |
| 55 | Edge-to-edge is mandatory; `expo.edgeToEdgeEnabled` removed | The regenerated `gradle.properties` drops that line. Check layouts on Android (hand test H11) | [E1] |
| 55 | `autolinkingModuleResolution` on by default in monorepos | Affects how native modules resolve in our pnpm/Rush layout. Check pods and the Gradle autolinking output | [E1] |
| 55 | AppDelegate template: `internal import Expo`, `@main` | Our plugin's `import GoogleSignIn` insertion would still work, but it is being removed anyway ([§3.4](#34-a3-config-plugins)) | [E13] |
| 56 | `expo/fetch` becomes the global `fetch` | `src/api.ts` and `src/config/runtime.ts` use `fetch` with `AbortController` timeouts and JSON bodies. Uploads send base64 in JSON, not multipart. Should be fine; to opt out, set `EXPO_PUBLIC_USE_RN_FETCH=1` | [E2] |
| 56 | The top-level `splash` key in app.json no longer applies; the splash moves to the `expo-splash-screen` plugin | Move `expo.splash` (colour `#6366f1`, `assets/splash.png`, `cover`) into `["expo-splash-screen", {...}]` and check the launch screen. *Inferred from Expo's source; the release notes don't say it outright.* | [E2] |
| 56 | `expo-file-system`: `copy()` and `move()` became async; SDK 58: `File.write()` async | We only call `await csvFile.write(csv)` (`UnsettledPaymentsScreen.tsx:202`), which already awaits. **`expo-file-system/legacy` still exists in 58**, so our 4 legacy imports keep working | [E2], [E4], [E11] |
| 56 | TypeScript 6 recommended | Not needed. Expo 58's `tsconfig.base` (`module: preserve`, `customConditions`) works with our TypeScript 5.9.3, and web and API stay on 5.x | [E2] |
| 57 | `expo prebuild` cleans by default | A plain `npx expo prebuild` now wipes `android/`, including its gitignored files (signing properties, `local.properties`). Only run it on purpose ([§3.6](#36-a5-android-native-project-tracked-in-git)) | [E3] |
| 58 (RN 0.85–0.88) | Removed: `StyleSheet.absoluteFillObject`, `InteractionManager`, Modal's `animated` prop, StatusBar's `backgroundColor`/`translucent` | One use: `src/context/FeedbackContext.tsx:221` `...StyleSheet.absoluteFillObject` → explicit `position: 'absolute', top/right/bottom/left: 0`. No other uses | [R1], [R2], [E4] |
| 58 (RN 0.87) | Strict TypeScript API by default: deep `react-native/Libraries/*` imports become type errors | We have none | [R2] |
| 58 | `@react-native/jest-preset` must be used as a package; jest-expo 58 has breaking changes | None: mobile Jest uses `ts-jest` with `react-native` fully mocked in `jest.setup.ts`, not jest-expo | [R2] |
| 58 | R8 is on by default in release builds | D6: keep it off with `android.enableMinifyInReleaseBuilds=false` | [E4] |
| 58 | AppDelegate has no `application(_:open:options:)`; `SceneDelegate` (`ExpoAppSceneDelegate`) owns the window and URLs | See [§3.4](#34-a3-config-plugins). Cold-start links still reach `Linking.getInitialURL()`: Expo rebuilds the launch options from the scene's connection options (fix #47628). Warm links reach the `url` event (fix #50235) | [E7], [E14] |

**Expo's upgrade guidance:**
- "upgrading SDK versions incrementally, one at a time" [E8];
- each changelog covers only the previous SDK;
- the native diff tool shows 54 → 58 directly [E9].

### 1.4 Dependencies

Locked versions are from `common/config/rush/pnpm-lock.yaml` on stage. SDK 58 versions are from
`expo@58.0.26`'s `bundledNativeModules.json` [E12].

| Package | Now (locked) | Target | Notes |
|---|---|---|---|
| `expo` | ~54.0.0 (54.0.33) | **~58.0.26** | |
| `react` / `react-native` | 19.1.0 / 0.81.5 | **19.3.0 / 0.88.1** | Web stays on React 19.2.3. pnpm keeps them apart; check that Metro bundles only one React ([§3.3](#33-a2-source-changes)) |
| `@react-native/community-cli-plugin`, `@react-native/gradle-plugin` | 0.81.5 | 0.88.1 | Keep matched to React Native |
| `babel-preset-expo` | ~54.0.0 | ~58.0.0 | |
| `@types/react` / `react-test-renderer` | ~19.1.0 / 19.1.0 | ~19.3.0 / 19.3.0 | `react-test-renderer` is deprecated in React 19 (warning only) [L7]. Replacing it is later work |
| `expo-modules-core` | ~3.0.0 | ~58.1.0 | |
| `expo-apple-authentication` | ~8.0.8 | ~58.0.3 | |
| `expo-application` / `expo-asset` / `expo-auth-session` / `expo-constants` | ~7 / ~12 / ~7 / ~18 | ~58.1.2 / ~58.0.21 / ~58.0.19 / ~58.0.16 | `expo-application`, `expo-auth-session` and `expo-constants` aren't imported anywhere. Bump them now; remove them later |
| `expo-crypto` / `expo-file-system` / `expo-font` | ~15 / ~19 / ~14 | ~58.0.8 / ~58.0.14 / ~58.0.12 | |
| `expo-image-picker` / `expo-keep-awake` / `expo-local-authentication` | ~17 / ~15 / ~17.0.7 | ~58.0.10 / ~58.0.4 / ~58.0.3 | |
| `expo-print` / `expo-secure-store` / `expo-sharing` | ~15.0.8 / ~15.0.7 / ~14.0.8 | ~58.0.9 / ~58.0.3 / ~58.0.23 | |
| `expo-status-bar` / `expo-web-browser` | ~3.0.0 / ~15.0.0 | ~58.0.5 / ~58.1.0 | |
| `expo-intent-launcher` | ~55.0.8 | ~58.0.3 | 55.x was the SDK 55 line, wrong for SDK 54 (which listed 13.0.8). It worked, but the new range is the right one |
| `expo-splash-screen` | – | ~58.0.14 (add) | Only if the `splash` move needs it ([§1.3](#13-breaking-changes-that-touch-this-app)) |
| `@react-native-async-storage/async-storage` | ~2.2.0 | 2.2.0 | Unchanged |
| `react-native-safe-area-context` | ~5.6.0 | ~5.11.1 | |
| `react-native-screens` | ~4.16.0 | ~4.30.1 | Supports only React Navigation 7 [L6] |
| `@react-native-community/datetimepicker` | ~9.1.0 | **9.2.1** | 9.x is fine; the only 9.0 break (Android button-label props) doesn't affect us |
| `@react-navigation/native` / `native-stack` | ^6.1.0 / ^6.9.0 | **^7.5.2 / ^7.21.1** | Required by screens 4.x. 6 → 7 changes are in [§3.3](#33-a2-source-changes) [L5] |
| `@react-navigation/bottom-tabs` | ^6.5.0 | **remove** | Not imported anywhere. A v6 copy would clash with v7 |
| `react-native-purchases` (RevenueCat) | ^10.14.0 | **^11.0.5** | Our 7 calls keep their signatures [L1]. 11.x needs RN ≥0.80 and Kotlin ≥2.1, uses Play Billing 9.1, and its iOS SDK 5.103 includes the Xcode 27 fixes. Error-code changes in [§3.3](#33-a2-source-changes) |
| `@react-native-google-signin/google-signin` | ^12.2.0 (12.2.1) | **^17.0.0** | Uses GoogleSignIn iOS 10.1. Google's 10.0 notes say Xcode 27 support required AppAuth 3 and iOS 15 [L4]. `signIn()` now returns `{type: 'cancelled'}` instead of throwing [L3] |
| `firebase` (JS SDK) | ^10.8.0 (10.14.1) | **~12.19.0** | "Expo only supports firebase@12.0.0 and above" [E10]. Not 13: its `@firebase/auth` needs Node ≥24.12, while Rush allows 24.11.1. 12.x's breaking changes (ES2020, Node 20) don't touch our `getAuth`/Firestore/Storage calls. Web stays on 10 |
| `styled-components`, `socket.io-client` | 6.3.9, 4.8.3 | unchanged | `styled-components` isn't imported (remove later) |
| `typescript`, `jest`, `ts-jest`, `@types/jest` | 5.9.3, 29, 29 | unchanged | Expo's `expo install --check` suggests TypeScript 6 and Jest 30. Those are for jest-expo projects, and the monorepo stays on one TypeScript and one Jest |

### 1.5 Android and Google Play

- **Play's target API.** New apps and updates must target **API 36 from 31 Aug 2026**; the extension
  ended 1 Nov 2026 [P1]. SDK 54 already targets 36, and so does SDK 58 (compileSdk 37). The next step (API 37,
  reportedly August 2027) isn't on Google's page yet.
- **JDK 17 or later** for Gradle 9.4 and AGP 9. This Mac has no default Java: only Homebrew's `openjdk@21`,
  which `build-test-app.sh` already finds, and Android Studio's bundled JBR.
- **New in the SDK 58 template:** `android.builtInKotlin=false` and `android.newDsl=false` (AGP 9 opt-outs
  until AGP 10). The manifest now limits `READ/WRITE_EXTERNAL_STORAGE` to `maxSdkVersion 32`, and
  `configChanges` gains `smallestScreenSize|assetsPaths` (from comparing the templates).

### 1.6 Tooling

- **Maestro 2.12.0 or later** starts simulators on Xcode 27, which has no Simulator.app [L9].
- **CocoaPods 1.17.0** (see [§1.1](#11-apple-xcode-the-sdk-deadline-uiscene-and-macos)). CocoaPods trunk becomes
  read-only on 2 Dec 2026. Published pods stay installable, so this doesn't block us.
- **React Native 0.88.1 still ships both scripts that `build-test-app.sh` runs:**
  `sdks/hermes-engine/utils/replace_hermes_version.js` and
  `third-party-podspecs/replace_dependencies_version.js`. Verified in the npm package.

---

## 2. Branching, order and releases

**One branch, one plan, two milestones: I agree with the earlier recommendation.**
- Expo 58 adopts UIScene on every Xcode, so the risky part (the scene life cycle, URL handling and Google
  Sign-In) is already built and tested in milestone A, with Xcode 26.5.
- Milestone B changes only the SDK the app links against: build fixes, signing on the other Mac, pods and
  iOS 27 behaviour.
- Two branches would mean two rounds of review and merging for one code base.
- Separate commits keep A and B apart in history, and the checkpoints keep them apart in time.

**Where milestone B runs.** B's commands run on the other Mac. Either you run them there from [§4](#4-milestone-b-xcode-27-on-the-other-mac),
or you start a Claude Code session there on the branch; this plan and the commits carry the context. If
you'd rather keep everything here, B could run on this Mac with `DEVELOPER_DIR` pointing at Xcode 27.2
([§5.1](#51-recommended-stay-on-macos-26-add-xcode-272)), after 1.1.0 has shipped. Your call (part of D3).

**One release (1.2.0), not two.**
- A and B ship the same app code. A release of A alone would make users and testers go through a full
  React Native 0.81 → 0.88 change twice: once now, and again weeks later for the SDK switch.
- Android is identical in A and B, so one Play release covers both.
- **Fallback:** if B hits a blocker that can't be fixed in time, ship A built with Xcode 26.5 as 1.2.0, then
  B as 1.2.1 before April 2027.
- Aim to have 1.2.0 live on both stores by **mid-March 2027**, ahead of the unannounced April day.

**Not disturbing 1.1.0:**
- **Prerequisite:** 1.1.0 has shipped on both stores, its version files are committed to `stage`
  ([RELEASE_MONEY_POOLING.md](../deployment/RELEASE_MONEY_POOLING.md) step 7), and it is tagged
  `ios-v1.1.0` / `android-v1.1.0`.
- `chore/expo-58` branches from `stage` after that and merges back only through a pull request, once B and
  the hand tests pass.
- Merge `stage` into the branch when `stage` moves; don't rebase, because you push it.
- **1.1.x hotfixes** come from the tags and are built on this Mac with Xcode 26.5 and Expo 54. That's
  possible until April 2027, so **keep Xcode 26.5 on this Mac until 1.2.0 is live.**
- Leave Xcode 27.2's first launch on this Mac until 1.1.0 is out. Apple supports both side by side, but
  nothing new should touch the release Mac mid-release.

**Order:**
1. 1.1.0 released.
2. Milestone A on this Mac → **Checkpoint A**.
3. Prepare the other Mac (can run in parallel with A).
4. Milestone B on the other Mac → **Checkpoint B**.
5. Hand test.
6. Pull request into `stage`.
7. Release 1.2.0: API and web unchanged, so straight to the apps.

---

## 3. Milestone A: Expo 58 on Xcode 26.5 (this Mac)

All commands run from `traxettle-rush/` unless shown otherwise. Prefix Rush with
`RUSH_ALLOW_UNSUPPORTED_NODEJS=1`.

### 3.1 A0. Branch and baseline

```bash
git fetch origin
git switch -c chore/expo-58 origin/stage
```

```bash
RUSH_ALLOW_UNSUPPORTED_NODEJS=1 node common/scripts/install-run-rush.js install
bash scripts/regression/run.sh full
```

- Record the baseline counts (unit suites, Playwright) to compare at the end.
- Record `npm run version:show` (in `apps/mobile`); it should say 1.1.0.
- **Back up the gitignored files inside `android/`** that a clean prebuild deletes: `gradle.properties.local`,
  `local.properties`, `app/google-services.json` and `app/debug.keystore`. Copy them to a folder outside
  the repo, never committed:

```bash
cd apps/mobile && git ls-files --others --ignored --exclude-standard android | grep -v -E '/(build|\.gradle|\.cxx)/'
```

### 3.2 A1. Dependencies

1. Edit `apps/mobile/package.json` to the targets in [§1.4](#14-dependencies). Leave its `version` field
   alone: `version.sh` owns it.
   - Don't use `npx expo install --fix`: in this Rush monorepo it would run a package manager outside Rush.
2. Update the lockfile:

   ```bash
   RUSH_ALLOW_UNSUPPORTED_NODEJS=1 node common/scripts/install-run-rush.js update
   ```

3. Check against Expo's list (read-only):

   ```bash
   cd apps/mobile && npx expo install --check
   ```

   ```bash
   cd apps/mobile && npx expo-doctor@latest
   ```

   Expected leftovers are the TypeScript and Jest suggestions (kept deliberately) and monorepo notes.

4. Check that only one React and one React Native end up in the mobile bundle:

   ```bash
   cd apps/mobile && node -p "require.resolve('react/package.json')+'\n'+require.resolve('react-native/package.json')"
   ```

   Also check Metro's resolution in the first bundle. Two Reacts show up as "Invalid hook call".

- **D4, straight to 58:** the app's native surface is small: no Reanimated, no custom native code, and 9
  native libraries in use. The breaking changes of SDKs 55–58 are in the table in [§1.3](#13-breaking-changes-that-touch-this-app).
- **If a native build fails for no clear reason**, step back to SDK 56's versions to find out which side of
  0.85 it broke on.

### 3.3 A2. Source changes

| File | Change |
|---|---|
| `src/screens/LoginScreen.tsx:78`, `RegisterScreen.tsx:77`, `ProfileScreen.tsx:448` | Google Sign-In 13+: `signIn()` resolves `{type: 'cancelled'}` when the user backs out, instead of throwing `SIGN_IN_CANCELLED`. Today that would show the "No ID token received" alert. Handle `isCancelledResponse(result)` quietly. Keep `result?.data?.idToken`. The `statusCodes` checks stay, for `IN_PROGRESS` and `PLAY_SERVICES_NOT_AVAILABLE` |
| `src/services/purchases.ts` | RevenueCat 11: no renamed calls. On iOS, `purchasePackage` now rejects with the offerings error (for example `NETWORK_ERROR`) instead of `PRODUCT_NOT_AVAILABLE_FOR_PURCHASE`. On Android, a blocked Play Store reports `PURCHASE_NOT_ALLOWED_ERROR`. We only branch on `userCancelled`, so check the messages shown for other errors. `EntitlementInfo.periodType` is now a string union, so fix the types if `tsc` complains |
| `App.tsx` and the 9 files with 24 `navigation.navigate(...)` calls to 15 screens | **React Navigation 7:** `navigate()` no longer goes **back** to a screen that is already in the stack, and no longer reaches nested screens by name. Our stack is flat: one `createNativeStackNavigator` with a `linking` config (`com.traxettle.app://events/:eventId`). Check each call. Where the intent is "return to" (for example back to `EventDetail` or `Dashboard` after an action), use `popTo(...)`. No custom theme, `independent`, `headerBackTitleVisible` or tab options are used. Maestro's `go-back` subflow taps the iOS header back button; check its label still matches |
| `src/context/FeedbackContext.tsx:221` | `StyleSheet.absoluteFillObject` → explicit absolute-fill style |
| `app.json` | Move `expo.splash` into the `expo-splash-screen` plugin entry, if SDK 58 ignores the old key (check the generated launch screen and Android splash). Nothing else: `newArchEnabled` isn't there, and the plugins list stays |
| Tests (`src/__tests__`) | Update mocks that mirror changed APIs, such as the Google Sign-In `signIn` result shape. Add tests for the cancel path and any `popTo` change |

**Checks:**

```bash
cd apps/mobile && npx tsc --noEmit
```

```bash
cd apps/mobile && npx jest --ci
```

```bash
bash scripts/regression/run.sh quick
```

### 3.4 A3. Config plugins

**`plugins/copy-google-service-plist.js`:**
- **Keep:** copying `GoogleService-Info.plist` into the project and adding it to Copy Bundle Resources, the
  reversed-client-ID URL scheme, and `GIDClientID` / `GIDServerClientID`.
- **Remove** `withGoogleSignInAppDelegate` (the `import GoogleSignIn` insertion and the `handle(url)` regex
  patch), and update the header comment.
  - The package registers its own `GoogleSignInAppDelegate` (an `ExpoAppDelegateSubscriber` that calls
    `GIDSignIn.sharedInstance.handle(url)`) through `expo-module.config.json`. Verified in 12.2.1 and 17.0.0.
  - Under SDK 58, `ExpoAppSceneDelegate` → `SceneEventForwarder` passes every scene URL to `ExpoAppDelegate`,
    which calls its subscribers [E7], [E14].
  - Today the patch is a duplicate. On SDK 58 it matches nothing.
- **After prebuild, check:**

  ```bash
  cd apps/mobile && grep -l GoogleSignInAppDelegate "ios/Pods/Target Support Files/"*/ExpoModulesProvider.swift
  ```

  ```bash
  cd apps/mobile && /usr/libexec/PlistBuddy -c "Print :UIApplicationSceneManifest" ios/*/Info.plist
  ```

  Then sign in with Google on the simulator.

**`plugins/ios-release-signing.js`:** no change expected. The SDK 58 template still has one app target with
a Release configuration. Check after a `testflight`/`xcode` prebuild:

```bash
cd apps/mobile && xcodebuild -workspace ios/*.xcworkspace -scheme "$(basename ios/*.xcodeproj .xcodeproj)" -configuration Release -showBuildSettings | grep -E "CODE_SIGN_STYLE|PROVISIONING_PROFILE_SPECIFIER|IPHONEOS_DEPLOYMENT_TARGET"
```

### 3.5 A4. iOS native project (generated, gitignored)

```bash
cd apps/mobile && EXPO_NO_GIT_STATUS=1 npx expo prebuild --platform ios --clean
```

- [ ] `ios/<project>/SceneDelegate.swift` exists, and `Info.plist` has `UIApplicationSceneManifest`.
- [ ] `IPHONEOS_DEPLOYMENT_TARGET = 16.4`; `objectVersion = 54` in `project.pbxproj`.
- [ ] `pod install` succeeds (prebuild runs it).
- [ ] The Google plist is in the project (the plugin's log lines).
- [ ] Builds and runs with Xcode 26.5:

  ```bash
  bash apps/mobile/maestro/scripts/build-test-app.sh ios
  ```

### 3.6 A5. Android native project (tracked in git)

`build-android.sh` builds the tracked `android/` as it is, so this is a regenerate-and-reapply step.

```bash
cd apps/mobile && EXPO_NO_GIT_STATUS=1 npx expo prebuild --platform android --clean
```

1. **Restore** the gitignored files backed up in A0.
2. **Review `git diff -- android` hunk by hunk** (`git add -p`).
   - **Keep** the template's changes: Gradle 9.4.1 wrapper, `MainApplication.kt` (`ExpoReactHostFactory`),
     the Kotlin classpath, `builtInKotlin`/`newDsl` opt-outs, manifest changes, dropped `expo.edgeToEdgeEnabled`.
   - **Put back** our customizations, which I read from stage:
     - **`app/build.gradle`:** `versionCode` / `versionName`. Prebuild writes 1 / "1.0.0"; `version.sh` needs
       exactly one of each line, holding 1.1.0's values.
     - **`app/build.gradle`:** the `release` signing config that reads `MYAPP_RELEASE_*`, and
       `signingConfig signingConfigs.release` in the release build type (the template signs release with the
       debug key).
     - **`gradle.properties`:** the `MYAPP_RELEASE_*` lines.
     - **`gradle.properties`:** `android.enableMinifyInReleaseBuilds=false` (D6).
     - Anything else the diff shows as ours, such as `rootProject.name = 'Traxettle'`.
   - If the diff is hard to read: run the same prebuild on stage *before* step A1. That diff is our
     customizations alone. Then restore with `git checkout -- android` and the backup.
3. **Checks:**
   - [ ] `npm run version:show` shows 1.1.0 and the right `versionCode`.
   - [ ] `bash apps/mobile/maestro/scripts/build-test-app.sh android` builds, installs and opens.
   - [ ] `bash scripts/build-android.sh debug:staging` (in `apps/mobile`) builds a **release-signed** APK.
     It opens on production by default.
   - [ ] Its certificate is the upload key:

     ```bash
     "$(ls -d ~/Library/Android/sdk/build-tools/* | tail -1)/apksigner" verify --print-certs apps/mobile/android/app/build/outputs/apk/release/app-release.apk | grep -i 'SHA-1'
     ```

     It should show `6a773af7…ae26`, which is `6A:77:3A:F7:…:AE:26` (DEPLOYMENT_CHANNELS.md, "Signing
     Keys"). Not `keytool -printcert -jarfile`: the APK has only v2/v3 signatures, which keytool can't read.

**Pre-existing, out of scope:** the tracked `android/gradle.properties` holds the release keystore password
(it's also in DEPLOYMENT_CHANNELS.md). The upgrade keeps those lines as they are and adds nothing new. Moving
them out of git is a separate change. (`build.gradle` reads them from `gradle.properties`; the
`gradle.properties.local` file that `build-android.sh` checks for isn't loaded by Gradle.)

### 3.7 A6. Scripts

| Script | Change |
|---|---|
| `scripts/build-ios.sh` | In `testflight` and `xcode` modes, print the Xcode and SDK used (`xcodebuild -version`, `xcrun --sdk iphoneos --show-sdk-version`). In `xcode` mode, open the workspace with the **selected** Xcode, `${DEVELOPER_DIR:-$(xcode-select -p)}` minus `/Contents/Developer`, rather than whatever Finder picks. With the App Store copy of Xcode 27.2 installed, a changed default would otherwise archive with the wrong SDK |
| `maestro/scripts/build-test-app.sh` | The replace scripts are unchanged (both present in RN 0.88.1). Skip a missing one with a warning instead of failing. Open the selected Xcode's `Simulator.app`, or `DeviceHub.app` on Xcode 27, instead of `open -a Simulator`. Keep `iPhone 17 Pro` as the default after checking it exists in the iOS 27 runtime |
| `scripts/build-android.sh` | Gradle 9 needs JDK 17+. If `JAVA_HOME` is unset, fall back to Homebrew's `openjdk@21` as `build-test-app.sh` does. No other change |
| `scripts/version.sh` / `version.mts` | No change |

### 3.8 A7. Automated regression (this Mac)

1. Full suite:

   ```bash
   bash scripts/regression/run.sh full
   ```

2. iOS Maestro: iPhone 17 Pro simulator, iOS 26.5.

   ```bash
   bash apps/mobile/maestro/scripts/build-test-app.sh ios
   ```

   ```bash
   bash scripts/regression/run.sh mobile
   ```

3. Android Maestro: start an emulator, then:

   ```bash
   bash apps/mobile/maestro/scripts/build-test-app.sh android
   ```

   ```bash
   MAESTRO_DEVICE=emulator-5554 bash scripts/regression/run.sh mobile
   ```

Compare every count with the A0 baseline. A failure is either a real break (fix it) or a flow that depended
on React Navigation 6 behaviour (fix the app or the flow, and say which).

### 3.9 A8. Release-configuration smoke test (no store upload)

- **iOS:** `npx expo run:ios --configuration Release` on the simulator.
  - It opens on **production**: only look, don't sign in.
  - 7 taps on "Traxettle" → staging; sign in with a staging account.
  - Confirms the Release bundle, scene start-up and the staging switch without spending a version number.
- **Android:** install the `debug:staging` APK from A5 and do the same check.
- **Never run Maestro against these builds.**

### 3.10 A9. Docs

- **DEPLOYMENT_CHANNELS.md §5:** Xcode prerequisites (27.x for uploads from April 2027, how to select it,
  don't accept project-format upgrades).
- **REGRESSION_SUITE.md §6:** Maestro ≥2.12, DeviceHub, iOS 27 simulator.
- **IOS_SETUP.md / ANDROID_SETUP.md / LOCAL_DEVELOPMENT.md:** minimum iOS 16.4, Xcode 26.4+, JDK 17+,
  Gradle 9.
- **New `runbook/EXPO_58_HAND_TEST.md`:** the hand test from [§6.3](#63-hand-test-plan).

### Checkpoint A

I stop and report:
- the dependency diff;
- regression counts against the baseline (both platforms' Maestro);
- the `android/` diff summary and signing check;
- anything deferred.

Proposed commits (nothing is committed until you say so):
1. `docs: Expo 58 / iOS 27 upgrade plan`
2. `chore(mobile): Expo SDK 58 dependencies` (package.json, pnpm-lock.yaml)
3. `fix(mobile): API changes for React Navigation 7, Google Sign-In 17, RevenueCat 11, RN 0.88`
4. `fix(mobile): drop the AppDelegate Google Sign-In patch (the library's subscriber handles URLs under UIScene)`
5. `chore(android): regenerate the native project for SDK 58, keeping signing and versions`
6. `chore(mobile): build scripts for Xcode 27 and Gradle 9`
7. `docs: runbooks for SDK 58`

---

## 4. Milestone B: Xcode 27 on the other Mac

Prerequisite: the other Mac is set up ([§5](#5-the-other-mac)), and you've pushed `chore/expo-58`.

1. **Get the branch:**

   ```bash
   git fetch origin && git switch chore/expo-58
   ```

   ```bash
   RUSH_ALLOW_UNSUPPORTED_NODEJS=1 node common/scripts/install-run-rush.js install
   ```

   ```bash
   bash scripts/regression/run.sh quick
   ```

2. **Select Xcode 27.2** for this terminal (or `sudo xcode-select -s` on that Mac):

   ```bash
   export DEVELOPER_DIR=/Applications/Xcode_27.2.app/Contents/Developer
   ```

   Then check:

   ```bash
   xcodebuild -version && xcrun --sdk iphoneos --show-sdk-version
   ```

   It should print 27.2 / 27.2.

3. **Debug build on an iOS 27 simulator:**

   ```bash
   bash apps/mobile/maestro/scripts/build-test-app.sh ios
   ```

   Fix what Xcode 27 breaks: Swift 6.4 diagnostics, pod deployment targets, linker flags (ld64 and
   `-ld_classic` are gone).
   - Don't let Xcode change the project format; check `objectVersion` stays 54.
   - Fixes belong in config plugins or package versions, never hand edits to `ios/`.
4. **Maestro on iOS 27:** `bash scripts/regression/run.sh mobile`. If Maestro itself can't drive the iOS 27
   simulator, the iOS 26.5 run from A7 plus the hand test cover the JavaScript, and B's own risk (launch,
   scenes, sign-in) is in the hand test.
5. **Release check** on iOS 27 (simulator, then an iPad and an iPhone Duo simulator): as in A8.
6. **Release candidate:**
   1. Bump the version on the branch:

      ```bash
      cd apps/mobile && npm run version:bump -- minor
      ```

   2. Check App Store Connect's release notes allow Xcode 27.2 uploads (they do since 30 Oct).
   3. Build and upload with `IOS_PROVISIONING_PROFILE=… APPLE_TEAM_ID=… bash scripts/build-ios.sh testflight`,
      using `DEVELOPER_DIR` set as in step 2.
   4. The archive must show Xcode 27.2 in Organizer.
   5. This TestFlight build is the one you later promote.

### Checkpoint B

I report:
- the build fixes;
- the Maestro results on iOS 27;
- the release candidate's build number.

Commit: `fix(ios): build with Xcode 27 / iOS 27 SDK` (only if anything needed changing), plus the version
files.

Then:
- the hand test ([§6.3](#63-hand-test-plan));
- the Android AAB from the **same commit**: `build-android.sh production`, Play internal testing;
- the pull request into `stage`.

Build the AAB only after the final iOS candidate, so both platforms ship the same version (`version.sh` bumps
a platform that has already shipped the current version).

---

## 5. The other Mac

**After milestone B:** for day-to-day work with Xcode 27 (what to rerun after a pull, making every build
use Xcode 27, proving which SDK a build used, which iOS versions to test on) and for the move to macOS 27,
follow [runbook/XCODE_27_AND_MACOS_27.md](../runbook/XCODE_27_AND_MACOS_27.md). This section is the
original setup plan.

**First, look at what's there:**

```bash
sw_vers
```

```bash
ls -d /Applications/Xcode*.app && xcode-select -p
```

```bash
pod --version; ~/.maestro/bin/maestro --version; /usr/libexec/java_home -V
```

It may already have the App Store's Xcode 27.2, as this Mac does.

### 5.1 Recommended: stay on macOS 26, add Xcode 27.2

Nothing is lost: Xcode 26.5 keeps working, and that Mac can still build 1.1.x in an emergency.

1. **Install Xcode 27.2.**
   - Download `Xcode_27.2.xip` from developer.apple.com/download/all, expand it, and move it to
     `/Applications/Xcode_27.2.app`.
   - A fixed copy is better than the App Store's `/Applications/Xcode.app`, which updates itself. Turn off
     App Store automatic updates on that Mac, or note Xcode's version before every build.
2. **Accept the license and install components:**

   ```bash
   sudo DEVELOPER_DIR=/Applications/Xcode_27.2.app/Contents/Developer xcodebuild -license accept
   ```

   ```bash
   sudo DEVELOPER_DIR=/Applications/Xcode_27.2.app/Contents/Developer xcodebuild -runFirstLaunch
   ```

   First launch installs shared system components; Xcode 26.5 works with them.
3. **iOS 27 simulator runtime** (several GB):

   ```bash
   DEVELOPER_DIR=/Applications/Xcode_27.2.app/Contents/Developer xcodebuild -downloadPlatform iOS
   ```

   Then create the simulators you need: an iPhone 17 Pro if missing, an iPad and an iPhone Duo. Use Xcode →
   Window → Devices, or `xcrun simctl create`.
4. **CocoaPods 1.17.0:**

   ```bash
   brew upgrade cocoapods
   ```

   or `gem install cocoapods`, matching how it was installed.
5. **Maestro 2.12 or later:**

   ```bash
   curl -Ls "https://get.maestro.mobile.dev" | bash
   ```

6. **Node 24 and JDK 21:**

   ```bash
   brew install openjdk@21
   ```

   JDK 21 is for the Firebase emulators that `run.sh mobile` starts. Android Studio is only needed if you
   build Android there; B doesn't.
7. **Pick the Xcode per terminal** with `DEVELOPER_DIR`, or system-wide with `sudo xcode-select -s`.

### 5.2 Your plan: upgrade that Mac to macOS 27

**Decided (2026-11-27):** upgrade only after 1.2.0 is live on both stores and `chore/expo-58` is merged into
`stage`. The full procedure, with gates, backups, commands and checks, is
[runbook/XCODE_27_AND_MACOS_27.md §7](../runbook/XCODE_27_AND_MACOS_27.md#7-upgrading-the-other-mac-to-macos-27).
The outline below is the original plan.

Only if you want macOS 27 itself. This upgrade doesn't need it. **Plainly: after the upgrade, Xcode 26 won't
open on that Mac,** so it becomes an Xcode 27-only machine. That's fine for milestone B, but it can no longer
build a 1.1.x hotfix. macOS 27 runs only on Apple silicon.

1. **Back up:**
   - Time Machine → **Back Up Now**, and wait for "Latest backup" to update. Use an APFS-formatted drive:
     macOS 27 deprecates encrypted HFS+ backups.
   - Also export that Mac's signing identity, if it has one, as a `.p12`.
   - A Time Machine backup made **before** the upgrade is the only way back: erase, reinstall macOS 26,
     then restore with Migration Assistant [A9].
2. **Upgrade:** System Settings → General → Software Update → macOS 27.2.1.
3. **Command-line tools and Homebrew:**

   ```bash
   xcode-select --install
   ```

   ```bash
   brew update && brew upgrade
   ```

   ```bash
   brew reinstall cocoapods
   ```

   If CocoaPods' Ruby gems break, reinstall them.
4. **Xcode 27.2:** as in 5.1, steps 1–7. Xcode 26.5 can be deleted from that Mac.

### 5.3 Getting the branch to build there (either option)

- **Repo:** `git fetch`, `git switch chore/expo-58`, then `rush install`. `run.sh` builds the shared library.
- **Files that aren't in git**, copied privately from this Mac, never committed:
  - `apps/mobile/GoogleService-Info.staging.plist` (plus `.local` for Debug builds);
  - `rc_prod.properties` at the repo root, copied as it is, not edited. Store builds read the RevenueCat Apple
    key from it.
- **Signing** (DEPLOYMENT_CHANNELS.md §5):
  1. On this Mac: Keychain Access → My Certificates → right-click **Apple Distribution: …** → **Export**
     → `.p12` with a password.
  2. Move it to the other Mac (AirDrop) and double-click it there.
  3. Download the **App Store** provisioning profile (it must include Sign in with Apple) from
     developer.apple.com → Profiles, and double-click it.
  4. Check:

     ```bash
     security find-identity -v -p codesigning
     ```

     It should list "Apple Distribution". `build-ios.sh` checks the profile, the App ID and the Sign in with
     Apple entitlement before building.
  5. For the upload: sign in under Xcode → Settings → Accounts, or set `ASC_KEY_PATH`, `ASC_KEY_ID` and
     `ASC_KEY_ISSUER_ID`.
- **Versions:** pull 1.1.0's version files first, or the build reuses a version.

---

## 6. Testing

### 6.1 Automated

| Run | Milestone A (this Mac, Xcode 26.5) | Milestone B (other Mac, Xcode 27.2) |
|---|---|---|
| `run.sh full`: type checks, every unit suite, Playwright | ✔ (and CI on the pull request: Ubuntu 24.04, Node 24) | `quick` (the JavaScript is the same as A) |
| `run.sh mobile`: Maestro, iOS | ✔ iPhone 17 Pro, iOS 26.5 | ✔ iOS 27 simulator |
| `run.sh mobile`: Maestro, Android | ✔ emulator | – (no Android change in B) |

### 6.2 Is that enough?

Yes, with the hand test below. The app's logic doesn't change. The risk is in native integrations, which
neither Jest (React Native is mocked) nor Maestro (Debug build, emulators, no real stores) reaches:
- sign-in providers;
- URL delivery under scenes;
- camera and photos;
- the native picker;
- store purchases;
- Release-only behaviour (bundling, signing, R8, the 7-tap switch);
- upgrading over an installed 1.1.0.

I've added three items to your list:
- **deep links and cold-start links**, the part the scene life cycle changes most;
- **iPad and iPhone Duo launch**: App Review tests on iPad, and Duo screenshots are needed from April 2027;
- **Android edge-to-edge and back gesture**, made mandatory in SDK 55.

### 6.3 Hand-test plan

To be saved as `runbook/EXPO_58_HAND_TEST.md` in step A9.

**What changes:** only the platform under the app: Expo 58, React Native 0.88, React Navigation 7, new
sign-in, purchase and Firebase libraries, iOS scene start-up, Android Gradle 9, and an Xcode 27 build. No
screen or rule changes.

**Builds:**
- **iOS:** the 1.2.0 TestFlight build from milestone B, on an iPhone with iOS 27. If you have none, use a
  Release build on the iOS 27 simulator; purchases then can't be tested.
- **Android:** the 1.2.0 AAB from Play internal testing, on a phone (Android 16 if possible).

**Is it safe?** Yes.
- Store builds open on **production**. Do the sign-in tests on **staging** (H2), except H1, which is about
  your real account.
- iOS purchases in TestFlight use the Sandbox. On Android, use a license-tester account, so nobody is
  charged.
- Don't buy with a real account.

| # | Test | Platforms | Steps | Expected |
|---|---|---|---|---|
| H1 | **Update keeps you signed in** (do it first) | iOS, Android | Before installing 1.2.0: have 1.1.0 from the store, signed in, with PIN or biometrics on if you use them. Install 1.2.0 over it (TestFlight / internal-testing link). Open it | Still signed in, same events, PIN or biometric unlock works, environment unchanged |
| H2 | **Production by default, 7-tap switch** | iOS, Android | Sign out. On the sign-in screen tap "Traxettle" 7 times; the app reloads. Repeat to go back | Opens on production; switches to staging and back, each time with a reload |
| H3 | **Google sign-in** (staging) | iOS, Android | Sign in with Google → pick an account. Sign out, start again, and **cancel** the account picker | Signed in. Cancelling returns quietly: no "No ID token" alert, no error |
| H4 | **Sign in with Apple** (staging) | iOS | Sign in with Apple; then start again and cancel | Signed in; cancelling does nothing |
| H5 | **Email-link sign-in, warm and cold** (staging) | iOS, Android | Request a sign-in link. (a) App in the background: tap the link in Mail. (b) Request again, **force-quit** the app, tap the link | Both sign you in. (b) is the cold-start path the scene life cycle changes |
| H6 | **Deep link** | iOS, Android | Open `com.traxettle.app://events/<an event id>` from Notes or Safari, once with the app running and once after force-quitting | Opens that event |
| H7 | **Camera and photo receipt** | iOS, Android | On a pool spend (or settlement proof): **Take photo** (allow the camera the first time) → attach. Then **Choose from library** → attach. Open the receipt | Both upload and show. Permission prompts show the app's own wording |
| H8 | **Native date picker** | iOS, Android | Add an expense, change its date with the picker, save; edit it again | The chosen date is saved and shown; the picker opens with it |
| H9 | **RevenueCat Sandbox purchase and Restore** | iOS, Android | As a free test account in the environment you used for 1.1.0's purchase check: open Upgrade to Pro (price and trial shown), buy with the Sandbox / license-tester account. Delete and reinstall (or sign out and in), then **Restore** | Pro unlocks after buying; Restore brings it back; cancelling the purchase sheet does nothing |
| H10 | **Export, share and open** | iOS, Android | Export unsettled payments (CSV) and a PDF; open an attached proof file on Android | Share sheet / print preview appears; the file opens |
| H11 | **Android look and back** | Android | Browse events, add an expense with the keyboard open, use the system back gesture to the dashboard, then back once more | Nothing under the status or navigation bars; the keyboard doesn't cover the field being typed in; back goes to the previous screen, and from the dashboard puts the app in the background |
| H12 | **iPad and iPhone Duo launch** | iOS simulators (Release build, Xcode 27.2) | Launch on an iPad (iOS 27) and on an iPhone Duo (closed, then open); sign in on staging | Fills the screen, no blank or black window; usable in both Duo postures |

Record results as pass/fail per platform. Anything that fails blocks the pull request into `stage`.

---

## 7. Risks and rollback

| Risk | Likelihood / impact | Mitigation |
|---|---|---|
| Google Sign-In on iOS doesn't complete under scenes | Low / high | The library's own subscriber handles the URL, and Expo forwards scene URLs to it (verified in source). Prebuild check in A3; hand test H3 |
| Email or deep links lost on cold start | Low / high | Expo 58 rebuilds the launch options for `getInitialURL` (fix #47628); hand tests H5b and H6 |
| Regenerated `android/` loses signing or `versionCode`, so Play rejects the AAB or it's signed with the debug key | Medium / high | Backup, hunk-by-hunk review, `keytool` SHA-1 check, `version:show` (A5) |
| React Navigation 7 changes back-navigation (`navigate` no longer pops) | Medium / medium | Audit of the 24 calls; Maestro flows cover most screens (A2, A7) |
| Library majors (Google Sign-In 17, RevenueCat 11, Firebase 12) behave differently | Low–medium / medium | Changes listed in §3.3; unit tests; hand tests H3, H9 |
| Wrong Xcode archives a build. Example: the App Store updates `Xcode.app`, or Finder's default changes, and an Expo 54 build gets the iOS 27 SDK and won't launch | Low / high | `build-ios.sh` prints the toolchain and opens the selected Xcode (A6). Fixed-version `Xcode_27.2.app`. Check Organizer's Xcode version before submitting |
| Xcode 27 / CocoaPods project-format clash (`objectVersion 110`, `.xcproj`) | Low / medium | Keep Expo's format (54); never accept Xcode's format update |
| Maestro can't drive iOS 27 simulators | Medium / low | Maestro ≥2.12; iOS 26.5 Maestro run in A; hand test |
| Users on iOS 15–16.3 stop getting updates | Certain / low | They keep 1.1.x. Accepted (D8) |
| Two Reacts in the monorepo (web 19.2.3, mobile 19.3.0) | Low / medium | Resolution check in A1 |
| App Store Connect not yet accepting a new Xcode point release | Low / low | Check its release notes before uploading |
| Deadline pressure (exact April day unknown) | Medium / high | Target 1.2.0 live by mid-March 2027; fallback is A built with Xcode 26.5 |

### Rollback

- **Before merging:** nothing to roll back. `stage`, the tags and 1.1.x are untouched; drop the branch.
- **Merged into `stage`, not yet released:** revert the merge commit with `git revert -m 1 <merge>` in a
  pull request.
- **Released:**
  - **iOS:** use App Store **Phased Release** for 1.2.0. It can be paused, and it only affects automatic
    updates. If something is wrong, pause it and ship a fix. The App Store can't go back to an earlier
    binary: a "rollback" is a new version (1.2.1) built from the `ios-v1.1.0` code. **Until April 2027**,
    that can be built on this Mac with Xcode 26.5. After that only Expo 58 code can ship, which is why B and
    the hand test must be solid before April.
  - **Android:** use a **staged rollout** (for example 20%) and halt it if needed. A rollback is an AAB
    built from `android-v1.1.0` with a **higher** `versionCode` (Play never accepts a lower one).
- The API and web don't change, so a rollback is app-only.

---

## 8. Rough size

| Part | Size | Mostly |
|---|---|---|
| Other Mac setup (§5.1) | ½ day | Downloads: Xcode about 3–4 GB, the iOS 27 runtime about 8 GB. Add 2–3 hours with a macOS 27 upgrade and backup (§5.2) |
| Milestone A | 3–5 working days | Dependencies and lockfile ½; source, type and test fixes incl. navigation audit 1–2; plugin ½; Android regenerate and checks ½–1; regression on both platforms ½–1; docs ¼ |
| Milestone B | 1–2 days | Xcode 27 build fixes 0–1; Maestro on iOS 27 ½; TestFlight candidate ½ |
| Hand test and release | 1 day, plus store review | H1–H12 on both platforms; AAB; pull request; submissions |

---

## 9. Sources

**Apple**
- [A1] Upcoming SDK minimum requirements (9 Sept 2026): https://developer.apple.com/news/?id=k1mtkt1k
- [A2] TN3187, Migrating to the UIKit scene-based life cycle: https://developer.apple.com/documentation/technotes/tn3187-migrating-to-the-uikit-scene-based-life-cycle
- [A3] iOS & iPadOS 27 release notes: https://developer.apple.com/documentation/ios-ipados-release-notes/ios-ipados-27-release-notes
- [A4] Transitioning to the UIKit scene-based life cycle: https://developer.apple.com/documentation/uikit/transitioning-to-the-uikit-scene-based-life-cycle
- [A5] WWDC25 session 243, What's new in UIKit: https://developer.apple.com/videos/play/wwdc2025/243/
- [A6] Xcode 27 release notes: https://developer.apple.com/documentation/xcode-release-notes/xcode-27-release-notes and 27.2: https://developer.apple.com/documentation/xcode-release-notes/xcode-27_2-release-notes
- [A7] Xcode system requirements table: https://developer.apple.com/support/xcode/
- [A8] Apple Developer Forums, DTS replies: https://developer.apple.com/forums/thread/831716 (Xcode 26 not supported on macOS 27) and https://developer.apple.com/forums/thread/836048 (keep both Xcodes); developer report of the Xcode 26 vs 27 launch behaviour: https://developer.apple.com/forums/thread/840957
- [A9] macOS 27 compatible Macs and upgrading: https://support.apple.com/en-us/127255, https://support.apple.com/en-us/127455; release history: https://support.apple.com/en-us/100100; macOS installers: https://support.apple.com/en-us/102662; Migration Assistant: https://support.apple.com/en-us/102551
- [A10] Downloading and installing additional Xcode components: https://developer.apple.com/documentation/xcode/downloading-and-installing-additional-xcode-components
- [A11] App Store Connect release notes (Xcode 27.2 uploads from 30 Oct; iPhone Duo screenshots from April 2027): https://developer.apple.com/help/app-store-connect/release-notes/
- [A12] Defining a custom URL scheme for your app: https://developer.apple.com/documentation/xcode/defining-a-custom-url-scheme-for-your-app
- [A13] Export a signing certificate (Xcode Help): https://help.apple.com/xcode/mac/current/en.lproj/dev154b28f09.html
- [A14] Upcoming requirements (last cycle's date, 28 April 2026): https://developer.apple.com/news/upcoming-requirements/

**Expo and React Native**
- [E1]–[E4] Changelogs: https://expo.dev/changelog/sdk-55, https://expo.dev/changelog/sdk-56, https://expo.dev/changelog/sdk-57, https://expo.dev/changelog/sdk-58
- [E5] How to upgrade to SDK 58: https://expo.dev/blog/how-to-upgrade-to-sdk-58
- [E6] SDK versions table: https://docs.expo.dev/versions/latest/
- [E7] iOS scene life cycle guide: https://github.com/expo/fyi/blob/main/ios-scene-lifecycle.md
- [E8] Upgrade walkthrough ("one at a time"): https://docs.expo.dev/workflow/upgrading-expo-sdk-walkthrough/
- [E9] Native upgrade helper, 54 → 58: https://docs.expo.dev/bare/upgrade/?fromSdk=54&toSdk=58
- [E10] Using Firebase ("firebase@12.0.0 and above"): https://docs.expo.dev/guides/using-firebase/
- [E11] expo-file-system legacy API in SDK 58: https://docs.expo.dev/versions/v58.0.0/sdk/filesystem-legacy/
- [E12] bundledNativeModules.json (sdk-58): https://github.com/expo/expo/blob/sdk-58/packages/expo/bundledNativeModules.json (also read from the `expo@58.0.26` npm package)
- [E13] Prebuild template (sdk-58): https://github.com/expo/expo/tree/sdk-58/templates/expo-template-bare-minimum (also compared as npm packages: 54.0.54 vs 58.0.35)
- [E14] `ExpoAppSceneDelegate.swift` and `SceneEventForwarder.swift`: https://github.com/expo/expo/blob/sdk-58/packages/expo/ios/Expo/ExpoAppSceneDelegate.swift (read in `expo@58.0.26`)
- [R1] React Native 0.85: https://reactnative.dev/blog/2026/04/07/react-native-0.85
- [R2] React Native 0.87: https://reactnative.dev/blog/2026/08/11/react-native-0.87
- [R3] React Native 0.88: https://reactnative.dev/blog/2026/10/19/react-native-0.88
- [R4] React Native 0.88.1 Android versions: https://github.com/facebook/react-native/blob/v0.88.1/packages/react-native/gradle/libs.versions.toml

**Libraries and tools**
- [L1] RevenueCat v11 migration: https://github.com/RevenueCat/react-native-purchases/blob/main/migrations/v11-MIGRATION.md
- [L2] RevenueCat, Xcode 27 CocoaPods deployment-target error: https://www.revenuecat.com/docs/known-store-issues/xcode-27/cocoapods-deployment-target-error
- [L3] Google Sign-In migration guide: https://react-native-google-signin.github.io/docs/migrating; v17.0.0: https://github.com/react-native-google-signin/google-signin/releases/tag/v17.0.0
- [L4] GoogleSignIn-iOS 10.0.0 (Xcode 27, AppAuth 3, iOS 15): https://github.com/google/GoogleSignIn-iOS/releases/tag/10.0.0
- [L5] React Navigation, upgrading from 6.x: https://reactnavigation.org/docs/upgrading-from-6.x
- [L6] react-native-screens 4.0.0 (React Navigation 7 only): https://github.com/software-mansion/react-native-screens/releases/tag/4.0.0
- [L7] react-test-renderer deprecation: https://react.dev/warnings/react-test-renderer
- [L8] CocoaPods 1.17.0: https://github.com/CocoaPods/CocoaPods/releases/tag/1.17.0; objectVersion 110 issue: https://github.com/CocoaPods/CocoaPods/issues/12927
- [L9] Maestro changelog (2.12.0: Xcode 27 without Simulator.app): https://github.com/mobile-dev-inc/maestro/blob/main/CHANGELOG.md
- [P1] Google Play target API level requirement: https://support.google.com/googleplay/android-developer/answer/11926878

**Checked locally (2026-11-26):**
- This Mac: macOS 26.7.2; `/Applications/Xcode_26.5.app` (selected); `/Applications/Xcode.app` 27.2
  (27B52, App Store, `LSMinimumSystemVersion` 26.6, contains `DeviceHub.app`, no `Simulator.app`); CocoaPods
  1.17.0; Homebrew `openjdk@21`.
- Stage's `apps/mobile`: package.json, app.json, `plugins/`, `scripts/`, tracked `android/`, source usage of
  every native module.

---

## 10. As built (milestone A)

What implementing milestone A found that this plan didn't predict:

| Area | Plan said | As built |
|---|---|---|
| **Metro** | Keep `metro.config.js` | **Package exports are now on** (`unstable_enablePackageExports = false` removed). React Native 0.88 publishes `react-native/react-private-interface` only through `exports`, so neither platform bundled with exports off. Expo's default is on, and Firebase 12 supports it. `unstable_enableSymlinks` stays |
| **Splash** | Move `splash` into the `expo-splash-screen` plugin "if SDK 58 ignores the old key" | It does: `@expo/prebuild-config` 58 no longer reads `splash`. Added `expo-splash-screen` ~58.0.14. iOS keeps the same colour, image and `cover`. Android now uses the system splash API (Android 12+), which showed the full-screen `splash.png` shrunk into a small rectangle, so Android gets its own setting (the user's choice at Checkpoint A): the app icon (`assets/icon.png`, 160 dp) on white, which leads into the light first screen without a colour flash. Check both in hand test H2 |
| **`build-test-app.sh`** | Replace scripts unchanged | React Native 0.88 gives Hermes its own version (`260318099.0.5`) and adds a third step for the prebuilt core (`replace-rncore-version.js`). The script now reads the steps and versions from the `ios/Pods` project's build phases instead of using the RN version for all |
| **Android regenerate** | Restore signing, `versionCode`, `MYAPP_*`, R8 off | Also restored: the launcher label `app_name` = "Traxettle" (prebuild writes app.json's long name, "Traxettle app - by Karkhanis Labs") and `rootProject.name = 'Traxettle'`. Kept from the template: Gradle 9.4.1, the `hermes-compiler` path, the `proguard-android-optimize` preset, transparent system bars, the system splash theme, storage permissions capped at API 32, `USE_BIOMETRIC` |
| **Type fixes** | `absoluteFillObject` only | Also `DashboardScreen.tsx`: refs typed `HostInstance` (React Native 0.87+ types), and `ListFooterComponent` `undefined` instead of `null` |
| **Navigation audit** | Check 24 calls | One change: Profile → "replay walkthrough" uses `popTo('Dashboard', …)`. The others go to screens not yet in the stack, so they behave as in v6 |
| **Google Sign-In cancel** | Handle `isCancelledResponse` | Done in Login, Register and Profile (password change re-auth), with a new `LoginScreen.test.tsx` |
| **RevenueCat 11** | Check error messages | No change needed: unknown codes fall back to RevenueCat's own message |
| **`expo install --check`** | Expected TypeScript/Jest suggestions | Recorded as deliberate in `package.json` → `expo.install.exclude` (`jest`, `@types/jest`, `typescript`), so the check passes |
| **Android 17 local network** | – | React Native 0.88's **Debug** library declares `ACCESS_LOCAL_NETWORK`. On Android 17 the Debug app then asks to "find, connect to … nearby devices" at launch, because it reaches Metro and the local API. `build-test-app.sh` now grants it after installing; Maestro's `launchApp` grants permissions too. Release builds don't declare it, so store users see no prompt |
| **Test devices** | Default simulator / emulator | The existing `iPhone 17 Pro` simulator and `Pixel_10_Pro_XL` emulator keep the SDK 54 test app. This branch uses a new simulator "iPhone 17 Pro Expo58" (iOS 26.5) and a new emulator `Expo58_Pixel` (Pixel 8 Pro profile, Android 17) |

**Milestone A results (2026-11-26, this Mac, Xcode 26.5, Node 22.23):**

| Check | Baseline (`stage`, SDK 54) | `chore/expo-58` (SDK 58) |
|---|---|---|
| `run.sh full` | shared 264, ui 15, api 919, web 119, mobile 172, Playwright 108, all passed | same, with mobile 174 (2 new tests), all passed |
| `expo install --check` | – | up to date (TypeScript/Jest excluded on purpose) |
| JavaScript bundle (`expo export`) | – | iOS 1,063 modules, Android 1,066 |
| iOS Debug build, Xcode 26.5 | – | builds, installs, launches; scenes on; `GoogleSignInAppDelegate` registered |
| Android Debug build, Gradle 9.4.1, JDK 21 | – | builds; versionCode 42, 1.1.0, compileSdk 37, targetSdk 36, label "Traxettle" |
| Android release manifest | – | 13 permissions, no `ACCESS_LOCAL_NETWORK` |
| Maestro iOS (9 flows) | – | 9 passed (one after a rerun; see REGRESSION_SUITE.md §7) |
| Maestro Android (9 flows) | – | 9 passed |

**Not done on this Mac:** the Android release-signing check. The release keystore, `gradle.properties.local`,
the `google-services.*` / `GoogleService-Info.*` files and the `rc_*.properties` files aren't on this Mac.
Do it on the Mac that builds for the stores, before the first Play upload:
- `bash scripts/build-android.sh debug:staging`;
- `apksigner verify --print-certs` on the APK (not `keytool -printcert -jarfile`, which can't read v2/v3
  signatures), expecting the upload key SHA-1 `6a773af7…ae26` (`6A:77:…:AE:26`).

Done on 2026-11-27 on the other Mac; see milestone B below.

**Milestone B results (2026-11-27, the other Mac):**
- **Setup:** macOS 26.7.2, Node 24.21.
- **Xcode:** 27.2 with the iOS 27.2 SDK, chosen per terminal with `DEVELOPER_DIR`. Xcode 26.6 stays
  selected for 1.1.x.
- **Checkout:** the branch in its own worktree, so that Mac's `stage` checkout stays ready for a 1.1.x
  hotfix.

| Check | Result |
|---|---|
| `run.sh quick` | passed |
| `expo prebuild --platform ios --clean` with Xcode 27.2 | passed; the first `pod install` retried after updating the spec list |
| iOS Debug build, Xcode 27.2, iOS 27 simulator | builds and runs; **no code, plugin or package changes needed** |
| Maestro iOS 27 (9 flows, through DeviceHub) | 9 passed |
| Release check on iOS 27: iPhone 17 Pro, iPad Pro 13", iPhone Duo closed and open | passed: launch, 7-tap staging switch, sign-in, events, cold start, iPad rotation, Duo postures |
| Android release signing (`debug:staging`, `apksigner`) | upload key SHA-1 matches |
| Release candidate (1.2.0 on TestFlight) | not yet |

**What Xcode 27 changed for testing:**
- **DeviceHub replaces Simulator.app.** `build-test-app.sh` already opens it.
- **The iPhone Duo needs its own runtime.** It runs only on `iOS-27-2-iPhone19-4`, which ships with Xcode
  27.2. The general iOS 27.0 and 27.2 runtimes don't support it, so create it without naming a runtime.
- **The Xcode 26 toolchain can't use the iOS 27 runtimes.** With it selected, `simctl` reports the runtime
  as "not available".

**Pre-existing problems found, not changed:**
- `app.json`'s Android `SEND` intent filter is malformed (`categories` instead of `category`; the generated
  action is `android.intent.action.android.intent.action.SEND`). Sharing an image into the app has never worked.
- Profile → "Forgot Password" navigates to a screen that exists only in the signed-out stack, so it does
  nothing while signed in.
- `expo-doctor` also notes `expo-modules-core` listed directly in `package.json` and the Metro symlink
  flag. Both are harmless and left as they were.
