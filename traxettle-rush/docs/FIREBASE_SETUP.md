# Firebase Setup Guide

Firebase provides authentication, database, storage, and hosting services for Traxettle.

## Overview

Traxettle uses three Firebase projects:
- **traxettle-test**: Local development
- **traxettle-staging**: Staging environment  
- **traxettle-prod**: Production environment

## Step-by-Step Setup

### 1. Create Firebase Projects

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Click "Add project"
3. Create three projects with these exact IDs:
   - `traxettle-test`
   - `traxettle-staging`
   - `traxettle-prod`

### 2. Enable Required Services

For each project, enable these services:

#### Authentication
1. Go to **Authentication** → **Sign-in method**
2. Enable **Google** provider
3. Add OAuth consent screen if prompted
4. Configure OAuth client IDs (see Environment Variables section)

#### Firestore Database
1. Go to **Firestore Database** → **Create database**
2. Choose **Production mode**
3. Select a location (choose one closest to your users)
4. Create database

#### Storage
1. Go to **Storage** → **Get started**
2. Select "Start in test mode"
3. Choose a location (same as Firestore)
4. Enable storage

#### App Hosting (Optional)
1. Go to **App Hosting** → **Get started**
2. Connect your GitHub repository
3. Configure build settings

### 3. Service Account Configuration

For each project, create a service account:

1. Go to **Project Settings** → **Service accounts**
2. Click **Generate new private key**
3. Select **Firebase Admin SDK**
4. Click **Generate key**
5. Download the JSON file
6. Rename and place in `apps/api/`:
   ```
   traxettle-test-service-account.json
   traxettle-staging-service-account.json
   traxettle-prod-service-account.json
   ```

### 4. Mobile App Configuration

#### Android Setup
1. In Firebase console, go to **Project Settings** → **General**
2. Under "Your apps", click **Android app**
3. Package name: `com.traxettle.app`
4. Download `google-services.json`
5. Place in `apps/mobile/android/app/`

#### iOS Setup
1. In Firebase console, add **iOS app**
2. Bundle ID: `com.traxettle.app`
3. Download `GoogleService-Info.plist`
4. Place in `apps/mobile/ios/`

### 5. Google OAuth Configuration

You need OAuth client IDs for Google Sign-In:

#### For Local Development
1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Select the `traxettle-test` project
3. Go to **APIs & Services** → **Credentials**
4. Create **OAuth 2.0 Client IDs**:
   - **Web application**: For local development
   - **Android**: For mobile app
   - **iOS**: For iOS app

#### Required Client IDs
You'll need these for environment variables:
- Web client ID (for web app)
- Android client ID (for Android app)
- iOS client ID (for iOS app)

### 6. Firestore Security Rules

Apply these security rules in Firebase Console → Firestore → Rules:

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
      allow create: if request.auth != null;
    }
    
    // Expense rules (similar to events)
    match /events/{eventId}/expenses/{expenseId} {
      allow read: if request.auth != null && 
        resource.data.participants.any(p => p.userId == request.auth.uid);
      allow write: if request.auth != null && 
        resource.data.participants.any(p => p.userId == request.auth.uid && p.role == 'admin');
      allow create: if request.auth != null;
    }
    
    // Group rules
    match /groups/{groupId} {
      allow read, write: if request.auth != null && 
        resource.data.members.any(m => m == request.auth.uid || 
          (resource.data.representative == request.auth.uid) ||
          (resource.data.createdBy == request.auth.uid));
    }
    
    // Settlement rules
    match /events/{eventId}/settlements/{settlementId} {
      allow read: if request.auth != null && 
        resource.data.participants.any(p => p.userId == request.auth.uid);
      allow write: if request.auth != null && 
        resource.data.participants.any(p => p.userId == request.auth.uid && p.role == 'admin');
    }
    
    // Invitation rules
    match /invitations/{invitationId} {
      allow read: if request.auth != null && 
        (resource.data.recipientEmail == request.auth.token.email ||
         resource.data.inviterId == request.auth.uid);
    }
  }
}
```

### 7. Storage Security Rules

Apply these storage security rules:

```javascript
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    // Users can upload to their own folder
    match /users/{userId}/{allPaths=**} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
    
    // Event-related files
    match /events/{eventId}/{allPaths=**} {
      allow read: if request.auth != null;
      allow write: if request.auth != null && 
        request.auth.uid == resource.metadata.createdBy;
    }
    
    // Profile pictures
    match /profiles/{userId}/avatar.jpg {
      allow read: if request.auth != null;
      allow write: if request.auth != null && request.auth.uid == userId;
    }
  }
}
```

### 8. Environment Variables

Add these to your environment files:

#### Backend (`apps/api/.env`)
```bash
# Firebase Admin SDK (use appropriate project ID)
FIREBASE_PROJECT_ID=traxettle-test  # or traxettle-staging, traxettle-prod
FIREBASE_CLIENT_EMAIL=firebase-adminsdk-xxxxx@traxettle-test.iam.gserviceaccount.com
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
FIREBASE_STORAGE_BUCKET=traxettle-test.firebasestorage.app
FIREBASE_WEB_API_KEY=your-web-api-key
```

#### Mobile (`apps/mobile/.env`)
```bash
# Google Sign-In (get from Firebase Console → Authentication → Google)
EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID=your-web-client-id
EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID=your-android-client-id
EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID=your-ios-client-id
```

### 9. Verification

Test your Firebase setup:

1. **Backend Test**:
   ```bash
   cd apps/api
   npm run dev
   # Check Firebase connection in logs
   ```

2. **Mobile Test**:
   ```bash
   cd apps/mobile
   npx expo start
   # Try Google Sign-In
   ```

3. **Web Test**:
   ```bash
   cd apps/web
   npm run dev
   # Try Google Sign-In
   ```

### 10. Production Considerations

For production (`traxettle-prod`):

1. **Enable App Check**: Add security to prevent abuse
2. **Configure Monitoring**: Set up Firebase Performance Monitoring
3. **Set Up Alerts**: Configure crash reporting and analytics alerts
4. **Backup Strategy**: Regular Firestore backups
5. **Cost Monitoring**: Monitor usage and set budgets

## Troubleshooting

### Common Issues

1. **Permission Denied**: Check service account permissions and security rules
2. **Invalid Credentials**: Verify OAuth client IDs match
3. **Network Issues**: Check Firebase project location and network settings
4. **Build Failures**: Ensure config files are in correct locations

### Debug Steps

1. Check Firebase console for errors
2. Verify service account key format
3. Test with Firebase emulator locally
4. Check network connectivity

## Next Steps

After Firebase setup:
1. Configure [RevenueCat](./REVENUECAT_SETUP.md)
2. Set up [Email](../SETUP.md#email-setup)
3. Configure [Build](../SETUP.md#build-configuration)
