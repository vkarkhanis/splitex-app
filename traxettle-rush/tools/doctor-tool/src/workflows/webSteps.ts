import type { WorkflowStep } from '@/types';
import { firebaseUtilitySteps } from '@/workflows/shared/firebaseUtilitySteps';
import { revenueCatUtilitySteps } from '@/workflows/shared/revenuecatUtilitySteps';
import { cloudUtilitySteps } from '@/workflows/shared/cloudUtilitySteps';
import { securityUtilitySteps } from '@/workflows/shared/securityUtilitySteps';

/**
 * Web workflow goals:
 * - Layman-friendly, copy/paste commands.
 * - Prefer wrapper scripts (scripts/*) over manual multi-step setups.
 * - Prerequisites and Utilities are shared building-blocks to reduce duplication.
 */
export const webSteps: WorkflowStep[] = [
  // ────────────────────────────────────────────────────────────────────────────
  // PREREQUISITES
  // ────────────────────────────────────────────────────────────────────────────
  {
    id: 'w-pre-where-am-i',
    platform: 'web',
    environment: 'prerequisites',
    section: 'Start',
    title: 'Open Terminal in the right folder',
    whyThisMatters:
      'All commands must run from the repo’s “traxettle-rush” folder, otherwise scripts will fail.',
    kind: 'action',
    skippable: false,
    instructions: [
      '1) Open Terminal',
      '2) Go to the “Traxettle” folder you downloaded/cloned',
      '3) Then go into the “traxettle-rush” folder',
      '4) Run the checks below (they should show folders like apps/, scripts/, tools/)',
    ],
    scripts: [
      { label: 'Print current folder', command: 'pwd' },
      { label: 'List important folders', command: 'ls -la' },
    ],
    expected: ['You are inside the folder that contains: apps/, scripts/, tools/, common/'],
  },
  {
    id: 'w-pre-node-git',
    platform: 'web',
    environment: 'prerequisites',
    section: 'Install',
    title: 'Install Node.js (v24+) and Git',
    whyThisMatters: 'Rush + all scripts require Node.js. Git is needed for updates and typical workflows.',
    kind: 'action',
    skippable: false,
    instructions: [
      'Install Node.js v24 or newer.',
      'Install Git.',
      'After installing, close and reopen Terminal (important).',
      'Then run the checks below.',
    ],
    scripts: [
      { label: 'Check Node.js', command: 'node -v || echo "Node.js not found"' },
      { label: 'Check Git', command: 'git --version || echo "Git not found"' },
    ],
    expected: ['Node.js prints a version starting with v24 (or higher).', 'Git prints a version.'],
  },
  {
    id: 'w-pre-install-deps',
    platform: 'web',
    environment: 'prerequisites',
    section: 'Install',
    title: 'Install Traxettle dependencies (one-time)',
    whyThisMatters: 'This downloads all required packages so the Web/API can start.',
    kind: 'action',
    skippable: false,
    instructions: [
      'Run the command below from the traxettle-rush folder.',
      'If it takes a long time, leave it running until it completes.',
    ],
    scripts: [
      {
        label: 'Install via Rush (recommended)',
        command: 'node tools/doctor-tool/scripts/install-run-rush.js install',
      },
    ],
    expected: ['The command finishes without errors.'],
  },
  {
    id: 'w-pre-doctor-verify',
    platform: 'web',
    environment: 'prerequisites',
    section: 'Verify',
    title: 'Run the Doctor check (quick verification)',
    whyThisMatters: 'This quickly detects missing tools or missing config before you waste time.',
    kind: 'verify',
    skippable: false,
    instructions: [
      'Run the doctor script in non-interactive mode.',
      'If it shows missing items, go back and complete the missing prerequisite/utility steps.',
    ],
    scripts: [{ label: 'Doctor (local)', command: 'bash scripts/doctor.sh local --non-interactive' }],
    expected: ['No critical “❌” errors for web/system basics.'],
  },

  // ────────────────────────────────────────────────────────────────────────────
  // UTILITIES (shared building blocks)
  // ────────────────────────────────────────────────────────────────────────────
  {
    id: 'u-firebase-cli-java',
    platform: 'web',
    environment: 'utility',
    section: 'Firebase',
    title: 'Install Java (JDK 21+) and Firebase CLI',
    whyThisMatters:
      'Firebase emulators require Java 21+. Firebase CLI is needed for Hosting deploys and some Firebase operations.',
    kind: 'action',
    skippable: false,
    instructions: [
      '1) Install Java (JDK 21 or newer)',
      '2) Install Firebase CLI (firebase-tools)',
      '3) Login: firebase login',
      '4) Run the checks below',
    ],
    scripts: [
      { label: 'Check Java', command: 'java -version || echo "Java not found"' },
      { label: 'Check Firebase CLI', command: 'firebase --version || echo "firebase not found"' },
      { label: 'Firebase login', command: 'firebase login' },
    ],
    expected: ['Java prints a version (21+ recommended).', 'firebase prints a version.', 'firebase login succeeds.'],
  },
  ...firebaseUtilitySteps('web'),
  ...securityUtilitySteps('web'),
  ...revenueCatUtilitySteps('web'),
  ...cloudUtilitySteps('web'),

  // ────────────────────────────────────────────────────────────────────────────
  // LOCAL
  // ────────────────────────────────────────────────────────────────────────────
  {
    id: 'w-local-run-emulator',
    platform: 'web',
    environment: 'local',
    section: 'Run',
    title: 'Run WEB locally (safe mode: Firebase emulators)',
    whyThisMatters:
      'This is the recommended local mode for non-technical users: it runs everything with fake local Firebase data.',
    kind: 'action',
    skippable: false,
    instructions: [
      'Run the single command below.',
      'Leave it running. Open the Web app URL after it starts.',
      'To stop everything: press Ctrl+C in the same terminal window.',
    ],
    scripts: [{ label: 'Start Web + API + Emulators', command: 'sh scripts/local-dev/02_emulator_web.sh' }],
    expected: ['Web: http://localhost:3000', 'API: http://localhost:3001', 'Emulator UI: http://localhost:4000'],
  },
  {
    id: 'w-local-run-real',
    platform: 'web',
    environment: 'local',
    section: 'Run',
    title: 'Run WEB locally against real Firebase (local or staging)',
    whyThisMatters: 'Use this when you must test real Google Sign-In, real auth, or real data with the web app. Pass "local" for traxettle-test or "staging" for traxettle-staging.',
    kind: 'action',
    skippable: true,
    instructions: [
      'This mode uses a real Firebase project while still running the API and Next.js dev server locally.',
      'Pass "local" (default) to use traxettle-test, or "staging" to use traxettle-staging.',
      '',
      '── SWITCHING ENVIRONMENTS ──',
      'Unlike mobile, the web app does NOT need a native rebuild when switching.',
      'Firebase config is passed as NEXT_PUBLIC_* env vars at runtime, not baked into a build.',
      'Just Ctrl+C and re-run the script with the new argument — that\'s it.',
      '',
      '── PER-ENVIRONMENT FILES REQUIRED ──',
      'Under fb-service-accounts/:',
      '  • traxettle-fb-sa-test.json (for local) / traxettle-fb-sa-staging.json (for staging)',
      '',
      'Under fb-web-configs/:',
      '  • traxettle-test.env (for local) / traxettle-staging.env (for staging) — Web Firebase API keys',
      '  Format: FIREBASE_WEB_API_KEY="...", FIREBASE_WEB_APP_ID="...", etc.',
      '  bootstrap.sh loads the correct file automatically based on the environment argument.',
    ],
    scripts: [
      { label: 'Start with LOCAL Firebase (traxettle-test)', command: 'sh scripts/local-dev/04_real_web.sh local' },
      { label: 'Start with STAGING Firebase (traxettle-staging)', command: 'sh scripts/local-dev/04_real_web.sh staging' },
    ],
    expected: ['Web: http://localhost:3000', 'API: http://localhost:3001', 'Bootstrap prints ✅ for service account and Firebase config'],
  },
  {
    id: 'w-local-flags',
    platform: 'web',
    environment: 'local',
    section: 'Optional',
    title: 'Optional: set default tier and payment mode (local only)',
    whyThisMatters: 'Lets testers simulate Free vs Pro and mock vs real payments (safely).',
    kind: 'action',
    skippable: true,
    instructions: [
      'If you don’t know what this is, skip it.',
      'You can change the default tier and payment behavior for local runs.',
    ],
    scripts: [
      { label: 'Free + mock payments (safe default)', command: 'sh scripts/local-dev/05_set-flags.sh --tier free --payments mock' },
      { label: 'Pro + mock payments', command: 'sh scripts/local-dev/05_set-flags.sh --tier pro --payments mock' },
      { label: 'Pro + real payments (non-prod only)', command: 'sh scripts/local-dev/05_set-flags.sh --tier pro --payments real' },
    ],
    expected: ['The file scripts/local-dev/.runtime.env is created/updated.'],
  },

  // ────────────────────────────────────────────────────────────────────────────
  // STAGING
  // ────────────────────────────────────────────────────────────────────────────
  {
    id: 'w-staging-configure',
    platform: 'web',
    environment: 'staging',
    section: 'Configure',
    title: 'Create staging config (one-time, recommended)',
    whyThisMatters:
      'Staging deploy scripts can load your saved values from .traxettle/api-staging.env so you don’t have to edit scripts or remember secrets.',
    kind: 'action',
    skippable: true,
    instructions: [
      'Run the guided script below once.',
      'It will ask you for: GCP project id, Firebase project id, service-account email + key file path, JWT secrets, RevenueCat webhook secret.',
      'It now also asks for the Firebase client runtime fields used by mobile startup: apiKey, authDomain, messagingSenderId, appId, and optional databaseURL/measurementId.',
      'Tip: Utilities → Firebase has a step called “Find the exact values needed by the configure scripts”.',
    ],
    scripts: [{ label: 'Configure staging API', command: 'bash scripts/api-deployment/configure-staging.sh' }],
    expected: ['.traxettle/api-staging.env exists (gitignored).'],
  },
  {
    id: 'w-staging-deploy-api',
    platform: 'web',
    environment: 'staging',
    section: 'Deploy',
    title: 'Deploy API to STAGING (Cloud Run)',
    whyThisMatters: 'Staging web + mobile builds expect a staging API URL to exist and be reachable.',
    kind: 'action',
    skippable: true,
    instructions: [
      'Make sure you completed Utilities → Cloud (gcloud + firebase login).',
      'Then run ONE deploy script:',
      '- Without SMTP (simpler): deploy-staging.sh',
      '- With Gmail SMTP: deploy-staging-gmail.sh (requires smtp_staging.local.properties; created by configure-staging.sh if you choose Gmail)',
      'If you are not authorized for the staging project, this step will fail (ask your admin).',
    ],
    scripts: [
      { label: 'Deploy staging API (no SMTP)', command: 'bash scripts/api-deployment/deploy-staging.sh' },
      { label: 'Deploy staging API (Gmail SMTP)', command: 'bash scripts/api-deployment/deploy-staging-gmail.sh' },
    ],
    expected: ['A Cloud Run URL is printed.', 'Health endpoint returns OK.'],
  },
  {
    id: 'w-staging-verify-api-email-links',
    platform: 'web',
    environment: 'staging',
    section: 'Verify',
    title: 'Verify staging emails will NOT open localhost',
    whyThisMatters:
      'If the API is misconfigured, “View Event” emails can point to http://localhost:3000 (which will not work for testers). This check makes sure the deployed API has APP_URL set correctly OR FIREBASE_PROJECT_ID set (non-local).',
    kind: 'verify',
    skippable: false,
    instructions: [
      'Run the single command below.',
      'If it says “NOT OK”, follow the exact fix steps it prints, then rerun this verification.',
    ],
    scripts: [{ label: 'Verify deployed staging API env', command: 'bash scripts/api-deployment/verify-deployed-api-env.sh staging' }],
    expected: ['Result: ✅ OK — this deployed API should NOT generate localhost links in emails.'],
  },
  {
    id: 'w-staging-deploy-web',
    platform: 'web',
    environment: 'staging',
    section: 'Deploy',
    title: 'Deploy WEB to STAGING (Cloud Run + Firebase Hosting)',
    whyThisMatters: 'Publishes the staging website for internal testing.',
    kind: 'action',
    skippable: true,
    instructions: [
      'Make sure the staging API is deployed first (previous step).',
      'Then run the web deploy script.',
    ],
    scripts: [{ label: 'Deploy staging Web', command: 'bash scripts/web-deployment/deploy-web-staging.sh' }],
    expected: ['A Firebase Hosting URL is printed (…web.app).'],
  },

  // ────────────────────────────────────────────────────────────────────────────
  // PRODUCTION
  // ────────────────────────────────────────────────────────────────────────────
  {
    id: 'w-prod-configure',
    platform: 'web',
    environment: 'production',
    section: 'Configure',
    title: 'Create production config (one-time)',
    whyThisMatters: 'Production deploy scripts need production IDs and keys. This step saves them locally (gitignored).',
    kind: 'action',
    skippable: true,
    instructions: [
      'Run BOTH configure scripts below once.',
      'They save two different gitignored files under .traxettle/:',
      '- API deploy config → .traxettle/api-prod.env',
      '- WEB deploy config → .traxettle/web-prod.env',
      'Important:',
      '- If you only run the API configure script, web deploy will still fail.',
      '- The WEB configure script asks for the production API URL. Use the real API Cloud Run URL or a real configured API custom domain.',
      '- Do not enter a domain you have not purchased/configured yet.',
      '- Firebase web values come from Firebase Console → Project settings → Your apps → Web app.',
      '- API configure prompts that are easy to skip:',
      '  • FIREBASE_DATABASE_URL → leave blank unless you use Firebase Realtime Database',
      '  • AUTH_EMAIL_LINK_CONTINUE_URL → leave blank unless you use Firebase email-link sign-in/passwordless auth',
      '  • FIREBASE_CLIENT_EMAIL / private key file → copy both from the same Firebase Admin SDK JSON',
      '  • REVENUECAT_WEBHOOK_SECRET → generate a long random string yourself and use the same value in RevenueCat',
    ],
    scripts: [
      { label: 'Configure production API', command: 'bash scripts/api-deployment/configure-prod.sh' },
      { label: 'Configure production Web', command: 'bash scripts/web-deployment/configure-prod.sh' },
    ],
    expected: ['.traxettle/api-prod.env exists', '.traxettle/web-prod.env exists'],
  },
  {
    id: 'w-prod-deploy-api',
    platform: 'web',
    environment: 'production',
    section: 'Deploy',
    title: 'Deploy API to PRODUCTION',
    whyThisMatters: 'The production website and production mobile builds must point to a working production API.',
    kind: 'action',
    skippable: true,
    instructions: [
      'Run the script below.',
      'If Google sign-in later fails with serviceusage permission errors, run verify-deployed-api-env.sh and apply the printed IAM bindings with condition None.',
    ],
    scripts: [{ label: 'Deploy production API', command: 'bash scripts/api-deployment/deploy-prod-gmail.sh' }],
    expected: ['A Cloud Run URL is printed.', 'Health endpoint returns OK.'],
  },
  {
    id: 'w-prod-verify-api-email-links',
    platform: 'web',
    environment: 'production',
    section: 'Verify',
    title: 'Verify production emails will NOT open localhost',
    whyThisMatters:
      'This verifies the deployed production API is configured so emails never contain localhost links. It checks that APP_URL is set correctly OR FIREBASE_PROJECT_ID is set (non-local).',
    kind: 'verify',
    skippable: false,
    instructions: [
      'Run the single command below.',
      'If it says “NOT OK”, follow the exact fix steps it prints, then rerun this verification.',
    ],
    scripts: [{ label: 'Verify deployed production API env', command: 'bash scripts/api-deployment/verify-deployed-api-env.sh production' }],
    expected: ['Result: ✅ OK — this deployed API should NOT generate localhost links in emails.'],
  },
  {
    id: 'w-prod-deploy-web',
    platform: 'web',
    environment: 'production',
    section: 'Deploy',
    title: 'Deploy WEB to PRODUCTION',
    whyThisMatters: 'Publishes the production website.',
    kind: 'action',
    skippable: true,
    instructions: [
      'Run the script below only after production API is deployed.',
      'This script reads .traxettle/web-prod.env, not .traxettle/api-prod.env.',
      'If RevenueCat config verification is needed from zsh, use:',
      "bash -lc 'source scripts/revenuecat/load-rc-config.sh production && echo OK'",
    ],
    scripts: [{ label: 'Deploy production Web', command: 'bash scripts/web-deployment/deploy-web-prod.sh' }],
    expected: ['A Firebase Hosting URL is printed (…web.app) or your custom domain loads.'],
  },
];
