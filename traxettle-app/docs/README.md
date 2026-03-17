# Traxettle Documentation

All project documentation is organized under this directory.

## Structure

```
docs/
├── deployment/          — Deploying to Cloud Run, Play Store, App Store
│   ├── scripts/         — Shell scripts for staging/production deploys
│   ├── DEPLOYMENT_RUNBOOK.md
│   ├── DEPLOYMENT_CHANNELS.md
│   └── FIRST_RELEASE_CHECKLIST.md
├── runbook/             — Running the app locally in different modes
│   └── LOCAL_DEVELOPMENT.md
└── utility/             — Reference docs for integrations and features
    ├── FIREBASE_SETUP.md
    ├── REVENUECAT_INTEGRATION_RUNBOOK.md
    ├── TIER_ENTITLEMENT_ENV_MATRIX.md
    ├── TIER_SWITCH_TESTING_GUIDE.md
    ├── SETTLEMENT_GATEWAY_TESTING_POLICY.md
    ├── PRO_FREE_IMPLEMENTATION_CHECKLIST.md
    ├── 01_SETTLEMENT_PROVIDER_RECOMMENDATION_AND_RUNBOOK.md
    ├── 02_DETAILED_CODE_CHANGES.md
    ├── DESIGN_DOCUMENT.md
    └── local-entitlement-test.sh
```

## Quick Links

### Getting Started
- **[Local Development](runbook/LOCAL_DEVELOPMENT.md)** — 6 run modes (emulator/real Firebase × web/mobile)
- **Doctor Tool UI** — guided, layman-friendly setup flow:
  - Start it from repo root: `cd traxettle-rush/tools/doctor-tool && npm run dev`
  - Then open the printed localhost URL in your browser

### Deploying
- **[Deployment Runbook](deployment/DEPLOYMENT_RUNBOOK.md)** — Full first-time deployment guide (Firebase, Cloud Run, EAS, stores)
- **[Deployment Channels](deployment/DEPLOYMENT_CHANNELS.md)** — Per-channel build & deploy commands (Web, Android, iOS)
- **[First Release Checklist](deployment/FIRST_RELEASE_CHECKLIST.md)** — Ordered checklist for initial release

### Reference
- **[Firebase Setup](utility/FIREBASE_SETUP.md)** — Auth, Firestore, Storage, service accounts, security rules
- **[RevenueCat Integration](utility/REVENUECAT_INTEGRATION_RUNBOOK.md)** — Webhook setup, entitlement mapping, smoke tests
- **[Tier Entitlement Matrix](utility/TIER_ENTITLEMENT_ENV_MATRIX.md)** — Free/Pro capabilities per environment
- **[Tier Switch Testing](utility/TIER_SWITCH_TESTING_GUIDE.md)** — How to test tier switching locally and in staging
- **[Settlement Gateway Policy](utility/SETTLEMENT_GATEWAY_TESTING_POLICY.md)** — Mock vs real payment safety controls
- **[Pro/Free Checklist](utility/PRO_FREE_IMPLEMENTATION_CHECKLIST.md)** — Implementation status for tier-based features
- **[Settlement Provider Guide](utility/01_SETTLEMENT_PROVIDER_RECOMMENDATION_AND_RUNBOOK.md)** — Razorpay (INR) + Stripe (intl) integration plan
- **[Settlement Code Changes](utility/02_DETAILED_CODE_CHANGES.md)** — Detailed code-level changes for payment integration
- **[Design Document](utility/DESIGN_DOCUMENT.md)** — Core application architecture and design decisions

## Current Auth Session Behavior

The app currently allows multi-device concurrent login. Signing in on one device does not automatically sign out another device.

### Multi-Device Behavior Matrix

| Action | Existing device session | New device session | Current behavior |
| --- | --- | --- | --- |
| Email/password login on device B while already logged in on device A | Remains active | New session is created | Both devices stay signed in |
| Google login on device B while already logged in on device A | Remains active | New session is created | Both devices stay signed in |
| Register on device B with the same email as an existing account | Remains active | Registration is rejected | User must log in instead |
| Google login on device B for an email that already has an email/password account | Remains active | Existing account is reused | Google is linked to the existing account instead of creating a duplicate |
| Logout on one device | That device signs out | Other active device sessions remain active unless all sessions are explicitly revoked | Single-device logout by default |
| Password change | Other existing sessions should be revoked as part of the security flow | User must re-authenticate on other devices | Sensitive credential change |

### Notes

- Backend login creates a separate `sessionId` per successful login, so multiple active sessions are supported by design.
- Duplicate registration for the same email is not supported.
- Account-linking behavior now prefers reusing an existing email account when the same email later signs in with Google.
- Session revocation is server-side for logout and sensitive actions, but the product does not currently enforce single-device-only login.
