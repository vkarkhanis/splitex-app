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
      'Run the configure scripts below once.',
      'They will ask you questions and save config files under .traxettle/ (gitignored).',
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
    instructions: ['Run the script below. If you configured production already, it should not require edits.'],
    scripts: [{ label: 'Deploy production API', command: 'bash scripts/api-deployment/deploy-prod-gmail.sh' }],
    expected: ['A Cloud Run URL is printed.', 'Health endpoint returns OK.'],
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
    instructions: ['Run the script below. If you configured production already, it should not require edits.'],
    scripts: [{ label: 'Deploy production Web', command: 'bash scripts/web-deployment/deploy-web-prod.sh' }],
    expected: ['A Firebase Hosting URL is printed (…web.app) or your custom domain loads.'],
  },
];
