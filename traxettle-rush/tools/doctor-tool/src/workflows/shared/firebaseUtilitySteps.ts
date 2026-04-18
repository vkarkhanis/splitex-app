import type { Platform, WorkflowStep } from '@/types';

const FIRESTORE_RULES_LOCKED_DOWN = `rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Traxettle clients (web/mobile) should NOT talk to Firestore directly.
    // The Traxettle API uses the Firebase Admin SDK and is NOT restricted by rules.
    //
    // This ruleset is intentionally strict to prevent data leakage if someone
    // extracts the public Firebase config from the web app.

    // Allow a signed-in user to read/write only their own user document subtree.
    match /users/{userId}/{document=**} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }

    // Everything else is blocked from client access.
    match /{document=**} {
      allow read, write: if false;
    }
  }
}`;

const STORAGE_RULES_LOCKED_DOWN = `rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    // Same philosophy as Firestore: prefer API-controlled access.

    // If you ever allow direct client uploads/downloads, confine them to /users/<uid>/...
    match /users/{userId}/{allPaths=**} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }

    // Everything else is blocked from client access.
    match /{allPaths=**} {
      allow read, write: if false;
    }
  }
}`;

export function firebaseUtilitySteps(platform: Platform): WorkflowStep[] {
  return [
    {
      id: 'u-firebase-projects',
      platform,
      environment: 'utility',
      section: 'Firebase',
      title: 'Create Firebase projects (test / staging / production)',
      whyThisMatters:
        'Traxettle uses Firebase Auth + Firestore + Storage. You need separate Firebase projects for each environment.',
      kind: 'action',
      skippable: false,
      instructions: [
        'Open Firebase Console and create these projects (recommended):',
        '1) traxettle-test (used for local/dev OAuth + “local real Firebase” runs)',
        '2) traxettle-staging (used for internal testing/TestFlight/staging)',
        '3) traxettle-prod (used for real production users)',
        'Tip: keep staging and production separate.',
      ],
      scripts: [{ label: 'Open Firebase Console (manual)', command: 'echo "Open: https://console.firebase.google.com/"' }],
      expected: ['You can see all 3 projects in Firebase Console.'],
    },
    {
      id: 'u-firebase-enable-products',
      platform,
      environment: 'utility',
      section: 'Firebase',
      title: 'Enable Firebase products (Auth, Firestore, Storage)',
      whyThisMatters: 'The app requires authentication and data storage.',
      kind: 'action',
      skippable: false,
      instructions: [
        'For EACH Firebase project (test / staging / prod):',
        '1) Enable Authentication',
        '2) Create Firestore Database',
        '3) Enable Storage',
        'Important: choose the same region for Firestore and Storage inside a project.',
      ],
      expected: ['Auth, Firestore and Storage show as enabled in the Firebase Console.'],
    },
    {
      id: 'u-firebase-auth-providers',
      platform,
      environment: 'utility',
      section: 'Firebase',
      title: 'Enable login providers (Google + Email/Password)',
      whyThisMatters: 'Sign-in won’t work until providers are enabled.',
      kind: 'action',
      skippable: false,
      instructions: [
        'For EACH Firebase project (test / staging / prod):',
        '1) Go to Authentication → Sign-in method',
        '2) Enable Google',
        '3) Enable Email/Password',
        'Optional: enable Phone if you want phone auth.',
      ],
      expected: ['Google and Email/Password show as “Enabled”.'],
    },
    {
      id: 'u-firebase-authorized-domains',
      platform,
      environment: 'utility',
      section: 'Firebase',
      title: 'Add Authorized Domains (Web + email-link sign-in)',
      whyThisMatters:
        'Google sign-in and email-link flows can fail if your domains are not authorized in Firebase Auth settings.',
      kind: 'action',
      skippable: platform === 'mobile',
      instructions: [
        'For EACH Firebase project (test / staging / prod):',
        '1) Authentication → Settings → Authorized domains',
        '2) Ensure localhost is present (for local dev)',
        '3) Add your staging web domain (…web.app) and production domain if applicable',
        'If you use email-link sign-in, also ensure your API domain is allowed for the continue URL you use.',
      ],
      expected: ['Authorized domains include the web hosting domains you plan to use.'],
    },
    {
      id: 'u-firebase-register-apps',
      platform,
      environment: 'utility',
      section: 'Firebase',
      title: 'Register Web + Android + iOS apps in Firebase',
      whyThisMatters: 'Firebase config files (google-services.json / plist) come from registered apps.',
      kind: 'action',
      skippable: false,
      instructions: [
        'For EACH Firebase project (test / staging / prod), register:',
        '1) Android app',
        '   - Package name: com.traxettle.app',
        '2) iOS app',
        '   - Bundle ID: com.traxettle.app',
        '3) Web app',
        '   - Name: Traxettle Web (any name is fine)',
      ],
      expected: ['Each project shows Web + Android + iOS under Project Settings → Your apps.'],
    },
    {
      id: 'u-firebase-download-config-files',
      platform,
      environment: 'utility',
      section: 'Firebase',
      title: 'Download Firebase config files into the repo',
      whyThisMatters:
        'Local scripts and mobile build scripts expect specific filenames so non-technical users don’t edit config.',
      kind: 'action',
      skippable: false,
      instructions: [
        'Download these from Firebase Console → Project Settings → Your apps:',
        '',
        'From traxettle-test:',
        '- Android: google-services.json → save as apps/mobile/google-services.local.json',
        '- iOS: GoogleService-Info.plist → save as apps/mobile/GoogleService-Info.local.plist',
        '',
        'From traxettle-staging:',
        '- Android: google-services.json → save as apps/mobile/google-services.staging.json',
        '- iOS: GoogleService-Info.plist → save as apps/mobile/GoogleService-Info.staging.plist',
        '',
        'From traxettle-prod:',
        '- Android: google-services.json → save as apps/mobile/google-services.prod.json',
        '- iOS: GoogleService-Info.plist → save as apps/mobile/GoogleService-Info.prod.plist',
      ],
      scripts: [
        {
          label: 'Check required files (shows missing ones)',
          command:
            'ls -la apps/mobile/google-services.local.json apps/mobile/google-services.staging.json apps/mobile/google-services.prod.json apps/mobile/GoogleService-Info.local.plist apps/mobile/GoogleService-Info.staging.plist apps/mobile/GoogleService-Info.prod.plist',
        },
        { label: 'Run bootstrap check (local)', command: 'sh scripts/local-dev/bootstrap.sh local' },
        { label: 'Run bootstrap check (staging)', command: 'sh scripts/local-dev/bootstrap.sh staging' },
      ],
      expected: ['Bootstrap prints ✅ for config files.', 'If SHA mismatch is shown, complete the SHA step next.'],
    },
    {
      id: 'u-firebase-web-app-config',
      platform,
      environment: 'utility',
      section: 'Firebase',
      title: 'Collect Firebase Web App config (needed for local-dev + deploys)',
      whyThisMatters:
        'Both local-dev scripts and production deploys need the Firebase Web API key (different from the Android API key in google-services.json). The mobile app also uses the Firebase JS SDK internally, so this applies to mobile too.',
      kind: 'action',
      skippable: false,
      instructions: [
        'For EACH Firebase project (test / staging):',
        '1) Firebase Console → Project Settings → General → Your apps',
        '2) Click the Web app you registered earlier',
        '3) Copy these values from the config snippet:',
        '   - apiKey, authDomain, storageBucket, messagingSenderId, appId, measurementId (optional)',
        '',
        'For local-dev scripts (03_real_mobile.sh / 04_real_web.sh):',
        '  Save as env files under fb-web-configs/:',
        '  • fb-web-configs/traxettle-test.env       (from traxettle-test)',
        '  • fb-web-configs/traxettle-staging.env     (from traxettle-staging)',
        '  Format: FIREBASE_WEB_API_KEY="...", FIREBASE_WEB_APP_ID="...", etc.',
        '  bootstrap.sh loads the correct file automatically based on the project ID.',
        '',
        'For production deploy:',
        '  Use the values when running: bash scripts/web-deployment/configure-prod.sh',
      ],
      scripts: [
        { label: 'Check fb-web-configs files', command: 'ls -la fb-web-configs/*.env 2>&1' },
      ],
      expected: ['fb-web-configs/ contains .env files for each project.', 'Deploy configure scripts accept the values.'],
    },
    {
      id: 'u-firebase-android-sha',
      platform,
      environment: 'utility',
      section: 'Firebase',
      title: 'Add Android SHA fingerprints (fixes Google Sign-In)',
      whyThisMatters:
        'If SHA-1/SHA-256 fingerprints are missing or wrong, Google Sign-In fails with DEVELOPER_ERROR (code 10). ' +
        'This is the #1 cause of Google Sign-In failures on Android.',
      kind: 'action',
      skippable: false,
      instructions: [
        'You must add fingerprints to the Android app inside Firebase for EACH relevant project.',
        '',
        '── STEP 1: Generate debug keystores ──',
        'Run the keystore creation scripts (or use existing ones):',
        '  bash scripts/firebase/create-debug-keystore.sh local',
        '  bash scripts/firebase/create-debug-keystore.sh staging',
        'Each script prints the SHA-1 fingerprint. Copy it.',
        '',
        '── STEP 2: Register fingerprints in Firebase Console ──',
        'For EACH project (traxettle-test, traxettle-staging):',
        '  Firebase Console → Project Settings → Your apps → Android app',
        '  → "SHA certificate fingerprints" → Add fingerprint → paste SHA-1',
        '',
        '── STEP 3: Verify the OAuth client was auto-created in Google Cloud ──',
        'Adding a fingerprint in Firebase should auto-create an Android OAuth client in GCP.',
        'Verify at: Google Cloud Console → APIs & Services → Credentials',
        'Look for an Android OAuth 2.0 Client ID with your package name + SHA-1.',
        'If it does NOT exist (rare), create it manually:',
        '  + CREATE CREDENTIALS → OAuth client ID → Android',
        '  → Package name: com.traxettle.app → paste SHA-1',
        '',
        '── STEP 4: Re-download google-services.json (CRITICAL) ──',
        '⚠ google-services.json is a SNAPSHOT. Adding fingerprints in Firebase Console',
        'does NOT auto-update the file. You MUST re-download it after adding fingerprints.',
        '  Firebase Console → Project Settings → Your apps → Android → Download google-services.json',
        '  Save as: apps/mobile/google-services.local.json (or .staging.json)',
        '',
        '── STEP 5: Rebuild the native Android app ──',
        'google-services.json is processed at BUILD TIME by the Gradle plugin.',
        'After replacing the file, you must rebuild:',
        '  cd apps/mobile && npx expo run:android',
        'Without this rebuild, the APK still has the old config → DEVELOPER_ERROR.',
      ],
      scripts: [
        { label: 'Create debug keystore (local)', command: 'bash scripts/firebase/create-debug-keystore.sh local' },
        { label: 'Create debug keystore (staging)', command: 'bash scripts/firebase/create-debug-keystore.sh staging' },
        { label: 'Bootstrap check (local)', command: 'sh scripts/local-dev/bootstrap.sh local' },
        { label: 'Bootstrap check (staging)', command: 'sh scripts/local-dev/bootstrap.sh staging' },
        { label: 'Rebuild Android native app', command: 'cd apps/mobile && npx expo run:android' },
      ],
      expected: ['Bootstrap prints "SHA-1 matches google-services.json ✓" (or no mismatch warnings).', 'Native build succeeds and app installs.'],
    },
    {
      id: 'u-firebase-android-release-sha',
      platform,
      environment: 'utility',
      section: 'Firebase',
      title: 'Add Android RELEASE SHA fingerprints (staging + production)',
      whyThisMatters:
        'Store builds use your release signing key. Firebase must know the release SHA fingerprints for Google Sign-In to work in staged/prod builds.',
      kind: 'action',
      skippable: false,
      instructions: [
        '1) Create your release keystore (if not done): bash tools/doctor-tool/scripts/doctor-keystore.sh',
        '2) Generate SHA-1 from the release keystore (the script shows the exact keytool command)',
        '3) Add the release SHA-1 (and SHA-256 if available) to BOTH:',
        '   - traxettle-staging → Android app → Add fingerprint',
        '   - traxettle-prod → Android app → Add fingerprint',
        '4) Re-download google-services.json for staging/prod and save them as:',
        '   - apps/mobile/google-services.staging.json',
        '   - apps/mobile/google-services.prod.json',
      ],
      scripts: [
        { label: 'Keystore + release SHA guide', command: 'bash tools/doctor-tool/scripts/doctor-keystore.sh' },
        { label: 'Bootstrap check (staging)', command: 'sh scripts/local-dev/bootstrap.sh staging' },
      ],
      expected: ['Staging/prod google-services files are refreshed after adding release fingerprints.'],
    },
    {
      id: 'u-firebase-firestore-storage-rules',
      platform,
      environment: 'utility',
      section: 'Firebase',
      title: 'Set Firestore + Storage rules (recommended baseline)',
      whyThisMatters: 'Rules control who can read/write your database and storage.',
      kind: 'action',
      skippable: false,
      instructions: [
        'For EACH Firebase project (test / staging / prod):',
        '1) Go to Firestore Database → Rules',
        '2) Paste the Firestore rules below → Publish',
        '3) Go to Storage → Rules',
        '4) Paste the Storage rules below → Publish',
        'Note: If your product needs different rules, update them with your developer later.',
      ],
      snippets: [
        { label: 'Firestore rules (locked down baseline)', text: FIRESTORE_RULES_LOCKED_DOWN },
        { label: 'Storage rules (locked down baseline)', text: STORAGE_RULES_LOCKED_DOWN },
      ],
      expected: ['Firestore rules and Storage rules are published (no errors).'],
    },
    {
      id: 'u-firebase-service-account',
      platform,
      environment: 'utility',
      section: 'Firebase',
      title: 'Create Firebase service-account keys (for local dev + deploy)',
      whyThisMatters:
        'The API needs Firebase Admin credentials for Auth/Firestore/Storage — both locally and in deployed environments.',
      kind: 'action',
      skippable: false,
      instructions: [
        'For EACH Firebase project (test / staging / prod):',
        '1) Firebase Console → Project Settings → Service accounts',
        '2) Click "Generate new private key" (JSON)',
        '',
        'For local-dev scripts (03_real_mobile.sh / 04_real_web.sh):',
        '  Save the JSON files in the repo as:',
        '  • fb-service-accounts/traxettle-fb-sa-test.json    (from traxettle-test)',
        '  • fb-service-accounts/traxettle-fb-sa-staging.json (from traxettle-staging)',
        '  bootstrap.sh picks the correct one based on the "local" or "staging" argument.',
        '',
        'For deploy scripts:',
        '  Use the file paths when running:',
        '  • bash scripts/api-deployment/configure-staging.sh',
        '  • bash scripts/api-deployment/configure-prod.sh',
      ],
      scripts: [
        { label: 'Check local-dev SA files', command: 'ls -la fb-service-accounts/traxettle-fb-sa-test.json fb-service-accounts/traxettle-fb-sa-staging.json 2>&1' },
      ],
      expected: ['Both SA files exist under fb-service-accounts/.', 'Deploy configure scripts accept the file paths.'],
    },
    {
      id: 'u-firebase-values-for-configure-scripts',
      platform,
      environment: 'utility',
      section: 'Firebase',
      title: 'Find the exact values needed by the configure scripts',
      whyThisMatters:
        'The guided configure scripts ask for specific IDs and emails. This step tells you exactly where to copy them from (no guessing).',
      kind: 'action',
      skippable: false,
      instructions: [
        'When `configure-staging.sh` / `configure-prod.sh` asks for these values:',
        '',
        'A) GCP project id / Firebase project id',
        '   - Firebase Console → Project Settings → General → Project ID',
        '   - Google Cloud Console → Project picker → Project ID',
        '   - For a Firebase project, these are normally the SAME value.',
        '',
        'B) Firebase storage bucket',
        '   - Firebase Console → Project Settings → General → Storage bucket',
        '   - It often looks like: <project-id>.firebasestorage.app',
        '',
        'C) Firebase service-account client_email (and client_id if needed)',
        '   - Open the JSON file you downloaded in the previous step',
        '   - Copy the value from the JSON key: `client_email`',
        '   - If someone asks for “client id”, copy JSON key: `client_id`',
        '',
        'D) Firebase private key file path',
        '   - Use the absolute path to that downloaded JSON file',
        '   - Example: /Users/<you>/Downloads/<project>-firebase-adminsdk-xxxxx.json',
      ],
      expected: ['You can answer every prompt in the configure scripts without searching.'],
    },
  ];
}
