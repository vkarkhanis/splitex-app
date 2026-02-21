# Splitex Deployment Runbook (Local, Staging, Production)

This runbook is for the repo at:

- `/Users/vkarkhanis/workspace/Splitex/splitex-rush`

It covers:

1. Local development setup
2. Staging deployment (Cloud Run + Firebase staging project)
3. Production deployment (Cloud Run + Firebase production project)
4. Mobile/TestFlight/Play internal + production environment mapping

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

### 2.3 Repo bootstrap

```bash
cd /Users/vkarkhanis/workspace/Splitex/splitex-rush
rush update
rush build:shared
rush build:api
```

### 2.4 Create API container files (if not already present)

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

### 3.3 Mobile app registration in Firebase (per env)

In each Firebase project:

1. Register Android app package (current package is `com.splitex.app`)
2. Register iOS app bundle ID (current bundle is `com.splitex.app`)
3. Add SHA fingerprints for Android signing certs (internal + Play App Signing for prod)
4. Download:
   - `google-services.json`
   - `GoogleService-Info.plist`

Keep staging and production versions separate in secure local folders.

### 3.4 Backend service account key (per env)

In each Firebase project:

- Project Settings -> Service Accounts -> Generate new private key
- Save JSON securely
- Extract:
  - `project_id`
  - `client_email`
  - `private_key`

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
eas build --platform ios --profile production

EXPO_PUBLIC_API_URL=https://api-staging.splitex.app \
EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID=<STAGING_WEB_CLIENT_ID> \
EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID=<STAGING_ANDROID_CLIENT_ID> \
EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID=<STAGING_IOS_CLIENT_ID> \
eas build --platform android --profile production
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

## 8) DNS and domain mapping notes

If you set `DOMAIN_NAME` in scripts:

1. Script creates Cloud Run domain mapping
2. Run:

```bash
gcloud run domain-mappings describe <YOUR_DOMAIN> --region <YOUR_REGION>
```

3. Add the returned DNS records in your DNS provider
4. Wait for certificate provisioning and DNS propagation

## 9) Security/operations notes (important)

1. Never commit Firebase private keys
2. Use separate Firebase projects for staging/prod
3. Use separate JWT secrets for staging/prod
4. Set Cloud Run min instance to `1` if websocket usage must stay warm
5. Rotate compromised keys immediately if any secret was committed in git history
6. Restrict Firebase API keys in Google Cloud Console by app/bundle/package where possible

## 10) Rollback strategy

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
