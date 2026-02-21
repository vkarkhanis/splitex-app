# Tier Entitlement Environment Matrix

## Modes

| Environment | Tier Switch (Mobile) | Tier Switch (Web) | Source of Truth | Notes |
|---|---|---|---|---|
| Local | Enabled (when internal features flag is on) | Enabled (local-only flag) | API + manual override | Used for development validation |
| Staging/Internal | Enabled (internal testers only) | Disabled | API + RevenueCat sandbox | Web is read-only for tier switching |
| TestFlight (staging backend) | Enabled (internal testers only) | Disabled | API + RevenueCat sandbox | Mobile-only switch for controlled QA |
| Production | Disabled | Disabled | RevenueCat live webhook | No manual switch paths |

## Capability Rules

| Capability | Free | Pro Active/Grace | Pro Expired/Revoked |
|---|---|---|---|
| Multi-currency settlement (FX event creation/update) | Denied | Allowed | Denied |
| 3 active/closed event cap | Enforced | Bypassed | Enforced when no active Pro |

## Required Flags

- `APP_ENV`
- `INTERNAL_TIER_SWITCH_ENABLED`
- `PAYMENT_GATEWAY_MODE`
- `PAYMENT_ALLOW_REAL_IN_NON_PROD`
- `EXPO_PUBLIC_INTERNAL_FEATURES_ENABLED`
- `NEXT_PUBLIC_ALLOW_LOCAL_TIER_SWITCH`
