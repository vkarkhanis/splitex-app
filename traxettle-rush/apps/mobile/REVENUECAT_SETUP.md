# RevenueCat Integration — Setup Guide

This guide walks you through configuring RevenueCat for in-app purchases in the Traxettle mobile app.

## 1. RevenueCat Dashboard Setup

### 1.1 Create a Project
1. Log in to [RevenueCat Dashboard](https://app.revenuecat.com)
2. Click **+ New Project** → name it `Traxettle`

### 1.2 Add Platform Apps

#### Google Play (Android)
1. In your project, go to **Apps** → **+ New App** → select **Google Play**
2. Enter:
   - **App name**: `Traxettle Android`
   - **Package name**: `com.traxettle.app`
3. You'll need a **Google Play Service Account JSON** key:
   - Go to [Google Play Console](https://play.google.com/console) → **Setup** → **API access**
   - Create or link a service account with **Financial data** permission
   - Download the JSON key file
   - Upload it in RevenueCat under **Service Account credentials**

#### App Store (iOS)
1. In your project, go to **Apps** → **+ New App** → select **App Store**
2. Enter:
   - **App name**: `Traxettle iOS`
   - **Bundle ID**: `com.traxettle.app`
3. You'll need an **App Store Connect Shared Secret**:
   - Go to [App Store Connect](https://appstoreconnect.apple.com) → your app → **In-App Purchases** → **Manage**
   - Copy the **Shared Secret** (or generate one under **App Information**)
   - Paste it in RevenueCat

### 1.3 Get Your API Keys
1. In RevenueCat Dashboard → your project → **API Keys**
2. Copy the **Apple API Key** (starts with `appl_...`)
3. Copy the **Google API Key** (starts with `goog_...`)
4. These go in your environment configuration (see Section 3 below)

---

## 2. Store Product Setup

### 2.1 Google Play Console — In-App Product
1. Go to [Google Play Console](https://play.google.com/console) → your app
2. Navigate to **Monetize** → **In-app products**
3. Click **Create product**:
   - **Product ID**: `traxettle_pro_lifetime`
   - **Name**: `Traxettle Pro`
   - **Description**: `Unlock multi-currency settlement, analytics, unlimited groups, and more`
   - **Default price**: `₹199` (INR) — Google Play will auto-convert to ~$9.99 for other regions
4. **Activate** the product

### 2.2 App Store Connect — In-App Purchase
1. Go to [App Store Connect](https://appstoreconnect.apple.com) → your app
2. Navigate to **In-App Purchases** → **+** button
3. Select **Non-Consumable**:
   - **Reference Name**: `Traxettle Pro Lifetime`
   - **Product ID**: `traxettle_pro_lifetime`
   - **Price**: Tier 10 ($9.99 USD) — which maps to ₹199 INR
   - **Display Name**: `Traxettle Pro`
   - **Description**: `Unlock multi-currency settlement, analytics, unlimited groups, and more`
4. Submit for review

---

## 3. RevenueCat Entitlements & Offerings

### 3.1 Create an Entitlement
1. In RevenueCat Dashboard → **Entitlements** → **+ New**
2. **Identifier**: `pro` _(must match `REVENUECAT_PRO_ENTITLEMENT_ID` in env.ts)_
3. **Description**: `Pro tier — unlocks all premium features`
4. Attach the products from both stores:
   - `traxettle_pro_lifetime` (Google Play)
   - `traxettle_pro_lifetime` (App Store)

### 3.2 Create an Offering
1. In RevenueCat Dashboard → **Offerings** → **+ New**
2. **Identifier**: `default` _(must match `REVENUECAT_OFFERING_ID` in env.ts)_
3. Add a **Package**:
   - **Type**: `Lifetime`
   - Attach both store products (`traxettle_pro_lifetime`)
4. Set this offering as **Current**

---

## 4. Configure the Mobile App

### 4.1 Environment Variables

Add your API keys to the app. You have two options:

**Option A — Environment variables (recommended for CI/CD)**
```bash
EXPO_PUBLIC_REVENUECAT_APPLE_KEY=appl_YOUR_APPLE_KEY_HERE
EXPO_PUBLIC_REVENUECAT_GOOGLE_KEY=goog_YOUR_GOOGLE_KEY_HERE
```

**Option B — Hardcode in env.ts (for quick local testing)**

Edit `apps/mobile/src/config/env.ts`:
```typescript
REVENUECAT_APPLE_API_KEY:
  (process.env as any).EXPO_PUBLIC_REVENUECAT_APPLE_KEY || 'appl_YOUR_APPLE_KEY_HERE',
REVENUECAT_GOOGLE_API_KEY:
  (process.env as any).EXPO_PUBLIC_REVENUECAT_GOOGLE_KEY || 'goog_YOUR_GOOGLE_KEY_HERE',
```

### 4.2 Other Configurable Values

| Env Variable | Default | Description |
|---|---|---|
| `EXPO_PUBLIC_REVENUECAT_APPLE_KEY` | `''` | RevenueCat Apple API key |
| `EXPO_PUBLIC_REVENUECAT_GOOGLE_KEY` | `''` | RevenueCat Google API key |
| `EXPO_PUBLIC_REVENUECAT_PRO_ENTITLEMENT` | `pro` | Entitlement ID in RevenueCat |
| `EXPO_PUBLIC_REVENUECAT_OFFERING` | `default` | Offering ID in RevenueCat |

### 4.3 Install Dependencies
```bash
cd apps/mobile
rush update          # or: npm install
npx expo prebuild    # regenerate native projects with the new native module
```

---

## 5. Architecture Overview

```
┌─────────────────────────────────────────────┐
│  App.tsx                                     │
│  └─ ThemeProvider                            │
│     └─ AuthProvider (tier, capabilities)     │
│        └─ PurchaseProvider                   │
│           └─ NavigationContainer             │
│              ├─ DashboardScreen              │
│              │   └─ Pro upgrade banner       │
│              ├─ ProfileScreen                │
│              │   └─ Pro upgrade card         │
│              └─ ProUpgradeScreen             │
│                  └─ Paywall UI               │
│                     ├─ Purchase button       │
│                     └─ Restore button        │
└─────────────────────────────────────────────┘
```

### Key Files

| File | Purpose |
|---|---|
| `src/config/env.ts` | API keys and RevenueCat config |
| `src/services/purchases.ts` | RevenueCat SDK wrapper (init, purchase, restore, entitlements) |
| `src/context/PurchaseContext.tsx` | React context providing purchase state app-wide |
| `src/screens/ProUpgradeScreen.tsx` | Paywall screen with pricing, features, purchase/restore buttons |
| `src/screens/ProfileScreen.tsx` | Shows Pro status card or upgrade CTA |
| `src/screens/DashboardScreen.tsx` | Shows upgrade banner for free users |

### Flow

1. **App startup** → `PurchaseProvider` initialises RevenueCat SDK with the user's ID
2. **User navigates** to ProUpgradeScreen (via Dashboard banner or Profile card)
3. **User taps "Upgrade"** → `purchasePro()` calls RevenueCat SDK → native store payment sheet
4. **On success** → `isPro` set to `true` → UI updates across the app
5. **Restore** → `restorePurchases()` checks for previous purchases on this account/device

---

## 6. Testing

### 6.1 Google Play — License Testing
1. Go to Google Play Console → **Setup** → **License testing**
2. Add your test Gmail addresses
3. These accounts can purchase without being charged

### 6.2 App Store — Sandbox Testing
1. Go to App Store Connect → **Users and Access** → **Sandbox Testers**
2. Create a sandbox tester account
3. On your iOS device, sign into the sandbox account in Settings → App Store

### 6.3 RevenueCat Sandbox Mode
- RevenueCat automatically detects sandbox vs production
- In `__DEV__` mode, the SDK log level is set to `DEBUG` for verbose logging
- Check the RevenueCat Dashboard → **Customers** to see test purchases

---

## 7. Pricing Summary

| Region | Price | Type |
|---|---|---|
| India (INR) | ₹199 | One-time / Lifetime |
| US (USD) | $9.99 | One-time / Lifetime |
| Other regions | Auto-converted by stores | One-time / Lifetime |

> **Note**: This is a limited-time launch price. The price will increase based on adoption.
