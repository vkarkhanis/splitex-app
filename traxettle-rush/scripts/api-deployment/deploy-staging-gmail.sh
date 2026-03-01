#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SECRETS_FILE="${SCRIPT_DIR}/smtp_staging.local.properties"

if [[ ! -f "$SECRETS_FILE" ]]; then
  echo "ERROR: Missing $SECRETS_FILE" >&2
  echo "Create it from scripts/api-deployment/smtp_local.properties.example" >&2
  exit 1
fi

set -a
source "$SECRETS_FILE"
set +a

if [[ -z "${SMTP_PASS:-}" ]]; then
  echo "ERROR: SMTP_PASS is empty in $SECRETS_FILE" >&2
  exit 1
fi

exec bash "${SCRIPT_DIR}/deploy-staging.sh"
