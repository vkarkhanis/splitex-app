#!/bin/bash

# Traxettle Doctor Script - Rush Command Wrapper
# Usage: rush doctor [environment]

# Get the directory where this script is located
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Run the doctor script with all arguments
node "$SCRIPT_DIR/../common/scripts/doctor.js" "$@"
