# Firebase Microsoft OAuth - Complete Setup Guide

## 🔍 **Microsoft OAuth Consent Screen Setup**

The Microsoft OAuth setup requires creating an app in **Azure Active Directory** (now Microsoft Entra ID). Here's the complete process:

## 📋 **Step-by-Step Microsoft OAuth Setup**

### **Step 1: Go to Microsoft Azure Portal**
1. Navigate to: `https://portal.azure.com/`
2. Sign in with your Microsoft account
3. If you don't have an Azure subscription, you can create a free account

### **Step 2: Create Azure Active Directory App**
1. In Azure Portal, search for **"Azure Active Directory"** or **"Microsoft Entra ID"**
2. Click on **"App registrations"** in the left sidebar
3. Click **"+ New registration"**

### **Step 3: Configure App Registration**
1. **Name**: `Splitex Web App` (or your app name)
2. **Supported account types**: Choose one:
   - **"Accounts in any organizational directory (Any Azure AD directory - Multitenant)"** (recommended for public apps)
   - **"Accounts in this organizational directory only"** (if you have Azure AD)
3. **Redirect URI**: 
   - Select **"Web"**
   - Enter: `https://your-project-id.firebaseapp.com/__/auth/handler`
   - For development: `http://localhost:3000`
4. Click **"Register"**

### **Step 4: Get App Credentials**
After registration, you'll see:
1. **Application (client) ID** - Copy this
2. **Directory (tenant) ID** - Copy this
3. Click **"Certificates & secrets"** to create a client secret

### **Step 5: Create Client Secret**
1. In **"Certificates & secrets"** tab
2. Click **"+ New client secret"**
3. **Description**: `Splitex Firebase Secret`
4. **Expires**: Choose your preference (6 months, 12 months, etc.)
5. Click **"Add"**
6. **IMPORTANT**: Copy the secret **immediately** - it won't be shown again

### **Step 6: Configure API Permissions**
1. Go to **"API permissions"** tab
2. Click **"+ Add a permission"**
3. Select **"Microsoft Graph"**
4. Choose **"Delegated permissions"**
5. Add these permissions:
   - `email` - View user's email address
   - `openid` - Sign users in
   - `profile` - View user's basic profile
6. Click **"Add permissions"**
7. Click **"Grant admin consent for [Your Directory]"** (if available)

### **Step 7: Configure Firebase Microsoft Provider**
1. Go back to **Firebase Console**
2. **Authentication** → **"Sign-in method"**
3. Click **"Microsoft"** provider
4. **Enable** the toggle
5. **Client ID**: Paste the Application (client) ID from Azure
6. **Client Secret**: Paste the client secret you created
7. **Tenant ID**: Paste the Directory (tenant) ID from Azure
8. **Authorized domains**: Add `localhost:3000` and your production domain
9. Click **"Save"**

## 🔧 **Alternative: Use Microsoft Quick Start**

### **Microsoft Identity Platform Quick Start**
1. Go to: `https://docs.microsoft.com/en-us/azure/active-directory/develop/quickstart-register-app`
2. Follow the guided setup
3. This will create the app registration with proper redirect URIs

## 🚨 **Common Issues & Solutions**

### **Issue: "AADSTS700016: Application not found"**
- Check if Application ID is correct
- Verify the app is registered in the correct tenant

### **Issue: "AADSTS50011: The reply address does not match"**
- Redirect URI doesn't match what's configured in Azure
- Make sure to use the exact Firebase redirect URI

### **Issue: "AADSTS65001: The user or administrator has not consented"**
- Need to grant admin consent for API permissions
- Or users need to consent on first login

### **Issue: "AADSTS50034: No user account found"**
- User account doesn't exist in the selected tenant
- Try with "Accounts in any organizational directory"

## 📱 **Testing Microsoft OAuth**

### **Development Testing**
```bash
# Make sure your redirect URI includes localhost
# In Azure App Registration:
# Redirect URI: http://localhost:3000
```

### **Test Flow**
1. Start your app: `rush dev:web`
2. Navigate to `http://localhost:3000`
3. Click "Sign in with Microsoft"
4. Should redirect to Microsoft login
5. After login, should redirect back to your app

## 🎯 **Complete Configuration Checklist**

### **Azure Portal Setup**
- [ ] App registration created
- [ ] Redirect URI configured (`http://localhost:3000`)
- [ ] Client secret created and saved
- [ ] API permissions added (email, openid, profile)
- [ ] Admin consent granted (if required)

### **Firebase Setup**
- [ ] Microsoft provider enabled
- [ ] Client ID entered
- [ ] Client Secret entered
- [ ] Tenant ID entered
- [ ] Authorized domains added

### **Testing**
- [ ] OAuth flow works in development
- [ ] OAuth flow works in production
- [ ] User profile data received correctly

## 🔍 **Finding Your Azure Information**

### **Where to Find Each Value**
1. **Application (client) ID**: App registration overview page
2. **Directory (tenant) ID**: App registration overview page
3. **Client Secret**: Certificates & secrets tab
4. **Redirect URI**: Authentication section in app registration

## 🚀 **Quick Start Values**

For testing, you can use these values:
```
Name: Splitex Web App
Supported account types: Accounts in any organizational directory
Redirect URI: http://localhost:3000
API Permissions: email, openid, profile
```

---

**Note**: Microsoft OAuth setup is more complex than Google because it requires Azure Active Directory configuration. The key is creating the app registration first in Azure, then connecting it to Firebase.
