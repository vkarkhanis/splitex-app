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
      title: 'Collect Firebase Web App config values (needed for web deploys)',
      whyThisMatters:
        'Production web deploy requires Firebase Web config values (apiKey, authDomain, etc.).',
      kind: 'action',
      skippable: platform === 'mobile',
      instructions: [
        'For staging/prod Firebase projects:',
        '1) Firebase Console → Project Settings → General → Your apps',
        '2) Click the Web app you registered earlier',
        '3) Copy these values from the config snippet:',
        '   - apiKey',
        '   - authDomain',
        '   - projectId',
        '   - storageBucket',
        '   - messagingSenderId',
        '   - appId',
        '   - measurementId (optional)',
        '4) Use them when running: bash scripts/web-deployment/configure-prod.sh',
      ],
      expected: ['You have the Firebase Web config values ready for the web deploy configure script.'],
    },
    {
      id: 'u-firebase-android-sha',
      platform,
      environment: 'utility',
      section: 'Firebase',
      title: 'Add Android SHA fingerprints (fixes Google Sign-In)',
      whyThisMatters:
        'If SHA-1/SHA-256 fingerprints are missing or wrong, Google Sign-In fails (common “Error 10”).',
      kind: 'action',
      skippable: false,
      instructions: [
        'You must add fingerprints to the Android app inside Firebase for EACH relevant project:',
        '1) Generate per-env debug keystore (local/staging):',
        '   - bash scripts/firebase/create-debug-keystore.sh local',
        '   - bash scripts/firebase/create-debug-keystore.sh staging',
        '2) Add SHA-1 + SHA-256 in Firebase Console → Project Settings → Your apps → Android → Add fingerprint',
        '3) Re-download google-services.json after adding fingerprints, and save it with the correct filename',
        '4) Run bootstrap again to verify SHA match',
      ],
      scripts: [
        { label: 'Create debug keystore (local)', command: 'bash scripts/firebase/create-debug-keystore.sh local' },
        { label: 'Create debug keystore (staging)', command: 'bash scripts/firebase/create-debug-keystore.sh staging' },
        { label: 'Bootstrap check (local)', command: 'sh scripts/local-dev/bootstrap.sh local' },
        { label: 'Bootstrap check (staging)', command: 'sh scripts/local-dev/bootstrap.sh staging' },
      ],
      expected: ['Bootstrap prints “SHA-1 matches google-services.json ✓” (or no mismatch warnings).'],
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
      title: 'Create Firebase service-account keys (for API deploy)',
      whyThisMatters:
        'The API deploy scripts need Firebase Admin credentials to talk to Auth/Firestore/Storage.',
      kind: 'action',
      skippable: false,
      instructions: [
        'For staging and production projects:',
        '1) Firebase Console → Project Settings → Service accounts',
        '2) Click “Generate new private key” (JSON)',
        '3) Save the JSON file safely on your computer',
        '4) Use those file paths when running:',
        '   - bash scripts/api-deployment/configure-staging.sh',
        '   - bash scripts/api-deployment/configure-prod.sh',
      ],
      expected: ['You have JSON key files saved locally for staging and production.'],
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
