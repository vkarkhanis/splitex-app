#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────────────────────
# What build-ios.sh testflight needs for signing, from what is installed on this Mac:
#
#   bash scripts/ios-signing-info.sh          # profiles for com.traxettle.app
#   bash scripts/ios-signing-info.sh --all    # every installed profile
#
# Prints:
# - the "Apple Distribution" signing certificates in the keychain (the Team ID is in brackets);
# - each installed provisioning profile for the app: its name (IOS_PROVISIONING_PROFILE), team
#   (APPLE_TEAM_ID), type, whether it has Sign in with Apple, and when it expires;
# - the build-ios.sh command to use with a profile that fits.
# Reads only. Nothing is changed or sent anywhere.
# ──────────────────────────────────────────────────────────────────────────────
set -uo pipefail

BUNDLE_ID="com.traxettle.app"
SHOW_ALL=""
[[ "${1:-}" == "--all" ]] && SHOW_ALL=1

echo "Apple Distribution certificates in the keychain (Team ID in brackets):"
if ! security find-identity -v -p codesigning | grep "Apple Distribution"; then
  echo "  none. Import the .p12 exported from the Mac that made it (double-click it), or create one at"
  echo "  developer.apple.com → Certificates. Manual signing needs it."
fi
echo

now="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
GOOD=""
FOUND=0
while IFS= read -r f; do
  P="$(security cms -D -i "$f" 2>/dev/null)" || continue
  app="$(plutil -extract Entitlements.application-identifier raw -o - - <<<"$P" 2>/dev/null)"
  [[ -n "$SHOW_ALL" || "$app" == *".$BUNDLE_ID" ]] || continue
  FOUND=$((FOUND + 1))
  name="$(plutil -extract Name raw -o - - <<<"$P" 2>/dev/null)"
  exp="$(plutil -extract ExpirationDate raw -o - - <<<"$P" 2>/dev/null)"
  team="${app%%.*}"
  if grep -q ProvisionedDevices <<<"$P"; then kind="development/ad hoc"; else kind="App Store"; fi
  if grep -q com.apple.developer.applesignin <<<"$P"; then siwa="Sign in with Apple"; else siwa="NO Sign in with Apple"; fi
  if [[ "$exp" < "$now" ]]; then state="EXPIRED"; else state="valid"; fi
  usable=""
  if [[ "$app" == *".$BUNDLE_ID" && "$kind" == "App Store" && "$siwa" == "Sign in with Apple" && "$state" == "valid" ]]; then
    usable="   ← use this one"
    GOOD="$name|$team"
  fi
  echo "\"$name\""
  echo "    app $app | $kind | $siwa | expires ${exp%%T*} ($state)$usable"
done < <(find "$HOME/Library/Developer/Xcode/UserData/Provisioning Profiles" \
              "$HOME/Library/MobileDevice/Provisioning Profiles" -name '*.mobileprovision' 2>/dev/null)

echo
if [[ "$FOUND" -eq 0 ]]; then
  echo "No provisioning profiles for $BUNDLE_ID are installed on this Mac."
fi
if [[ -n "$GOOD" ]]; then
  echo "Build with it:"
  echo "  IOS_PROVISIONING_PROFILE=\"${GOOD%%|*}\" APPLE_TEAM_ID=${GOOD##*|} bash scripts/build-ios.sh testflight"
else
  echo "No valid App Store profile with Sign in with Apple for $BUNDLE_ID here. To get one:"
  echo "  developer.apple.com → Certificates, IDs & Profiles → Profiles → the App Store profile for $BUNDLE_ID"
  echo "  (Edit → Save if it has expired) → Download, then double-click the file and run this again."
  echo "  If there is none: + → App Store Connect → App ID $BUNDLE_ID → your Apple Distribution"
  echo "  certificate → name it (e.g. Traxettle App Store) → Generate → Download."
fi
