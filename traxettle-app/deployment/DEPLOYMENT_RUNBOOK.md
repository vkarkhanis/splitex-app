# Traxettle Deployment Runbook (First-Time Friendly)

Deployment folder:
- `/Users/vkarkhanis/workspace/Traxettle/traxettle-app/deployment`

Source repo:
- `/Users/vkarkhanis/workspace/Traxettle/traxettle-rush`

This runbook gives exact steps for:
1. Local development
2. Staging (internal testing / TestFlight / Play Internal)
3. Production (App Store / Play Store)

## 0) Current recommended environment names

Use separate projects:
- Dev: `traxettle-test`
- Staging: `traxettle-staging`
- Production: `traxettle-prod`

Do not reuse the same Firebase project for staging and production.

## 1) What you can do before store developer accounts

You can fully complete these before Apple/Play account approval:
1. Create Firebase staging + prod projects
2. Deploy API to Cloud Run (staging + prod)
3. Configure Firebase Auth providers
4. Configure Firestore/Storage rules
5. Validate mobile app against staging API/Firebase locally

You need store accounts only for:
- TestFlight distribution (Apple Developer account)
- Play internal/production distribution (Google Play Console developer account)

## 2) One-time machine setup

### 2.1 Install CLIs

```bash
brew install --cask google-cloud-sdk
brew install firebase-cli
npm install -g eas-cli
corepack enable
```

Verify:

```bash
gcloud --version
firebase --version
eas --version
node --version
```

### 2.2 Login

```bash
gcloud auth login
firebase login
eas login
```

### 2.3 Set active gcloud project

```bash
gcloud config set project traxettle-staging
gcloud config get-value project
```

Expected output for staging should be exactly:
- `traxettle-staging`

### 2.4 Ensure EAS project/profiles exist

From mobile app directory:

```bash
cd /Users/vkarkhanis/workspace/Traxettle/traxettle-rush/apps/mobile
eas whoami
```

If `eas.json` is missing, create:

```bash
cat > /Users/vkarkhanis/workspace/Traxettle/traxettle-rush/apps/mobile/eas.json <<'EOF'
{
  "build": {
    "staging": {
      "distribution": "internal",
      "ios": { "simulator": false },
      "android": { "buildType": "app-bundle" }
    },
    "production": {
      "distribution": "store",
      "ios": { "simulator": false },
      "android": { "buildType": "app-bundle" }
    }
  },
  "submit": {
    "production": {}
  }
}
EOF
```

If EAS project is not initialized, run:

```bash
cd /Users/vkarkhanis/workspace/Traxettle/traxettle-rush/apps/mobile
eas init
```

## 3) Firebase setup (run once per environment)

Do this for both `traxettle-staging` and `traxettle-prod`.

### 3.1 Create project

Go to [Firebase Console](https://console.firebase.google.com/) and create project.

### 3.2 Enable products

In each project, enable:
1. Authentication
2. Firestore Database
3. Storage

### 3.3 Auth providers

In Authentication -> Sign-in method:
1. Enable `Google`
2. Enable `Email/Password`
3. Enable `Email link (passwordless sign-in)` if you want passwordless flow

### 3.4 Authorized domains (for email-link)

In Authentication -> Settings -> Authorized domains, add:
- Your API service URL domain (for staging now):
  - `traxettle-api-staging-862789756309.us-central1.run.app`
- Later add custom domains if used

Cloud Run service URL does not change on every deploy for the same service name.

### 3.5 Register apps in Firebase project

Per environment project, register:
1. Android app package: `com.traxettle.app`
2. iOS bundle ID: `com.traxettle.app`
3. Web app (needed to get Firebase Web API key)

Download and store per environment:
- `google-services.json` (Android)
- `GoogleService-Info.plist` (iOS)

### 3.6 Android SHA fingerprints

Add SHA-1 and SHA-256 values in Firebase Android app settings:
1. For internal builds: from local/upload keystore
2. For production Play release: from Play Console -> App integrity

You need active Play Console access to get Play App Signing cert fingerprints.

### 3.7 Service account JSON (for API)

In Firebase project:
- Project settings -> Service accounts -> Generate new private key

This JSON file is used by deploy scripts via `FIREBASE_PRIVATE_KEY_FILE`.

### 3.8 Firebase Web API key (for email-link endpoint)

From project settings -> General -> Your apps -> Web app config:
- `apiKey` value is `FIREBASE_WEB_API_KEY`

## 4) Firestore and Storage security rules

If all business logic/data access is through your API, keep client access locked.

Firestore rules:

```text
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read, write: if false;
    }
  }
}
```

Storage rules:

```text
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    match /{allPaths=**} {
      allow read, write: if false;
    }
  }
}
```

Note: Firestore rules and Storage rules are edited in separate screens:
- Firestore Database -> Rules
- Storage -> Rules

## 5) API deployment (Cloud Run)

Scripts:
- `/Users/vkarkhanis/workspace/Traxettle/traxettle-app/deployment/scripts/deploy-staging.sh`
- `/Users/vkarkhanis/workspace/Traxettle/traxettle-app/deployment/scripts/deploy-prod.sh`

### 5.1 Fill staging script placeholders

Edit `/Users/vkarkhanis/workspace/Traxettle/traxettle-app/deployment/scripts/deploy-staging.sh` and set:
- `GCP_PROJECT_ID=traxettle-staging`
- `FIREBASE_PROJECT_ID=traxettle-staging`
- `FIREBASE_CLIENT_EMAIL`
- `FIREBASE_STORAGE_BUCKET`
- `FIREBASE_PRIVATE_KEY_FILE` (absolute path to service-account JSON)
- `JWT_SECRET`
- `JWT_REFRESH_SECRET`

Optional email-link vars (if enabled):
- `FIREBASE_WEB_API_KEY`
- `AUTH_EMAIL_LINK_CONTINUE_URL`
- `AUTH_ANDROID_PACKAGE_NAME=com.traxettle.app`
- `AUTH_IOS_BUNDLE_ID=com.traxettle.app`

For staging continue URL, use:
- `https://traxettle-api-staging-862789756309.us-central1.run.app/auth/email-link`

Optional SMTP (Gmail example):
- `SMTP_HOST=smtp.gmail.com`
- `SMTP_PORT=465`
- `SMTP_SECURE=true`
- `SMTP_USER=<gmail_address>`
- `SMTP_PASS=<gmail_app_password>`
- `SMTP_FROM=<gmail_address>`

### 5.2 Deploy staging API

```bash
bash /Users/vkarkhanis/workspace/Traxettle/traxettle-app/deployment/scripts/deploy-staging.sh
```

### 5.3 Verify staging API

```bash
curl https://traxettle-api-staging-862789756309.us-central1.run.app/health
```

### 5.4 Deploy production API

Edit placeholders in `/Users/vkarkhanis/workspace/Traxettle/traxettle-app/deployment/scripts/deploy-prod.sh` then run:

```bash
bash /Users/vkarkhanis/workspace/Traxettle/traxettle-app/deployment/scripts/deploy-prod.sh
```

## 6) Local app vs staging vs production mapping

### 6.1 Local

- API: `http://localhost:3001`
- Firebase: dev project (`traxettle-test`)
- `NODE_ENV=development`

Run:

```bash
cd /Users/vkarkhanis/workspace/Traxettle/traxettle-rush
rush update
rush dev:api
```

Mobile local:

```bash
cd /Users/vkarkhanis/workspace/Traxettle/traxettle-rush
EXPO_PUBLIC_API_URL=http://localhost:3001 rush dev:mobile
```

### 6.2 Staging (internal testing)

- API: Cloud Run staging URL
- Firebase: `traxettle-staging`
- `NODE_ENV=staging`

Before building mobile:

```bash
cp <STAGING_GOOGLE_SERVICES_JSON> /Users/vkarkhanis/workspace/Traxettle/traxettle-rush/apps/mobile/google-services.json
cp <STAGING_GOOGLESERVICE_INFO_PLIST> /Users/vkarkhanis/workspace/Traxettle/traxettle-rush/apps/mobile/ios/Traxettle/GoogleService-Info.plist
```

Then build:

```bash
cd /Users/vkarkhanis/workspace/Traxettle/traxettle-rush/apps/mobile
EXPO_PUBLIC_API_URL=https://traxettle-api-staging-862789756309.us-central1.run.app \
EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID=<STAGING_WEB_CLIENT_ID> \
EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID=<STAGING_ANDROID_CLIENT_ID> \
EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID=<STAGING_IOS_CLIENT_ID> \
eas build --platform ios --profile staging

EXPO_PUBLIC_API_URL=https://traxettle-api-staging-862789756309.us-central1.run.app \
EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID=<STAGING_WEB_CLIENT_ID> \
EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID=<STAGING_ANDROID_CLIENT_ID> \
EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID=<STAGING_IOS_CLIENT_ID> \
eas build --platform android --profile staging
```

### 6.3 Production

- API: production Cloud Run/custom domain
- Firebase: `traxettle-prod`
- `NODE_ENV=production`

Before prod builds, copy prod Firebase mobile files and run same commands with prod API/client IDs.

## 7) Store deployment requirements

### 7.1 TestFlight

Requires active Apple Developer Program membership.

### 7.2 Play Internal/Production

Requires active Google Play Console developer account.

If account shows `Account closed` for inactivity, create a new Play Console account and complete verification before release.

## 8) Known errors and exact fixes

### 8.1 `gcloud: command not found`

Install gcloud SDK and restart terminal.

### 8.2 `firebase: command not found`

```bash
brew install firebase-cli
```

### 8.3 `You do not currently have an active account selected`

```bash
gcloud auth login
gcloud config set project traxettle-staging
```

### 8.4 `Billing account ... not found`

Link billing account in GCP project before enabling Cloud Run/Build/Artifact Registry APIs.

### 8.5 `Missing .../Dockerfile`

Ensure file exists at:
- `/Users/vkarkhanis/workspace/Traxettle/traxettle-rush/Dockerfile`

### 8.6 `bash: not found` during Cloud Build

Already fixed in Dockerfile by installing bash via `apk add --no-cache bash`.

### 8.7 Project lacks `environment` tag warning

This warning is non-blocking for deployment. You can continue.

## 9) Cost model (quick)

- Firebase Spark (free) is limited; Cloud Run + Secret Manager + Artifact Registry require billing (Blaze/pay-as-you-go).
- With `min instances = 0` staging can stay very low cost when idle.
- Add budget alert in GCP:
  1. Billing -> Budgets & alerts -> Create budget
  2. Set monthly amount and alert thresholds (50%, 90%, 100%)

## 10) Security notes

1. Do not keep real secrets committed in shell scripts.
2. Use placeholders in repo and local private copies for real values.
3. Rotate secrets if any real value was ever committed.
4. Keep staging and production secrets different.

## 11) Web hosting status

API deployment path is working (Cloud Run). For web in this monorepo, the recommended path is:
1. Deploy web to Cloud Run using monorepo `Dockerfile.web`
2. Put Firebase Hosting in front with rewrite to Cloud Run

This avoids Firebase App Hosting buildpack issues with Rush + `workspace:` dependencies.

### 11.1 Why this works with workspace dependencies

`apps/web` depends on `@traxettle/ui` and `@traxettle/shared` via `workspace:^...`.
Firebase App Hosting buildpack often installs with `npm` from `apps/web` root and fails on workspace protocols in this monorepo layout.

`Dockerfile.web` builds from repo root using Rush, so workspace dependencies are resolved exactly like local/dev.

### 11.2 Files used

- `/Users/vkarkhanis/workspace/Traxettle/traxettle-rush/Dockerfile.web`
- `/Users/vkarkhanis/workspace/Traxettle/traxettle-app/deployment/scripts/deploy-web-staging.sh`
- `/Users/vkarkhanis/workspace/Traxettle/traxettle-app/deployment/scripts/deploy-web-prod.sh`

### 11.3 Staging web deploy (one command)

1. Edit placeholders in:
   - `/Users/vkarkhanis/workspace/Traxettle/traxettle-app/deployment/scripts/deploy-web-staging.sh`
2. Ensure web source files are tracked in git (important):

```bash
git -C /Users/vkarkhanis/workspace/Traxettle ls-files -- traxettle-rush/apps/web/src/lib/StyledComponentsRegistry.tsx
```

If empty, add/fix and push branch before deploy.
3. Ensure Hosting site exists (or script creates it):

```bash
firebase hosting:sites:create <HOSTING_SITE_ID> --project traxettle-staging
```
4. Run:

```bash
bash /Users/vkarkhanis/workspace/Traxettle/traxettle-app/deployment/scripts/deploy-web-staging.sh
```

### 11.4 Production web deploy (one command)

1. Edit placeholders in:
   - `/Users/vkarkhanis/workspace/Traxettle/traxettle-app/deployment/scripts/deploy-web-prod.sh`
2. Ensure Hosting site exists:

```bash
firebase hosting:sites:create <HOSTING_SITE_ID> --project traxettle-prod
```
3. Run:

```bash
bash /Users/vkarkhanis/workspace/Traxettle/traxettle-app/deployment/scripts/deploy-web-prod.sh
```

### 11.5 Web deployment troubleshooting

If Cloud Run is deployed but script appears to stop after that, run Hosting deploy directly:

```bash
cd /Users/vkarkhanis/workspace/Traxettle/traxettle-rush
firebase deploy --project traxettle-staging --only hosting --config .firebase-hosting-staging.generated.json --non-interactive --debug
```

If you get `Directory 'apps/web/public' for Hosting does not exist`:
1. Ensure config file is inside repo root (already handled in current scripts).
2. Run deploy from repo root.

### 11.6 If you still want Firebase App Hosting (Git-based)

Correct CLI syntax:

```bash
firebase apphosting:backends:create \
  --project traxettle-staging \
  --backend traxettle-staging \
  --primary-region us-central1 \
  --root-dir traxettle-rush/apps/web

firebase apphosting:rollouts:create traxettle-staging \
  --project traxettle-staging \
  --git-branch stage
```

Notes:
1. Use `--git-branch` (hyphen), not `--git_branch`.
2. App Hosting may still fail with this monorepo because of workspace dependency installation.
