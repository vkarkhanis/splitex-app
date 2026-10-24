#!/usr/bin/env bash
# build-ios.sh — iOS debug and TestFlight builds with RevenueCat + env injection.
#
# Usage:
#   ./scripts/build-ios.sh debug
#   APPLE_TEAM_ID=ABCDE12345 ./scripts/build-ios.sh testflight
#
# Notes:
# - `debug` builds and runs locally via Expo (local API, traxettle-test Google IDs).
# - The former `staging` / `production` modes used EAS Build, which can't install
#   this Rush monorepo. They now stop and point here: one iOS build serves every
#   environment.
# - `testflight` archives the production release build locally with Xcode and
#   uploads it to App Store Connect (TestFlight). It is the binary you later
#   promote to the App Store. Release builds choose the API at runtime: production
#   by default; testers switch to staging by tapping "Traxettle" 7 times on the
#   sign-in screen. Runs locally because EAS can't install this Rush monorepo
#   (`workspace:` dependencies).
#   Signs with the Apple account added in Xcode → Settings → Accounts, or with
#   an App Store Connect API key: ASC_KEY_PATH, ASC_KEY_ID, ASC_KEY_ISSUER_ID.
#   Automatic signing needs a registered iPhone/iPad on the team. Without one, set
#   IOS_PROVISIONING_PROFILE to the name of an installed App Store profile: the app then
#   signs manually with it and the "Apple Distribution" certificate in this Mac's keychain
#   (IOS_SIGNING_IDENTITY to override). See plugins/ios-release-signing.js.
#   Build number defaults to yymmddHHMM; override with IOS_BUILD_NUMBER. The version is
#   shared with Android (scripts/version.sh) and recorded once the upload succeeds.
# - `xcode` prepares the same TestFlight build (version, build number, signing, native
#   project) and opens it in Xcode to archive and upload by hand (Product → Archive). It
#   leaves .env and src/config/buildEnv.ts in place, because Xcode bundles the JavaScript
#   during the archive and reads the RevenueCat key from them. Afterwards run
#   `build-ios.sh xcode-done` (records the version, restores both files), or
#   `build-ios.sh xcode-done --not-uploaded` if nothing was uploaded.

set -euo pipefail

PROFILE="${1:-}"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
MOBILE_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
IOS_DIR="$MOBILE_DIR/ios"
RC_LOADER="$MOBILE_DIR/../../scripts/revenuecat/load-rc-config.sh"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

info()  { echo -e "${CYAN}ℹ ${NC}$1"; }
ok()    { echo -e "${GREEN}✅${NC} $1"; }
warn()  { echo -e "${YELLOW}⚠️ ${NC}$1"; }
fail()  { echo -e "${RED}❌${NC} $1"; exit 1; }

if [ -z "$PROFILE" ]; then
  echo "Usage: ./scripts/build-ios.sh <profile>"
  echo "Profiles: debug | testflight | xcode | xcode-done [--not-uploaded]"
  exit 1
fi

case "$PROFILE" in
  debug|testflight|xcode|xcode-done) ;;
  staging|production)
    fail "'$PROFILE' builds used EAS Build, which can't install this Rush monorepo.
   For TestFlight and the App Store (one build for every environment):
     APPLE_TEAM_ID=<your Team ID> bash scripts/build-ios.sh testflight
   Testers switch the app to Staging by tapping \"Traxettle\" 7 times on the sign-in screen.
   For a simulator against the deployed staging API (from traxettle-rush/):
     bash scripts/local-dev/06_staging_mobile.sh ios" ;;
  *) fail "Unknown profile '$PROFILE'. Use: debug, testflight, xcode or xcode-done" ;;
esac

ENV_FILE="$MOBILE_DIR/.env"
BUILD_ENV_TS="$MOBILE_DIR/src/config/buildEnv.ts"
# Set by `xcode` while a build waits to be archived in Xcode; removed by `xcode-done`.
XCODE_PENDING_FILE="$MOBILE_DIR/.xcode-build-pending"

# Puts back the .env and buildEnv.ts that were there before this build wrote its own.
restore_build_env() {
  if [ "$ENV_FILE_EXISTED" = true ]; then
    mv "$ENV_FILE.build-backup" "$ENV_FILE"
  else
    rm -f "$ENV_FILE"
  fi
  if [ "$BUILD_ENV_TS_EXISTED" = true ]; then
    mv "$BUILD_ENV_TS.build-backup" "$BUILD_ENV_TS"
  else
    rm -f "$BUILD_ENV_TS"
  fi
}

if [ "$PROFILE" = "xcode-done" ]; then
  [ -f "$XCODE_PENDING_FILE" ] || fail "No Xcode build is waiting. Start one with: bash scripts/build-ios.sh xcode"
  case "${2:-}" in
    ""|--not-uploaded) ;;
    *) fail "Unknown option '${2}'. Use: build-ios.sh xcode-done [--not-uploaded]" ;;
  esac
  # shellcheck disable=SC1090
  source "$XCODE_PENDING_FILE"
  restore_build_env
  ok "Restored .env and src/config/buildEnv.ts"
  if [ "${2:-}" = "--not-uploaded" ]; then
    info "Not recorded: the next store build reuses version $VERSION."
  else
    bash "$MOBILE_DIR/scripts/version.sh" record ios "$BUILD_NUMBER"
  fi
  rm -f "$XCODE_PENDING_FILE"
  exit 0
fi

# Another build would back up the Xcode build's .env and buildEnv.ts as if they were the originals.
[ -f "$XCODE_PENDING_FILE" ] && fail "An Xcode build is still waiting (it holds .env and src/config/buildEnv.ts).
   After uploading it: bash scripts/build-ios.sh xcode-done
   If you didn't upload: bash scripts/build-ios.sh xcode-done --not-uploaded"

case "$PROFILE" in
  debug) RC_ENV="local" ;;
  testflight|xcode) RC_ENV="prod" ;;
esac

echo ""
echo "═══════════════════════════════════════════════════════════"
echo "  Traxettle iOS Build — $PROFILE"
echo "═══════════════════════════════════════════════════════════"
echo ""

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || fail "Missing command: $1"
}

# Name of the generated Xcode project (derived from app.json "name"); empty before prebuild.
ios_project_name() {
  local proj
  for proj in "$IOS_DIR"/*.xcodeproj; do
    [ -d "$proj" ] && basename "$proj" .xcodeproj && return 0
  done
  return 0
}

# Decoded plist of the installed provisioning profile with this name. A regenerated profile keeps
# its name and the old copy stays installed, so the newest (CreationDate) wins.
ios_profile_plist() {
  local name="$1" file plist created best="" best_created=""
  for file in "$HOME/Library/Developer/Xcode/UserData/Provisioning Profiles"/*.mobileprovision \
              "$HOME/Library/MobileDevice/Provisioning Profiles"/*.mobileprovision; do
    [ -f "$file" ] || continue
    plist="$(security cms -D -i "$file" 2>/dev/null)" || continue
    [ "$(plutil -extract Name raw -o - - <<<"$plist" 2>/dev/null)" = "$name" ] || continue
    created="$(plutil -extract CreationDate raw -o - - <<<"$plist" 2>/dev/null || true)"
    if [ -z "$best" ] || [[ "$created" > "$best_created" ]]; then
      best="$plist"
      best_created="$created"
    fi
  done
  [ -n "$best" ] || return 1
  printf '%s' "$best"
}

# Manual signing: the profile must be an installed App Store profile for this app, and the
# keychain must hold its certificate with the private key. Checked before anything is built.
check_manual_signing() {
  local profile_plist app_id
  profile_plist="$(ios_profile_plist "$IOS_PROVISIONING_PROFILE")" \
    || fail "No installed provisioning profile named \"$IOS_PROVISIONING_PROFILE\".
   Download it from developer.apple.com → Certificates, Identifiers & Profiles → Profiles and double-click it."
  app_id="$(plutil -extract Entitlements.application-identifier raw -o - - <<<"$profile_plist" 2>/dev/null || true)"
  [ "$app_id" = "$APPLE_TEAM_ID.$IOS_BUNDLE_ID" ] \
    || fail "Profile \"$IOS_PROVISIONING_PROFILE\" is for \"$app_id\", not $APPLE_TEAM_ID.$IOS_BUNDLE_ID."
  plutil -extract ProvisionedDevices xml1 -o /dev/null - <<<"$profile_plist" 2>/dev/null \
    && fail "Profile \"$IOS_PROVISIONING_PROFILE\" lists devices (development or ad hoc). Use an App Store profile."
  plutil -extract 'Entitlements.com\.apple\.developer\.applesignin' xml1 -o /dev/null - <<<"$profile_plist" 2>/dev/null \
    || fail "Profile \"$IOS_PROVISIONING_PROFILE\" doesn't include Sign in with Apple, which the app uses.
   developer.apple.com → Identifiers → $IOS_BUNDLE_ID → tick \"Sign In with Apple\" → Save. Then Profiles →
   \"$IOS_PROVISIONING_PROFILE\" → Edit → Save, download it and double-click it (see SIGN_IN_WITH_APPLE_SETUP.md)."
  security find-identity -v -p codesigning | grep -q "\"$IOS_SIGNING_IDENTITY" \
    || fail "No \"$IOS_SIGNING_IDENTITY\" certificate with its private key in this Mac's keychain.
   On the Mac that created it: Keychain Access → My Certificates → right-click it → Export (.p12).
   Double-click the .p12 here. (The downloaded profile alone isn't enough.)"
  ok "Signing with App Store profile \"$IOS_PROVISIONING_PROFILE\" and \"$IOS_SIGNING_IDENTITY\""
}

require_cmd node
require_cmd bash
if [ "$PROFILE" = "testflight" ] || [ "$PROFILE" = "xcode" ]; then
  require_cmd xcodebuild
  require_cmd npx
  [[ "${APPLE_TEAM_ID:-}" =~ ^[A-Z0-9]{10}$ ]] \
    || fail "Set APPLE_TEAM_ID to your 10-character Apple Team ID (help: tools/doctor-tool/scripts/doctor-apple-team.sh)"
  IOS_BUNDLE_ID="$(node -p "require('$MOBILE_DIR/app.json').expo.ios.bundleIdentifier")"
  if [ -n "${IOS_PROVISIONING_PROFILE:-}" ]; then
    # Read by plugins/ios-release-signing.js during expo prebuild.
    export IOS_PROVISIONING_PROFILE IOS_SIGNING_IDENTITY="${IOS_SIGNING_IDENTITY:-Apple Distribution}"
    check_manual_signing
  else
    info "Signing automatically, which needs a registered iPhone/iPad on the team."
    info "  No device? Set IOS_PROVISIONING_PROFILE to the name of your App Store profile."
  fi
fi
[ -f "$RC_LOADER" ] || fail "Missing RevenueCat loader: $RC_LOADER"
source "$RC_LOADER" "$RC_ENV"

if [ -z "${EXPO_PUBLIC_REVENUECAT_APPLE_KEY:-}" ]; then
  warn "EXPO_PUBLIC_REVENUECAT_APPLE_KEY is empty in rc_${RC_ENV}.properties — iOS Pro purchases won't work in this build."
fi

case "$PROFILE" in
  testflight|xcode)
    export EXPO_PUBLIC_APP_ENV="production"
    # Release builds choose the API at runtime; this URL only feeds development builds.
    export EXPO_PUBLIC_API_URL="${EXPO_PUBLIC_API_URL:-https://traxettle-api-prod-ncwutlgtga-uc.a.run.app}"
    # Update with production OAuth client IDs once prod Firebase app is ready.
    export EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID="943648574702-n7h4msh3iho1187po0dnc8tja7insc89.apps.googleusercontent.com"
    export EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID="943648574702-0qk99r3oql0sv3k4h6cgluffdqs7letj.apps.googleusercontent.com"
    export EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID="943648574702-cvgj086ppdcbqgcagrekjs4pekn0q1ok.apps.googleusercontent.com"
    FIREBASE_ENV="staging"
    ;;
  debug)
    export EXPO_PUBLIC_APP_ENV="local"
    export EXPO_PUBLIC_API_URL_IOS="http://localhost:3001"
    export EXPO_PUBLIC_API_URL="http://localhost:3001"
    export EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID="603084161476-igddelh46pe5l2t0hajsl52da0rici6o.apps.googleusercontent.com"
    export EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID="603084161476-ii602klf0go223a0ve690kopl7u5e7a0.apps.googleusercontent.com"
    export EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID="603084161476-j4ht8hs7kk6tqqh273q2ks89udmdc3pe.apps.googleusercontent.com"
    FIREBASE_ENV="local"
    ;;
esac

PLIST_SRC="$MOBILE_DIR/GoogleService-Info.$FIREBASE_ENV.plist"
PLIST_FALLBACK="$MOBILE_DIR/GoogleService-Info.plist"

# The config plugin copies apps/mobile/GoogleService-Info.plist into the native
# project on prebuild; an already-generated project gets it directly.
if [ -f "$PLIST_SRC" ]; then
  cp "$PLIST_SRC" "$PLIST_FALLBACK"
  ok "GoogleService-Info.$FIREBASE_ENV.plist → GoogleService-Info.plist"
elif [ -f "$PLIST_FALLBACK" ]; then
  warn "GoogleService-Info.$FIREBASE_ENV.plist not found — using GoogleService-Info.plist"
else
  fail "Missing iOS Firebase plist for env '$FIREBASE_ENV'"
fi
IOS_PROJECT="$(ios_project_name)"
if [ -n "$IOS_PROJECT" ]; then
  cp "$PLIST_FALLBACK" "$IOS_DIR/$IOS_PROJECT/GoogleService-Info.plist"
  ok "  → ios/$IOS_PROJECT/GoogleService-Info.plist"
fi

ENV_FILE_EXISTED=false
[ -f "$ENV_FILE" ] && ENV_FILE_EXISTED=true && cp "$ENV_FILE" "$ENV_FILE.build-backup"
BUILD_ENV_TS_EXISTED=false
[ -f "$BUILD_ENV_TS" ] && BUILD_ENV_TS_EXISTED=true && cp "$BUILD_ENV_TS" "$BUILD_ENV_TS.build-backup"

cat > "$ENV_FILE" <<EOF
EXPO_PUBLIC_APP_ENV=${EXPO_PUBLIC_APP_ENV}
EXPO_PUBLIC_API_URL=${EXPO_PUBLIC_API_URL:-}
EXPO_PUBLIC_API_URL_IOS=${EXPO_PUBLIC_API_URL_IOS:-}
EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID=${EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID}
EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID=${EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID}
EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID=${EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID}
EXPO_PUBLIC_REVENUECAT_GOOGLE_KEY=${EXPO_PUBLIC_REVENUECAT_GOOGLE_KEY:-}
EXPO_PUBLIC_REVENUECAT_APPLE_KEY=${EXPO_PUBLIC_REVENUECAT_APPLE_KEY:-}
EXPO_PUBLIC_REVENUECAT_PRO_ENTITLEMENT=${EXPO_PUBLIC_REVENUECAT_PRO_ENTITLEMENT:-pro}
EXPO_PUBLIC_REVENUECAT_OFFERING=${EXPO_PUBLIC_REVENUECAT_OFFERING:-default}
EOF
ok ".env written for iOS build"

cat > "$BUILD_ENV_TS" <<EOF
/**
 * Auto-generated by build-ios.sh for profile: $PROFILE
 * DO NOT COMMIT.
 */
export const BUILD_ENV = {
  REVENUECAT_APPLE_API_KEY: "${EXPO_PUBLIC_REVENUECAT_APPLE_KEY:-}",
  REVENUECAT_GOOGLE_API_KEY: "${EXPO_PUBLIC_REVENUECAT_GOOGLE_KEY:-}",
  REVENUECAT_PRO_ENTITLEMENT_ID: "${EXPO_PUBLIC_REVENUECAT_PRO_ENTITLEMENT:-pro}",
  REVENUECAT_OFFERING_ID: "${EXPO_PUBLIC_REVENUECAT_OFFERING:-default}",
} as const;
EOF
ok "buildEnv.ts written for release bundle fallback"

# `xcode` keeps them once it has prepared the project: Xcode still has to bundle the JavaScript.
KEEP_BUILD_ENV=false
cleanup_env() {
  [ "$KEEP_BUILD_ENV" = true ] || restore_build_env
}
trap cleanup_env EXIT

# Version, native project and build number of a store build (testflight and xcode).
# Sets release_version, release_build and release_project.
prepare_release_project() {
  # Shares the version with Android for this release; bumped only if iOS already shipped it.
  bash "$MOBILE_DIR/scripts/version.sh" prepare ios
  release_version="$(node -p "require('$MOBILE_DIR/app.json').expo.version")"
  release_build="${IOS_BUILD_NUMBER:-$(date +%y%m%d%H%M)}"

  info "Generating the native iOS project (expo prebuild --clean)."
  # .env and buildEnv.ts are written above on purpose; skip prebuild's uncommitted-changes prompt.
  (cd "$MOBILE_DIR" && EXPO_NO_GIT_STATUS=1 npx expo prebuild --platform ios --clean)
  release_project="$(ios_project_name)"
  [ -n "$release_project" ] || fail "expo prebuild did not create an Xcode project in $IOS_DIR"
  # Tells scripts/local-dev/06_staging_mobile.sh to regenerate this project before its next
  # simulator (Debug) build: building Debug on top of a Release one can fail to link.
  touch "$IOS_DIR/.release-build"
  # Xcode's JS bundling phase needs node, which may live outside Xcode's default PATH (e.g. nvm).
  echo "export NODE_BINARY=$(command -v node)" > "$IOS_DIR/.xcode.env.local"
  /usr/libexec/PlistBuddy -c "Set :CFBundleVersion $release_build" "$IOS_DIR/$release_project/Info.plist"
  ok "Version $release_version, build $release_build"
}

# Prepares the build and hands it to Xcode for Product → Archive and the upload.
prepare_xcode_build() {
  prepare_release_project
  cat > "$XCODE_PENDING_FILE" <<EOF
# Written by build-ios.sh xcode; read and removed by build-ios.sh xcode-done.
VERSION=$release_version
BUILD_NUMBER=$release_build
ENV_FILE_EXISTED=$ENV_FILE_EXISTED
BUILD_ENV_TS_EXISTED=$BUILD_ENV_TS_EXISTED
EOF
  KEEP_BUILD_ENV=true

  local signing="Manual: profile \"${IOS_PROVISIONING_PROFILE:-}\" with \"${IOS_SIGNING_IDENTITY:-}\""
  [ -n "${IOS_PROVISIONING_PROFILE:-}" ] \
    || signing="Automatic: pick team $APPLE_TEAM_ID under Signing & Capabilities if Xcode asks"
  ok "Ready to archive version $release_version (build $release_build) in Xcode."
  echo ""
  echo "  In Xcode (opening $release_project.xcworkspace):"
  echo "    1. Destination (top bar): Any iOS Device (arm64)."
  echo "    2. Product → Archive. Signing — $signing."
  echo "    3. Organizer → Distribute App → App Store Connect → Upload."
  echo "  Then, from apps/mobile:"
  echo "    bash scripts/build-ios.sh xcode-done                  # uploaded: records $release_version, restores files"
  echo "    bash scripts/build-ios.sh xcode-done --not-uploaded   # didn't upload: restores files only"
  echo ""
  warn "Until then .env and src/config/buildEnv.ts hold this build's values (RevenueCat key): don't commit them."
  open "$IOS_DIR/$release_project.xcworkspace" || warn "Open $IOS_DIR/$release_project.xcworkspace in Xcode yourself."
}

# Prebuild → archive (Release) → upload to App Store Connect, all on this Mac.
build_testflight() {
  local version build_number archive_dir archive_path export_dir project
  prepare_release_project
  version="$release_version"
  build_number="$release_build"
  project="$release_project"
  # Archives here show up in Xcode's Organizer, so a failed upload can be retried from there.
  archive_dir="$HOME/Library/Developer/Xcode/Archives/$(date +%Y-%m-%d)"
  archive_path="$archive_dir/Traxettle-$version-$build_number.xcarchive"
  export_dir="$(mktemp -d)"

  local auth_flags=()
  if [ -n "${ASC_KEY_PATH:-}" ]; then
    auth_flags=(-authenticationKeyPath "$ASC_KEY_PATH"
      -authenticationKeyID "${ASC_KEY_ID:?Set ASC_KEY_ID with ASC_KEY_PATH}"
      -authenticationKeyIssuerID "${ASC_KEY_ISSUER_ID:?Set ASC_KEY_ISSUER_ID with ASC_KEY_PATH}")
  fi

  local signing_options="  <key>signingStyle</key>
  <string>automatic</string>"
  if [ -n "${IOS_PROVISIONING_PROFILE:-}" ]; then
    signing_options="  <key>signingStyle</key>
  <string>manual</string>
  <key>signingCertificate</key>
  <string>${IOS_SIGNING_IDENTITY}</string>
  <key>provisioningProfiles</key>
  <dict>
    <key>${IOS_BUNDLE_ID}</key>
    <string>${IOS_PROVISIONING_PROFILE}</string>
  </dict>"
  fi

  info "Archiving (Release, team $APPLE_TEAM_ID)."
  mkdir -p "$archive_dir"
  xcodebuild -workspace "$IOS_DIR/$project.xcworkspace" -scheme "$project" -configuration Release \
    -destination 'generic/platform=iOS' -archivePath "$archive_path" \
    -allowProvisioningUpdates ${auth_flags[@]+"${auth_flags[@]}"} \
    DEVELOPMENT_TEAM="$APPLE_TEAM_ID" archive
  ok "Archive: $archive_path"

  cat > "$export_dir/ExportOptions.plist" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>method</key>
  <string>app-store-connect</string>
  <key>destination</key>
  <string>upload</string>
  <key>teamID</key>
  <string>${APPLE_TEAM_ID}</string>
${signing_options}
  <key>manageAppVersionAndBuildNumber</key>
  <false/>
  <key>uploadSymbols</key>
  <true/>
</dict>
</plist>
EOF

  if [ -n "${ASC_KEY_PATH:-}" ]; then
    info "Uploading to App Store Connect with API key $ASC_KEY_ID (logs: $export_dir)."
  else
    info "Uploading to App Store Connect as the Apple account signed in to Xcode (logs: $export_dir)."
    info "  No ASC_KEY_PATH set, so Xcode → Settings → Accounts must be signed in to this team."
  fi
  xcodebuild -exportArchive -archivePath "$archive_path" -exportOptionsPlist "$export_dir/ExportOptions.plist" \
    -exportPath "$export_dir" -allowProvisioningUpdates ${auth_flags[@]+"${auth_flags[@]}"} \
    || fail "The upload failed, but the archive is fine: $archive_path
   Upload it from Xcode: Window → Organizer → Archives → version $version ($build_number) →
   Distribute App → App Store Connect → Upload. Then record it:
     bash scripts/version.sh record ios $build_number
   So this script can upload next time: sign in again in Xcode → Settings → Accounts (an account
   with the App Manager or Admin role), or set ASC_KEY_PATH, ASC_KEY_ID and ASC_KEY_ISSUER_ID for a
   Team key (App Store Connect → Users and Access → Integrations → App Store Connect API)."
  ok "Uploaded $version ($build_number). It appears in App Store Connect → TestFlight after processing (~10–30 min)."
  bash "$MOBILE_DIR/scripts/version.sh" record ios "$build_number"
  info "The build uses production by default. To test staging, tap \"Traxettle\" 7 times on the sign-in screen."
}

echo ""
if [ "$PROFILE" = "debug" ]; then
  require_cmd npx
  info "Starting local iOS debug build (Expo run:ios)."
  (
    cd "$MOBILE_DIR"
    npx expo run:ios --configuration Debug
  )
elif [ "$PROFILE" = "xcode" ]; then
  prepare_xcode_build
else
  build_testflight
fi

echo ""
ok "iOS build command completed for profile: $PROFILE"
echo "═══════════════════════════════════════════════════════════"
echo ""
