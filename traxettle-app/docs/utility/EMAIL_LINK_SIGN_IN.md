# Email-link sign-in (mobile app)

How the "email me a sign-in link" option on the app's Login screen gets the user from the email back
into the app, and the plan for making it seamless with universal links and App Links.

## How it works today (step 1, web page)

1. The app calls `POST /api/auth/email-link/send` and saves the email address on the device
   (`AuthContext`, key `@traxettle_pending_email_link_email`).
2. The API (`apps/api/src/routes/auth.ts`, `getActionCodeSettings`) asks Firebase for a sign-in link
   whose continue URL is `${APP_URL}/auth/email-link` (`https://traxettle-staging.web.app` on staging,
   `https://traxettle.app` on production). The email's link goes through Firebase's action handler,
   which forwards to `${APP_URL}/auth/email-link?apiKey=…&mode=signIn&oobCode=…&lang=…`.
3. That web page (`apps/web/src/app/auth/email-link/`) hands the query, unchanged, to the app as
   `com.traxettle.app://auth/email-link?<query>`:

   | Device | What the page does |
   |---|---|
   | Android | "Open in Traxettle" is an `intent://auth/email-link?<query>#Intent;scheme=com.traxettle.app;package=com.traxettle.app;S.browser_fallback_url=<Play Store>;end` link, also tried once on load. Chrome opens the app, or Google Play if it isn't installed. |
   | iPhone, iPad | "Open in Traxettle" links to `com.traxettle.app://auth/email-link?<query>`. No automatic redirect: Safari shows an error if the app isn't installed. App Store and Google Play buttons below it. |
   | Computer | "Open this link on your phone": the link signs in the app on the phone where it was requested. Links to the normal web sign-in. |
   | Missing or garbled query | "This sign-in link is incomplete. Ask for a new one in the Traxettle app." |

4. The app's `Linking` listener in `AuthContext` sees `oobCode=` and `mode=signIn`, and calls
   Firebase `signInWithEmailLink` with the saved email. React Navigation ignores the URL (no screen
   matches `auth/email-link`), so it never lands on an error screen.

After a fresh install from the store the user must ask for a new link: the code can't survive an
install (Firebase Dynamic Links, which used to carry it, shut down in August 2025), and the new
install has no saved email. The page says so.

Privacy: the query is a one-time sign-in code. The page never renders or logs it, sets
`<meta name="referrer" content="no-referrer">` (so the store links don't receive it) and is `noindex`.

Store links come from `NEXT_PUBLIC_APP_STORE_URL` / `NEXT_PUBLIC_PLAY_STORE_URL`, defaulting to
the published listings (`apps/web/src/utils/mobile-subscribe.ts`). Link building is in
`apps/web/src/utils/email-link.ts`; tests in `apps/web/src/__tests__/utils/email-link.test.ts` and
`e2e/tests/email-link.spec.ts`.

It is a web-only change, so it also fixes app versions already in the stores:
`bash scripts/web-deployment/deploy-web-staging.sh`, then `deploy-web-prod.sh`.

Testing the app side without email: `xcrun simctl openurl booted "com.traxettle.app://auth/email-link?<query>"`
(iOS) or `adb shell am start -a android.intent.action.VIEW -d "com.traxettle.app://auth/email-link?<query>"`
(Android), after asking for a link in the app so the email is saved.

## Step 2 (later app version): universal links and App Links

Not built. Goal: tapping the link in the email opens the app straight away, with no web page in
between; the web page above stays as the fallback when the app isn't installed or the OS declines
to open it. Both platforms open an app reliably only when **the tapped link itself** is on a
verified domain, so this needs app, web and API changes, and a new app build.

### 1. App (`apps/mobile/app.json`)

```json
"ios": {
  "associatedDomains": ["applinks:traxettle.app", "applinks:traxettle-staging.web.app"]
},
"android": {
  "intentFilters": [
    {
      "action": "VIEW",
      "autoVerify": true,
      "data": [
        { "scheme": "https", "host": "traxettle.app", "pathPrefix": "/auth/email-link" },
        { "scheme": "https", "host": "traxettle-staging.web.app", "pathPrefix": "/auth/email-link" }
      ],
      "category": ["BROWSABLE", "DEFAULT"]
    }
  ]
}
```

- Keep the existing image `SEND` filter next to it. One binary serves both environments, so both
  domains go into every build.
- iOS: the App ID needs the Associated Domains capability (Apple Developer → Identifiers →
  `com.traxettle.app`). A manual provisioning profile (`IOS_PROVISIONING_PROFILE` in
  `build-ios.sh`) must be regenerated after enabling it. `build-ios.sh` runs `expo prebuild --clean`,
  so `app.json` is enough on iOS.
- Android: `build-android.sh` builds the **committed** `apps/mobile/android/` project and does not
  run prebuild, so also add the same `<intent-filter android:autoVerify="true">` to
  `android/app/src/main/AndroidManifest.xml` (or regenerate `android/` with prebuild).
- No code change is needed to handle the link: the `https://…/auth/email-link?…` URL contains
  `oobCode=` and `mode=signIn`, which is what `AuthContext` checks. React Navigation's prefixes
  only list `com.traxettle.app://`, so it ignores the https URL.

### 2. Web: `/.well-known/` files on both domains

Serve them from the web app as Next route handlers, e.g.
`apps/web/src/app/.well-known/apple-app-site-association/route.ts` and
`apps/web/src/app/.well-known/assetlinks.json/route.ts`, each returning `Response.json(…)`.
Checked: Next serves routes under `app/.well-known/` with `Content-Type: application/json`, and
Firebase Hosting's `**` rewrite passes them to Cloud Run. Putting static files in
`apps/web/public/.well-known/` would not reach Hosting: the generated hosting config in
`scripts/web-deployment/deploy-web-*.sh` ignores `**/.*`.

`apple-app-site-association` (no redirects, HTTPS; `TEAM_ID` from Apple Developer → Membership):

```json
{
  "applinks": {
    "details": [
      {
        "appIDs": ["TEAM_ID.com.traxettle.app"],
        "components": [{ "/": "/auth/email-link", "?": { "mode": "signIn" }, "comment": "Email-link sign-in" }]
      }
    ]
  }
}
```

`assetlinks.json`:

```json
[
  {
    "relation": ["delegate_permission/common.handle_all_urls"],
    "target": {
      "namespace": "android_app",
      "package_name": "com.traxettle.app",
      "sha256_cert_fingerprints": ["PLAY_APP_SIGNING_SHA256", "UPLOAD_KEY_SHA256"]
    }
  }
]
```

- `PLAY_APP_SIGNING_SHA256` is required: Play re-signs the app, so it's the key on users' phones.
  Play Console → the app → App integrity (Setup → App signing) → "App signing key certificate",
  SHA-256. Play Console shows a ready-made Digital Asset Links snippet on the same page.
- `UPLOAD_KEY_SHA256` (same page, or `keytool -list -v -keystore android/app/traxettle-release-key.keystore`)
  covers APKs signed locally, such as `build-android.sh debug:staging`. Add the debug keystore's
  fingerprint too if debug builds should verify on staging.
- Check: `curl -sI https://traxettle.app/.well-known/apple-app-site-association` (200, JSON, no
  redirect) and Google's `https://digitalassetlinks.googleapis.com/v1/statements:list?source.web.site=https://traxettle.app&relation=delegate_permission/common.handle_all_urls`.
  On a phone: `adb shell pm get-app-links com.traxettle.app` should say `verified`.
- Apple fetches the file through its CDN and caches it. For testing against staging before the
  CDN has it, use `applinks:traxettle-staging.web.app?mode=developer` in a debug build with
  Developer Mode → Associated Domains Development turned on.

### 3. API: link straight to the page

Today the email's link is Firebase's action handler (`https://<project>.firebaseapp.com/__/auth/action?…`),
which forwards to our page with a script redirect. iOS and Android generally don't open an app for
a redirect like that, so universal links and App Links would rarely trigger. Change
`POST /api/auth/email-link/send` to build the emailed link itself from the generated one: take
`apiKey`, `mode`, `oobCode` and `lang` and send
`${APP_URL}/auth/email-link?apiKey=…&mode=signIn&oobCode=…&lang=…`. The continue URL stays the
same; only the hop through firebaseapp.com goes. This is safe to ship before the app (the step-1
page handles the direct link exactly as it handles the forwarded one) and should ship before or
with it.

At the same time remove the `iOS` and `android` blocks from `getActionCodeSettings`. `installApp`
and `minimumVersion` were Firebase Dynamic Links settings and have done nothing since Dynamic
Links shut down. If `AUTH_ANDROID_PACKAGE_NAME` / `AUTH_IOS_BUNDLE_ID` are set on the Cloud Run
service, they may also route the email through Firebase's hosted mobile-link page, which the app
doesn't handle. Check with `gcloud run services describe traxettle-api-<env> --region us-central1`.

### 4. Release order

1. Web: deploy the `/.well-known/` routes to staging, then production, and check them as above.
2. API: deploy the direct-link change (staging, then production).
3. App: new version with associated domains and the intent filter; hand-test on staging (ask for a
   link, tap it in the Mail or Gmail app: the app opens signed in, with no browser in between),
   then release. Older app versions keep working through the step-1 page.
