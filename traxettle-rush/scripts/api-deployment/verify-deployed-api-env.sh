#!/usr/bin/env bash
set -euo pipefail

# Verifies that a deployed Cloud Run API will not generate localhost links in emails.
#
# Rule:
# - OK if APP_URL is set to a non-localhost URL
# - OR OK if FIREBASE_PROJECT_ID is set and not "local"
#
# Usage:
#   bash scripts/api-deployment/verify-deployed-api-env.sh staging
#   bash scripts/api-deployment/verify-deployed-api-env.sh production
#
# Optional overrides (advanced):
#   GCP_PROJECT_ID=... REGION=... SERVICE_NAME=... bash scripts/api-deployment/verify-deployed-api-env.sh staging

ENVIRONMENT="${1:-}"
if [[ -z "$ENVIRONMENT" ]]; then
  echo "ERROR: Missing environment. Use: staging | production" >&2
  exit 1
fi

case "$ENVIRONMENT" in
  staging)
    DEFAULT_GCP_PROJECT_ID="traxettle-staging"
    DEFAULT_REGION="us-central1"
    DEFAULT_SERVICE_NAME="traxettle-api-staging"
    DEFAULT_EXPECTED_APP_URL="https://traxettle-staging.web.app"
    SECRET_FIREBASE_PROJECT_ID="traxettle-stg-firebase-project-id"
    ;;
  prod|production)
    DEFAULT_GCP_PROJECT_ID=""
    DEFAULT_REGION="us-central1"
    DEFAULT_SERVICE_NAME="traxettle-api-prod"
    DEFAULT_EXPECTED_APP_URL="https://traxettle.app"
    SECRET_FIREBASE_PROJECT_ID="traxettle-prod-firebase-project-id"
    ;;
  *)
    echo "ERROR: Unknown environment: $ENVIRONMENT (use staging | production)" >&2
    exit 1
    ;;
esac

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"

# Load saved config if present (created by configure-staging.sh / configure-prod.sh)
CONFIG_FILE=""
if [[ "$ENVIRONMENT" == "staging" ]]; then
  CONFIG_FILE="${REPO_ROOT}/.traxettle/api-staging.env"
else
  CONFIG_FILE="${REPO_ROOT}/.traxettle/api-prod.env"
fi
if [[ -f "$CONFIG_FILE" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "$CONFIG_FILE"
  set +a
fi

GCP_PROJECT_ID="${GCP_PROJECT_ID:-$DEFAULT_GCP_PROJECT_ID}"
REGION="${REGION:-$DEFAULT_REGION}"
SERVICE_NAME="${SERVICE_NAME:-$DEFAULT_SERVICE_NAME}"
EXPECTED_APP_URL="${EXPECTED_APP_URL:-$DEFAULT_EXPECTED_APP_URL}"

fail() {
  echo "ERROR: $*" >&2
  exit 1
}

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || fail "Missing command: $1"
}

mask() {
  # masks a secret-ish value but keeps it recognizable
  local value="${1:-}"
  local keep="${2:-3}"
  if [[ -z "$value" ]]; then
    echo ""
    return
  fi
  if [[ "${#value}" -le $((keep * 2)) ]]; then
    echo "***"
    return
  fi
  echo "${value:0:keep}***${value: -keep}"
}

is_localhost_url() {
  local url="${1:-}"
  [[ "$url" == http://localhost:* || "$url" == http://127.0.0.1:* || "$url" == *"://localhost"* || "$url" == *"://127.0.0.1"* ]]
}

require_cmd gcloud
require_cmd node

if [[ -z "$GCP_PROJECT_ID" ]]; then
  fail "GCP_PROJECT_ID is empty. Set it (or run configure-prod.sh first)."
fi

echo ""
echo "═══════════════════════════════════════════════"
echo "  Verify deployed API env ($ENVIRONMENT)"
echo "═══════════════════════════════════════════════"
echo "Project:  $GCP_PROJECT_ID"
echo "Region:   $REGION"
echo "Service:  $SERVICE_NAME"
echo ""

SERVICE_JSON="$(gcloud run services describe "$SERVICE_NAME" --region "$REGION" --project "$GCP_PROJECT_ID" --format=json 2>/dev/null || true)"
if [[ -z "$SERVICE_JSON" ]]; then
  fail "Could not read Cloud Run service. Check: gcloud auth login, permissions, service name, project, region."
fi

APP_URL_VALUE="$(
  SERVICE_JSON="$SERVICE_JSON" node -e "
    const data = JSON.parse(process.env.SERVICE_JSON);
    const env = (((data || {}).spec || {}).template || {}).spec?.containers?.[0]?.env || [];
    const found = env.find(e => e && e.name === 'APP_URL');
    const val = found && typeof found.value === 'string' ? found.value : '';
    process.stdout.write(val);
  " 2>/dev/null || true
)"

FIREBASE_PROJECT_ID_PRESENT="$(
  SERVICE_JSON="$SERVICE_JSON" node -e "
    const data = JSON.parse(process.env.SERVICE_JSON);
    const env = (((data || {}).spec || {}).template || {}).spec?.containers?.[0]?.env || [];
    const found = env.find(e => e && e.name === 'FIREBASE_PROJECT_ID');
    process.stdout.write(found ? 'yes' : 'no');
  " 2>/dev/null || true
)"

FIREBASE_PROJECT_ID_VALUE=""
if gcloud secrets describe "$SECRET_FIREBASE_PROJECT_ID" --project "$GCP_PROJECT_ID" >/dev/null 2>&1; then
  # Do not print the secret value; only use it for checks.
  FIREBASE_PROJECT_ID_VALUE="$(gcloud secrets versions access latest --secret "$SECRET_FIREBASE_PROJECT_ID" --project "$GCP_PROJECT_ID" 2>/dev/null || true)"
fi

echo "Checks:"
if [[ -n "${APP_URL_VALUE:-}" ]]; then
  if is_localhost_url "$APP_URL_VALUE"; then
    echo "  ❌ APP_URL is set to localhost: $(mask "$APP_URL_VALUE" 10)"
  else
    echo "  ✅ APP_URL is set: $(mask "$APP_URL_VALUE" 12)"
  fi
else
  echo "  ⚠️  APP_URL is empty or not set on the deployed service"
fi

if [[ "$FIREBASE_PROJECT_ID_PRESENT" == "yes" ]]; then
  echo "  ✅ FIREBASE_PROJECT_ID is configured on the deployed service"
else
  echo "  ❌ FIREBASE_PROJECT_ID is NOT configured on the deployed service"
fi

if [[ -n "${FIREBASE_PROJECT_ID_VALUE:-}" ]]; then
  if [[ "$FIREBASE_PROJECT_ID_VALUE" == "local" ]]; then
    echo "  ❌ FIREBASE_PROJECT_ID secret value is 'local' (this is only for local dev)"
  else
    echo "  ✅ FIREBASE_PROJECT_ID secret value looks non-local: $(mask "$FIREBASE_PROJECT_ID_VALUE" 6)"
  fi
else
  echo "  ⚠️  Could not read FIREBASE_PROJECT_ID secret value (permission or secret missing)"
fi

echo ""
EMAIL_LINKS_OK="no"
if [[ -n "${APP_URL_VALUE:-}" ]] && ! is_localhost_url "$APP_URL_VALUE"; then
  EMAIL_LINKS_OK="yes"
elif [[ "$FIREBASE_PROJECT_ID_PRESENT" == "yes" ]] && [[ -n "${FIREBASE_PROJECT_ID_VALUE:-}" ]] && [[ "$FIREBASE_PROJECT_ID_VALUE" != "local" ]]; then
  EMAIL_LINKS_OK="yes"
elif [[ "$FIREBASE_PROJECT_ID_PRESENT" == "yes" ]] && [[ -z "${FIREBASE_PROJECT_ID_VALUE:-}" ]]; then
  # We couldn't read the secret value, but the env var is configured. With the server change,
  # any non-local FIREBASE_PROJECT_ID prevents localhost links. Ask user to confirm value.
  EMAIL_LINKS_OK="maybe"
fi

case "$EMAIL_LINKS_OK" in
  yes)
    echo "Result: ✅ OK — this deployed API should NOT generate localhost links in emails."
    ;;
  maybe)
    echo "Result: ⚠️  PROBABLY OK — FIREBASE_PROJECT_ID is configured, but its value could not be verified."
    echo "        If you can, confirm it is NOT 'local' by running:"
    echo "        gcloud secrets versions access latest --secret \"$SECRET_FIREBASE_PROJECT_ID\" --project \"$GCP_PROJECT_ID\""
    ;;
  *)
    echo "Result: ❌ NOT OK — emails may contain localhost links."
    echo ""
    echo "Fix (recommended): set APP_URL and redeploy the API."
    if [[ "$ENVIRONMENT" == "staging" ]]; then
      echo "  1) Run: bash scripts/api-deployment/configure-staging.sh"
      echo "     - When asked for APP_URL, enter: $EXPECTED_APP_URL"
      echo "  2) Run: bash scripts/api-deployment/deploy-staging.sh"
    else
      echo "  1) Run: bash scripts/api-deployment/configure-prod.sh"
      echo "     - APP_URL should be: $EXPECTED_APP_URL"
      echo "  2) Run: bash scripts/api-deployment/deploy-prod.sh"
    fi
    echo ""
    echo "Alternative fix: ensure FIREBASE_PROJECT_ID is set to a real Firebase project id (not 'local'), then redeploy."
    ;;
esac
