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
#   Build number defaults to yymmddHHMM; override with IOS_BUILD_NUMBER.

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
  echo "Profiles: debug | testflight"
  exit 1
fi

case "$PROFILE" in
  debug|testflight) ;;
  staging|production)
    fail "'$PROFILE' builds used EAS Build, which can't install this Rush monorepo.
   For TestFlight and the App Store (one build for every environment):
     APPLE_TEAM_ID=<your Team ID> bash scripts/build-ios.sh testflight
   Testers switch the app to Staging by tapping \"Traxettle\" 7 times on the sign-in screen.
   For a simulator against the deployed staging API (from traxettle-rush/):
     bash scripts/local-dev/06_staging_mobile.sh ios" ;;
  *) fail "Unknown profile '$PROFILE'. Use: debug or testflight" ;;
esac

case "$PROFILE" in
  debug) RC_ENV="local" ;;
  testflight) RC_ENV="prod" ;;
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

require_cmd node
require_cmd bash
if [ "$PROFILE" = "testflight" ]; then
  require_cmd xcodebuild
  require_cmd npx
  [[ "${APPLE_TEAM_ID:-}" =~ ^[A-Z0-9]{10}$ ]] \
    || fail "Set APPLE_TEAM_ID to your 10-character Apple Team ID (help: tools/doctor-tool/scripts/doctor-apple-team.sh)"
fi
[ -f "$RC_LOADER" ] || fail "Missing RevenueCat loader: $RC_LOADER"
source "$RC_LOADER" "$RC_ENV"

if [ -z "${EXPO_PUBLIC_REVENUECAT_APPLE_KEY:-}" ]; then
  warn "EXPO_PUBLIC_REVENUECAT_APPLE_KEY is empty in rc_${RC_ENV}.properties — iOS Pro purchases won't work in this build."
fi

case "$PROFILE" in
  testflight)
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

ENV_FILE="$MOBILE_DIR/.env"
ENV_FILE_EXISTED=false
[ -f "$ENV_FILE" ] && ENV_FILE_EXISTED=true && cp "$ENV_FILE" "$ENV_FILE.build-backup"
BUILD_ENV_TS="$MOBILE_DIR/src/config/buildEnv.ts"
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

cleanup_env() {
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
trap cleanup_env EXIT

# Prebuild → archive (Release) → upload to App Store Connect, all on this Mac.
build_testflight() {
  local version build_number archive_dir archive_path export_dir project
  version="$(node -p "require('$MOBILE_DIR/app.json').expo.version")"
  build_number="${IOS_BUILD_NUMBER:-$(date +%y%m%d%H%M)}"
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

  info "Generating the native iOS project (expo prebuild --clean)."
  # .env and buildEnv.ts are written above on purpose; skip prebuild's uncommitted-changes prompt.
  (cd "$MOBILE_DIR" && EXPO_NO_GIT_STATUS=1 npx expo prebuild --platform ios --clean)
  project="$(ios_project_name)"
  [ -n "$project" ] || fail "expo prebuild did not create an Xcode project in $IOS_DIR"
  # Xcode's JS bundling phase needs node, which may live outside Xcode's default PATH (e.g. nvm).
  echo "export NODE_BINARY=$(command -v node)" > "$IOS_DIR/.xcode.env.local"
  /usr/libexec/PlistBuddy -c "Set :CFBundleVersion $build_number" "$IOS_DIR/$project/Info.plist"
  ok "Version $version, build $build_number"

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
  <key>signingStyle</key>
  <string>automatic</string>
  <key>manageAppVersionAndBuildNumber</key>
  <false/>
  <key>uploadSymbols</key>
  <true/>
</dict>
</plist>
EOF

  info "Uploading to App Store Connect (logs: $export_dir)."
  xcodebuild -exportArchive -archivePath "$archive_path" -exportOptionsPlist "$export_dir/ExportOptions.plist" \
    -exportPath "$export_dir" -allowProvisioningUpdates ${auth_flags[@]+"${auth_flags[@]}"}
  ok "Uploaded $version ($build_number). It appears in App Store Connect → TestFlight after processing (~10–30 min)."
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
else
  build_testflight
fi

echo ""
ok "iOS build command completed for profile: $PROFILE"
echo "═══════════════════════════════════════════════════════════"
echo ""
