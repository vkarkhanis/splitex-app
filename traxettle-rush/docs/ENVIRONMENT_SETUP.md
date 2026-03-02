# Environment Variables Setup Guide

Complete configuration of all environment variables for Traxettle across different environments.

## Overview

Traxettle uses environment variables for:
- Firebase configuration
- API endpoints
- Email services
- RevenueCat
- Google Sign-In
- Feature flags

## Environment Files Structure

```
apps/
├── api/
│   ├── .env                 # Local development
│   ├── .env.local           # Local overrides
│   └── .env.production      # Production
├── web/
│   └── .env.local           # Web environment
└── mobile/
    └── .env                 # Mobile environment
```

## Backend Environment Variables

### `apps/api/.env` (Local Development)

```bash
# ===========================================
# FIREBASE ADMIN SDK CONFIGURATION
# ===========================================
FIREBASE_PROJECT_ID=traxettle-test
FIREBASE_CLIENT_EMAIL=firebase-adminsdk-xxxxx@traxettle-test.iam.gserviceaccount.com
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQC...\n-----END PRIVATE KEY-----\n"
FIREBASE_STORAGE_BUCKET=traxettle-test.firebasestorage.app
FIREBASE_WEB_API_KEY=AIzaSyxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

# ===========================================
# SERVER CONFIGURATION
# ===========================================
PORT=3001

# ===========================================
# EMAIL CONFIGURATION
# ===========================================
# Gmail Setup (Recommended for development)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-16-character-app-password
SMTP_FROM=Traxettle <noreply@traxettle.app>

# Alternative: SendGrid
# SMTP_HOST=smtp.sendgrid.net
# SMTP_PORT=587
# SMTP_USER=apikey
# SMTP_PASS=SG.xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
# SMTP_FROM=Traxettle <noreply@traxettle.app>

# ===========================================
# WEB APP CONFIGURATION
# ===========================================
APP_URL=http://localhost:3000

# Mobile Deep Links
MOBILE_APP_SCHEME=com.traxettle.app

# ===========================================
# AUTH EMAIL LINKS
# ===========================================
AUTH_EMAIL_LINK_CONTINUE_URL=http://localhost:3000/auth/email-link
AUTH_ANDROID_PACKAGE_NAME=com.traxettle.app
AUTH_ANDROID_MIN_VERSION=1
AUTH_IOS_BUNDLE_ID=com.traxettle.app
```

### `apps/api/.env.production` (Production)

```bash
# ===========================================
# FIREBASE ADMIN SDK CONFIGURATION
# ===========================================
FIREBASE_PROJECT_ID=traxettle-prod
FIREBASE_CLIENT_EMAIL=firebase-adminsdk-xxxxx@traxettle-prod.iam.gserviceaccount.com
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQC...\n-----END PRIVATE KEY-----\n"
FIREBASE_STORAGE_BUCKET=traxettle-prod.firebasestorage.app
FIREBASE_WEB_API_KEY=AIzaSyxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

# ===========================================
# SERVER CONFIGURATION
# ===========================================
PORT=3001

# ===========================================
# EMAIL CONFIGURATION (Production)
# ===========================================
SMTP_HOST=smtp.sendgrid.net
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=apikey
SMTP_PASS=SG.xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
SMTP_FROM=Traxettle <noreply@traxettle.app>

# ===========================================
# WEB APP CONFIGURATION
# ===========================================
APP_URL=https://traxettle.app

# Mobile Deep Links
MOBILE_APP_SCHEME=com.traxettle.app

# ===========================================
# AUTH EMAIL LINKS
# ===========================================
AUTH_EMAIL_LINK_CONTINUE_URL=https://traxettle.app/auth/email-link
AUTH_ANDROID_PACKAGE_NAME=com.traxettle.app
AUTH_ANDROID_MIN_VERSION=1
AUTH_IOS_BUNDLE_ID=com.traxettle.app
```

### `apps/api/.env.staging` (Staging)

```bash
# ===========================================
# FIREBASE ADMIN SDK CONFIGURATION
# ===========================================
FIREBASE_PROJECT_ID=traxettle-staging
FIREBASE_CLIENT_EMAIL=firebase-adminsdk-xxxxx@traxettle-staging.iam.gserviceaccount.com
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQC...\n-----END PRIVATE KEY-----\n"
FIREBASE_STORAGE_BUCKET=traxettle-staging.firebasestorage.app
FIREBASE_WEB_API_KEY=AIzaSyxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

# ===========================================
# SERVER CONFIGURATION
# ===========================================
PORT=3001

# ===========================================
# EMAIL CONFIGURATION
# ===========================================
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your-staging-email@gmail.com
SMTP_PASS=your-16-character-app-password
SMTP_FROM=Traxettle Staging <staging@traxettle.app>

# ===========================================
# WEB APP CONFIGURATION
# ===========================================
APP_URL=https://traxettle-staging.web.app

# Mobile Deep Links
MOBILE_APP_SCHEME=com.traxettle.app

# ===========================================
# AUTH EMAIL LINKS
# ===========================================
AUTH_EMAIL_LINK_CONTINUE_URL=https://staging.traxettle.app/auth/email-link
AUTH_ANDROID_PACKAGE_NAME=com.traxettle.app
AUTH_ANDROID_MIN_VERSION=1
AUTH_IOS_BUNDLE_ID=com.traxettle.app
```

## Mobile Environment Variables

### `apps/mobile/.env`

```bash
# ===========================================
# GOOGLE SIGN-IN CONFIGURATION
# ===========================================
# Get these from Firebase Console → Authentication → Google → Web SDK Configuration
EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID=368026022797-fbiqh6sgmcel4r6kblcg16tb3pa12nn1.apps.googleusercontent.com
EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID=368026022797-v07qjj1ns2j1lv7dka6rsds89besfiud.apps.googleusercontent.com
EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID=368026022797-j4ht8hs7kk6tqqh273q2ks89udmdc3pe.apps.googleusercontent.com

# ===========================================
# REVENUECAT CONFIGURATION
# ===========================================
# Get these from RevenueCat Dashboard → Project → API Keys
EXPO_PUBLIC_REVENUECAT_APPLE_KEY=appl_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
EXPO_PUBLIC_REVENUECAT_GOOGLE_KEY=goog_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

# RevenueCat Configuration (optional overrides)
EXPO_PUBLIC_REVENUECAT_PRO_ENTITLEMENT_ID=pro
EXPO_PUBLIC_REVENUECAT_OFFERING_ID=default

# ===========================================
# API CONFIGURATION
# ===========================================
# Override API URL for different environments
# EXPO_PUBLIC_API_URL=http://10.0.2.2:3001  # Android emulator
# EXPO_PUBLIC_API_URL=http://192.168.1.42:3001  # Real device on same WiFi
# EXPO_PUBLIC_API_URL=https://traxettle-api-staging-lomxjapdhq-uc.a.run.app  # Staging
# EXPO_PUBLIC_API_URL=https://api.traxettle.app  # Production

# ===========================================
# FEATURE FLAGS
# ===========================================
# Enable real payments (false for development/testing)
EXPO_PUBLIC_USE_REAL_PAYMENTS=false

# Default user tier for testing
EXPO_PUBLIC_DEFAULT_TIER=free

# Enable internal features for testing
EXPO_PUBLIC_INTERNAL_FEATURES_ENABLED=false

# Enable local dev options
EXPO_PUBLIC_LOCAL_DEV_OPTIONS_ENABLED=true
```

## Web Environment Variables

### `apps/web/.env.local`

```bash
# ===========================================
# API CONFIGURATION
# ===========================================
# Local development
NEXT_PUBLIC_API_URL=http://localhost:3001

# Staging
# NEXT_PUBLIC_API_URL=https://traxettle-api-staging-lomxjapdhq-uc.a.run.app

# Production
# NEXT_PUBLIC_API_URL=https://api.traxettle.app

# ===========================================
# FIREBASE CLIENT CONFIGURATION
# ===========================================
# Get these from Firebase Console → Project Settings → General → Your apps → Web app
NEXT_PUBLIC_FIREBASE_API_KEY=AIzaSyxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=traxettle-test.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=traxettle-test
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=traxettle-test.appspot.com
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=123456789012
NEXT_PUBLIC_FIREBASE_APP_ID=1:123456789012:web:abcdef1234567890

# ===========================================
# GOOGLE SIGN-IN
# ===========================================
NEXT_PUBLIC_GOOGLE_CLIENT_ID=368026022797-fbiqh6sgmcel4r6kblcg16tb3pa12nn1.apps.googleusercontent.com
```

## Environment-Specific Values

### Firebase Project IDs

| Environment | Project ID | Console URL |
|------------|-------------|-------------|
| Local | `traxettle-test` | https://console.firebase.google.com/project/traxettle-test |
| Staging | `traxettle-staging` | https://console.firebase.google.com/project/traxettle-staging |
| Production | `traxettle-prod` | https://console.firebase.google.com/project/traxettle-prod |

### API URLs

| Environment | Backend URL | Web URL |
|------------|-------------|----------|
| Local | `http://localhost:3001` | `http://localhost:3000` |
| Staging | `https://traxettle-api-staging-lomxjapdhq-uc.a.run.app` | `https://traxettle-staging.web.app` |
| Production | `https://api.traxettle.app` | `https://traxettle.app` |

### Google OAuth Client IDs

Each Firebase project has its own set of OAuth client IDs:

#### traxettle-test (Local)
- Web: `368026022797-fbiqh6sgmcel4r6kblcg16tb3pa12nn1.apps.googleusercontent.com`
- Android: `368026022797-v07qjj1ns2j1lv7dka6rsds89besfiud.apps.googleusercontent.com`
- iOS: `368026022797-j4ht8hs7kk6tqqh273q2ks89udmdc3pe.apps.googleusercontent.com`

#### traxettle-staging (Staging)
- Web: `943648574702-n7h4msh3iho1187po0dnc8tja7insc89.apps.googleusercontent.com`
- Android: `943648574702-0qk99r3oql0sv3k4h6cgluffdqs7letj.apps.googleusercontent.com`
- iOS: `943648574702-cvgj086ppdcbqgcagrekjs4pekn0q1ok.apps.googleusercontent.com`

#### traxettle-prod (Production)
- Generate new client IDs for production project

## Security Best Practices

### 1. Never Commit Secrets

Add these to `.gitignore`:
```
.env
.env.local
.env.production
*.key
*.keystore
service-account*.json
google-services.json
GoogleService-Info.plist
```

### 2. Use Environment-Specific Files

- `.env` for local development
- `.env.staging` for staging
- `.env.production` for production

### 3. Secure Key Storage

Store sensitive values securely:
- Use password managers for API keys
- Use Firebase service account keys only on servers
- Rotate keys regularly

### 4. Validate Environment Variables

Add validation in your application code:

```javascript
// apps/api/src/config/env.ts
const requiredVars = [
  'FIREBASE_PROJECT_ID',
  'FIREBASE_CLIENT_EMAIL',
  'FIREBASE_PRIVATE_KEY'
];

for (const varName of requiredVars) {
  if (!process.env[varName]) {
    throw new Error(`Missing required environment variable: ${varName}`);
  }
}
```

## Environment Switching

### Development Workflow

1. **Local Development**:
   ```bash
   cp apps/api/.env.example apps/api/.env
   # Edit .env with local values
   ```

2. **Staging Deployment**:
   ```bash
   cp apps/api/.env.staging apps/api/.env.production
   # Deploy with staging configuration
   ```

3. **Production Deployment**:
   ```bash
   cp apps/api/.env.production apps/api/.env.production
   # Deploy with production configuration
   ```

### Mobile Environment Switching

For mobile, use build scripts or Expo EAS:

```bash
# Staging build
bash scripts/build-android.sh debug:staging

# Production build
bash scripts/build-android.sh release:production
```

## Troubleshooting

### Common Issues

1. **Environment variables not loading**:
   - Check file names and locations
   - Verify syntax (no spaces around =)
   - Restart application after changes

2. **Firebase authentication failing**:
   - Verify project ID matches Firebase console
   - Check service account key format
   - Ensure correct OAuth client IDs

3. **Email not sending**:
   - Verify SMTP credentials
   - Check app-specific password for Gmail
   - Test SMTP connection

4. **Build failures**:
   - Check all required variables are set
   - Verify certificate and keystore paths
   - Test with doctor script

### Debug Commands

```bash
# Check environment variables
env | grep FIREBASE
env | grep SMTP
env | grep REVENUECAT

# Test Firebase connection
cd apps/api && npm run test:firebase

# Test email configuration
cd apps/api && npm run test:email

# Test mobile build
cd apps/mobile && bash scripts/build-android.sh debug:staging
```

## Verification

Test your environment setup:

```bash
# Run doctor script
node doctor.js local    # Test local setup
node doctor.js staging  # Test staging setup
node doctor.js production  # Test production setup

# Test individual services
cd apps/api && npm run dev      # Test backend
cd apps/web && npm run dev      # Test web
cd apps/mobile && npx expo start  # Test mobile
```

## Next Steps

After environment setup:
1. Run [Doctor Script](../doctor.js) to verify all dependencies
2. Complete [Firebase Setup](./FIREBASE_SETUP.md)
3. Configure [RevenueCat](./REVENUECAT_SETUP.md)
4. Set up [Build Process](../SETUP.md#build-configuration)
