# Splitex First Release Checklist

Use this checklist for your very first Internal/TestFlight/Production rollout.

Primary runbook:

- `/Users/vkarkhanis/workspace/Splitex/splitex-app/deployment/DEPLOYMENT_RUNBOOK.md`

## 1) Accounts and Console Access

- [ ] Apple Developer Program account is active
- [ ] App Store Connect access is available
- [ ] Google Play Console account is active
- [ ] Firebase Console access is available
- [ ] GCP project owner/editor access is available
- [ ] EAS account access is available (`eas whoami`)

## 2) One-Time App Records

- [ ] App record exists in App Store Connect for bundle ID `com.splitex.app`
- [ ] App record exists in Play Console for package `com.splitex.app`
- [ ] Internal tester emails/groups are prepared (Apple + Google)
- [ ] Privacy policy URL is ready
- [ ] Support URL/email is ready

## 3) Local Tooling and Auth

- [ ] `gcloud`, `firebase`, `eas`, `rush` available on machine
- [ ] `gcloud auth login` completed
- [ ] `firebase login` completed
- [ ] `eas login` completed

## 4) Repo and Build Baseline

- [ ] `rush update` completed in `/Users/vkarkhanis/workspace/Splitex/splitex-rush`
- [ ] `rush build:shared` passes
- [ ] `rush build:api` passes
- [ ] `Dockerfile` exists at `/Users/vkarkhanis/workspace/Splitex/splitex-rush/Dockerfile`
- [ ] `.dockerignore` exists at `/Users/vkarkhanis/workspace/Splitex/splitex-rush/.dockerignore`

## 5) Firebase Projects (Staging + Production)

- [ ] `splitex-staging` Firebase project created
- [ ] `splitex-prod` Firebase project created
- [ ] Auth enabled in both (Google at minimum)
- [ ] Firestore enabled in both
- [ ] Storage enabled in both
- [ ] Service account JSON downloaded for both environments

## 6) Mobile Firebase Registration

For both environments:

- [ ] Android app registered in Firebase (`com.splitex.app`)
- [ ] iOS app registered in Firebase (`com.splitex.app`)
- [ ] SHA fingerprints configured for Android signing certs
- [ ] `google-services.json` downloaded
- [ ] `GoogleService-Info.plist` downloaded
- [ ] (If using passwordless) Firebase Auth has Email/Password + Email link enabled

## 7) Staging API Deployment

- [ ] Open `/Users/vkarkhanis/workspace/Splitex/splitex-app/deployment/scripts/deploy-staging.sh`
- [ ] Fill all `CHANGE_ME_*` placeholders
- [ ] `FIREBASE_PRIVATE_KEY_FILE` points to staging service-account JSON or PEM
- [ ] (If using passwordless) `FIREBASE_WEB_API_KEY` and `AUTH_*` email-link vars set in script
- [ ] Run:

```bash
bash /Users/vkarkhanis/workspace/Splitex/splitex-app/deployment/scripts/deploy-staging.sh
```

- [ ] Health check succeeds (`/health`)
- [ ] If custom domain used, DNS records are added and SSL is active

## 8) Staging Mobile Build + Internal Distribution

- [ ] Copy staging Firebase files into mobile project:

```bash
cp <STAGING_GOOGLE_SERVICES_JSON> /Users/vkarkhanis/workspace/Splitex/splitex-rush/apps/mobile/google-services.json
cp <STAGING_GOOGLESERVICE_INFO_PLIST> /Users/vkarkhanis/workspace/Splitex/splitex-rush/apps/mobile/ios/Splitex/GoogleService-Info.plist
```

- [ ] Build iOS staging artifact:

```bash
cd /Users/vkarkhanis/workspace/Splitex/splitex-rush/apps/mobile
EXPO_PUBLIC_API_URL=https://api-staging.splitex.app \
EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID=<STAGING_WEB_CLIENT_ID> \
EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID=<STAGING_ANDROID_CLIENT_ID> \
EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID=<STAGING_IOS_CLIENT_ID> \
eas build --platform ios --profile staging
```

- [ ] Submit iOS build:

```bash
eas submit --platform ios --latest
```

- [ ] Build Android staging artifact:

```bash
EXPO_PUBLIC_API_URL=https://api-staging.splitex.app \
EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID=<STAGING_WEB_CLIENT_ID> \
EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID=<STAGING_ANDROID_CLIENT_ID> \
EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID=<STAGING_IOS_CLIENT_ID> \
eas build --platform android --profile staging
```

- [ ] Submit Android build:

```bash
eas submit --platform android --latest
```

- [ ] TestFlight testers added and invited
- [ ] Play Internal testing rollout created and testers added
- [ ] End-to-end smoke test passes on both platforms

## 9) Production API Deployment

- [ ] Open `/Users/vkarkhanis/workspace/Splitex/splitex-app/deployment/scripts/deploy-prod.sh`
- [ ] Fill all `CHANGE_ME_*` placeholders
- [ ] `FIREBASE_PRIVATE_KEY_FILE` points to prod service-account JSON or PEM
- [ ] (If using passwordless) `FIREBASE_WEB_API_KEY` and `AUTH_*` email-link vars set in script
- [ ] Run:

```bash
bash /Users/vkarkhanis/workspace/Splitex/splitex-app/deployment/scripts/deploy-prod.sh
```

- [ ] Health check succeeds (`https://api.splitex.app/health`)

## 10) Production Mobile Build + Store Submission

- [ ] Copy production Firebase files into mobile project:

```bash
cp <PROD_GOOGLE_SERVICES_JSON> /Users/vkarkhanis/workspace/Splitex/splitex-rush/apps/mobile/google-services.json
cp <PROD_GOOGLESERVICE_INFO_PLIST> /Users/vkarkhanis/workspace/Splitex/splitex-rush/apps/mobile/ios/Splitex/GoogleService-Info.plist
```

- [ ] Build and submit iOS production:

```bash
cd /Users/vkarkhanis/workspace/Splitex/splitex-rush/apps/mobile
EXPO_PUBLIC_API_URL=https://api.splitex.app \
EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID=<PROD_WEB_CLIENT_ID> \
EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID=<PROD_ANDROID_CLIENT_ID> \
EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID=<PROD_IOS_CLIENT_ID> \
eas build --platform ios --profile production

eas submit --platform ios --latest
```

- [ ] Build and submit Android production:

```bash
EXPO_PUBLIC_API_URL=https://api.splitex.app \
EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID=<PROD_WEB_CLIENT_ID> \
EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID=<PROD_ANDROID_CLIENT_ID> \
EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID=<PROD_IOS_CLIENT_ID> \
eas build --platform android --profile production

eas submit --platform android --latest
```

- [ ] Select build for release in App Store Connect
- [ ] Roll out release to Production track in Play Console

## 11) Post-Release Verification

- [ ] `/health` endpoint healthy
- [ ] Login/Google sign-in works in production app
- [ ] Event creation/expense creation works
- [ ] Invitation links point to correct `APP_URL`
- [ ] No critical errors in Cloud Run logs

## 12) Security Final Check

- [ ] No secrets committed in git
- [ ] Staging and production Firebase/JWT secrets are different
- [ ] API keys are restricted in Google Cloud Console
- [ ] If credentials were ever exposed in repo history, all affected keys are rotated
