#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────────────────────
# doctor-firebase-prod.sh — Firebase Production Setup Guide
#
# Usage: bash tools/doctor-tool/scripts/doctor-firebase-prod.sh
#
# This script provides step-by-step instructions for setting up the
# production Firebase project for Traxettle.
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
header "Firebase Production Setup Doctor"
echo ""

# Check prerequisites
info "Checking prerequisites..."

if ! command -v firebase >/dev/null 2>&1; then
  warn "Firebase CLI not found. Install with: npm install -g firebase-tools"
  echo "  Or visit: https://firebase.google.com/docs/cli"
fi

if [ ! -f "firebase.json" ]; then
  warn "firebase.json not found. Run from project root."
fi

echo ""
ok "Prerequisites checked"
echo ""

# Prerequisite: Keystore Setup
header "Prerequisite: Keystore & SHA-1 Setup"
echo ""

# Check if keystore already exists
KEYSTORE_FILE="apps/mobile/keystore/traxettle-release-key.keystore"
if [ -f "$KEYSTORE_FILE" ]; then
    ok "Release keystore found at: $KEYSTORE_FILE"
else
    warn "Keystore not found at: $KEYSTORE_FILE"
    echo ""
    echo "Please run the keystore setup first:"
    echo "  bash tools/doctor-tool/scripts/doctor-keystore.sh"
    echo ""
    read -p "Continue anyway? (y/n): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
fi

echo ""

# Prerequisite: Apple Team ID Setup
header "Prerequisite: Apple Team ID Setup"
echo ""

echo "For iOS app support, you need Apple Team ID:"
echo ""
echo "1. If you have Apple Developer Account:"
echo "   bash tools/doctor-tool/scripts/doctor-apple-team.sh"
echo ""
echo "2. If you don't have developer account:"
echo "   - You can proceed without Team ID (Android only)"
echo "   - iOS features will be limited"
echo ""
read -p "Have you set up Apple Team ID or want to skip iOS? (y/n): " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo ""
    info "Run Apple Team ID setup when ready:"
    echo "  bash tools/doctor-tool/scripts/doctor-apple-team.sh"
    echo ""
    read -p "Continue with Android-only setup? (y/n): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
fi

echo ""
info "You will need these SHA-1 fingerprints:"
echo "If you need SHA-1 values:"
echo "  Debug: keytool -list -v -keystore ~/.android/debug.keystore -alias androiddebugkey"
echo "  Release: keytool -list -v -keystore apps/mobile/keystore/traxettle-release-key.keystore -alias traxettle-key"
echo ""

# Step 1: Create Firebase Project
header "Step 1: Create Firebase Production Project"
echo ""

echo "1. Go to Firebase Console: https://console.firebase.google.com/"
echo "2. Click 'Add project'"
echo "3. Project name: traxettle-prod"
echo "4. Enable Google Analytics (recommended)"
echo "5. Select existing account or create new"
echo "6. Wait for project creation"
echo ""

info "After creation, note the Project ID (should be: traxettle-prod)"
echo ""

# Step 2: Enable Services
header "Step 2: Enable Firebase Services"
echo ""

echo "In your traxettle-prod project, enable these services:"
echo ""
echo "🔥 Authentication:"
echo "  - Go to Authentication → Sign-in method"
echo "  - Enable Email/Password"
echo "  - Enable Google (configure OAuth consent screen if needed)"
echo ""
echo "📊 Firestore Database:"
echo "  - Go to Firestore Database → Get started"
echo "  - Start in PRODUCTION mode (NOT test mode)"
echo "  - Location: Same as staging"
echo "  - Security rules will be copied in Step 9"
echo ""
echo "📁 Storage:"
echo "  - Go to Storage → Get started"
echo "  - Start in PRODUCTION mode (NOT test mode)"
echo "  - Location: Same as staging"
echo "  - Security rules will be copied in Step 9"
echo ""
warn "CRITICAL: Always use PRODUCTION mode for production Firebase!"
echo "Test mode allows open access and is a security risk."
echo ""
echo ""
echo "☁️ Functions:"
echo "  - Go to Functions → Get started"
echo "  - This will be used for the API deployment"
echo ""

# Step 3: Add Android App + Exchange SHA-1
header "Step 3: Add Android App + Exchange SHA-1"
echo ""

echo "1. In Firebase Console, go to traxettle-prod → Project Settings → General"
echo "2. Click 'Add app' → Android"
echo "3. Package name: com.traxettle.app"
echo "4. Download google-services.json"
echo "5. Save as: apps/mobile/google-services.prod.json"
echo ""
echo "6. Add SHA-1 fingerprints to BOTH Firebase projects:"
echo "   - See doctor-keystore.sh, Step 3: 'Generate SHA-1 Fingerprints'"
echo "   - Add BOTH SHA-1s to traxettle-prod Firebase project"
echo "   - Add BOTH SHA-1s to traxettle-staging Firebase project"
echo ""
warn "CRITICAL: Both Firebase projects must have the SAME SHA-1 fingerprints!"
echo "This allows the same app to work in both environments."
echo ""
echo "For detailed SHA-1 instructions:"
echo "  bash tools/doctor-tool/scripts/doctor-keystore.sh"
echo "  (See Step 3: Generate SHA-1 Fingerprints)"
echo ""

# Step 4: Add iOS App
header "Step 4: Add iOS App to Firebase"
echo ""

echo "1. First, setup Apple Team ID (if not done already):"
echo "   bash tools/doctor-tool/scripts/doctor-apple-team.sh"
echo "   - This script helps you find your Apple Team ID"
echo "   - Adds Team ID to both Firebase projects"
echo "   - Downloads updated iOS config files"
echo ""
echo "2. In Firebase Console, go to Project Settings → General"
echo "3. Click 'Add app' → iOS"
echo "4. Bundle ID: com.traxettle.app (match your staging bundle ID)"
echo "5. Add Team ID (obtained from doctor-apple-team.sh)"
echo "6. Download GoogleService-Info.plist"
echo "7. Save as: apps/mobile/GoogleService-Info.prod.plist"
echo ""
echo "If you don't have Apple Developer Account:"
echo "  - You can skip this step (Android-only setup)"
echo "  - iOS features will be limited"
echo "  - Run doctor-apple-team.sh later when you get account"
echo ""
warn "IMPORTANT: Use the same Team ID and Bundle ID as staging"
echo "This allows the same iOS app to work in both environments."
echo ""
echo ""

# Step 5: Setup Gradle Configuration
header "Step 5: Setup Gradle Configuration"
echo ""

echo "Configure Gradle to use the external keystore:"
echo ""
echo "See doctor-keystore.sh for detailed instructions:"
echo "  - Step 4: 'Update Gradle Configuration'"
echo "  - Step 4.5: 'Automated Prebuild Protection'"
echo "  - Step 5: 'Google Play Console Setup'"
echo ""
echo "Quick setup:"
echo "  cp apps/mobile/android/gradle.properties.local.example apps/mobile/android/gradle.properties.local"
echo "  # Update STORE_FILE path to: ../../keystore/traxettle-release-key.keystore"
echo ""
echo "For automated prebuild (recommended):"
echo "  rushx prebuild:android:safe"
echo "  # OR: bash tools/doctor-tool/scripts/safe-prebuild.sh android"
echo ""
warn "IMPORTANT: Never commit gradle.properties.local to Git!"
echo "This file contains your keystore passwords."
echo ""
echo "For complete keystore and Gradle setup:"
echo "  bash tools/doctor-tool/scripts/doctor-keystore.sh"
echo "  (See Steps 4-5 for Gradle and Play Console setup)"
echo ""

# Step 6: Deploy API to Staging
header "Step 6: Deploy API to Staging"
echo ""

echo "Deploy API with config endpoint to staging:"
echo ""
echo "1. Run staging deployment:"
echo "   ./scripts/api-deployment/deploy-staging.sh"
echo ""
echo "2. Test config endpoint works:"
echo "   curl https://staging-api.traxettle.app/api/config"
echo ""
echo "3. You should see response like:"
echo '   {"success":true,"data":{"env":"staging",...}}'
echo ""

# Step 7: Deploy API to Production
header "Step 7: Deploy API to Production"
echo ""

echo "Deploy API with config endpoint to production:"
echo ""
echo "1. Run production deployment:"
echo "   ./scripts/api-deployment/deploy-prod.sh"
echo "   # OR"
echo "   ./scripts/api-deployment/deploy-prod-gmail.sh"
echo ""
echo "2. Test config endpoint works:"
echo "   curl https://traxettle-prod.web.app/api/config"
echo ""
echo "3. You should see response like:"
echo '   {"success":true,"data":{"env":"production",...}}'
echo ""

# Step 8: Use Production Config for All Builds
header "Step 8: Use Production Config for All Builds"
echo ""

echo "Copy production Firebase config to default (for single bundle):"
echo ""
echo "1. Copy production Android config:"
echo "   cp apps/mobile/google-services.prod.json apps/mobile/google-services.json"
echo ""
echo "2. Copy production iOS config:"
echo "   cp apps/mobile/GoogleService-Info.prod.plist apps/mobile/GoogleService-Info.plist"
echo ""
warn "IMPORTANT: Now all builds will use production Firebase config"
echo "The app will connect to staging or production based on runtime config"
echo ""

# Step 9: Setup Security Rules
header "Step 9: Setup Security Rules"
echo ""

echo "1. Copy Firestore rules from staging:"
echo "   - Go to Firebase Console → traxettle-staging → Firestore Database → Rules"
echo "   - Copy the rules"
echo "   - Go to traxettle-prod → Firestore Database → Rules"
echo "   - Paste and publish"
echo ""
echo "2. Copy Storage rules from staging:"
echo "   - Go to Firebase Console → traxettle-staging → Storage → Rules"
echo "   - Copy the rules"
echo "   - Go to traxettle-prod → Storage → Rules"
echo "   - Paste and publish"
echo ""
echo "3. Check Firebase Hosting rules (if any):"
echo "   - Review firebase.json in your project"
echo "   - Ensure hosting rules are appropriate for production"
echo ""

# Step 10: Build Single Bundle
header "Step 10: Build Single Bundle"
echo ""

echo "Build the app bundle (single build for all environments):"
echo ""
echo "1. Build the bundle:"
echo "   cd apps/mobile"
echo "   rushx build:android"
echo ""
echo "2. This creates a single .aab file that works in both environments"
echo "   - The bundle uses production Firebase config by default"
echo "   - Runtime config determines which API to call (production or staging)"
echo "   - Developer options allow manual switching to staging mode"
echo "   - No separate staging or production builds needed"
echo ""

# Step 11: Test on Staging
header "Step 11: Test on Staging"
echo ""

echo "Test the single bundle on staging environment:"
echo ""
echo "1. Upload to Play Console:"
echo "   - Go to Google Play Console"
echo "   - Upload the .aab file to Internal Testing"
echo "   - Create testing track for staging"
echo ""
echo "2. Test the app:"
echo "   - Install from Play Console"
echo "   - App will try production API first (default behavior)"
echo "   - If production API is not available, app will show error"
echo "   - Enable developer options: tap version text 7 times quickly"
echo "   - Switch to staging mode in developer options"
echo "   - 'STAGE' badge will appear in profile"
echo "   - App will now use staging API and Firebase"
echo "   - Test all features work correctly in staging mode"
echo ""
echo "3. Verify staging behavior:"
echo "   - Check 'STAGE' badge appears in profile"
echo "   - Verify data goes to staging Firebase project"
echo "   - Test switching back to production mode"
echo ""

# Step 12: Deploy to Production
header "Step 12: Deploy to Production"
echo ""

echo "Deploy the SAME bundle to production:"
echo ""
echo "1. Promote to production:"
echo "   - In Play Console, promote the SAME bundle"
echo "   - From Internal Testing to Production track"
echo "   - NO new build needed"
echo ""
echo "2. Production deployment:"
echo "   - The same bundle now connects to production API by default"
echo "   - Regular users will use production API automatically"
echo "   - Developer options remain available for testing"
echo "   - No app update needed for users"
echo ""
echo "3. Production verification:"
echo "   - Download from Play Store (production)"
echo "   - Verify no 'STAGE' badge appears (production mode)"
echo "   - Verify data goes to production Firebase project"
echo "   - Test that developer options still work for testers"
echo ""

# Summary
header "Summary Checklist"
echo ""

echo "✅ Firebase project traxettle-prod created"
echo "✅ Authentication, Firestore, Storage, Functions enabled"
echo "✅ Android app added to production Firebase"
echo "✅ SHA-1 fingerprints exchanged (both projects have both SHA-1s)"
echo "✅ Apple Team ID configured (if developer account available)"
echo "✅ iOS app added (com.traxettle.app)"
echo "✅ google-services.prod.json saved"
echo "✅ GoogleService-Info.prod.plist saved"
echo "✅ Gradle configured with external keystore"
echo "✅ Automated prebuild script ready (safe-prebuild.sh)"
echo "✅ Production config copied to default (for single bundle)"
echo "✅ API deployed to staging with /api/config endpoint"
echo "✅ API deployed to production with /api/config endpoint"
echo "✅ Security rules copied from staging"
echo "✅ Single bundle built (rushx build:android)"
echo "✅ Developer options implemented (hidden 7-tap trigger)"
echo "✅ Environment switching manual (no automatic fallback)"
echo "✅ Bundle tested on staging (via developer options)"
echo "✅ SAME bundle promoted to production"
echo "✅ Error handling for production API failure implemented"
echo ""

warn "Remember:"
echo "  - Same keystore used for both environments"
echo "  - Same SHA-1 fingerprints in both Firebase projects"
echo "  - Single bundle works in both environments"
echo "  - Production API is default, staging via developer options"
echo "  - No automatic fallback - manual environment switching"
echo "  - Developer options: tap version text 7 times quickly"
echo "  - 'STAGE' badge appears only in staging mode"
echo "  - Use rushx prebuild:android:safe for automated prebuild"
echo "  - Test thoroughly on staging before production"
echo ""

echo ""
header "Firebase Production Setup Complete!"
echo ""
