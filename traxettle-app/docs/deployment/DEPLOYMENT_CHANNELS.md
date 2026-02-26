# Traxettle — Deployment Instructions

This document covers all deployment channels: Web (staging/production), Mobile Android (internal testing/Play Store), and Mobile iOS (TestFlight/App Store).

---

## Overview

| Channel | Target | Build Artifact | Deploy To |
|---------|--------|---------------|-----------|
| Web Staging | traxettle-staging | Next.js build | Cloud Run (staging) |
| Web Production | traxettle-production | Next.js build | Cloud Run (production) |
| Android Internal | traxettle-staging | `.aab` (signed) | Play Console → Internal Testing |
| Android Production | traxettle-production | `.aab` (signed) | Play Console → Production |
| iOS Internal | traxettle-staging | `.ipa` (signed) | TestFlight |
| iOS Production | traxettle-production | `.ipa` (signed) | App Store Connect |

---

## 1. Web — Staging

### Prerequisites
- GCP project with Cloud Run enabled
- `gcloud` CLI authenticated (`gcloud auth login`)
- Firebase service account credentials configured in Cloud Run environment

### Steps

```bash
# 1. Build the web app
cd apps/web
NEXT_PUBLIC_APP_ENV=staging \
NEXT_PUBLIC_API_URL=https://traxettle-api-staging-lomxjapdhq-uc.a.run.app \
rushx build

# 2. Build the API
cd apps/api
rushx build

# 3. Deploy API to Cloud Run (staging)
gcloud run deploy traxettle-api-staging \
  --source apps/api \
  --region us-central1 \
  --set-env-vars="APP_ENV=staging,PORT=3001,FIREBASE_USE_EMULATOR=false" \
  --set-env-vars="FIREBASE_PROJECT_ID=traxettle-staging" \
  --set-env-vars="FIREBASE_CLIENT_EMAIL=<service-account-email>" \
  --set-env-vars="FIREBASE_PRIVATE_KEY=<base64-encoded-private-key>" \
  --set-env-vars="FIREBASE_STORAGE_BUCKET=traxettle-staging.firebasestorage.app" \
  --set-env-vars="JWT_SECRET=<jwt-secret>" \
  --set-env-vars="JWT_REFRESH_SECRET=<jwt-refresh-secret>" \
  --allow-unauthenticated

# 4. Deploy Web to Cloud Run (staging) or static hosting
gcloud run deploy traxettle-web-staging \
  --source apps/web \
  --region us-central1 \
  --set-env-vars="NEXT_PUBLIC_APP_ENV=staging" \
  --set-env-vars="NEXT_PUBLIC_API_URL=https://traxettle-api-staging-lomxjapdhq-uc.a.run.app" \
  --allow-unauthenticated
```

### Verify
```bash
curl https://traxettle-api-staging-lomxjapdhq-uc.a.run.app/health
```

---

## 2. Web — Production

Same as staging but with production env vars:

```bash
# Build
cd apps/web
NEXT_PUBLIC_APP_ENV=production \
NEXT_PUBLIC_API_URL=https://<production-api-url> \
rushx build

# Deploy API
gcloud run deploy traxettle-api-production \
  --source apps/api \
  --region us-central1 \
  --set-env-vars="APP_ENV=production,PORT=3001" \
  --set-env-vars="FIREBASE_PROJECT_ID=<production-firebase-project>" \
  --set-env-vars="FIREBASE_CLIENT_EMAIL=<prod-service-account>" \
  --set-env-vars="FIREBASE_PRIVATE_KEY=<prod-private-key>" \
  --set-env-vars="JWT_SECRET=<prod-jwt-secret>" \
  --allow-unauthenticated

# Deploy Web
gcloud run deploy traxettle-web-production \
  --source apps/web \
  --region us-central1 \
  --set-env-vars="NEXT_PUBLIC_APP_ENV=production" \
  --set-env-vars="NEXT_PUBLIC_API_URL=https://<production-api-url>" \
  --allow-unauthenticated
```

---

## 3. Android — Internal Testing (Play Console)

### Prerequisites
- `google-services.staging.json` in `apps/mobile/`
- Release keystore at `apps/mobile/android/app/traxettle-release-key.keystore`
- Signing credentials in `apps/mobile/android/gradle.properties.local`:
  ```
  TRAXETTLE_RELEASE_STORE_FILE=traxettle-release-key.keystore
  TRAXETTLE_RELEASE_STORE_PASSWORD=traxettle2024
  TRAXETTLE_RELEASE_KEY_ALIAS=traxettle-key
  TRAXETTLE_RELEASE_KEY_PASSWORD=traxettle2024
  ```
- Android SDK and Java 17+

### Steps

```bash
# 1. Bump version (if needed)
#    Edit apps/mobile/app.json: increment "version"
#    Edit apps/mobile/android/app/build.gradle: increment versionCode

# 2. Build the signed .aab
cd apps/mobile
rushx build:android:staging
# Or directly:
# bash scripts/build-android.sh staging

# 3. Output location
#    apps/mobile/android/app/build/outputs/bundle/release/app-release.aab

# 4. Upload to Play Console
#    Google Play Console → Traxettle → Testing → Internal testing
#    → Create new release → Upload app-release.aab
#    → Add release notes → Review → Start rollout
```

### Quick Debug APK (sideload to device)
```bash
# Self-contained APK pointing to staging API (no Metro needed)
rushx build:android:debug:staging
# Output: android/app/build/outputs/apk/release/app-release.apk
# Auto-installs on connected device if adb is available
```

---

## 4. Android — Production (Play Store)

```bash
# 1. Bump versionCode and version in app.json + build.gradle

# 2. Build production .aab
cd apps/mobile
rushx build:android:production
# Or: bash scripts/build-android.sh production

# 3. Upload to Play Console
#    Google Play Console → Traxettle → Production
#    → Create new release → Upload app-release.aab
#    → Add release notes → Review → Start rollout
```

> **Note:** The production build currently falls back to the staging API URL. Set `EXPO_PUBLIC_API_URL` before building when a production API is available:
> ```bash
> EXPO_PUBLIC_API_URL=https://your-prod-api.run.app bash scripts/build-android.sh production
> ```

---

## 5. iOS — TestFlight (Internal Testing)

### Prerequisites
- macOS with Xcode installed
- Apple Developer account enrolled
- `GoogleService-Info.staging.plist` in `apps/mobile/`
- CocoaPods (`gem install cocoapods`)

### Steps

```bash
# 1. Generate native iOS project
cd apps/mobile
rushx prebuild:ios
# Or: expo prebuild --platform ios --clean

# 2. Install pods
cd ios
pod install
cd ..

# 3. Open in Xcode
open ios/Traxettle.xcworkspace

# 4. In Xcode:
#    - Select "Traxettle" target
#    - Set Bundle Identifier: com.traxettle.app
#    - Select your Team (Apple Developer account)
#    - Set version and build number
#    - Select "Any iOS Device (arm64)" as destination
#    - Product → Archive
#
# 5. In Organizer (Window → Organizer):
#    - Select the archive
#    - Click "Distribute App"
#    - Choose "App Store Connect"
#    - Upload
#
# 6. In App Store Connect:
#    - Go to TestFlight tab
#    - The build appears after processing (~15 min)
#    - Add internal/external testers
#    - Submit for Beta App Review (external testers only)
```

### EAS Build Alternative
```bash
# Using Expo Application Services (cloud build)
cd apps/mobile
eas build --platform ios --profile staging
# Follow prompts for Apple credentials
# Download .ipa from EAS dashboard and upload to App Store Connect
```

---

## 6. iOS — App Store (Production)

Same as TestFlight but select "App Store" distribution:

```bash
# 1. Prebuild, archive in Xcode (same as above)
# 2. In Organizer → Distribute App → App Store Connect → Upload
# 3. In App Store Connect:
#    - Go to App Store tab (not TestFlight)
#    - Create new version
#    - Select the uploaded build
#    - Fill in release notes, screenshots, metadata
#    - Submit for Review
```

---

## Version Management Checklist

Before any release, update these files:

| File | Field | Example |
|------|-------|---------|
| `apps/mobile/app.json` | `expo.version` | `1.0.6` |
| `apps/mobile/android/app/build.gradle` | `versionCode` | `7` |
| `apps/mobile/android/app/build.gradle` | `versionName` | `1.0.6` |
| `apps/mobile/package.json` | `version` | `1.0.6` |

> **Critical:** `versionCode` must be strictly incremented for every Play Console upload. You cannot re-upload the same `versionCode`.

---

## Environment Variable Reference (Deployment)

### API (Cloud Run)
| Variable | Staging | Production |
|----------|---------|------------|
| `APP_ENV` | `staging` | `production` |
| `PORT` | `3001` | `3001` |
| `FIREBASE_PROJECT_ID` | `traxettle-staging` | `<prod-project>` |
| `FIREBASE_USE_EMULATOR` | `false` | `false` |
| `JWT_SECRET` | `<staging-secret>` | `<prod-secret>` |
| `PAYMENT_GATEWAY_MODE` | `mock` | `live` |

### Web (Cloud Run / Static)
| Variable | Staging | Production |
|----------|---------|------------|
| `NEXT_PUBLIC_APP_ENV` | `staging` | `production` |
| `NEXT_PUBLIC_API_URL` | `https://traxettle-api-staging-...` | `https://<prod-api>` |

### Mobile (Build-time via .env / build script)
| Variable | Staging | Production |
|----------|---------|------------|
| `EXPO_PUBLIC_APP_ENV` | `staging` | `production` |
| `EXPO_PUBLIC_API_URL` | `https://traxettle-api-staging-...` | `https://<prod-api>` |

---

## Signing Keys

| Key | Location | Alias | Password |
|-----|----------|-------|----------|
| Android Release | `android/app/traxettle-release-key.keystore` | `traxettle-key` | `traxettle2024` |
| Android Debug (local) | `apps/mobile/debug.keystore.local` | `androiddebugkey` | `android` |
| Android Debug (staging) | `apps/mobile/debug.keystore.staging` | `androiddebugkey` | `android` |

Upload key SHA-1: `6A:77:3A:F7:80:44:DF:90:49:77:64:40:89:15:27:AB:8D:10:AE:26`

> **Security:** Never commit keystores or `gradle.properties.local` to git. They are in `.gitignore`.
