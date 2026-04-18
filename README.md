# Traxettle

Traxettle is a shared-expense coordination app for trips, households, outings, teams, and any other situation where multiple people spend money together and need a clean way to split, review, and settle up.

This repository contains:
- [traxettle-rush](/Users/vkarkhanis/workspace/Traxettle/traxettle-rush): the active monorepo with the web app, mobile app, API, doctor tool, scripts, shared libraries, and tests
- [traxettle-app/docs](/Users/vkarkhanis/workspace/Traxettle/traxettle-app/docs): the product, deployment, and utility documentation set

## Functional Overview

Traxettle is built around `events`.

An event can represent:
- a trip
- a home or apartment
- a wedding or celebration
- a work outing
- a club, team, or recurring shared-spend group

Within an event, users can:
- invite participants
- create optional sub-groups
- add expenses
- split those expenses across individuals or groups
- review final balances
- generate a settlement plan
- track whether people have paid and whether the payee has confirmed receipt

### Core User Journey

1. A user creates an event.
2. They invite people into the event.
3. Participants add expenses in the event currency.
4. Traxettle keeps track of who paid, who owes, and who belongs to which group.
5. When the event is ready, Traxettle generates a settlement plan that minimizes the number of payment legs.
6. Participants approve the settlement review state.
7. Payments happen and are tracked until the event is fully settled.
8. The event can then move to settled/closed history.

### What The App Does Well

Traxettle is not just a basic bill splitter. Functionally, it supports:

- multi-user event collaboration
- event-level participant management
- optional group-based splitting inside an event
- manual and weighted split scenarios
- settlement review before payment begins
- unsettled payment tracking
- invitation management
- closed-event history
- exports and email-based history delivery
- payment-method details on user profiles so payers know how to pay the right person

### Authentication And Access

The app supports:
- email/password
- Google sign-in
- provider-aware account behavior
- session refresh and session revocation
- mobile quick-unlock security features such as PIN / biometrics

The product currently allows concurrent sessions across devices. Logging in on one device does not automatically log out another.

### Settlement Behavior

Traxettle separates `subscription purchase` from `event settlement`.

For mobile subscriptions:
- Android uses Google Play Billing
- iOS uses the Apple in-app purchase path

For event settlement:
- the default production behavior remains the legacy/manual model
- users pay outside the app using any method they want
- then mark the settlement as paid inside Traxettle
- the payee confirms receipt inside Traxettle

Optional gateway-based settlement code exists for pilot use, but it is intentionally hidden by default behind a feature flag.

## Product Surfaces

### Web App

The web app provides:
- authentication
- dashboard
- event creation and management
- expense management
- invitations
- closed events
- unsettled payments
- profile management
- guided onboarding tour

### Mobile App

The mobile app provides:
- authentication
- dashboard and event management
- expense creation/editing
- invitations
- closed events
- unsettled payments
- profile and local security controls
- guided onboarding walkthrough
- environment switching for controlled testing builds

### API

The API is the main backend for:
- auth flows
- user profile and entitlement state
- event/expense/group/invitation flows
- settlement generation and status transitions
- email flows
- payment-provider pilot endpoints
- runtime configuration for clients

## Where To Find Documentation

All maintained documentation lives under:

- [traxettle-app/docs](/Users/vkarkhanis/workspace/Traxettle/traxettle-app/docs)

Best starting points:

- [Deployment Runbook](/Users/vkarkhanis/workspace/Traxettle/traxettle-app/docs/deployment/DEPLOYMENT_RUNBOOK.md)
- [First Release Checklist](/Users/vkarkhanis/workspace/Traxettle/traxettle-app/docs/deployment/FIRST_RELEASE_CHECKLIST.md)
- [Local Development](/Users/vkarkhanis/workspace/Traxettle/traxettle-app/docs/runbook/LOCAL_DEVELOPMENT.md)
- [Firebase Setup](/Users/vkarkhanis/workspace/Traxettle/traxettle-app/docs/utility/FIREBASE_SETUP.md)
- [RevenueCat Integration Runbook](/Users/vkarkhanis/workspace/Traxettle/traxettle-app/docs/utility/REVENUECAT_INTEGRATION_RUNBOOK.md)
- [Settlement Gateway Testing Policy](/Users/vkarkhanis/workspace/Traxettle/traxettle-app/docs/utility/SETTLEMENT_GATEWAY_TESTING_POLICY.md)

The docs index is here:

- [docs/README.md](/Users/vkarkhanis/workspace/Traxettle/traxettle-app/docs/README.md)

## Doctor Tool

The doctor tool is the guided setup/checking experience for this project.

It helps with:
- local environment validation
- Firebase setup orientation
- staging/production deployment prep
- web/mobile/backend prerequisites
- store and release setup guidance

### Run The Doctor UI

From repo root:

```bash
cd /Users/vkarkhanis/workspace/Traxettle/traxettle-rush/tools/doctor-tool
npm run dev
```

Then open the printed localhost URL in your browser.

### Run The CLI Doctor

From repo root:

```bash
cd /Users/vkarkhanis/workspace/Traxettle/traxettle-rush
bash scripts/doctor.sh local --non-interactive
bash scripts/doctor.sh staging --non-interactive
bash scripts/doctor.sh production --non-interactive
```

Use the environment that matches what you are validating.

## Developer Section

### Monorepo Layout

Inside [traxettle-rush](/Users/vkarkhanis/workspace/Traxettle/traxettle-rush):

- `apps/web` — Next.js web application
- `apps/mobile` — React Native / Expo mobile application
- `apps/api` — Express API backend
- `libraries/shared` — shared types and core shared models
- `libraries/ui` — shared UI building blocks
- `tools/doctor-tool` — guided setup and validation tool
- `scripts` — local-dev, deployment, verification, and utility scripts

### Key Product/Engineering Notes

- The mobile release strategy intentionally supports the same bundle being promoted from closed testing to production.
- Production is the default runtime target for released mobile builds.
- A hidden 7-tap developer switch can move the runtime environment to staging for testing.
- Environment switching now requires app re-bootstrap so Firebase project selection stays aligned.
- Manual settlement is the default user-facing flow.
- Settlement gateway pilot support is controlled by:
  - `SETTLEMENT_GATEWAY_PILOT_ENABLED`
- When that flag is off:
  - only manual settlement is exposed
  - Razorpay and BillDesk settlement options stay hidden

### Important Distinctions

- `Google Play Billing / Apple IAP` are for app subscriptions such as `Pro`.
- `Razorpay / BillDesk settlement` are separate from store subscriptions.
- Do not treat settlement gateway integration as a substitute for mobile store billing.

### Helpful Commands

From [traxettle-rush](/Users/vkarkhanis/workspace/Traxettle/traxettle-rush):

```bash
# Doctor
bash scripts/doctor.sh local --non-interactive

# Mobile typecheck
cd apps/mobile && npm run typecheck

# Web typecheck
cd apps/web && npm run typecheck

# API typecheck
cd apps/api && npm run typecheck
```

### Documentation For Developers

If you are joining the project or returning after some time, read these first:

- [docs index](/Users/vkarkhanis/workspace/Traxettle/traxettle-app/docs/README.md)
- [deployment runbook](/Users/vkarkhanis/workspace/Traxettle/traxettle-app/docs/deployment/DEPLOYMENT_RUNBOOK.md)
- [local development runbook](/Users/vkarkhanis/workspace/Traxettle/traxettle-app/docs/runbook/LOCAL_DEVELOPMENT.md)
- [design document](/Users/vkarkhanis/workspace/Traxettle/traxettle-app/docs/utility/DESIGN_DOCUMENT.md)

## Summary

Traxettle is a shared-expense coordination product with strong event-based collaboration, settlement review, invitation handling, historical reporting, and multi-surface support across web, mobile, and API. For setup, deployment, and operational detail, use the documentation under [traxettle-app/docs](/Users/vkarkhanis/workspace/Traxettle/traxettle-app/docs) and the doctor tool in [traxettle-rush/tools/doctor-tool](/Users/vkarkhanis/workspace/Traxettle/traxettle-rush/tools/doctor-tool).
