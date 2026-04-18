#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
TARGET_ENV_FILE="${ROOT_DIR}/.env.local"
TEMPLATE_FILE="${ROOT_DIR}/.env.revenuecat.template"

echo "Traxettle RevenueCat bootstrap"
echo "Repo: ${ROOT_DIR}"

if [[ ! -f "${TEMPLATE_FILE}" ]]; then
  echo "Template not found: ${TEMPLATE_FILE}"
  exit 1
fi

if [[ -f "${TARGET_ENV_FILE}" ]]; then
  echo ".env.local already exists at ${TARGET_ENV_FILE}."
  echo "Keeping existing file. Edit it manually if needed."
else
  cp "${TEMPLATE_FILE}" "${TARGET_ENV_FILE}"
  echo "Created ${TARGET_ENV_FILE} from template."
fi

read -r -p "Set APP_ENV (local/staging/production) [local]: " APP_ENV_INPUT
APP_ENV_INPUT="${APP_ENV_INPUT:-local}"

read -r -p "Enable INTERNAL_TIER_SWITCH_ENABLED? (true/false) [true]: " SWITCH_INPUT
SWITCH_INPUT="${SWITCH_INPUT:-true}"

read -r -p "RevenueCat Webhook Secret: " WEBHOOK_SECRET_INPUT
read -r -p "RevenueCat API Key (optional for webhook-only path): " API_KEY_INPUT
read -r -p "RevenueCat Pro Entitlement ID [pro]: " ENTITLEMENT_INPUT
ENTITLEMENT_INPUT="${ENTITLEMENT_INPUT:-pro}"

TMP_FILE="$(mktemp)"
awk -v app_env="${APP_ENV_INPUT}" \
    -v switch_enabled="${SWITCH_INPUT}" \
    -v webhook_secret="${WEBHOOK_SECRET_INPUT}" \
    -v api_key="${API_KEY_INPUT}" \
    -v entitlement="${ENTITLEMENT_INPUT}" \
'
{
  if ($0 ~ /^APP_ENV=/) { print "APP_ENV=" app_env; next; }
  if ($0 ~ /^INTERNAL_TIER_SWITCH_ENABLED=/) { print "INTERNAL_TIER_SWITCH_ENABLED=" switch_enabled; next; }
  if ($0 ~ /^REVENUECAT_WEBHOOK_SECRET=/) { print "REVENUECAT_WEBHOOK_SECRET=" webhook_secret; next; }
  if ($0 ~ /^REVENUECAT_API_KEY=/) { print "REVENUECAT_API_KEY=" api_key; next; }
  if ($0 ~ /^REVENUECAT_PRO_ENTITLEMENT_ID=/) { print "REVENUECAT_PRO_ENTITLEMENT_ID=" entitlement; next; }
  print $0;
}
' "${TARGET_ENV_FILE}" > "${TMP_FILE}"

mv "${TMP_FILE}" "${TARGET_ENV_FILE}"

echo
echo "Bootstrap complete."
echo "Next:"
echo "1) Run scripts/revenuecat/check-config.sh"
echo "2) Start API: cd ${ROOT_DIR} && rush dev:api"
echo "3) Run scripts/revenuecat/smoke-webhook.sh"
