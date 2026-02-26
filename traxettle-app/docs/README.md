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
