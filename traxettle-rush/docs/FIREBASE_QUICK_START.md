# Firebase Quick Start Guide

This is a condensed version of the Firebase setup for developers who want to get started quickly.

## 🚀 5-Minute Setup

### Step 1: Create Firebase Project
1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Click "Add project" → Name it `traxettle-[your-name]`
3. Enable Authentication, Firestore, and Storage (all in test mode)

### Step 2: Get Backend Credentials
1. Project Settings → Service Accounts → "Generate new private key"
2. Download the JSON file
3. Copy these values to your `.env.local`:

```env
FIREBASE_PROJECT_ID=your-project-id
FIREBASE_CLIENT_EMAIL=service-account@project-id.iam.gserviceaccount.com
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
FIREBASE_STORAGE_BUCKET=your-project-id.appspot.com
```

### Step 3: Get Frontend Credentials
1. Project Settings → General → "Your apps" → Web app (</>)
2. Name it "Traxettle Web"
3. Copy the config to `.env.local`:

```env
NEXT_PUBLIC_FIREBASE_API_KEY=your-api-key
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=project-id.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=project-id
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=project-id.appspot.com
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=sender-id
NEXT_PUBLIC_FIREBASE_APP_ID=app-id
```

### Step 4: Update JWT Secrets
```env
JWT_SECRET=your-super-secret-jwt-key
JWT_REFRESH_SECRET=your-super-secret-refresh-key
```

### Step 5: Test Configuration
```bash
# Install dependencies
rush update

# Build project
rush build

# Start services
rush dev:api &
rush dev:web &

# Test API
curl http://localhost:3001/health
```

## 🎯 Enable Authentication Methods

In Firebase Console → Authentication → Sign-in method:

✅ **Phone** - Enable (no config needed)  
✅ **Google** - Enable, add `localhost:3000` to authorized domains  
✅ **Microsoft** - Optional, similar setup

## 🔐 Security Rules (Optional)

For production, update these rules:

**Firestore Rules:**
```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{userId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
    // Add more rules as needed
  }
}
```

**Storage Rules:**
```javascript
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    match /users/{userId}/{allPaths=**} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
  }
}
```

## 🧪 Mock Mode (Development)

If you want to develop without Firebase:

1. Remove/comment Firebase credentials in `.env.local`
2. The app will automatically use mock services
3. Add real credentials when ready

## ✅ Verification Commands

```bash
# Test API health
curl http://localhost:3001/health

# Test OTP sending
curl -X POST http://localhost:3001/api/auth/send-otp \
  -H "Content-Type: application/json" \
  -d '{"phoneNumber": "+1234567890"}'

# Check web app
curl -I http://localhost:3000
```

## 🔧 Troubleshooting

**"Firebase app does not exist"** → Check environment variables  
**"Permission denied"** → Update security rules  
**"Invalid credentials"** → Verify OAuth domains in Firebase Console  

---

**For detailed setup, see [FIREBASE_SETUP.md](./FIREBASE_SETUP.md)**
