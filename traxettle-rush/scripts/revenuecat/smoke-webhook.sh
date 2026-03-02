#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
ENV_FILE="${ROOT_DIR}/.env.local"
API_BASE="${API_BASE:-http://localhost:3001}"
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

if [[ -z "${REVENUECAT_WEBHOOK_SECRET:-}" ]]; then
  echo "REVENUECAT_WEBHOOK_SECRET is empty in ${ENV_FILE}"
  exit 1
fi

read -r -p "App user ID to apply PRO entitlement to [mock-user-1]: " APP_USER_ID
APP_USER_ID="${APP_USER_ID:-mock-user-1}"

PAYLOAD="$(cat <<JSON
{
  "event": {
    "id": "smoke-$(date +%s)",
    "type": "INITIAL_PURCHASE",
    "app_user_id": "${APP_USER_ID}",
    "entitlement_ids": ["${REVENUECAT_PRO_ENTITLEMENT_ID:-pro}"],
    "expiration_at": null
  }
}
JSON
)"

echo "Sending webhook payload to ${API_BASE}/api/billing/revenuecat/webhook"
HTTP_CODE="$(curl -sS -o /tmp/traxettle_revenuecat_smoke.json -w "%{http_code}" \
  -X POST "${API_BASE}/api/billing/revenuecat/webhook" \
  -H "Content-Type: application/json" \
  -H "X-Webhook-Secret: ${REVENUECAT_WEBHOOK_SECRET}" \
  -d "${PAYLOAD}")"

echo "HTTP ${HTTP_CODE}"
cat /tmp/traxettle_revenuecat_smoke.json

if [[ "${HTTP_CODE}" != "200" ]]; then
  echo "Smoke webhook failed."
  exit 1
fi

echo
echo "Smoke webhook succeeded."
echo "Verify with /api/users/profile on that user session."
