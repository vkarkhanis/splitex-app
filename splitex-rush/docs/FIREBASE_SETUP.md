# Firebase Configuration Guide for Splitex

This comprehensive guide will walk you through setting up Firebase for the Splitex expense splitting application, covering all required services: Authentication, Firestore Database, and Storage.

## 📋 Table of Contents

1. [Prerequisites](#prerequisites)
2. [Firebase Project Setup](#firebase-project-setup)
3. [Authentication Configuration](#authentication-configuration)
4. [Firestore Database Setup](#firestore-database-setup)
5. [Storage Configuration](#storage-configuration)
6. [Service Account Setup](#service-account-setup)
7. [Environment Configuration](#environment-configuration)
8. [Testing Your Configuration](#testing-your-configuration)
9. [Mock vs Production Mode](#mock-vs-production-mode)
10. [Troubleshooting](#troubleshooting)

## 🚀 Prerequisites

- Google account with access to [Firebase Console](https://console.firebase.google.com/)
- Node.js 24+ installed
- Splitex project cloned and `rush update` completed

## 🏗️ Firebase Project Setup

### Step 1: Create Firebase Project

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Click **"Add project"**
3. Enter project name: `splitex-[your-name]` (e.g., `splitex-john-doe`)
4. Choose your preferred Google Analytics account (optional)
5. Click **"Create project"**
6. Wait for project creation (usually takes 1-2 minutes)

### Step 2: Enable Required Services

Once your project is created, enable these services:

#### 2.1 Authentication
1. In the Firebase Console, go to **"Authentication"** in the left sidebar
2. Click **"Get started"**
3. Enable **"Phone"** authentication:
   - Click on **"Phone"** in the sign-in providers list
   - Enable it and click **"Save"**
4. Enable **"Google"** authentication:
   - Click on **"Google"** in the sign-in providers list
   - Enable it and provide your authorized domain (e.g., `localhost:3000`)
   - Click **"Save"**
5. Enable **"Microsoft"** authentication (optional):
   - Click on **"Microsoft"** in the sign-in providers list
   - Enable it and configure OAuth consent screen if prompted
   - Click **"Save"**

#### 2.2 Firestore Database
1. Go to **"Firestore Database"** in the left sidebar
2. Click **"Create database"**
3. Choose **"Start in test mode"** (allows read/write access for 30 days)
4. Select a location (choose the closest to your users)
5. Click **"Create database"**

#### 2.3 Storage
1. Go to **"Storage"** in the left sidebar
2. Click **"Get started"**
3. Choose **"Start in test mode"**
4. Select the same location as your Firestore database
5. Click **"Done"**

## 🔐 Authentication Configuration

### Phone Authentication Setup

1. In Firebase Console → Authentication → Sign-in method
2. Enable **"Phone"** provider
3. No additional configuration needed for development

### Google OAuth Setup

1. In Firebase Console → Authentication → Sign-in method
2. Enable **"Google"** provider
3. Add authorized domains:
   - `localhost:3000` (development)
   - `yourdomain.com` (production)
4. Provide your project support email
5. Click **"Save"**

### Microsoft OAuth Setup (Optional)

1. In Firebase Console → Authentication → Sign-in method
2. Enable **"Microsoft"** provider
3. Follow the OAuth consent screen setup
4. Add authorized domains as above

## 🗄️ Firestore Database Setup

### Security Rules

1. Go to **Firestore Database → Rules**
2. Replace default rules with:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Users can read/write their own data
    match /users/{userId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
    
    // Events: users can read events they're part of
    match /events/{eventId} {
      allow read, write: if request.auth != null && 
        resource.data.participants.keys().hasAll([request.auth.uid]);
    }
    
    // Expenses: users can read/write expenses for events they're part of
    match /expenses/{expenseId} {
      allow read, write: if request.auth != null && 
        firestore.get(/databases/$(database)/documents/events/$(resource.data.eventId))
        .data.participants.keys().hasAll([request.auth.uid]);
    }
    
    // Settlements: similar to expenses
    match /settlements/{settlementId} {
      allow read, write: if request.auth != null && 
        firestore.get(/databases/$(database)/documents/events/$(resource.data.eventId))
        .data.participants.keys().hasAll([request.auth.uid]);
    }
  }
}
```

3. Click **"Publish"**

### Indexes

The application will automatically create required indexes as needed. You'll see index creation links in the Firebase Console errors when queries are run.

## 📁 Storage Configuration

### Security Rules

1. Go to **Storage → Rules**
2. Replace default rules with:

```javascript
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    // Users can upload to their own folder
    match /users/{userId}/{allPaths=**} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
    
    // Event-related files (receipts, etc.)
    match /events/{eventId}/{allPaths=**} {
      allow read, write: if request.auth != null && 
        firestore.get(/databases/$(database)/documents/events/$(eventId))
        .data.participants.keys().hasAll([request.auth.uid]);
    }
  }
}
```

3. Click **"Publish"**

## 🔑 Service Account Setup

### Step 1: Generate Service Account Key

1. In Firebase Console, click **⚙️ Project Settings** (gear icon)
2. Go to **"Service accounts"** tab
3. Click **"Generate new private key"**
4. Select **JSON** format
5. Click **"Create"**
6. **Save this file securely** - it contains sensitive credentials

### Step 2: Extract Configuration Values

Open the downloaded JSON file. You'll need these values:

```json
{
  "project_id": "your-project-id",
  "private_key": "-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n",
  "client_email": "your-service-account@your-project-id.iam.gserviceaccount.com"
}
```

## ⚙️ Environment Configuration

### Step 1: Create Environment File

1. Copy the example environment file:
```bash
cp .env.example .env.local
```

2. Update `.env.local` with your Firebase credentials:

```env
# Firebase Configuration
FIREBASE_PROJECT_ID=your-project-id-here
FIREBASE_CLIENT_EMAIL=your-service-account@your-project-id.iam.gserviceaccount.com
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----
YOUR_PRIVATE_KEY_HERE
-----END PRIVATE KEY-----"
FIREBASE_STORAGE_BUCKET=your-project-id.appspot.com

# JWT Configuration
JWT_SECRET=your-super-secret-jwt-key-change-this-in-production
JWT_REFRESH_SECRET=your-super-secret-refresh-key-change-this-in-production

# API Configuration
PORT=3001
NODE_ENV=development

# Development
DEV_MODE=true
```

### Step 2: Web App Firebase Configuration

For the web app, you'll need client-side Firebase config:

1. In Firebase Console → Project Settings → General
2. Scroll to **"Your apps"** section
3. Click **Web app** (</>) icon
4. Give it a name: "Splitex Web"
5. Click **"Register app"**
6. Copy the Firebase configuration object

Create `apps/web/src/config/firebase-client.ts`:

```typescript
export const firebaseConfig = {
  apiKey: "your-api-key",
  authDomain: "your-project-id.firebaseapp.com",
  projectId: "your-project-id",
  storageBucket: "your-project-id.appspot.com",
  messagingSenderId: "your-sender-id",
  appId: "your-app-id"
};
```

## 🧪 Testing Your Configuration

### Test API Configuration

1. Start the API server:
```bash
rush dev:api
```

2. Test the health endpoint:
```bash
curl http://localhost:3001/health
```

3. Test authentication:
```bash
# Send OTP
curl -X POST http://localhost:3001/api/auth/send-otp \
  -H "Content-Type: application/json" \
  -d '{"phoneNumber": "+1234567890"}'

# Verify OTP
curl -X POST http://localhost:3001/api/auth/verify-otp \
  -H "Content-Type: application/json" \
  -d '{"phoneNumber": "+1234567890", "otp": "123456"}'
```

### Test Web App Configuration

1. Start the web app:
```bash
rush dev:web
```

2. Open `http://localhost:3000` in your browser
3. Try the authentication flows

## 🎭 Mock vs Production Mode

The application supports two modes:

### Mock Mode (Development)
- Uses mock Firebase services
- No real Firebase credentials needed
- Perfect for development and testing
- Enabled when Firebase credentials are missing

### Production Mode
- Uses real Firebase services
- Requires valid Firebase configuration
- Enabled when all Firebase credentials are provided

### Switching Modes

**To enable Mock Mode:**
```bash
# Remove or comment out Firebase credentials in .env.local
# FIREBASE_PRIVATE_KEY=""
```

**To enable Production Mode:**
```bash
# Ensure all Firebase credentials are properly set in .env.local
FIREBASE_PROJECT_ID=your-project-id
FIREBASE_CLIENT_EMAIL=your-service-account@your-project-id.iam.gserviceaccount.com
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----..."
```

## 🔧 Troubleshooting

### Common Issues

#### 1. "Service account object must contain a string 'project_id' property"
**Solution:** Ensure `FIREBASE_PROJECT_ID` is set correctly in `.env.local`

#### 2. "The default Firebase app does not exist"
**Solution:** Check that all Firebase environment variables are set and the service account key is valid

#### 3. "Permission denied" errors
**Solution:** Update Firestore and Storage security rules to allow proper access

#### 4. "Invalid credentials" in OAuth flows
**Solution:** Ensure authorized domains are correctly configured in Firebase Authentication settings

#### 5. Web app shows 404 errors
**Solution:** Ensure the web app is running with `--webpack` flag and Next.js configuration is correct

### Debug Mode

Enable debug logging by setting:
```env
DEBUG=firebase*
```

### Getting Help

1. Check Firebase Console logs
2. Review browser console for client-side errors
3. Check API server logs for backend errors
4. Verify environment variables are loaded correctly

## 📚 Additional Resources

- [Firebase Documentation](https://firebase.google.com/docs)
- [Firebase Admin SDK for Node.js](https://firebase.google.com/docs/admin/setup)
- [Firebase Authentication](https://firebase.google.com/docs/auth)
- [Firestore Security Rules](https://firebase.google.com/docs/firestore/security/get-started)
- [Firebase Storage Security Rules](https://firebase.google.com/docs/storage/security)

## 🎯 Next Steps

After completing Firebase setup:

1. Test all authentication flows
2. Verify database operations work correctly
3. Test file upload functionality
4. Configure production environment variables
5. Set up monitoring and error tracking

---

**Note:** Never commit your service account key or `.env.local` file to version control. Add them to `.gitignore` immediately.
