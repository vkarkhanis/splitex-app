# Traxettle Complete Setup Guide

This guide covers all dependencies and setup steps for Traxettle across all environments (local, staging, production).

## Quick Start

Run the doctor script to check your environment:
```bash
node doctor.js [environment]
```

Environments: `local`, `staging`, `production`

## Table of Contents

1. [System Requirements](#system-requirements)
2. [Firebase Setup](#firebase-setup)
3. [RevenueCat Setup](#revenuecat-setup)
4. [Email Setup](#email-setup)
5. [Android Setup](#android-setup)
6. [iOS Setup](#ios-setup)
7. [Environment Variables](#environment-variables)
8. [Build Configuration](#build-configuration)

## System Requirements

### Required Software
- **Node.js** v24+ (required by Rush.js)
- **pnpm** latest (required by Rush.js)
- **Git** latest
- **Java** JDK 17+ (for Android builds)
- **Android SDK** (for Android builds)
- **Xcode** 15+ (for iOS builds, macOS only)

### Installation Commands

#### macOS
```bash
# Install Node.js via nvm (recommended)
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash
nvm install 24
nvm use 24

# Install pnpm
npm install -g pnpm

# Install Java (for Android)
brew install openjdk@17

# Install Android SDK
brew install --cask android-studio
# OR
brew install --cask android-commandlinetools

# Install Xcode (from App Store)
# Then install command line tools
xcode-select --install
```

#### Linux (Ubuntu/Debian)
```bash
# Install Node.js via nvm
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash
source ~/.bashrc
nvm install 24
nvm use 24

# Install pnpm
npm install -g pnpm

# Install Java
sudo apt update
sudo apt install openjdk-17-jdk

# Install Android SDK
sudo apt install android-sdk
```

#### Windows
```bash
# Install Node.js from https://nodejs.org (v24+ LTS)
# Install pnpm
npm install -g pnpm

# Install Java JDK 17+ from https://adoptium.net/
# Install Android Studio from https://developer.android.com/studio
```

## Firebase Setup

Firebase is required for authentication, storage, and backend services.

### 1. Create Firebase Projects

Create three separate Firebase projects:

| Environment | Project ID | Purpose |
|------------|------------|---------|
| Local | `traxettle-test` | Development/testing |
| Staging | `traxettle-staging` | Staging environment |
| Production | `traxettle-prod` | Production environment |

Visit https://console.firebase.google.com/ and create each project.

### 2. Enable Firebase Services

For each project, enable these services:

#### Authentication
- Go to Authentication → Sign-in method
- Enable **Google** provider
- Add your OAuth client IDs (see Environment Variables section)

#### Firestore Database
- Go to Firestore Database → Create database
- Choose **Production mode**
- Select a location (choose one closest to your users)

#### Storage
- Go to Storage → Get started
- Follow the setup wizard
- Configure security rules (see below)

#### App Hosting (Optional)
- For production web hosting

### 3. Service Account Keys

For each project, generate a service account key:

1. Go to Project Settings → Service accounts
2. Click "Generate new private key"
3. Select "Firebase Admin SDK"
4. Generate and download the JSON file
5. Rename and place in `apps/api/`:
   - `traxettle-test-service-account.json`
   - `traxettle-staging-service-account.json`
   - `traxettle-prod-service-account.json`

### 4. Mobile App Configuration

#### Android
1. In Firebase console, go to Project Settings → General
2. Under "Your apps", click Android app
3. Package name: `com.traxettle.app`
4. Download `google-services.json`
5. Place in `apps/mobile/android/app/`

#### iOS
1. In Firebase console, add iOS app
2. Bundle ID: `com.traxettle.app`
3. Download `GoogleService-Info.plist`
4. Place in `apps/mobile/ios/`

### 5. Firestore Security Rules

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Users can read/write their own documents
    match /users/{userId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
    
    // Event participants can read events they're part of
    match /events/{eventId} {
      allow read: if request.auth != null && 
        resource.data.participants.any(p => p.userId == request.auth.uid);
      allow write: if request.auth != null && 
        resource.data.participants.any(p => p.userId == request.auth.uid && p.role == 'admin');
    }
    
    // Expense rules (similar to events)
    match /events/{eventId}/expenses/{expenseId} {
      allow read: if request.auth != null && 
        resource.data.participants.any(p => p.userId == request.auth.uid);
    }
  }
}
```

## RevenueCat Setup

RevenueCat handles in-app purchases and subscriptions.

### 1. Create RevenueCat Account

1. Sign up at https://www.revenuecat.com/
2. Create a new project: "Traxettle"

### 2. Configure Products

#### Entitlements
1. Go to Entitlements → Create Entitlement
2. **Identifier**: `pro`
3. **Name**: "Pro Features"
4. **Products**: Add your product IDs

#### Offerings
1. Go to Offerings → Create Offering
2. **Identifier**: `default`
3. **Name**: "Standard"
4. Add your products to this offering

#### Products
Create these products in both stores:

| Store | Product ID | Type | Price |
|-------|------------|------|-------|
| Google Play | `traxettle_pro_lifetime` | Non-consumable | ₹199 (INR) / $9.99 (USD) |
| App Store | `traxettle_pro_lifetime` | Non-consumable | ₹199 (INR) / $9.99 (USD) |

### 3. Get API Keys

1. Go to Project Settings → API Keys
2. Create keys for:
   - **Apple**: iOS App Store
   - **Google**: Google Play Store

### 4. Configure in App

Add these environment variables (see Environment Variables section):
- `EXPO_PUBLIC_REVENUECAT_APPLE_KEY`
- `EXPO_PUBLIC_REVENUECAT_GOOGLE_KEY`

## Email Setup

Email notifications use SMTP. You can use Gmail, SendGrid, or any SMTP provider.

### Gmail Setup (Recommended for Development)

1. **Enable 2-Factor Authentication** on your Google account
2. **Generate App-Specific Password**:
   - Go to https://myaccount.google.com/apppasswords
   - Select "Mail" on "Device: Other (Custom name)"
   - Enter "Traxettle" as the name
   - Copy the 16-character password
3. **Configure Environment Variables** (see below)

### SendGrid Setup (Recommended for Production)

1. Sign up at https://sendgrid.com/
2. Verify your sender domain
3. Create an API key
4. Configure environment variables

### Custom SMTP

Any SMTP provider works. Configure these variables:
- `SMTP_HOST`
- `SMTP_PORT`
- `SMTP_USER`
- `SMTP_PASS`
- `SMTP_FROM`

## Android Setup

### 1. Install Android SDK

#### Option A: Android Studio (Recommended)
1. Download Android Studio from https://developer.android.com/studio
2. Install and open Android Studio
3. Go to SDK Manager → SDK Platforms
4. Install Android API 34 (Android 14)
5. Go to SDK Manager → SDK Tools
6. Install:
   - Android SDK Build-Tools 34.0.0
   - Android SDK Command-line Tools
   - Android SDK Platform-Tools

#### Option B: Command Line Tools
1. Download command-line tools from https://developer.android.com/studio/command-line-tools
2. Extract and add to PATH
3. Run `sdkmanager "platform-tools" "platforms;android-34"`

### 2. Configure Environment

Add to your shell profile (~/.zshrc or ~/.bashrc):
```bash
export ANDROID_HOME=$HOME/Library/Android/sdk  # macOS
export ANDROID_HOME=$HOME/Android/Sdk          # Linux
export ANDROID_SDK_ROOT=$ANDROID_HOME
export PATH=$PATH:$ANDROID_HOME/emulator
export PATH=$PATH:$ANDROID_HOME/tools
export PATH=$PATH:$ANDROID_HOME/tools/bin
export PATH=$PATH:$ANDROID_HOME/platform-tools
```

### 3. Generate Keystore

For release builds, generate a keystore:

```bash
cd apps/mobile/android/app
keytool -genkeypair -v -storetype PKCS12 -keystore traxettle-release-key.keystore -alias traxettle-key -keyalg RSA -keysize 2048 -validity 10000
```

**Important**: Store the keystore password and key password securely!

### 4. Configure Signing

Create `apps/mobile/android/gradle.properties.local`:
```properties
RELEASE_STORE_FILE=traxettle-release-key.keystore
RELEASE_STORE_PASSWORD=your_keystore_password
RELEASE_KEY_ALIAS=traxettle-key
RELEASE_KEY_PASSWORD=your_key_password
```

### 5. Create Virtual Device

```bash
# List available system images
sdkmanager --list

# Install system image
sdkmanager "system-images;android-34;google_apis;x86_64"

# Create virtual device
avdmanager create avd -n traxettle-emulator -k "system-images;android-34;google_apis;x86_64"

# Start emulator
emulator -avd traxettle-emulator
```

## iOS Setup

### 1. Install Xcode

1. Install Xcode from Mac App Store (version 15+)
2. Install command line tools:
   ```bash
   xcode-select --install
   ```

### 2. Configure Xcode

1. Open Xcode
2. Go to Preferences → Accounts
3. Add your Apple Developer account
4. Go to Preferences → Locations
5. Select Command Line Tools

### 3. Provisioning Profiles

For App Store distribution:

1. Go to Apple Developer Portal
2. Create App ID: `com.traxettle.app`
3. Create Development and Distribution provisioning profiles
4. Download and install in Xcode

### 4. Build Settings

Open `apps/mobile/ios/Traxettle.xcworkspace` in Xcode:
1. Select project → Traxettle target
2. Set Bundle Identifier to `com.traxettle.app`
3. Set Team to your developer account
4. Configure signing certificates

## Environment Variables

### Backend Environment Variables

Create `apps/api/.env` (or `.env.local`, `.env.production`):

```bash
# Firebase Admin SDK
FIREBASE_PROJECT_ID=traxettle-test  # or traxettle-staging, traxettle-prod
FIREBASE_CLIENT_EMAIL=firebase-adminsdk-xxxxx@traxettle-test.iam.gserviceaccount.com
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
FIREBASE_STORAGE_BUCKET=traxettle-test.firebasestorage.app
FIREBASE_WEB_API_KEY=your-web-api-key

# Server
PORT=3001

# Email Configuration
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-specific-password
SMTP_FROM=Traxettle <noreply@traxettle.app>

# Web App URL
APP_URL=https://traxettle-staging.web.app  # staging
# APP_URL=https://traxettle.app  # production

# Mobile Deep Links
MOBILE_APP_SCHEME=com.traxettle.app

# Auth Email Links
AUTH_EMAIL_LINK_CONTINUE_URL=https://staging.traxettle.app/auth/email-link
AUTH_ANDROID_PACKAGE_NAME=com.traxettle.app
AUTH_ANDROID_MIN_VERSION=1
AUTH_IOS_BUNDLE_ID=com.traxettle.app
```

### Mobile Environment Variables

Create `apps/mobile/.env`:

```bash
# Google Sign-In (get from Firebase Console → Authentication → Google)
EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID=your-web-client-id
EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID=your-android-client-id
EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID=your-ios-client-id

# RevenueCat
EXPO_PUBLIC_REVENUECAT_APPLE_KEY=your-revenuecat-apple-key
EXPO_PUBLIC_REVENUECAT_GOOGLE_KEY=your-revenuecat-google-key
EXPO_PUBLIC_REVENUECAT_PRO_ENTITLEMENT_ID=pro
EXPO_PUBLIC_REVENUECAT_OFFERING_ID=default

# Optional Overrides
EXPO_PUBLIC_API_URL=http://localhost:3001  # for local development
EXPO_PUBLIC_USE_REAL_PAYMENTS=false
EXPO_PUBLIC_DEFAULT_TIER=free
```

### Web Environment Variables

Create `apps/web/.env.local`:

```bash
# API URL
NEXT_PUBLIC_API_URL=http://localhost:3001  # local
# NEXT_PUBLIC_API_URL=https://traxettle-api-staging-lomxjapdhq-uc.a.run.app  # staging
# NEXT_PUBLIC_API_URL=https://api.traxettle.app  # production
```

## Build Configuration

### Backend Build

```bash
cd apps/api
npm run build
npm start
```

### Web Build

```bash
cd apps/web
npm run build
npm start
```

### Mobile Build

#### Android
```bash
cd apps/mobile
# Development build
bash scripts/build-android.sh debug:staging

# Production build
bash scripts/build-android.sh release:production
```

#### iOS
```bash
cd apps/mobile
# Development build
npx expo run:ios

# Production build (via Xcode)
# Open ios/Traxettle.xcworkspace in Xcode
# Product → Archive
```

## Verification

After completing setup, run the doctor script:

```bash
# Check local environment
node doctor.js local

# Check staging environment
node doctor.js staging

# Check production environment
node doctor.js production
```

The script will verify all dependencies and attempt test builds.

## Troubleshooting

### Common Issues

1. **Node.js version too old**: Upgrade to v24+
2. **Android SDK not found**: Check ANDROID_HOME environment variable
3. **Firebase permission denied**: Verify service account key and permissions
4. **Build fails on iOS**: Check Xcode command line tools selection
5. **Email not sending**: Verify SMTP credentials and app-specific passwords

### Getting Help

- Check the [doctor script output](#verification) for specific issues
- Review environment-specific documentation
- Check Firebase console for configuration issues
- Verify all environment variables are set correctly

## Next Steps

Once all dependencies are verified:

1. **Start Backend**: `cd apps/api && npm run dev`
2. **Start Web**: `cd apps/web && npm run dev`
3. **Start Mobile**: `cd apps/mobile && npx expo start`
4. **Run Tests**: `rush test`
5. **Deploy**: Follow deployment guides for your target environment
