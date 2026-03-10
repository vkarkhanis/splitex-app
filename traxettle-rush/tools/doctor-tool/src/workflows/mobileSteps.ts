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
    id: 'm-pre-eas',
    platform: 'mobile',
    environment: 'prerequisites',
    section: 'Accounts',
    title: 'Install EAS CLI and login (for signed builds)',
    whyThisMatters: 'Staging/production iOS builds and most Android store builds use EAS Build.',
    kind: 'action',
    skippable: true,
    instructions: [
      'If you only run LOCAL development (Expo dev server) you can skip this.',
      'Otherwise:',
      '1) Install EAS CLI',
      '2) Login to EAS',
    ],
    scripts: [
      { label: 'Install EAS CLI', command: 'npm i -g eas-cli' },
      { label: 'Login', command: 'eas login' },
      { label: 'Check EAS', command: 'eas --version || echo "eas not found"' },
    ],
    expected: ['eas prints a version.', 'eas login succeeds.'],
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
    id: 'm-local-run-real-staging',
    platform: 'mobile',
    environment: 'local',
    section: 'Run',
    title: 'Run MOBILE locally against real STAGING Firebase (advanced)',
    whyThisMatters: 'Use this when you must test real Google Sign-In or real staging data/auth.',
    kind: 'action',
    skippable: true,
    instructions: [
      'This mode uses real Firebase (traxettle-staging) while still running locally.',
      'Make sure your staging Firebase config files exist, then run:',
    ],
    scripts: [{ label: 'Start Mobile + API (real Firebase)', command: 'sh scripts/local-dev/03_real_mobile.sh' }],
    expected: ['Expo dev server output shows in terminal', 'API: http://localhost:3001'],
  },

  // ────────────────────────────────────────────────────────────────────────────
  // STAGING
  // ────────────────────────────────────────────────────────────────────────────
  {
    id: 'm-staging-build-android',
    platform: 'mobile',
    environment: 'staging',
    section: 'Build',
    title: 'Build Android STAGING (internal testing)',
    whyThisMatters: 'Creates an Android build that points to staging API/Firebase for internal testing.',
    kind: 'action',
    skippable: true,
    instructions: [
      'Make sure Firebase staging config files and RevenueCat staging config exist.',
      'Then run ONE of the commands below:',
      '- debug:staging → APK (easy to install, not for Play Store)',
      '- staging → AAB (for Google Play internal testing)',
    ],
    scripts: [
      { label: 'APK (debug:staging)', command: 'cd apps/mobile && npm run build:android:debug:staging' },
      { label: 'AAB (staging)', command: 'cd apps/mobile && npm run build:android:staging' },
    ],
    expected: ['The script prints the output file path.'],
  },
  {
    id: 'm-staging-build-ios',
    platform: 'mobile',
    environment: 'staging',
    section: 'Build',
    title: 'Build iOS STAGING (TestFlight/internal)',
    whyThisMatters: 'Creates an iOS build for internal testing via TestFlight.',
    kind: 'action',
    skippable: true,
    instructions: [
      'This requires macOS + Xcode + Apple Developer account + EAS login.',
      'Make sure Firebase staging plist and RevenueCat staging config exist.',
      'Then run:',
    ],
    scripts: [{ label: 'iOS staging build', command: 'cd apps/mobile && npm run build:ios:staging' }],
    expected: ['EAS prints a build URL and status.'],
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
    title: 'Build iOS PRODUCTION (App Store)',
    whyThisMatters: 'Creates the production build you submit to App Store / TestFlight.',
    kind: 'action',
    skippable: true,
    instructions: [
      'This requires macOS + Xcode + Apple Developer account + EAS login.',
      'Make sure production Firebase plist and RevenueCat production config exist.',
      'Then run:',
    ],
    scripts: [{ label: 'iOS production build', command: 'cd apps/mobile && npm run build:ios:production' }],
    expected: ['EAS prints a build URL and status.'],
  },
];
