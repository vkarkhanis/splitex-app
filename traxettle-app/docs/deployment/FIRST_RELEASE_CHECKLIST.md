# Traxettle First Release Checklist

Primary runbook:
- `docs/deployment/DEPLOYMENT_RUNBOOK.md`

Use this in order. Do not skip sections.

## A) Before Any Store Account Is Ready

- [ ] Firebase projects created:
  - [ ] `traxettle-staging`
  - [ ] `traxettle-prod`
- [ ] Firebase Authentication enabled in both
- [ ] Google provider enabled
- [ ] Email/Password enabled
- [ ] Email-link enabled (if using passwordless)
- [ ] Firestore enabled
- [ ] Storage enabled
- [ ] Firestore rules locked (`allow false`)
- [ ] Storage rules locked (`allow false`)
- [ ] Android, iOS, Web apps registered in Firebase for both envs
- [ ] Service-account JSON downloaded for both envs

## B) Machine and CLI Setup

- [ ] `gcloud` installed and works
- [ ] `firebase` installed and works
- [ ] Logged in: `gcloud auth login`
- [ ] Logged in: `firebase login`
- [ ] Xcode 26 installed and set as default (`sudo xcode-select -s /Applications/Xcode_26.app/Contents/Developer`); Apple ID added in Xcode → Settings → Accounts
- [ ] Mobile builds run on this Mac; EAS isn't used (it can't install this Rush monorepo)
- [ ] Active project set:
  - [ ] `gcloud config set project traxettle-staging`
  - [ ] `gcloud config get-value project` returns `traxettle-staging`
- [ ] Billing linked for staging/prod GCP projects

## C) Staging API Deployment

- [ ] Edit `scripts/api-deployment/deploy-staging.sh`
- [ ] Fill all required placeholders
- [ ] `FIREBASE_PRIVATE_KEY_FILE` points to staging service-account JSON path
- [ ] If passwordless enabled, set:
  - [ ] `FIREBASE_WEB_API_KEY`
  - [ ] `AUTH_EMAIL_LINK_CONTINUE_URL`
  - [ ] `AUTH_ANDROID_PACKAGE_NAME`
  - [ ] `AUTH_IOS_BUNDLE_ID`
- [ ] Run:

```bash
bash scripts/api-deployment/deploy-staging.sh
```

- [ ] Health check passes:

```bash
curl https://traxettle-api-staging-862789756309.us-central1.run.app/health
```

## D) Staging Mobile Internal Testing Build

One build serves every environment: release builds open on production, and testers switch
to staging by tapping "Traxettle" 7 times on the sign-in screen. The files each build needs
are listed in [DEPLOYMENT_RUNBOOK.md](DEPLOYMENT_RUNBOOK.md) section 6.2.

- [ ] Build iOS and upload to TestFlight:

```bash
cd traxettle-rush/apps/mobile
APPLE_TEAM_ID=<your Team ID> npm run build:ios:testflight
```

- [ ] Build the Android AAB and upload it to Play Console → Testing → Internal testing:

```bash
cd traxettle-rush/apps/mobile
npm run build:android:production
```

- [ ] When testing passes, promote the same builds: App Store Connect → submit the version for
  review; Play Console → promote the internal-testing release to production.

## E) Store Account Requirements

- [ ] Apple Developer Program active (required for TestFlight/App Store)
- [ ] Google Play Console account active (required for Play Internal/Production)
- [ ] If Play account was closed, new account created and verified

## F) Production Deployment

- [ ] Edit `scripts/api-deployment/deploy-prod.sh`
- [ ] Fill all required placeholders with prod values
- [ ] Deploy:

```bash
bash scripts/api-deployment/deploy-prod.sh
```

- [ ] Copy production Firebase mobile files
- [ ] Build production iOS/Android with prod API URL and prod client IDs
- [ ] Submit and release from App Store Connect/Play Console

## G) Web Deployment (Firebase Hosting + Cloud Run, monorepo-safe)

- [ ] `Dockerfile.web` exists at `traxettle-rush/Dockerfile.web`
- [ ] `StyledComponentsRegistry.tsx` is tracked in git:
  - [ ] `git ls-files -- traxettle-rush/apps/web/src/lib/StyledComponentsRegistry.tsx` returns a path
- [ ] Edit `scripts/web-deployment/deploy-web-staging.sh`
- [ ] Hosting site exists for staging (`HOSTING_SITE_ID`)
- [ ] Run:

```bash
bash scripts/web-deployment/deploy-web-staging.sh
```

- [ ] Staging web URL opens (`https://<HOSTING_SITE_ID>.web.app`)
- [ ] Edit `scripts/web-deployment/deploy-web-prod.sh`
- [ ] Hosting site exists for production (`HOSTING_SITE_ID`)
- [ ] Run:

```bash
bash scripts/web-deployment/deploy-web-prod.sh
```

- [ ] Production web URL opens (`https://<HOSTING_SITE_ID>.web.app`)
- [ ] If script pauses after Cloud Run, run Hosting deploy directly with debug:
  - [ ] `cd traxettle-rush && firebase deploy --project <PROJECT_ID> --only hosting --config .firebase-hosting-<env>.generated.json --non-interactive --debug`

## H) Final Security Checks

- [ ] No real secrets committed to git
- [ ] Staging and production secrets are different
- [ ] Rotate any secret that was exposed in scripts/history
- [ ] Budget alerts configured in GCP Billing

## I) Validation Before Release

- [ ] From `traxettle-rush/`, run:
  - [ ] `rush build --to @traxettle/web`
  - [ ] `rush test:e2e`
  - [ ] `rush test:api`
  - [ ] `rush test:mobile`
  - [ ] `rush test:web`
- [ ] Maestro prerequisites complete:
  - [ ] Android emulator or device is running
  - [ ] A build with package `com.traxettle.app` is installed on that device/emulator
  - [ ] `maestro --version` works locally
- [ ] Run Maestro:
  - [ ] `cd traxettle-rush && rush test:maestro`
