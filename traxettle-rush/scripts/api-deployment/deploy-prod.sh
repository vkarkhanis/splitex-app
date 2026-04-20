#!/usr/bin/env bash
set -euo pipefail

# ==============================
# Traxettle production deploy script
# One command deploy after filling placeholders
# ==============================

# ---- Required placeholders ----
GCP_PROJECT_ID="${GCP_PROJECT_ID:-CHANGE_ME_PROD_GCP_PROJECT_ID}"
REGION="${REGION:-us-central1}"
SERVICE_NAME="${SERVICE_NAME:-traxettle-api-prod}"
RUNTIME_SA_NAME="${RUNTIME_SA_NAME:-traxettle-api-prod-runtime}"
DOMAIN_NAME="${DOMAIN_NAME:-}"

APP_URL="${APP_URL:-https://traxettle.app}"
NODE_ENV_VALUE="${NODE_ENV_VALUE:-production}"
MIN_INSTANCES="${MIN_INSTANCES:-1}"

# Firebase Admin (prod)
FIREBASE_PROJECT_ID="${FIREBASE_PROJECT_ID:-CHANGE_ME_PROD_FIREBASE_PROJECT_ID}"
FIREBASE_CLIENT_EMAIL="${FIREBASE_CLIENT_EMAIL:-CHANGE_ME_PROD_FIREBASE_CLIENT_EMAIL}"
FIREBASE_STORAGE_BUCKET="${FIREBASE_STORAGE_BUCKET:-CHANGE_ME_PROD_FIREBASE_STORAGE_BUCKET}"
FIREBASE_PRIVATE_KEY_FILE="${FIREBASE_PRIVATE_KEY_FILE:-CHANGE_ME_ABSOLUTE_PATH_TO_PROD_FIREBASE_PRIVATE_KEY_PEM_OR_JSON}"

# JWT (prod)
JWT_SECRET="${JWT_SECRET:-CHANGE_ME_PROD_JWT_SECRET}"
JWT_REFRESH_SECRET="${JWT_REFRESH_SECRET:-CHANGE_ME_PROD_JWT_REFRESH_SECRET}"

# Optional (required only for email-link passwordless sign-in)
FIREBASE_WEB_API_KEY=""
FIREBASE_AUTH_DOMAIN=""
FIREBASE_DATABASE_URL=""
FIREBASE_MESSAGING_SENDER_ID=""
FIREBASE_APP_ID=""
FIREBASE_MEASUREMENT_ID=""
AUTH_EMAIL_LINK_CONTINUE_URL=""
AUTH_ANDROID_PACKAGE_NAME=""
AUTH_ANDROID_MIN_VERSION="1"
AUTH_IOS_BUNDLE_ID=""

# Optional SMTP
# Gmail mode (recommended):
# - SMTP_SERVICE=gmail
# - SMTP_USER=<gmail>
# - SMTP_PASS=<gmail app password>   (stored as secret, not plain env)
# - SMTP_FROM=<display from address>
SMTP_SERVICE="${SMTP_SERVICE:-gmail}"
SMTP_HOST="${SMTP_HOST:-}"
SMTP_PORT="${SMTP_PORT:-587}"
SMTP_SECURE="${SMTP_SECURE:-false}"
SMTP_USER="${SMTP_USER:-traxettleapp@gmail.com}"
SMTP_PASS="${SMTP_PASS:-}"
SMTP_FROM="${SMTP_FROM:-Traxettle Admin <${SMTP_USER}>}"

# ---- Internal constants ----
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../../../traxettle-rush" && pwd)"
RC_LOADER="$REPO_ROOT/scripts/revenuecat/load-rc-config.sh"

# Optional config file (created by scripts/api-deployment/configure-prod.sh)
CONFIG_FILE="${REPO_ROOT}/.traxettle/api-prod.env"
if [[ -f "$CONFIG_FILE" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "$CONFIG_FILE"
  set +a
fi

# Unified secrets (reduces from 15 to 2 secrets, lowering Secret Manager costs)
SECRET_API_CONFIG="traxettle-prod-api-config"
SECRET_MOBILE_CONFIG="traxettle-prod-mobile-config"

# ---- Helpers ----
fail() {
  echo "ERROR: $*" >&2
  exit 1
}

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || fail "Missing command: $1"
}

require_not_placeholder() {
  local name="$1"
  local value="$2"
  if [[ -z "$value" || "$value" == CHANGE_ME* ]]; then
    fail "Set ${name} before running"
  fi
}

prune_old_secret_versions() {
  local secret_name="$1"
  gcloud secrets versions list "$secret_name" \
    --project "$GCP_PROJECT_ID" \
    --sort-by="~createTime" \
    --format="value(name)" 2>/dev/null \
    | tail -n +2 \
    | while IFS= read -r ver; do
        ver_num="${ver##*/}"
        gcloud secrets versions destroy "$ver_num" \
          --secret="$secret_name" \
          --project "$GCP_PROJECT_ID" \
          --quiet >/dev/null 2>&1 || true
      done
}

upsert_secret_text() {
  local secret_name="$1"
  local value="$2"

  if ! gcloud secrets describe "$secret_name" --project "$GCP_PROJECT_ID" >/dev/null 2>&1; then
    printf '%s' "$value" | gcloud secrets create "$secret_name" --replication-policy="automatic" --data-file=- --project "$GCP_PROJECT_ID" >/dev/null
  else
    printf '%s' "$value" | gcloud secrets versions add "$secret_name" --data-file=- --project "$GCP_PROJECT_ID" >/dev/null
    prune_old_secret_versions "$secret_name"
  fi
}

upsert_secret_file() {
  local secret_name="$1"
  local file_path="$2"

  [[ -f "$file_path" ]] || fail "Secret file not found: $file_path"

  if ! gcloud secrets describe "$secret_name" --project "$GCP_PROJECT_ID" >/dev/null 2>&1; then
    gcloud secrets create "$secret_name" --replication-policy="automatic" --data-file="$file_path" --project "$GCP_PROJECT_ID" >/dev/null
  else
    gcloud secrets versions add "$secret_name" --data-file="$file_path" --project "$GCP_PROJECT_ID" >/dev/null
  fi
}

resolve_private_key_file() {
  local input_file="$1"
  local output_file="$2"

  [[ -f "$input_file" ]] || fail "Secret file not found: $input_file"

  if [[ "$input_file" == *.json ]]; then
    require_cmd node
    node -e "const fs=require('fs'); const p=process.argv[1]; const o=process.argv[2]; const j=JSON.parse(fs.readFileSync(p,'utf8')); if(!j.private_key){process.exit(2)} fs.writeFileSync(o,j.private_key);" "$input_file" "$output_file" \
      || fail "Could not extract private_key from JSON: $input_file"
  else
    cp "$input_file" "$output_file"
  fi
}

# ---- Prechecks ----
require_cmd gcloud
require_cmd bash

[ -f "$RC_LOADER" ] || fail "Missing RevenueCat loader: $RC_LOADER"
source "$RC_LOADER" prod

# RevenueCat public SDK keys
REVENUECAT_GOOGLE_API_KEY="${REVENUECAT_GOOGLE_API_KEY:-${RC_REVENUECAT_GOOGLE_PUBLIC_KEY:-${EXPO_PUBLIC_REVENUECAT_GOOGLE_KEY:-}}}"
REVENUECAT_APPLE_API_KEY="${REVENUECAT_APPLE_API_KEY:-${RC_REVENUECAT_APPLE_PUBLIC_KEY:-${EXPO_PUBLIC_REVENUECAT_APPLE_KEY:-}}}"

require_not_placeholder "GCP_PROJECT_ID" "$GCP_PROJECT_ID"
require_not_placeholder "FIREBASE_PROJECT_ID" "$FIREBASE_PROJECT_ID"
require_not_placeholder "FIREBASE_CLIENT_EMAIL" "$FIREBASE_CLIENT_EMAIL"
require_not_placeholder "FIREBASE_STORAGE_BUCKET" "$FIREBASE_STORAGE_BUCKET"
require_not_placeholder "FIREBASE_PRIVATE_KEY_FILE" "$FIREBASE_PRIVATE_KEY_FILE"
require_not_placeholder "JWT_SECRET" "$JWT_SECRET"
require_not_placeholder "JWT_REFRESH_SECRET" "$JWT_REFRESH_SECRET"
require_not_placeholder "REVENUECAT_WEBHOOK_SECRET" "${REVENUECAT_WEBHOOK_SECRET:-}"
require_not_placeholder "FIREBASE_WEB_API_KEY" "${FIREBASE_WEB_API_KEY:-}"
require_not_placeholder "FIREBASE_AUTH_DOMAIN" "${FIREBASE_AUTH_DOMAIN:-}"
require_not_placeholder "FIREBASE_MESSAGING_SENDER_ID" "${FIREBASE_MESSAGING_SENDER_ID:-}"
require_not_placeholder "FIREBASE_APP_ID" "${FIREBASE_APP_ID:-}"
if [[ -n "$SMTP_SERVICE" ]]; then
  require_not_placeholder "SMTP_USER" "$SMTP_USER"
  if [[ -z "${SMTP_PASS:-}" ]]; then
    echo "NOTE: SMTP_PASS is empty. Deploying without SMTP (email features disabled)."
    SMTP_SERVICE=""
  fi
fi

[[ -f "$REPO_ROOT/Dockerfile" ]] || fail "Missing $REPO_ROOT/Dockerfile"

# ---- GCP setup ----
gcloud config set project "$GCP_PROJECT_ID" >/dev/null

gcloud services enable \
  run.googleapis.com \
  cloudbuild.googleapis.com \
  artifactregistry.googleapis.com \
  secretmanager.googleapis.com \
  iam.googleapis.com \
  --project "$GCP_PROJECT_ID" >/dev/null

RUNTIME_SA_EMAIL="${RUNTIME_SA_NAME}@${GCP_PROJECT_ID}.iam.gserviceaccount.com"

# Create runtime service account if missing
if ! gcloud iam service-accounts describe "$RUNTIME_SA_EMAIL" --project "$GCP_PROJECT_ID" >/dev/null 2>&1; then
  gcloud iam service-accounts create "$RUNTIME_SA_NAME" \
    --display-name "Traxettle production API runtime" \
    --project "$GCP_PROJECT_ID" >/dev/null
fi

# Allow runtime SA to read secrets
gcloud projects add-iam-policy-binding "$GCP_PROJECT_ID" \
  --member="serviceAccount:${RUNTIME_SA_EMAIL}" \
  --role="roles/secretmanager.secretAccessor" \
  --condition="expression=request.auth != null,title=authenticated-access,description=Only authenticated users can access the API" >/dev/null

# ---- Upsert secrets ----
TMP_KEY_FILE="$(mktemp)"
trap 'rm -f "$TMP_KEY_FILE"' EXIT
resolve_private_key_file "$FIREBASE_PRIVATE_KEY_FILE" "$TMP_KEY_FILE"

# Build unified API config JSON
API_CONFIG_JSON=$(cat <<EOF
{
  "FIREBASE_PROJECT_ID": "$FIREBASE_PROJECT_ID",
  "FIREBASE_CLIENT_EMAIL": "$FIREBASE_CLIENT_EMAIL",
  "FIREBASE_PRIVATE_KEY": $(jq -Rs . < "$TMP_KEY_FILE" 2>/dev/null || echo "null"),
  "FIREBASE_STORAGE_BUCKET": "$FIREBASE_STORAGE_BUCKET",
  "JWT_SECRET": "$JWT_SECRET",
  "JWT_REFRESH_SECRET": "$JWT_REFRESH_SECRET",
  "REVENUECAT_WEBHOOK_SECRET": "$REVENUECAT_WEBHOOK_SECRET",
  "FIREBASE_WEB_API_KEY": "${FIREBASE_WEB_API_KEY:-}",
  "FIREBASE_AUTH_DOMAIN": "${FIREBASE_AUTH_DOMAIN:-}",
  "FIREBASE_DATABASE_URL": "${FIREBASE_DATABASE_URL:-}",
  "FIREBASE_MESSAGING_SENDER_ID": "${FIREBASE_MESSAGING_SENDER_ID:-}",
  "FIREBASE_APP_ID": "${FIREBASE_APP_ID:-}",
  "FIREBASE_MEASUREMENT_ID": "${FIREBASE_MEASUREMENT_ID:-}",
  "SMTP_PASS": "${SMTP_PASS:-}"
}
EOF
)

upsert_secret_text "$SECRET_API_CONFIG" "$API_CONFIG_JSON"

# Build unified mobile config JSON (RevenueCat public keys)
MOBILE_CONFIG_JSON=$(cat <<EOF
{
  "GOOGLE_API_KEY": "${REVENUECAT_GOOGLE_API_KEY:-}",
  "APPLE_API_KEY": "${REVENUECAT_APPLE_API_KEY:-}"
}
EOF
)

upsert_secret_text "$SECRET_MOBILE_CONFIG" "$MOBILE_CONFIG_JSON"

# ---- Build optional env vars ----
ENV_VARS="NODE_ENV=${NODE_ENV_VALUE},APP_URL=${APP_URL},REVENUECAT_PRO_ENTITLEMENT_ID=${REVENUECAT_PRO_ENTITLEMENT_ID:-pro}"

if [[ -n "$SMTP_SERVICE" ]]; then
  ENV_VARS+="${ENV_VARS:+,}SMTP_SERVICE=${SMTP_SERVICE}"
  if [[ -n "$SMTP_USER" ]]; then ENV_VARS+=",SMTP_USER=${SMTP_USER}"; fi
  if [[ -n "$SMTP_FROM" ]]; then ENV_VARS+=",SMTP_FROM=${SMTP_FROM}"; fi
elif [[ -n "$SMTP_HOST" ]]; then
  ENV_VARS+="${ENV_VARS:+,}SMTP_HOST=${SMTP_HOST},SMTP_PORT=${SMTP_PORT},SMTP_SECURE=${SMTP_SECURE}"
  if [[ -n "$SMTP_USER" ]]; then ENV_VARS+=",SMTP_USER=${SMTP_USER}"; fi
  if [[ -n "$SMTP_FROM" ]]; then ENV_VARS+=",SMTP_FROM=${SMTP_FROM}"; fi
fi

if [[ -n "$AUTH_EMAIL_LINK_CONTINUE_URL" ]]; then ENV_VARS+=",AUTH_EMAIL_LINK_CONTINUE_URL=${AUTH_EMAIL_LINK_CONTINUE_URL}"; fi
if [[ -n "$AUTH_ANDROID_PACKAGE_NAME" ]]; then ENV_VARS+=",AUTH_ANDROID_PACKAGE_NAME=${AUTH_ANDROID_PACKAGE_NAME}"; fi
if [[ -n "$AUTH_ANDROID_MIN_VERSION" ]]; then ENV_VARS+=",AUTH_ANDROID_MIN_VERSION=${AUTH_ANDROID_MIN_VERSION}"; fi
if [[ -n "$AUTH_IOS_BUNDLE_ID" ]]; then ENV_VARS+=",AUTH_IOS_BUNDLE_ID=${AUTH_IOS_BUNDLE_ID}"; fi

# ---- Deploy ----
DEPLOY_CMD=(
  gcloud run deploy "$SERVICE_NAME"
  --source "$REPO_ROOT"
  --region "$REGION"
  --allow-unauthenticated
  --service-account "$RUNTIME_SA_EMAIL"
  --min-instances "$MIN_INSTANCES"
  --set-env-vars "$ENV_VARS"
  --set-secrets "API_CONFIG_SECRET=${SECRET_API_CONFIG}:latest"
  --set-secrets "MOBILE_CONFIG_SECRET=${SECRET_MOBILE_CONFIG}:latest"
  --project "$GCP_PROJECT_ID"
)
"${DEPLOY_CMD[@]}"

SERVICE_URL="$(gcloud run services describe "$SERVICE_NAME" --region "$REGION" --project "$GCP_PROJECT_ID" --format='value(status.url)')"

# Optional domain mapping
if [[ -n "$DOMAIN_NAME" && "$DOMAIN_NAME" != CHANGE_ME_OPTIONAL_DOMAIN_OR_LEAVE_EMPTY ]]; then
  if ! gcloud run domain-mappings describe "$DOMAIN_NAME" --region "$REGION" --project "$GCP_PROJECT_ID" >/dev/null 2>&1; then
    gcloud run domain-mappings create \
      --service "$SERVICE_NAME" \
      --domain "$DOMAIN_NAME" \
      --region "$REGION" \
      --project "$GCP_PROJECT_ID" || true
  fi
fi

echo ""
echo "Production deploy complete"
echo "Service URL: $SERVICE_URL"
echo "Health check: ${SERVICE_URL}/health"
if [[ -n "$DOMAIN_NAME" && "$DOMAIN_NAME" != CHANGE_ME_OPTIONAL_DOMAIN_OR_LEAVE_EMPTY ]]; then
  echo "Domain mapping requested for: $DOMAIN_NAME"
  echo "Verify DNS records with: gcloud run domain-mappings describe $DOMAIN_NAME --region $REGION --project $GCP_PROJECT_ID"
fi
