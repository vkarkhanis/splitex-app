# RevenueCat Integration — Setup Guide

This guide walks you through configuring RevenueCat for in-app purchases in the Traxettle mobile app.

## RevenueCat Dashboard Setup

### Create a Project
- Log in to [RevenueCat Dashboard](https://app.revenuecat.com)
- Click **+ New Project** → name it `Traxettle`

### Add Platform Apps

#### Google Play (Android)
- In your project, go to **Apps** → **+ New App** → select **Google Play**
- Enter **App name**: `Traxettle Android`, **Package name**: `com.traxettle.app`
- You'll need a **Google Play Service Account JSON** key:
  - Go to [Google Play Console](https://play.google.com/console) → **Setup** → **API access**
  - Create or link a service account with **Financial data** permission
  - Download the JSON key file
  - Upload it in RevenueCat under **Service Account credentials**

#### App Store (iOS)
- In your project, go to **Apps** → **+ New App** → select **App Store**
- Enter **App name**: `Traxettle iOS`, **Bundle ID**: `com.traxettle.app`
- You'll need an **App Store Connect Shared Secret**:
  - Go to [App Store Connect](https://appstoreconnect.apple.com) → your app → **In-App Purchases** → **Manage**
  - Copy the **Shared Secret** (or generate one under **App Information**)
  - Paste it in RevenueCat

### Get Your API Keys
- In RevenueCat Dashboard → your project → **API Keys**
- Copy the **Apple API Key** (starts with `appl_...`)
- Copy the **Google API Key** (starts with `goog_...`)
- These go in your environment configuration (see Section 3 below)

---

## Store Product Setup

### Google Play Console — In-App Product
- Go to [Google Play Console](https://play.google.com/console) → your app
- Navigate to **Monetize** → **In-app products**
- Click **Create product**:
  - **Product ID**: `traxettle_pro_lifetime`
  - **Name**: `Traxettle Pro`
  - **Description**: `Unlock multi-currency settlement, analytics, unlimited groups, and more`
  - **Default price**: `₹199` (INR) — Google Play will auto-convert to ~$9.99 for other regions
- **Activate** the product

### App Store Connect — In-App Purchase
- Go to [App Store Connect](https://appstoreconnect.apple.com) → your app
- Navigate to **In-App Purchases** → **+** button
- Select **Non-Consumable**:
  - **Reference Name**: `Traxettle Pro Lifetime`
  - **Product ID**: `traxettle_pro_lifetime`
  - **Price**: Tier 10 ($9.99 USD) — which maps to ₹199 INR
  - **Display Name**: `Traxettle Pro`
  - **Description**: `Unlock multi-currency settlement, analytics, unlimited groups, and more`
- Submit for review

---

## RevenueCat Entitlements & Offerings

### Create an Entitlement
- In RevenueCat Dashboard → **Entitlements** → **+ New**
- **Identifier**: `pro` _(must match `REVENUECAT_PRO_ENTITLEMENT_ID` in env.ts)_
- **Description**: `Pro tier — unlocks all premium features`
- Attach the products from both stores:
  - `traxettle_pro_lifetime` (Google Play)
  - `traxettle_pro_lifetime` (App Store)

### Create an Offering
- In RevenueCat Dashboard → **Offerings** → **+ New**
- **Identifier**: `default` _(must match `REVENUECAT_OFFERING_ID` in env.ts)_
- Add a **Package**:
  - **Type**: `Lifetime`
  - Attach both store products (`traxettle_pro_lifetime`)
- Set this offering as **Current**

---

## Configure the Mobile App

### Environment Variables
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

### Other Configurable Values
| Env Variable | Default | Description |
|---|---|---|
| `EXPO_PUBLIC_REVENUECAT_APPLE_KEY` | `''` | RevenueCat Apple API key |
| `EXPO_PUBLIC_REVENUECAT_GOOGLE_KEY` | `''` | RevenueCat Google API key |
| `EXPO_PUBLIC_REVENUECAT_PRO_ENTITLEMENT` | `pro` | Entitlement ID in RevenueCat |
| `EXPO_PUBLIC_REVENUECAT_OFFERING` | `default` | Offering ID in RevenueCat |

### Install Dependencies
```bash
cd apps/mobile
rush update          # or: npm install
npx expo prebuild    # regenerate native projects with the new native module
```

---

## Architecture Overview

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
- **App startup** → `PurchaseProvider` initialises RevenueCat SDK with the user's ID
- **User navigates** to ProUpgradeScreen (via Dashboard banner or Profile card)
- **User taps "Upgrade"** → `purchasePro()` calls RevenueCat SDK → native store payment sheet
- **On success** → `isPro` set to `true` → UI updates across the app
- **Restore** → `restorePurchases()` checks for previous purchases on this account/device

---

## Testing

### Google Play — License Testing
- Go to Google Play Console → **Setup** → **License testing**
- Add your test Gmail addresses
- These accounts can purchase without being charged

### App Store — Sandbox Testing
- Go to App Store Connect → **Users and Access** → **Sandbox Testers**
- Create a sandbox tester account
- On your iOS device, sign into the sandbox account in Settings → App Store

### RevenueCat Sandbox Mode
- RevenueCat automatically detects sandbox vs production
- In `__DEV__` mode, the SDK log level is set to `DEBUG` for verbose logging
- Check the RevenueCat Dashboard → **Customers** to see test purchases

---

## Pricing Summary

| Region | Price | Type |
|---|---|---|
| India (INR) | ₹299/year | Subscription |
| US (USD) | $4.99 | Subscription |
| Other regions | Auto-converted by stores | One-time / Lifetime |

> **Note**: This is a limited-time launch price. The price will increase based on adoption.
