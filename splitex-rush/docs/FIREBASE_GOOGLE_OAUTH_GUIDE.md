# Firebase Google OAuth - Authorized Domains Setup

## 🔍 **Where to Find Authorized Domains**

The authorized domains setting for Google OAuth is **not** in the Authentication section where you enable the provider. Here's the exact location:

## 📋 **Step-by-Step Guide**

### **Step 1: Go to Project Settings**
1. In Firebase Console, click the **⚙️ Gear icon** (Project Settings) in the left sidebar
2. Or go directly: `https://console.firebase.google.com/project/YOUR-PROJECT-ID/settings`

### **Step 2: Find OAuth Redirect Domain**
1. In Project Settings, scroll down to the **"Your apps"** section
2. Find your Web app (the one you registered earlier)
3. Click on the app to expand its configuration
4. Look for **"OAuth redirect domain"** or **"Authorized domains"**

### **Step 3: Add Your Domains**
Add these domains:
```
localhost:3000
localhost
127.0.0.1:3000
your-production-domain.com
```

## 🎯 **Alternative Method: Google Cloud Console**

If you can't find it in Firebase, you can also set it in Google Cloud Console:

### **Step 1: Go to Google Cloud Console**
1. In Firebase Console, click the **⚙️ Gear icon** → "Project settings"
2. Click the **"Google Cloud Platform"** link at the bottom
3. Or go directly: `https://console.cloud.google.com/`

### **Step 2: Navigate to APIs & Services**
1. In the left sidebar, go to **"APIs & Services"** → **"Credentials"**
2. Find your **OAuth 2.0 Client ID** (usually named "Web client")

### **Step 3: Add Authorized JavaScript Origins**
1. Click on your OAuth client ID
2. Under **"Authorized JavaScript origins"**, click **"+ ADD URI"**
3. Add:
   - `http://localhost:3000`
   - `https://your-production-domain.com`

### **Step 4: Add Authorized Redirect URIs**
1. Under **"Authorized redirect URIs"**, click **"+ ADD URI"**
2. Add:
   - `http://localhost:3000`
   - `https://your-production-domain.com`

## 🔧 **Troubleshooting**

### **Issue: "redirect_uri_mismatch" Error**
This means the domain you're using is not authorized. Add it to both places above.

### **Issue: Can't Find OAuth Settings**
1. Make sure you have **enabled Google provider** in Firebase Authentication
2. Check that you're looking at the **correct project** in Google Cloud Console
3. Verify your OAuth client ID exists

### **Issue: Development vs Production**
- **Development**: Use `localhost:3000` or `127.0.0.1:3000`
- **Production**: Use your actual domain with HTTPS

## 📱 **Testing Your OAuth Setup**

### **Test in Development**
```bash
# Start your app from monorepo root
rush dev:web

# Navigate to
http://localhost:3000
```

### **Test OAuth Flow**
1. Click "Sign in with Google"
2. Should redirect to Google consent screen
3. After approval, should redirect back to your app

## 🔄 **Common OAuth Redirect URIs**

For Firebase Web Apps, the redirect URI is typically:
```
http://localhost:3000
https://your-domain.com
https://your-domain.firebaseapp.com
```

## 📊 **Complete OAuth Configuration Checklist**

- [ ] Google provider enabled in Firebase Authentication
- [ ] OAuth redirect domain added in Firebase Project Settings
- [ ] Authorized JavaScript origins added in Google Cloud Console
- [ ] Authorized redirect URIs added in Google Cloud Console
- [ ] Support email configured in Firebase Authentication
- [ ] Test OAuth flow works in development
- [ ] Test OAuth flow works in production

## 🚀 **Quick Fix**

If you're still having trouble, here's the fastest way:

1. **Go to Google Cloud Console**: `https://console.cloud.google.com/`
2. **Select your project** (same as Firebase project)
3. **Navigate to**: "APIs & Services" → "Credentials"
4. **Find your Web OAuth client** (usually named after your Firebase app)
5. **Add these to "Authorized JavaScript origins"**:
   - `http://localhost:3000`
   - `https://localhost:3000`
6. **Add these to "Authorized redirect URIs"**:
   - `http://localhost:3000`
   - `https://localhost:3000`

This should resolve the OAuth redirect issue immediately!

---

**Note**: Firebase sometimes syncs slowly with Google Cloud Console. If you make changes in Google Cloud Console, it might take a few minutes to reflect in Firebase.
