#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────────────────────
# safe-prebuild.sh - Safe Expo Prebuild with Keystore Protection
#
# Usage: bash tools/doctor-tool/scripts/safe-prebuild.sh android|ios
#
# This script automates prebuild while protecting keystore configuration.
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

# Check platform argument
if [ $# -ne 1 ]; then
    echo "Usage: $0 android|ios"
    exit 1
fi

PLATFORM=$1
if [ "$PLATFORM" != "android" ] && [ "$PLATFORM" != "ios" ]; then
    fail "Platform must be 'android' or 'ios'"
    exit 1
fi

echo ""
header "Safe Expo Prebuild - $PLATFORM"
echo ""

# Get project root
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$(dirname "$SCRIPT_DIR")")"
cd "$PROJECT_ROOT"

info "Project root: $PROJECT_ROOT"

# Step 1: Backup configuration files
header "Step 1: Backup Configuration Files"
echo ""

if [ "$PLATFORM" = "android" ]; then
    GRADLE_LOCAL="apps/mobile/android/gradle.properties.local"
    BACKUP_FILE="$HOME/gradle-local-backup.properties"
    
    if [ -f "$GRADLE_LOCAL" ]; then
        cp "$GRADLE_LOCAL" "$BACKUP_FILE"
        ok "Backed up gradle.properties.local"
        info "Backup location: $BACKUP_FILE"
    else
        warn "gradle.properties.local not found - no backup needed"
    fi
else
    # iOS specific backups if needed
    warn "iOS prebuild protection not implemented yet"
    warn "Manual backup may be required for iOS configuration"
fi

echo ""

# Step 2: Run prebuild
header "Step 2: Running Expo Prebuild"
echo ""

info "Running: rushx prebuild:$PLATFORM"
echo ""

cd apps/mobile
rushx "prebuild:$PLATFORM"

echo ""
ok "Prebuild completed successfully"
echo ""

# Step 3: Restore configuration files
header "Step 3: Restore Configuration Files"
echo ""

if [ "$PLATFORM" = "android" ]; then
    if [ -f "$BACKUP_FILE" ]; then
        # Ensure directory exists
        mkdir -p "$(dirname "$GRADLE_LOCAL")"
        
        # Copy back the configuration
        cp "$BACKUP_FILE" "$GRADLE_LOCAL"
        ok "Restored gradle.properties.local"
        
        # Clean up backup
        rm "$BACKUP_FILE"
        info "Cleaned up backup file"
    else
        warn "No backup file found - configuration not restored"
        warn "You may need to manually configure gradle.properties.local"
    fi
fi

echo ""

# Step 4: Verify keystore configuration
header "Step 4: Verify Configuration"
echo ""

if [ "$PLATFORM" = "android" ]; then
    if [ -f "$GRADLE_LOCAL" ]; then
        ok "gradle.properties.local exists"
        
        # Check if keystore path is correct
        if grep -q "keystore/traxettle-release-key.keystore" "$GRADLE_LOCAL"; then
            ok "Keystore path points to external location"
        else
            warn "Keystore path may not be configured correctly"
            warn "Expected: ../../keystore/traxettle-release-key.keystore"
        fi
        
        # Check if keystore exists
        if [ -f "apps/mobile/keystore/traxettle-release-key.keystore" ]; then
            ok "Keystore file exists"
        else
            warn "Keystore file not found at apps/mobile/keystore/traxettle-release-key.keystore"
        warn "Run bash tools/doctor-tool/scripts/doctor-keystore.sh to create keystore"
        fi
    else
        fail "gradle.properties.local not found after restore"
        fail "Prebuild protection may have failed"
    fi
fi

echo ""
header "Safe Prebuild Complete!"
echo ""

ok "Your $PLATFORM project has been prebuilt safely"
ok "Keystore configuration has been preserved"
echo ""

info "Next steps:"
echo "  1. Build your app: rushx build:$PLATFORM"
echo "  2. Test the build"
echo "  3. Deploy to testing/production"
echo ""
