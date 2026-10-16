import type { WorkflowStep } from '@/types';
import { firebaseUtilitySteps } from '@/workflows/shared/firebaseUtilitySteps';
import { revenueCatUtilitySteps } from '@/workflows/shared/revenuecatUtilitySteps';
import { cloudUtilitySteps } from '@/workflows/shared/cloudUtilitySteps';
import { storeUtilitySteps } from '@/workflows/shared/storeUtilitySteps';
import { securityUtilitySteps } from '@/workflows/shared/securityUtilitySteps';

/**
 * Mobile workflow goals:
 * - Layman-friendly: run a small number of wrapper scripts.
 * - Keep prerequisites and utilities reusable across environments.
 * - Provide clear paths for Local (emulator) → Staging (internal/TestFlight) → Production.
 */
export const mobileSteps: WorkflowStep[] = [
  // ────────────────────────────────────────────────────────────────────────────
  // PREREQUISITES
  // ────────────────────────────────────────────────────────────────────────────
  {
    id: 'm-pre-folder',
    platform: 'mobile',
    environment: 'prerequisites',
    section: 'Start',
    title: 'Open Terminal in the right folder',
    whyThisMatters: 'All commands must run from the “traxettle-rush” folder.',
    kind: 'action',
    skippable: false,
    instructions: [
      '1) Open Terminal',
      '2) Go into the “traxettle-rush” folder',
      '3) Run the checks below',
    ],
    scripts: [
      { label: 'Print current folder', command: 'pwd' },
      { label: 'List important folders', command: 'ls -la' },
    ],
    expected: ['You see apps/, scripts/, tools/, common/'],
  },
  {
    id: 'm-pre-node',
    platform: 'mobile',
    environment: 'prerequisites',
    section: 'Install',
    title: 'Install Node.js (v24+) and Git',
    whyThisMatters: 'Traxettle mobile tooling and Rush scripts require Node.js and Git.',
    kind: 'action',
    skippable: false,
    instructions: [
      'Install Node.js v24 or newer.',
      'Install Git.',
      'Close and reopen Terminal after installing.',
      'Then run the checks below.',
    ],
    scripts: [
      { label: 'Check Node.js', command: 'node -v || echo "Node.js not found"' },
      { label: 'Check Git', command: 'git --version || echo "Git not found"' },
    ],
    expected: ['Node.js prints v24+.', 'Git prints a version.'],
  },
  {
    id: 'm-pre-install-deps',
    platform: 'mobile',
    environment: 'prerequisites',
    section: 'Install',
    title: 'Install Traxettle dependencies (one-time)',
    whyThisMatters: 'Downloads all packages so mobile build/run commands work.',
    kind: 'action',
    skippable: false,
    instructions: ['Run the command below from the traxettle-rush folder and wait until it finishes.'],
    scripts: [{ label: 'Install via Rush', command: 'node tools/doctor-tool/scripts/install-run-rush.js install' }],
    expected: ['The command finishes without errors.'],
  },
  {
    id: 'm-pre-android-tools',
    platform: 'mobile',
    environment: 'prerequisites',
    section: 'Android',
    title: 'Install Android Studio (Android builds)',
    whyThisMatters: 'Android Studio provides the Android SDK and emulator needed for Android testing and builds.',
    kind: 'action',
    skippable: true,
    instructions: [
      'If you only need iOS, you can skip this.',
      '1) Install Android Studio',
      '2) In Android Studio, install Android SDK (API 34+) and “Command-line Tools (latest)”',
      '3) Create an emulator (recommended: Pixel 6 or similar)',
      '4) Run the checks below',
    ],
    scripts: [
      { label: 'Check Java', command: 'java -version || echo "Java not found (install JDK 21+)"' },
      { label: 'Check ADB', command: 'adb version || echo "adb not found (Android SDK not in PATH)"' },
    ],
    expected: ['adb prints a version.', 'Java prints a version (21+ recommended).'],
  },
  {
    id: 'm-pre-ios-xcode',
    platform: 'mobile',
    environment: 'prerequisites',
    section: 'iOS (macOS)',
    title: 'Install Xcode (iOS builds/TestFlight)',
    whyThisMatters: 'You need Xcode to build and test iOS apps on a simulator or device.',
    kind: 'action',
    skippable: true,
    instructions: [
      'This is macOS-only.',
      '1) Install Xcode (App Store)',
      '2) Open Xcode once and accept the license',
      '3) Install Command Line Tools',
    ],
    scripts: [
      { label: 'Install Command Line Tools', command: 'xcode-select --install' },
      { label: 'Check Xcode', command: 'xcodebuild -version || echo "Xcode not found (macOS only)"' },
    ],
    expected: ['Xcode prints a version.'],
  },
  {
    id: 'm-pre-doctor',
    platform: 'mobile',
    environment: 'prerequisites',
    section: 'Verify',
    title: 'Run the Doctor check (quick verification)',
    whyThisMatters: 'Detects missing mobile prerequisites early.',
    kind: 'verify',
    skippable: false,
    instructions: ['Run the doctor script in non-interactive mode and fix any critical errors.'],
    scripts: [{ label: 'Doctor (local)', command: 'bash scripts/doctor.sh local --non-interactive' }],
    expected: ['No critical “❌” errors for mobile/system basics.'],
  },

  // ────────────────────────────────────────────────────────────────────────────
  // UTILITIES
  // ────────────────────────────────────────────────────────────────────────────
  ...firebaseUtilitySteps('mobile'),
  ...securityUtilitySteps('mobile'),
  ...revenueCatUtilitySteps('mobile'),
  ...cloudUtilitySteps('mobile'),
  ...storeUtilitySteps('mobile'),
  {
    id: 'm-util-keystore',
    platform: 'mobile',
    environment: 'utility',
    section: 'Android',
    title: 'Create Android release keystore (required for store builds)',
    whyThisMatters: 'A stable keystore is required to publish and upgrade the Android app over time.',
    kind: 'action',
    skippable: true,
    instructions: [
      'If you only want LOCAL debug builds, you can skip this.',
      'Otherwise run the guided script below.',
    ],
    scripts: [{ label: 'Keystore setup', command: 'bash tools/doctor-tool/scripts/doctor-keystore.sh' }],
    expected: ['apps/mobile/keystore/traxettle-release-key.keystore exists', 'apps/mobile/android/gradle.properties.local exists (gitignored)'],
  },
  {
    id: 'm-util-apple-team',
    platform: 'mobile',
    environment: 'utility',
    section: 'iOS (macOS)',
    title: 'Apple Team ID setup (iOS Firebase/TestFlight)',
    whyThisMatters: 'Team ID is needed for iOS Firebase configuration and App Store distribution.',
    kind: 'action',
    skippable: true,
    instructions: [
      'If you are doing Android-only work, you can skip this.',
      'Otherwise run the guided script below.',
    ],
    scripts: [{ label: 'Apple Team ID setup', command: 'bash tools/doctor-tool/scripts/doctor-apple-team.sh' }],
    expected: ['You know your Apple Team ID and Firebase iOS app settings are updated.'],
  },
  // ────────────────────────────────────────────────────────────────────────────
  // LOCAL
  // ────────────────────────────────────────────────────────────────────────────
  {
    id: 'm-local-run-emulator',
    platform: 'mobile',
    environment: 'local',
    section: 'Run',
    title: 'Run MOBILE locally (safe mode: Firebase emulators)',
    whyThisMatters: 'Recommended local mode for testing without touching real Firebase data.',
    kind: 'action',
    skippable: false,
    instructions: [
      'Run the single command below.',
      'Leave it running. Follow the on-screen Expo instructions (QR, press a for Android, press i for iOS).',
      'To stop everything: press Ctrl+C in the same terminal window.',
    ],
    scripts: [{ label: 'Start Mobile + API + Emulators', command: 'sh scripts/local-dev/01_emulator_mobile.sh' }],
    expected: ['Expo dev server output shows in terminal', 'API: http://localhost:3001', 'Emulator UI: http://localhost:4000'],
  },
  {
    id: 'm-local-run-real',
    platform: 'mobile',
    environment: 'local',
    section: 'Run',
    title: 'Run MOBILE locally against real Firebase (local or staging)',
    whyThisMatters: 'Use this when you must test real Google Sign-In, real auth, or real data. Pass "local" for traxettle-test or "staging" for traxettle-staging.',
    kind: 'action',
    skippable: true,
    instructions: [
      'This mode uses a real Firebase project while still running the API and Expo locally.',
      'Pass "local" (default) to use traxettle-test, or "staging" to use traxettle-staging.',
      '',
      '── FIRST-TIME SETUP (once per environment) ──',
      '1) Ensure per-environment config files exist (see checklist below)',
      '2) Run bootstrap to copy them into place:',
      '     sh scripts/local-dev/bootstrap.sh <local|staging>',
      '3) Build the native Android app so google-services.json is baked in:',
      '     cd apps/mobile && npx expo run:android',
      '4) Then start the script:',
      '     sh scripts/local-dev/03_real_mobile.sh <local|staging>',
      '',
      '── PER-ENVIRONMENT FILES REQUIRED ──',
      'Under apps/mobile/:',
      '  • debug.keystore.local / debug.keystore.staging — Android debug keystores',
      '  • google-services.local.json / google-services.staging.json — Android Firebase config',
      '  • GoogleService-Info.local.plist / GoogleService-Info.staging.plist — iOS Firebase config',
      '',
      'Under fb-service-accounts/:',
      '  • traxettle-fb-sa-test.json (for local) / traxettle-fb-sa-staging.json (for staging)',
      '',
      'Under fb-web-configs/:',
      '  • traxettle-test.env (for local) / traxettle-staging.env (for staging)',
      '',
      '── SHA-1 FINGERPRINTS ──',
      'Each debug keystore SHA-1 must be registered in Firebase Console → Project Settings',
      '→ Android app → "SHA certificate fingerprints" for the corresponding project.',
      'After adding a fingerprint, RE-DOWNLOAD google-services.json and save it as',
      'google-services.<env>.json. The downloaded file is a snapshot — it does not auto-update.',
    ],
    scripts: [
      { label: 'Start with LOCAL Firebase (traxettle-test)', command: 'sh scripts/local-dev/03_real_mobile.sh local' },
      { label: 'Start with STAGING Firebase (traxettle-staging)', command: 'sh scripts/local-dev/03_real_mobile.sh staging' },
    ],
    expected: ['Expo dev server output shows in terminal', 'API: http://localhost:3001', 'Bootstrap prints ✅ for keystore, google-services, service account'],
  },
  {
    id: 'm-local-switch-env',
    platform: 'mobile',
    environment: 'local',
    section: 'Run',
    title: '⚠ Switching environments (local ↔ staging) — MUST rebuild Android',
    whyThisMatters:
      'google-services.json is processed at native BUILD TIME by the Gradle plugin and baked into the APK. ' +
      'If you switch environments without rebuilding, the installed app still contains the old Firebase project config ' +
      '(project ID, OAuth client mappings) while the JS code sends the new environment\'s webClientId. ' +
      'This cross-project mismatch causes Google Sign-In DEVELOPER_ERROR (code 10).',
    kind: 'action',
    skippable: true,
    instructions: [
      'When switching between "local" and "staging" (or vice versa):',
      '',
      '1) Stop the running script (Ctrl+C)',
      '',
      '2) Rebuild the native Android app (this bakes in the new google-services.json):',
      '     cd apps/mobile && npx expo run:android',
      '   This takes ~1-2 minutes. It will:',
      '   - Copy google-services.<env>.json → android/app/google-services.json',
      '   - Gradle processes it into native resources (project ID, OAuth clients)',
      '   - Sign the APK with the env-specific debug keystore',
      '   - Install the rebuilt APK on your device/emulator',
      '',
      '3) Start the script with the new environment:',
      '     sh scripts/local-dev/03_real_mobile.sh <local|staging>',
      '',
      '── WHEN YOU DO NOT NEED TO REBUILD ──',
      'If you are running the SAME environment as last time, no rebuild is needed.',
      'The script auto-detects environment switches and will warn you.',
      '',
      '── COMMON MISTAKE ──',
      'Symptom: Google Sign-In fails with DEVELOPER_ERROR (code 10) after switching environments.',
      'Cause: You skipped the native rebuild. The APK still has the old google-services.json.',
      'Fix: Run "cd apps/mobile && npx expo run:android" and restart the script.',
    ],
    scripts: [
      { label: 'Rebuild Android native app', command: 'cd apps/mobile && npx expo run:android' },
    ],
    expected: ['Gradle build succeeds', 'APK installs on device/emulator', 'Google Sign-In works after restart'],
  },

  // ────────────────────────────────────────────────────────────────────────────
  // STAGING
  // ────────────────────────────────────────────────────────────────────────────
  {
    id: 'm-staging-build-android',
    platform: 'mobile',
    environment: 'staging',
    section: 'Build',
    title: 'Build an Android test APK (install directly, not for Play Store)',
    whyThisMatters: 'Creates a self-contained APK you can install on an emulator or phone for testing.',
    kind: 'action',
    skippable: true,
    instructions: [
      'Make sure Firebase staging config files, RevenueCat staging config and the release keystore exist.',
      'Release builds choose the API at runtime: they open on PRODUCTION. To test staging, tap "Traxettle" 7 times on the sign-in screen.',
      'For Google Play internal testing, upload the production AAB instead (see "Build Android PRODUCTION"): you later promote that same file to production.',
      'Then run:',
    ],
    scripts: [
      { label: 'APK (debug:staging)', command: 'cd apps/mobile && npm run build:android:debug:staging' },
    ],
    expected: ['The script prints the APK path and installs it on the connected device or emulator.'],
  },
  {
    id: 'm-staging-build-ios',
    platform: 'mobile',
    environment: 'staging',
    section: 'Build',
    title: 'Build iOS for TestFlight',
    whyThisMatters: 'Creates the iOS build testers install from TestFlight. It is the same build you later promote to the App Store.',
    kind: 'action',
    skippable: true,
    instructions: [
      'This requires macOS + Xcode 26 (this Expo SDK does not support Xcode 27 yet) + an Apple Developer account added in Xcode → Settings → Accounts.',
      'You need your 10-character Apple Team ID (see "Apple Team ID setup").',
      'Make sure GoogleService-Info.staging.plist (apps/mobile) and rc_prod.properties (repo root) exist.',
      'The build opens on PRODUCTION. Testers switch to staging by tapping "Traxettle" 7 times on the sign-in screen.',
      'Then run (replace the Team ID):',
    ],
    scripts: [{ label: 'Build and upload to TestFlight', command: 'cd apps/mobile && APPLE_TEAM_ID=ABCDE12345 npm run build:ios:testflight' }],
    expected: ['The script ends with "Uploaded …". The build appears in App Store Connect → TestFlight after 10–30 minutes.'],
  },

  // ────────────────────────────────────────────────────────────────────────────
  // PRODUCTION
  // ────────────────────────────────────────────────────────────────────────────
  {
    id: 'm-prod-build-android',
    platform: 'mobile',
    environment: 'production',
    section: 'Build',
    title: 'Build Android PRODUCTION (Play Store)',
    whyThisMatters: 'Creates the production build you publish to the Play Store.',
    kind: 'action',
    skippable: true,
    instructions: [
      'Make sure production Firebase config files exist and release keystore setup is complete.',
      'Make sure RevenueCat production config exists.',
      'Then run:',
    ],
    scripts: [{ label: 'Android production AAB', command: 'cd apps/mobile && npm run build:android:production' }],
    expected: ['The script prints the output .aab path.'],
  },
  {
    id: 'm-prod-build-ios',
    platform: 'mobile',
    environment: 'production',
    section: 'Build',
    title: 'Release iOS to the App Store',
    whyThisMatters: 'Ships the build you tested in TestFlight to App Store users. No separate production build is needed.',
    kind: 'action',
    skippable: true,
    instructions: [
      'Upload a build with "Build iOS for TestFlight" and test it there first.',
      'In App Store Connect → your app → the iOS version: select that build under "Build".',
      'For the first release, also add the subscription under "In-App Purchases and Subscriptions".',
      'Fill in App Review Information (a demo account), then "Add for Review" → "Submit to App Review".',
    ],
    expected: ['The version shows "Waiting for Review" in App Store Connect.'],
  },
];
