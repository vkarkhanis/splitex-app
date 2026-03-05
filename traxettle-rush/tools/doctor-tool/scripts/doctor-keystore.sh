#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────────────────────
# doctor-keystore.sh — Android Keystore & SHA Management for Traxettle
#
# Usage: ./common/scripts/doctor-keystore.sh
#
# This script provides step-by-step instructions for:
# - Creating Android keystore for app signing
# - Generating SHA-1 fingerprints for Firebase
# - Managing keystore across environments
# - Recovery steps if keystore is lost
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
header "Android Keystore & SHA Management Setup"
echo ""

# Check if keystore already exists
KEYSTORE_FILE="apps/mobile/android/app/traxettle-release-key.keystore"
if [ -f "$KEYSTORE_FILE" ]; then
    warn "Keystore already exists at: $KEYSTORE_FILE"
    echo ""
    echo "If you want to create a new keystore:"
    echo "1. Back up existing keystore: cp $KEYSTORE_FILE $KEYSTORE_FILE.backup"
    echo "2. Remove existing: rm $KEYSTORE_FILE"
    echo "3. Run this script again"
    echo ""
    echo "If you want to continue with existing keystore, skip to Step 2"
    echo ""
    read -p "Continue with existing keystore? (y/n): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
fi

# Step 1: Create Keystore
header "Step 1: Create Release Keystore"
echo ""

echo "Creating keystore for app signing..."
echo ""

info "IMPORTANT: Create keystore OUTSIDE generated directory!"
echo "Generated directories (android/, ios/) are deleted by prebuild."
echo ""
echo "Recommended location: apps/mobile/keystore/traxettle-release-key.keystore"
echo ""

# Check if keytool is available
if ! command -v keytool >/dev/null 2>&1; then
    fail "keytool not found. Install Java JDK or add to PATH"
    echo "  keytool comes with Java JDK"
    echo "  Install with: brew install openjdk (macOS) or apt install openjdk-11-jdk (Ubuntu)"
    exit 1
fi

# Create keystore directory if it doesn't exist
KEYSTORE_DIR="apps/mobile/keystore"
mkdir -p "$KEYSTORE_DIR"
KEYSTORE_FILE="$KEYSTORE_DIR/traxettle-release-key.keystore"

if [ ! -f "$KEYSTORE_FILE" ]; then
    echo "Run this command to create keystore:"
    echo ""
    cat << 'EOF'
keytool -genkey -v -keystore apps/mobile/keystore/traxettle-release-key.keystore \
  -alias traxettle-key \
  -keyalg RSA \
  -keysize 2048 \
  -validity 10000 \
  -storepass traxettle2024 \
  -keypass traxettle2024 \
  -dname "CN=Traxettle, OU=Mobile, O=Traxettle, L=Bangalore, ST=Karnataka, C=IN"
EOF
    echo ""
    echo "Press Enter after running the command above..."
    read
fi

if [ -f "$KEYSTORE_FILE" ]; then
    ok "Keystore created/exists at: $KEYSTORE_FILE"
else
    fail "Keystore not found. Please run the command above first."
    exit 1
fi

# Step 2: Generate SHA-1 Fingerprints
header "Step 2: Generate SHA-1 Fingerprints"
echo ""

echo "Generating SHA-1 fingerprints needed for Firebase..."
echo ""

# Debug keystore SHA-1
info "Debug keystore SHA-1 (for local development):"
echo "  keytool -list -v -keystore ~/.android/debug.keystore -alias androiddebugkey"
echo ""
echo "Default debug keystore password: android"
echo ""

# Release keystore SHA-1
info "Release keystore SHA-1 (for production/staging):"
echo "  keytool -list -v -keystore apps/mobile/keystore/traxettle-release-key.keystore -alias traxettle-key"
echo ""
echo "Keystore password: traxettle2024"
echo ""

echo "Run these commands and note the SHA-1 fingerprints:"
echo ""
read -p "Press Enter after generating SHA-1 fingerprints..."

# Step 3: Add SHA to Firebase Projects
header "Step 3: Add SHA-1 to Firebase Projects"
echo ""

echo "Add these SHA-1 fingerprints to BOTH Firebase projects:"
echo ""
echo "1. Staging Firebase (traxettle-staging):"
echo "   - Go to: https://console.firebase.google.com/project/traxettle-staging/settings/general"
echo "   - Scroll to 'Your apps' → Android app"
echo "   - Click 'Add fingerprint'"
echo "   - Add both SHA-1 values (debug and release)"
echo ""
echo "2. Production Firebase (traxettle-prod):"
echo "   - Go to: https://console.firebase.google.com/project/traxettle-prod/settings/general"
echo "   - Add Android app (if not already added)"
echo "   - Add the SAME SHA-1 fingerprints"
echo ""
warn "IMPORTANT: Use the SAME SHA-1 fingerprints in both projects!"
echo "This allows the same app to work in both environments."
echo ""

# Step 4: Update Gradle Configuration
header "Step 4: Update Gradle Configuration"
echo ""

echo "Configure Gradle to use the external keystore:"
echo ""
echo "1. Create gradle.properties.local with keystore location:"
echo "   File: apps/mobile/android/gradle.properties.local"
echo ""
cat << 'EOF'
MYAPP_RELEASE_STORE_FILE=../../keystore/traxettle-release-key.keystore
MYAPP_RELEASE_KEY_ALIAS=traxettle-key
MYAPP_RELEASE_STORE_PASSWORD=traxettle2024
MYAPP_RELEASE_KEY_PASSWORD=traxettle2024
EOF
echo ""
echo "2. Copy from example if it exists:"
echo "   cp apps/mobile/android/gradle.properties.local.example apps/mobile/android/gradle.properties.local"
echo ""
echo "3. Update the STORE_FILE path to point to external keystore:"
echo "   ../../keystore/traxettle-release-key.keystore"
echo ""

# Step 4.5: Automated Prebuild Protection
header "Step 4.5: Automated Prebuild Protection"
echo ""

warn "CRITICAL: Expo prebuild DELETES android/ and ios/ directories!"
echo ""
echo "Use the automated safe prebuild script:"
echo ""
echo "  ./common/scripts/safe-prebuild.sh android"
echo "  ./common/scripts/safe-prebuild.sh ios"
echo ""
echo "This script automatically:"
echo "  1. Backs up gradle.properties.local before prebuild"
echo "  2. Runs expo prebuild"
echo "  3. Restores gradle.properties.local after prebuild"
echo "  4. Verifies keystore configuration"
echo ""
echo "The keystore is safe in apps/mobile/keystore/ (not deleted by prebuild)"
echo ""
echo "For manual prebuild (not recommended):"
echo "  See the safe-prebuild.sh script for manual steps"
echo ""

# Step 5: Google Play Console Setup
header "Step 5: Google Play Console Setup"
echo ""

echo "Upload app signing key to Google Play Console:"
echo ""
echo "1. Go to Google Play Console"
echo "2. Select your app"
echo "3. Go to Setup → App integrity → App signing"
echo "4. Upload the same keystore:"
echo "   - Keystore: apps/mobile/keystore/traxettle-release-key.keystore"
echo "   - Key alias: traxettle-key"
echo "   - Passwords: traxettle2024"
echo ""
warn "Use the SAME keystore for both staging internal testing and production!"
echo "This ensures the same app can be promoted from testing to production."
echo ""

# Step 6: Backup and Recovery
header "Step 6: Backup and Recovery"
echo ""

echo "CRITICAL: Back up your keystore securely:"
echo ""
echo "1. Create a secure backup:"
echo "   cp apps/mobile/keystore/traxettle-release-key.keystore ~/traxettle-keystore-backup.jks"
echo "   cp apps/mobile/android/gradle.properties.local ~/traxettle-gradle-backup.properties"
echo ""
echo "2. Store backups in multiple secure locations:"
echo "   - Cloud storage (Google Drive, Dropbox)"
echo "   - USB drive"
echo "   - Password manager"
echo ""
echo "3. Document passwords securely:"
echo "   - Keystore password: traxettle2024"
echo "   - Key alias: traxettle-key"
echo "   - Key password: traxettle2024"
echo ""

# Step 7: Recovery Procedures
header "Step 7: If Keystore is Lost"
echo ""

warn "If you lose the keystore, you CANNOT update the existing app!"
echo ""
echo "Recovery options:"
echo ""
echo "1. If you have backup:"
echo "   - Restore keystore to apps/mobile/keystore/"
echo "   - Restore gradle.properties.local"
echo "   - Continue with same app"
echo ""
echo "2. If NO backup available:"
echo "   - Create NEW keystore (different alias/password)"
echo "   - Update Firebase projects with NEW SHA-1"
echo "   - Create NEW app in Google Play Console"
echo "   - Users must reinstall the app (cannot update existing)"
echo ""
echo "3. Prevent future loss:"
echo "   - Set up automated backup to cloud"
echo "   - Store in team password manager"
echo "   - Document recovery procedure"
echo ""

# Step 8: Verification
header "Step 8: Verification"
echo ""

echo "Verify everything is working:"
echo ""
echo "1. Build test APK:"
echo "   cd apps/mobile"
echo "   rushx build:android:debug"
echo ""
echo "2. Install and test:"
echo "   - Install APK on device"
echo "   - Test Google Sign-In"
echo "   - Test Firebase features"
echo ""
echo "3. Check SHA-1 in Firebase:"
echo "   - Verify both SHA-1 fingerprints are added"
echo "   - Test with debug and release builds"
echo ""

# Summary
header "Summary Checklist"
echo ""

echo "✅ Release keystore created"
echo "✅ SHA-1 fingerprints generated"
echo "✅ SHA-1 added to staging Firebase"
echo "✅ SHA-1 added to production Firebase"
echo "✅ Gradle configuration updated"
echo "✅ Google Play Console configured"
echo "✅ Keystore backed up securely"
echo "✅ Recovery procedures documented"
echo ""

warn "Remember:"
echo "  - NEVER commit keystore to Git"
echo "  - ALWAYS back up keystore securely"
echo "  - USE SAME keystore for all environments"
echo "  - DOCUMENT passwords securely"
echo ""

echo ""
header "Keystore Setup Complete!"
echo ""
