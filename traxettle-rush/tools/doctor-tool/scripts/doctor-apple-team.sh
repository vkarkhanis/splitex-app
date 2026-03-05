#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────────────────────
# doctor-apple-team.sh — Apple Team ID Setup for Traxettle
#
# Usage: ./common/scripts/doctor-apple-team.sh
#
# This script provides step-by-step instructions for:
# - Finding Apple Team ID from Developer Portal
# - Adding Team ID to Firebase projects
# - Setting up iOS certificates and provisioning
# - Troubleshooting Team ID issues
# ──────────────────────────────────────────────────────────────────────────────

set -euo pipefail

# ── Colors ───────────────────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

info() { echo -e "${CYAN}ℹ ${NC}$1"; }
ok() { echo -e "${GREEN}✅${NC} $1"; }
warn() { echo -e "${YELLOW}⚠️ ${NC}$1"; }
fail() { echo -e "${RED}❌${NC} $1"; }
header() { echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}\n${BLUE}$1${NC}\n${BLUE}═══════════════════════════════════════════════════════════${NC}"; }

echo ""
header "Apple Team ID Setup for Traxettle"
echo ""

# Check prerequisites
header "Prerequisites Check"
echo ""

if command -v xcode-select >/dev/null 2>&1; then
    ok "Xcode command line tools installed"
else
    warn "Xcode command line tools not found"
    echo "  Install with: xcode-select --install"
    echo ""
fi

echo ""
info "Team ID is required for:"
echo "  - Firebase iOS app configuration"
echo "  - Push notifications (APNs)"
echo "  - Apple Sign-In"
echo "  - App Store distribution"
echo ""

# Step 1: Check if you have Apple Developer Account
header "Step 1: Apple Developer Account Check"
echo ""

echo "Do you have an Apple Developer Account?"
echo ""
echo "If YES: You can get your Team ID now"
echo "If NO:  You can proceed without Team ID, but some features won't work"
echo ""
read -p "Do you have Apple Developer Account? (y/n): " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    HAS_DEVELOPER_ACCOUNT=true
    ok "Proceeding with Team ID setup"
else
    HAS_DEVELOPER_ACCOUNT=false
    warn "No Apple Developer Account detected"
    echo ""
    echo "You can:"
    echo "  1. Proceed without Team ID (basic Firebase features only)"
    echo "  2. Get Apple Developer Account ($99/year) and return later"
    echo ""
    read -p "Continue without Team ID? (y/n): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo ""
        info "Get Apple Developer Account at: https://developer.apple.com/programs/"
        echo "Then run this script again."
        exit 0
    fi
fi

# Step 2: Find Team ID (if developer account)
if [ "$HAS_DEVELOPER_ACCOUNT" = true ]; then
    header "Step 2: Find Your Apple Team ID"
    echo ""
    
    echo "Method 1: Apple Developer Portal (Recommended)"
    echo "1. Go to: https://developer.apple.com/account/"
    echo "2. Sign in with your Apple ID"
    echo "3. Click on 'Membership' in the sidebar"
    echo "4. Look for 'Team ID' (10-character string)"
    echo ""
    echo "Example Team ID: AB12CD34EF"
    echo ""
    
    echo "Method 2: Xcode (if installed)"
    echo "1. Open Xcode"
    echo "2. Go to Preferences → Accounts"
    echo "3. Select your Apple ID"
    echo "4. Team ID appears under the team name"
    echo ""
    
    echo "Method 3: Command Line (if you have certificates)"
    echo "1. Run: security find-identity -v -p codesigning"
    echo "2. Look for your Team ID in the certificate details"
    echo ""
    
    echo "Enter your Team ID (10 characters):"
    read -p "Team ID: " TEAM_ID
    
    # Validate Team ID format
    if [[ ${#TEAM_ID} -eq 10 && $TEAM_ID =~ ^[A-Z0-9]+$ ]]; then
        ok "Team ID format looks correct: $TEAM_ID"
    else
        fail "Team ID should be 10 characters (letters and numbers only)"
        echo "Example: AB12CD34EF"
        echo ""
        read -p "Try again? (y/n): " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            exit 1
        fi
        # Loop back to Team ID entry
        exec "$0"
    fi
    
    echo ""
    info "Your Team ID: $TEAM_ID"
    echo ""
else
    TEAM_ID=""
    warn "Skipping Team ID setup - no developer account"
fi

# Step 3: Add Team ID to Firebase Projects
header "Step 3: Add Team ID to Firebase Projects"
echo ""

if [ "$HAS_DEVELOPER_ACCOUNT" = true ]; then
    echo "Add Team ID to BOTH Firebase projects:"
    echo ""
    echo "1. Staging Firebase:"
    echo "   - Go to: https://console.firebase.google.com/project/traxettle-staging/settings/general"
    echo "   - Click on your iOS app"
    echo "   - Add Team ID: $TEAM_ID"
    echo ""
    echo "2. Production Firebase:"
    echo "   - Go to: https://console.firebase.google.com/project/traxettle-prod/settings/general"
    echo "   - Click on your iOS app"
    echo "   - Add the SAME Team ID: $TEAM_ID"
    echo ""
    warn "IMPORTANT: Use the SAME Team ID in both Firebase projects!"
    echo "This allows the same iOS app to work in both environments."
    echo ""
    read -p "Press Enter after adding Team ID to both Firebase projects..."
else
    warn "Skipping Firebase Team ID setup - no developer account"
    echo ""
    echo "When you get a developer account:"
    echo "  1. Run this script again to get your Team ID"
    echo "  2. Add Team ID to both Firebase projects"
    echo ""
fi

# Step 4: Download Updated Config Files
header "Step 4: Download Updated iOS Config"
echo ""

echo "After adding Team ID, download updated iOS config files:"
echo ""
echo "1. Staging Firebase:"
echo "   - Go to traxettle-staging → Project Settings → Your Apps"
echo "   - Click on iOS app → Download GoogleService-Info.plist"
echo "   - Save as: apps/mobile/GoogleService-Info.staging.plist"
echo ""
echo "2. Production Firebase:"
echo "   - Go to traxettle-prod → Project Settings → Your Apps"
echo "   - Click on iOS app → Download GoogleService-Info.plist"
echo "   - Save as: apps/mobile/GoogleService-Info.prod.plist"
echo ""

if [ "$HAS_DEVELOPER_ACCOUNT" = true ]; then
    read -p "Press Enter after downloading both config files..."
else
    warn "Skip this step until you have developer account"
fi

# Step 5: Verify Bundle ID Consistency
header "Step 5: Verify Bundle ID Consistency"
echo ""

echo "Ensure Bundle ID is consistent across all environments:"
echo ""
echo "1. Check your app's Bundle ID:"
echo "   - apps/mobile/app.json → 'expo.android.package' for Android"
echo "   - apps/mobile/app.json → 'expo.ios.bundleIdentifier' for iOS"
echo ""
echo "2. Ensure Firebase apps use the same Bundle ID:"
echo "   - Both Firebase projects should have the same iOS Bundle ID"
echo ""
echo "3. For single bundle approach:"
echo "   - Use production Bundle ID in all environments"
echo "   - Runtime config determines Firebase connection"
echo ""

# Step 6: Next Steps
header "Step 6: Next Steps"
echo ""

if [ "$HAS_DEVELOPER_ACCOUNT" = true ]; then
    ok "Team ID setup complete!"
    echo ""
    echo "Next steps:"
    echo "  1. Continue with Firebase production setup"
    echo "  2. Set up iOS certificates and provisioning"
    echo "  3. Configure push notifications (if needed)"
    echo "  4. Test Apple Sign-In (if using)"
    echo ""
else
    warn "Team ID setup incomplete - no developer account"
    echo ""
    echo "When ready:"
    echo "  1. Get Apple Developer Account: https://developer.apple.com/programs/"
    echo "  2. Run this script again: ./common/scripts/doctor-apple-team.sh"
    echo "  3. Continue with Firebase setup"
    echo ""
fi

# Summary
header "Summary"
echo ""

if [ "$HAS_DEVELOPER_ACCOUNT" = true ]; then
    echo "✅ Apple Developer Account confirmed"
    echo "✅ Team ID obtained: $TEAM_ID"
    echo "✅ Team ID added to staging Firebase"
    echo "✅ Team ID added to production Firebase"
    echo "✅ iOS config files downloaded"
    echo "✅ Bundle ID consistency verified"
else
    echo "⚠️ No Apple Developer Account (optional for basic features)"
    echo "⚠️ Team ID setup pending"
    echo "✅ Prerequisites checked"
fi

echo ""
warn "Remember:"
echo "  - Use SAME Team ID in both Firebase projects"
echo "  - Keep Bundle ID consistent across environments"
echo "  - Download updated config files after adding Team ID"
echo ""

if [ "$HAS_DEVELOPER_ACCOUNT" = true ]; then
    echo ""
    header "Apple Team ID Setup Complete!"
    echo ""
else
    echo ""
    info "Run this script again after getting Apple Developer Account"
    echo ""
fi
