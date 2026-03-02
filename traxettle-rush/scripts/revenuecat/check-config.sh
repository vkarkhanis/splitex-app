#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
ENV_FILE="${ROOT_DIR}/.env.local"
RC_LOADER="${ROOT_DIR}/scripts/revenuecat/load-rc-config.sh"

if [[ ! -f "${ENV_FILE}" ]]; then
  echo "Missing ${ENV_FILE}. Run scripts/revenuecat/bootstrap.sh first."
  exit 1
fi

set -a
source "${ENV_FILE}"
set +a

if [[ -f "$RC_LOADER" ]]; then
  # shellcheck disable=SC1090
  source "$RC_LOADER" local
fi

missing=0
for key in APP_ENV INTERNAL_TIER_SWITCH_ENABLED REVENUECAT_WEBHOOK_SECRET REVENUECAT_PRO_ENTITLEMENT_ID PAYMENT_GATEWAY_MODE PAYMENT_ALLOW_REAL_IN_NON_PROD; do
  if [[ -z "${!key:-}" ]]; then
    echo "[MISSING] ${key}"
    missing=1
  else
    echo "[OK] ${key}=${!key}"
  fi
done

if [[ "${missing}" -ne 0 ]]; then
  echo "Config validation failed."
  exit 1
fi

echo
echo "Config validation passed."
echo "Tip: keep PAYMENT_ALLOW_REAL_IN_NON_PROD=false for safe default testing."
