# Splitex Deployment Runbook (Local, Staging, Production)

Deployment files live in:

- `/Users/vkarkhanis/workspace/Splitex/splitex-app/deployment`

App source being deployed is:

- `/Users/vkarkhanis/workspace/Splitex/splitex-rush`

This runbook is for the repo at:

- `/Users/vkarkhanis/workspace/Splitex/splitex-rush`

It covers:

1. Local development setup
2. Staging deployment (Cloud Run + Firebase staging project)
3. Production deployment (Cloud Run + Firebase production project)
4. Mobile/TestFlight/Play internal + production environment mapping

## 0) First-time release prerequisites (store accounts)

For first-ever TestFlight/Play internal/prod release, these are mandatory:

1. Apple Developer Program enrollment (paid) for your org/team
2. App Store Connect app created for iOS
3. Google Play Console developer account (one-time fee)
4. Play Console app created for Android
5. At least one tester account list prepared
6. App privacy policy URL and support URL prepared

Without these, mobile build artifacts can be produced, but store distribution cannot be completed.

## 1) What differs by environment

These values must be different between local/staging/production:

- Firebase Admin credentials (API server)
  - `FIREBASE_PROJECT_ID`
  - `FIREBASE_CLIENT_EMAIL`
  - `FIREBASE_PRIVATE_KEY`
  - `FIREBASE_STORAGE_BUCKET`
- JWT secrets
  - `JWT_SECRET`
  - `JWT_REFRESH_SECRET`
- API environment
  - `NODE_ENV`
  - `APP_URL`
- API URL consumed by mobile
  - `EXPO_PUBLIC_API_URL`
- Google OAuth client IDs used by mobile
  - `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID`
  - `EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID`
  - `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID`
- Optional SMTP/email settings
  - `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`

## 2) One-time prerequisites (machine + accounts)

### 2.1 Install tooling

```bash
brew install --cask google-cloud-sdk
corepack enable
npx @microsoft/rush@5.167.0 --version
pnpm dlx firebase-tools --version
pnpm dlx eas-cli --version
```

### 2.2 Authenticate

```bash
gcloud auth login
firebase login
eas login
```

### 2.3 One-time EAS setup for mobile project

From mobile app folder:

```bash
cd /Users/vkarkhanis/workspace/Splitex/splitex-rush/apps/mobile
eas whoami
eas init --id <EAS_PROJECT_ID>
```

If `eas.json` does not exist, create it:

```bash
cat > /Users/vkarkhanis/workspace/Splitex/splitex-rush/apps/mobile/eas.json <<'EOF'
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

Update `/Users/vkarkhanis/workspace/Splitex/splitex-rush/apps/mobile/app.json` and set a valid EAS UUID in `expo.extra.eas.projectId`.

### 2.4 Repo bootstrap

```bash
cd /Users/vkarkhanis/workspace/Splitex/splitex-rush
rush update
rush build:shared
rush build:api
```

### 2.5 Create API container files (if not already present)

Create `/Users/vkarkhanis/workspace/Splitex/splitex-rush/Dockerfile`:

```dockerfile
FROM node:24-alpine
WORKDIR /app

COPY . .

RUN corepack enable \
 && npx @microsoft/rush@5.167.0 update --bypass-policy \
 && npx @microsoft/rush@5.167.0 build:shared \
 && npx @microsoft/rush@5.167.0 build:api

WORKDIR /app/apps/api
ENV NODE_ENV=production
EXPOSE 8080
CMD ["node", "dist/index.js"]
```

Create `/Users/vkarkhanis/workspace/Splitex/splitex-rush/.dockerignore`:

```text
.git
**/node_modules
**/.expo
**/dist
**/build
common/temp
common/autoinstallers
```

## 3) Firebase setup per environment

Repeat once for staging and once for production.

### 3.1 Create Firebase projects

- Staging: `splitex-staging` (or your name)
- Production: `splitex-prod` (or your name)

### 3.2 Enable Firebase products

In each Firebase project:

- Authentication (enable Google provider)
- Firestore Database
- Storage

For passwordless email-link sign-in, additionally in Firebase Authentication:

1. Enable `Email/Password`
2. Enable `Email link (passwordless sign-in)`
3. Add authorized domains used in action links

### 3.3 Mobile app registration in Firebase (per env)

In each Firebase project:

1. Register Android app package (current package is `com.splitex.app`)
2. Register iOS app bundle ID (current bundle is `com.splitex.app`)
3. Add SHA fingerprints for Android signing certs (internal + Play App Signing for prod)
4. Download:
   - `google-services.json`
   - `GoogleService-Info.plist`

Keep staging and production versions separate in secure local folders.

### 3.4 Place mobile Firebase files before environment build

Before staging/internal builds, copy staging Firebase config files:

```bash
cp <STAGING_GOOGLE_SERVICES_JSON> /Users/vkarkhanis/workspace/Splitex/splitex-rush/apps/mobile/google-services.json
cp <STAGING_GOOGLESERVICE_INFO_PLIST> /Users/vkarkhanis/workspace/Splitex/splitex-rush/apps/mobile/ios/Splitex/GoogleService-Info.plist
```

Before production/store builds, copy production Firebase config files:

```bash
cp <PROD_GOOGLE_SERVICES_JSON> /Users/vkarkhanis/workspace/Splitex/splitex-rush/apps/mobile/google-services.json
cp <PROD_GOOGLESERVICE_INFO_PLIST> /Users/vkarkhanis/workspace/Splitex/splitex-rush/apps/mobile/ios/Splitex/GoogleService-Info.plist
```

### 3.5 Backend service account key (per env)

In each Firebase project:

- Project Settings -> Service Accounts -> Generate new private key
- Save JSON securely
- Extract:
  - `project_id`
  - `client_email`
  - `private_key`

### 3.6 Google Cloud / Firebase config for email-link auth

For each environment (staging/prod), collect and set:

1. Firebase Web API key (`FIREBASE_WEB_API_KEY`)
   - Firebase Console -> Project settings -> General -> Your apps -> Web app config
2. Cloud Run env vars (already supported in deploy scripts)
   - `AUTH_EMAIL_LINK_CONTINUE_URL`
   - `AUTH_ANDROID_PACKAGE_NAME`
   - `AUTH_ANDROID_MIN_VERSION`
   - `AUTH_IOS_BUNDLE_ID`

In scripts:

- `/Users/vkarkhanis/workspace/Splitex/splitex-app/deployment/scripts/deploy-staging.sh`
- `/Users/vkarkhanis/workspace/Splitex/splitex-app/deployment/scripts/deploy-prod.sh`

fill optional email-link placeholders when enabling this feature.

## 4) Local environment steps

### 4.1 Create local API env

Create `/Users/vkarkhanis/workspace/Splitex/splitex-rush/.env.local`:

```env
FIREBASE_PROJECT_ID=<LOCAL_FIREBASE_PROJECT_ID>
FIREBASE_CLIENT_EMAIL=<LOCAL_FIREBASE_CLIENT_EMAIL>
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
FIREBASE_STORAGE_BUCKET=<LOCAL_FIREBASE_STORAGE_BUCKET>

JWT_SECRET=<LOCAL_JWT_SECRET>
JWT_REFRESH_SECRET=<LOCAL_JWT_REFRESH_SECRET>

PORT=3001
NODE_ENV=development
APP_URL=http://localhost:3000

# Optional SMTP
# SMTP_HOST=smtp.gmail.com
# SMTP_PORT=587
# SMTP_SECURE=false
# SMTP_USER=<USER>
# SMTP_PASS=<PASS>
# SMTP_FROM=noreply@splitex.app
```

### 4.2 Start local API

```bash
cd /Users/vkarkhanis/workspace/Splitex/splitex-rush
rush dev:api
```

### 4.3 Start mobile against local API

iOS simulator/local dev:

```bash
cd /Users/vkarkhanis/workspace/Splitex/splitex-rush
EXPO_PUBLIC_API_URL=http://localhost:3001 rush dev:mobile
```

Android emulator:

```bash
cd /Users/vkarkhanis/workspace/Splitex/splitex-rush
EXPO_PUBLIC_API_URL=http://10.0.2.2:3001 rush mobile:android
```

## 5) Staging deployment steps

### 5.1 Configure script placeholders

Edit:

- `/Users/vkarkhanis/workspace/Splitex/splitex-app/deployment/scripts/deploy-staging.sh`

Replace all `CHANGE_ME_*` values.

`FIREBASE_PRIVATE_KEY_FILE` accepts either:

1. A file containing only the PEM private key text
2. A Firebase service-account JSON file (script auto-extracts `private_key`)

### 5.2 Run one command

```bash
bash /Users/vkarkhanis/workspace/Splitex/splitex-app/deployment/scripts/deploy-staging.sh
```

This script will:

1. Validate placeholders
2. Enable required GCP APIs
3. Create runtime service account and IAM grants
4. Upsert all required secrets into Secret Manager
5. Deploy Cloud Run service
6. Optionally create domain mapping
7. Print health check URL and service URL

### 5.3 Verify

```bash
curl https://api-staging.splitex.app/health
```

(or script output URL if domain mapping not configured)

## 6) Production deployment steps

### 6.1 Configure script placeholders

Edit:

- `/Users/vkarkhanis/workspace/Splitex/splitex-app/deployment/scripts/deploy-prod.sh`

Replace all `CHANGE_ME_*` values.

`FIREBASE_PRIVATE_KEY_FILE` accepts either:

1. A file containing only the PEM private key text
2. A Firebase service-account JSON file (script auto-extracts `private_key`)

### 6.2 Run one command

```bash
bash /Users/vkarkhanis/workspace/Splitex/splitex-app/deployment/scripts/deploy-prod.sh
```

### 6.3 Verify

```bash
curl https://api.splitex.app/health
```

(or script output URL if domain mapping not configured)

## 7) Mobile build mapping (staging vs production)

Build commands from `/Users/vkarkhanis/workspace/Splitex/splitex-rush/apps/mobile`.

### 7.1 Staging/Internal builds

```bash
EXPO_PUBLIC_API_URL=https://api-staging.splitex.app \
EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID=<STAGING_WEB_CLIENT_ID> \
EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID=<STAGING_ANDROID_CLIENT_ID> \
EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID=<STAGING_IOS_CLIENT_ID> \
eas build --platform ios --profile staging

EXPO_PUBLIC_API_URL=https://api-staging.splitex.app \
EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID=<STAGING_WEB_CLIENT_ID> \
EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID=<STAGING_ANDROID_CLIENT_ID> \
EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID=<STAGING_IOS_CLIENT_ID> \
eas build --platform android --profile staging
```

### 7.2 Production/AppStore/Play builds

```bash
EXPO_PUBLIC_API_URL=https://api.splitex.app \
EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID=<PROD_WEB_CLIENT_ID> \
EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID=<PROD_ANDROID_CLIENT_ID> \
EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID=<PROD_IOS_CLIENT_ID> \
eas build --platform ios --profile production

EXPO_PUBLIC_API_URL=https://api.splitex.app \
EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID=<PROD_WEB_CLIENT_ID> \
EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID=<PROD_ANDROID_CLIENT_ID> \
EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID=<PROD_IOS_CLIENT_ID> \
eas build --platform android --profile production
```

## 8) TestFlight and Play Internal testing (first-time flow)

### 8.1 TestFlight (iOS internal/external)

1. Create app record once in App Store Connect with bundle id `com.splitex.app`
2. Build and submit:

```bash
cd /Users/vkarkhanis/workspace/Splitex/splitex-rush/apps/mobile
eas build --platform ios --profile staging
eas submit --platform ios --latest
```

3. In App Store Connect:
1. Open TestFlight tab
2. Add internal testers (team users) or external tester group
3. For external testers, submit beta review and wait approval

### 8.2 Play Console internal testing

1. Create app record once in Play Console with package `com.splitex.app`
2. Build and submit:

```bash
cd /Users/vkarkhanis/workspace/Splitex/splitex-rush/apps/mobile
eas build --platform android --profile staging
eas submit --platform android --latest
```

3. In Play Console:
1. Open Testing > Internal testing
2. Create tester list/email group
3. Roll out release to internal track

## 9) Production store release flow

1. Ensure production API is deployed and healthy
2. Ensure production Firebase files are copied into mobile project
3. Build and submit production artifacts:

```bash
cd /Users/vkarkhanis/workspace/Splitex/splitex-rush/apps/mobile
eas build --platform ios --profile production
eas submit --platform ios --latest
eas build --platform android --profile production
eas submit --platform android --latest
```

4. Finalize release in consoles:
1. App Store Connect -> select build for App Store release
2. Play Console -> Production track rollout
## 10) DNS and domain mapping notes

If you set `DOMAIN_NAME` in scripts:

1. Script creates Cloud Run domain mapping
2. Run:

```bash
gcloud run domain-mappings describe <YOUR_DOMAIN> --region <YOUR_REGION>
```

3. Add the returned DNS records in your DNS provider
4. Wait for certificate provisioning and DNS propagation

## 11) Security/operations notes (important)

1. Never commit Firebase private keys
2. Use separate Firebase projects for staging/prod
3. Use separate JWT secrets for staging/prod
4. Use Cloud Run `min instances = 0` for staging to reduce cost
5. Set Cloud Run `min instances = 1` for production if websocket usage must stay warm
6. Rotate compromised keys immediately if any secret was committed in git history
7. Restrict Firebase API keys in Google Cloud Console by app/bundle/package where possible
8. Keep `apps/mobile/google-services.json` and `apps/mobile/ios/Splitex/GoogleService-Info.plist` environment-specific and out of git

## 12) Rollback strategy

List revisions:

```bash
gcloud run revisions list --service splitex-api-staging --region us-central1
gcloud run revisions list --service splitex-api-prod --region us-central1
```

Route traffic back to previous revision:

```bash
gcloud run services update-traffic splitex-api-staging --to-revisions <REVISION>=100 --region us-central1
gcloud run services update-traffic splitex-api-prod --to-revisions <REVISION>=100 --region us-central1
```
