# Firebase OAuth - Current Working Method (2024)

## ⚠️ **Important: OAuth Redirect Domain Field May Not Exist**

You're correct - many Firebase projects **don't show** the "OAuth redirect domain" field anymore. Here's the **current working method**:

## 🔧 **Method 1: Google Cloud Console (Recommended)**

### **Step 1: Access Google Cloud Console**
1. In Firebase Console → ⚙️ **Project Settings**
2. Scroll to bottom → Click **"Google Cloud Platform"** link
3. Or go directly: `https://console.cloud.google.com/`

### **Step 2: Find Your OAuth Credentials**
1. In Google Cloud Console → **"APIs & Services"** → **"Credentials"**
2. Look for **"OAuth 2.0 Client IDs"** section
3. Find the client named **"Web client"** (or similar)
4. Click on the client name to edit

### **Step 3: Add Authorized Domains**
Add these to **"Authorized JavaScript origins"**:
```
http://localhost:3000
https://localhost:3000
http://127.0.0.1:3000
https://your-production-domain.com
```

Add these to **"Authorized redirect URIs"**:
```
http://localhost:3000
https://localhost:3000
https://your-production-domain.com
```

## 🔧 **Method 2: Firebase Authentication Settings (Alternative)**

### **Step 1: Go to Authentication**
1. Firebase Console → **"Authentication"** → **"Sign-in method"**
2. Click on **"Google"** provider (if already enabled)

### **Step 2: Check Domain Settings**
Some projects show domains here:
- Look for **"Authorized domains"** section
- Add `localhost:3000` and your production domain

## 🚨 **If You Still Don't See OAuth Settings**

### **Create New OAuth Client**
1. In Google Cloud Console → **"APIs & Services"** → **"Credentials"**
2. Click **"+ CREATE CREDENTIALS"** → **"OAuth 2.0 client ID"**
3. Select **"Web application"**
4. Add authorized origins and URIs as above
5. Use the new client ID in your Firebase config

### **Update Firebase Config**
If you create a new OAuth client, update your Firebase config:
```javascript
// apps/web/src/config/firebase-client.ts
export const firebaseConfig = {
  apiKey: "your-api-key",
  authDomain: "your-project-id.firebaseapp.com",
  projectId: "your-project-id",
  // ... other config
};
```

## 🧪 **Test Your OAuth Setup**

### **Quick Test Script**
Create a test file to verify OAuth:
```javascript
// test-oauth.js
const firebaseConfig = {
  apiKey: "your-api-key",
  authDomain: "your-project-id.firebaseapp.com",
  projectId: "your-project-id",
};

// Test Google Sign-In
firebase.initializeApp(firebaseConfig);
const provider = new firebase.auth.GoogleAuthProvider();
firebase.auth().signInWithPopup(provider)
  .then(result => console.log("✅ OAuth works!"))
  .catch(error => console.error("❌ OAuth failed:", error));
```

## 🔍 **Troubleshooting Common Issues**

### **Issue: "redirect_uri_mismatch"**
- Domain not in authorized origins
- HTTP vs HTTPS mismatch
- Port number missing

### **Issue: "invalid_client"**
- OAuth client ID incorrect
- Client type wrong (should be "Web application")

### **Issue: "access_denied"**
- OAuth consent screen not configured
- Scopes not approved

## 📱 **Current Firebase OAuth Flow**

### **For Development (localhost)**
1. Add `http://localhost:3000` to both origins and URIs
2. Test with `rush dev:web`
3. Navigate to `http://localhost:3000`

### **For Production**
1. Add `https://yourdomain.com` to both origins and URIs
2. Ensure HTTPS is working
3. Test production OAuth flow

## 🎯 **Working Configuration Example**

**Google Cloud Console - OAuth 2.0 Client:**
```
Name: Web client (auto-created)
Type: Web application
Authorized JavaScript origins:
  - http://localhost:3000
  - https://yourdomain.com
Authorized redirect URIs:
  - http://localhost:3000
  - https://yourdomain.com
```

## 🚀 **Final Verification**

After setting up OAuth domains:

1. **Enable Google provider** in Firebase Authentication
2. **Add domains** in Google Cloud Console
3. **Test OAuth flow** in your app
4. **Check browser console** for any errors

If you still don't see OAuth settings, the **Google Cloud Console method** is the most reliable approach for modern Firebase projects.

---

**Key Point**: The "OAuth redirect domain" field in Firebase is being phased out. Use **Google Cloud Console → Credentials** for OAuth configuration.
