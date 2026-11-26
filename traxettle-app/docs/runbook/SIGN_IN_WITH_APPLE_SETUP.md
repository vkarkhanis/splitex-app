# Sign in with Apple — setup and testing

Added 2026-10-23 on `feature/money-pooling` (iOS only; Android and web don't show it). App Store guideline
4.8 requires it because the app offers Google Sign-In.

## How it works

1. The app shows Apple's sign-in sheet (`expo-apple-authentication`) with a one-time nonce
   (`apps/mobile/src/services/appleSignIn.ts`).
2. It sends Apple's identity token and the nonce to **`POST /api/auth/apple`**. The API checks the token
   against Apple's public keys: signature, issuer, audience (the bundle id `com.traxettle.app`), expiry and
   nonce (`apps/api/src/services/apple-auth.service.ts`).
3. The API finds or creates the account (`AuthService.signInWithApple`) and returns a **Firebase custom
   token**, exactly as for Google. The app signs in to Firebase with it.
   - New account: uid `apple-<Apple user id>`, provider `apple`, name from Apple (Apple shares it only on the
     first sign-in).
   - Returning user: found by their Apple user id (`appleSub` on the user document), even if their email changed.
   - An existing account with the same **verified** email gets Apple linked to it ("Email/password, Apple").
   - "Hide My Email" users get their `…@privaterelay.appleid.com` address as their account email.
4. **Account deletion** (Profile → Delete Account): the app asks Apple for a fresh authorization code and
   sends it with `DELETE /api/users/account`; the API exchanges it and **revokes** the Apple authorization, as
   Apple requires. A revocation failure is logged and never blocks the deletion.

## Firebase: no changes

Firebase only ever sees a custom token from our API, so **don't enable the Apple provider** in Firebase
Authentication; there is nothing to configure there (no Services ID, no return URL, no key). Apple users appear
in the Firebase Authentication user list with uid `apple-…` (Google users have `google-…`).

## Apple Developer (developer.apple.com → Certificates, Identifiers & Profiles)

1. **App ID.** Identifiers → `com.traxettle.app` → tick **Sign In with Apple** (Enable as a primary App ID)
   → **Save** → confirm. Apple then marks the app's profiles invalid.
2. **App Store profile.** Profiles → the profile named in `IOS_PROVISIONING_PROFILE` → **Edit** → **Save**
   (regenerates it with the new capability) → **Download** → double-click it. Keep the same name and
   `IOS_PROVISIONING_PROFILE` needs no change. `build-ios.sh testflight` now stops early if the installed
   profile lacks Sign in with Apple. Do the same on the other Mac if you build there.
3. **Sign in with Apple key** (for revocation on account deletion). Keys → **+** → name it e.g.
   "Traxettle Sign in with Apple" → tick **Sign in with Apple** → **Configure** → Primary App ID
   `com.traxettle.app` → Save → Continue → **Register** → **Download** the `AuthKey_<KEYID>.p8` (only
   downloadable once) and note the **Key ID**. This is a different key from the App Store Connect API key
   used for uploads. Keep it outside the repo, e.g. `~/.traxettle/keys/AuthKey_<KEYID>.p8`.
4. *(Optional)* **Email relay.** Only needed if Traxettle emails users who hid their email: Services → Sign in
   with Apple for Email Communication → Configure → add `traxettleapp@gmail.com` as a source. Without it,
   emails from that address to `@privaterelay.appleid.com` addresses are dropped.

## API config (staging and production)

The deploy scripts read these from your shell (e.g. `~/.zshrc`) or from the gitignored
`traxettle-rush/.traxettle/api-staging.env` / `api-prod.env`:

```bash
export APPLE_TEAM_ID=XXXXXXXXXX                  # already set for build-ios.sh
export APPLE_SIGNIN_KEY_ID=YYYYYYYYYY            # Key ID from step 3
export APPLE_SIGNIN_PRIVATE_KEY_FILE="$HOME/.traxettle/keys/AuthKey_YYYYYYYYYY.p8"
# APPLE_SIGNIN_CLIENT_ID defaults to com.traxettle.app (the bundle id); no need to set it.
```

Then deploy as usual (`scripts/api-deployment/deploy-staging.sh`, `deploy-prod.sh`). They store the key in
the `traxettle-<env>-api-config` secret. Without the key file they print a WARNING: sign-in still works, but
deletion can't revoke the Apple authorization (Apple can reject the app for that).

Check the route is live (400 = exists and wants a token; 404 = old API):

```bash
/usr/bin/curl -s -o /dev/null -w '%{http_code}\n' -X POST -H 'Content-Type: application/json' -d '{}' https://traxettle-api-prod-ncwutlgtga-uc.a.run.app/api/auth/apple
```

## Build

`bash apps/mobile/scripts/build-ios.sh testflight` as usual. Prebuild adds the
`com.apple.developer.applesignin` entitlement (`app.json`: `ios.usesAppleSignIn` and the
`expo-apple-authentication` plugin).

## Testing (TestFlight, on the iPhone/Mac signed in to your Apple ID)

To start over as a first-time Apple user: Settings → [your name] → Sign-In & Security → Sign in with Apple →
Traxettle → **Stop Using Apple ID** (on the Mac: System Settings → [your name] → Sign-In & Security).

| # | Steps | Expected |
|---|---|---|
| 1 | Login → **Sign in with Apple** → Continue → **Hide My Email** | Dashboard. Profile: email `…@privaterelay.appleid.com`, name from Apple, Sign-in methods "Apple" |
| 2 | Sign out → Sign in with Apple again | Same account and events; no name/email prompt |
| 3 | Register screen → **Sign up with Apple** | Same as sign-in (creates or reuses the account) |
| 4 | Tap the Apple button and cancel the sheet | Nothing happens, no error |
| 5 | Stop Using Apple ID; create an email/password account with your Apple ID's email; sign out; Sign in with Apple → **Share My Email** | Signs in to that account; Profile shows "Email/password, Apple" |
| 6 | Apple account → Profile → Delete Account → Delete → confirm on Apple's sheet | "Account Deleted", signed out. Traxettle disappears from Sign in with Apple in Settings (revoked) |
| 7 | Sign in with Apple again after 6 | Apple asks for name/email again; a new, empty account |
| 8 | Delete Account → Delete → **cancel** Apple's sheet | Nothing deleted, still signed in |
| 9 | 7 taps on "Traxettle" (staging) → repeat 1 and 6 | Same on staging |
| 10 | Android build | No Apple button |

If 6 leaves Traxettle listed in Settings, check the API logs for `DELETE /account: Apple revocation failed`
(wrong Key ID, team or key file; or the key isn't enabled for `com.traxettle.app`).

## Troubleshooting

| Symptom | Cause / fix |
|---|---|
| Archive fails: profile doesn't support Sign in with Apple / missing `com.apple.developer.applesignin` | Apple Developer steps 1–2, then install the new profile |
| Apple sheet errors at once (`AuthorizationError 1000`) | The build lacks the entitlement, or the device isn't signed in to an Apple ID |
| "Apple Sign-In Failed" after the sheet; API log `[auth/apple] Sign-in failed` (401) | Token check failed: check `APPLE_SIGNIN_CLIENT_ID` matches the bundle id; check the server clock |
| "Apple didn't share an email address" (400) | Apple sent no email for a brand-new account (rare). Stop Using Apple ID and try again |
| Deploy prints the Sign in with Apple WARNING | `APPLE_SIGNIN_PRIVATE_KEY_FILE` isn't set in that shell |

## Known limits

- **Invitations go by email.** Someone who hides their email has a relay address on their account, so an
  invitation sent to their real email doesn't show in their Invitations list. They can give the inviter their
  relay address (shown on Profile), or use **Share My Email** when they first sign in with Apple.
- No Sign in with Apple on web or Android (not required there), so an Apple-only account signs in only on
  iPhone, iPad or Mac.
