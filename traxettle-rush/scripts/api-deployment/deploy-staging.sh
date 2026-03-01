#!/usr/bin/env bash
set -euo pipefail

# ==============================
# Traxettle staging deploy script
# One command deploy after filling placeholders
# ==============================

# ---- Required placeholders ----
GCP_PROJECT_ID="traxettle-staging"
REGION="us-central1"
SERVICE_NAME="traxettle-api-staging"
RUNTIME_SA_NAME="traxettle-api-staging-runtime"
DOMAIN_NAME="CHANGE_ME_OPTIONAL_DOMAIN_OR_LEAVE_EMPTY"

APP_URL="https://staging.traxettle.app"
NODE_ENV_VALUE="staging"
MIN_INSTANCES="0"

# Firebase Admin (staging)
FIREBASE_PROJECT_ID="traxettle-staging"
FIREBASE_CLIENT_EMAIL="firebase-adminsdk-fbsvc@traxettle-staging.iam.gserviceaccount.com"
FIREBASE_STORAGE_BUCKET="traxettle-staging.firebasestorage.app"
FIREBASE_PRIVATE_KEY_FILE="/Users/vkarkhanis/workspace/misc/service-api-private-key.json"

# JWT (staging)
JWT_SECRET="lU4CM38gTdgniwELfn4PX2gdl4w0YbkvXZzicluCBJm3DtaYxaNFFO8DNMnJXAyD"
JWT_REFRESH_SECRET="YE1AoQkOHiyJt1qdVFO6g1sM79kbLj1jCJNMUQhVlQfD9u8bqMEDR1qv"

# Optional (required only for email-link passwordless sign-in)
FIREBASE_WEB_API_KEY=""
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
SMTP_SERVICE="gmail"
SMTP_HOST=""
SMTP_PORT="587"
SMTP_SECURE="false"
SMTP_USER="traxettleapp@gmail.com"
SMTP_PASS="${SMTP_PASS:-}"
SMTP_FROM="Traxettle Admin <traxettleapp@gmail.com>"

# ---- Internal constants ----
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../../../traxettle-rush" && pwd)"
RC_LOADER="$REPO_ROOT/scripts/revenuecat/load-rc-config.sh"

SECRET_FIREBASE_PROJECT_ID="traxettle-stg-firebase-project-id"
SECRET_FIREBASE_CLIENT_EMAIL="traxettle-stg-firebase-client-email"
SECRET_FIREBASE_PRIVATE_KEY="traxettle-stg-firebase-private-key"
SECRET_FIREBASE_STORAGE_BUCKET="traxettle-stg-firebase-storage-bucket"
SECRET_JWT_SECRET="traxettle-stg-jwt-secret"
SECRET_JWT_REFRESH_SECRET="traxettle-stg-jwt-refresh-secret"
SECRET_FIREBASE_WEB_API_KEY="traxettle-stg-firebase-web-api-key"
SECRET_REVENUECAT_WEBHOOK_SECRET="traxettle-stg-revenuecat-webhook-secret"
SECRET_SMTP_PASS="traxettle-stg-smtp-pass"

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

upsert_secret_text() {
  local secret_name="$1"
  local value="$2"

  if ! gcloud secrets describe "$secret_name" --project "$GCP_PROJECT_ID" >/dev/null 2>&1; then
    printf '%s' "$value" | gcloud secrets create "$secret_name" --replication-policy="automatic" --data-file=- --project "$GCP_PROJECT_ID" >/dev/null
  else
    printf '%s' "$value" | gcloud secrets versions add "$secret_name" --data-file=- --project "$GCP_PROJECT_ID" >/dev/null
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
source "$RC_LOADER" staging

require_not_placeholder "GCP_PROJECT_ID" "$GCP_PROJECT_ID"
require_not_placeholder "FIREBASE_PROJECT_ID" "$FIREBASE_PROJECT_ID"
require_not_placeholder "FIREBASE_CLIENT_EMAIL" "$FIREBASE_CLIENT_EMAIL"
require_not_placeholder "FIREBASE_STORAGE_BUCKET" "$FIREBASE_STORAGE_BUCKET"
require_not_placeholder "FIREBASE_PRIVATE_KEY_FILE" "$FIREBASE_PRIVATE_KEY_FILE"
require_not_placeholder "JWT_SECRET" "$JWT_SECRET"
require_not_placeholder "JWT_REFRESH_SECRET" "$JWT_REFRESH_SECRET"
require_not_placeholder "REVENUECAT_WEBHOOK_SECRET" "${REVENUECAT_WEBHOOK_SECRET:-}"
if [[ -n "$SMTP_SERVICE" ]]; then
  require_not_placeholder "SMTP_USER" "$SMTP_USER"
  [[ -n "$SMTP_PASS" ]] || fail "Set SMTP_PASS before running (Gmail app password)"
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
    --display-name "Traxettle staging API runtime" \
    --project "$GCP_PROJECT_ID" >/dev/null
fi

# Allow runtime SA to read secrets
gcloud projects add-iam-policy-binding "$GCP_PROJECT_ID" \
  --member="serviceAccount:${RUNTIME_SA_EMAIL}" \
  --role="roles/secretmanager.secretAccessor" >/dev/null

# ---- Upsert secrets ----
TMP_KEY_FILE="$(mktemp)"
trap 'rm -f "$TMP_KEY_FILE"' EXIT
resolve_private_key_file "$FIREBASE_PRIVATE_KEY_FILE" "$TMP_KEY_FILE"

upsert_secret_text "$SECRET_FIREBASE_PROJECT_ID" "$FIREBASE_PROJECT_ID"
upsert_secret_text "$SECRET_FIREBASE_CLIENT_EMAIL" "$FIREBASE_CLIENT_EMAIL"
upsert_secret_file "$SECRET_FIREBASE_PRIVATE_KEY" "$TMP_KEY_FILE"
upsert_secret_text "$SECRET_FIREBASE_STORAGE_BUCKET" "$FIREBASE_STORAGE_BUCKET"
upsert_secret_text "$SECRET_JWT_SECRET" "$JWT_SECRET"
upsert_secret_text "$SECRET_JWT_REFRESH_SECRET" "$JWT_REFRESH_SECRET"
upsert_secret_text "$SECRET_REVENUECAT_WEBHOOK_SECRET" "$REVENUECAT_WEBHOOK_SECRET"
if [[ -n "$FIREBASE_WEB_API_KEY" ]]; then
  upsert_secret_text "$SECRET_FIREBASE_WEB_API_KEY" "$FIREBASE_WEB_API_KEY"
fi
if [[ -n "$SMTP_SERVICE" ]]; then
  upsert_secret_text "$SECRET_SMTP_PASS" "$SMTP_PASS"
fi

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
  --set-secrets "FIREBASE_PROJECT_ID=${SECRET_FIREBASE_PROJECT_ID}:latest"
  --set-secrets "FIREBASE_CLIENT_EMAIL=${SECRET_FIREBASE_CLIENT_EMAIL}:latest"
  --set-secrets "FIREBASE_PRIVATE_KEY=${SECRET_FIREBASE_PRIVATE_KEY}:latest"
  --set-secrets "FIREBASE_STORAGE_BUCKET=${SECRET_FIREBASE_STORAGE_BUCKET}:latest"
  --set-secrets "JWT_SECRET=${SECRET_JWT_SECRET}:latest"
  --set-secrets "JWT_REFRESH_SECRET=${SECRET_JWT_REFRESH_SECRET}:latest"
  --set-secrets "REVENUECAT_WEBHOOK_SECRET=${SECRET_REVENUECAT_WEBHOOK_SECRET}:latest"
  --project "$GCP_PROJECT_ID"
)
if [[ -n "$FIREBASE_WEB_API_KEY" ]]; then
  DEPLOY_CMD+=(--set-secrets "FIREBASE_WEB_API_KEY=${SECRET_FIREBASE_WEB_API_KEY}:latest")
fi
if [[ -n "$SMTP_SERVICE" || -n "$SMTP_HOST" ]]; then
  DEPLOY_CMD+=(--set-secrets "SMTP_PASS=${SECRET_SMTP_PASS}:latest")
fi
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
echo "Staging deploy complete"
echo "Service URL: $SERVICE_URL"
echo "Health check: ${SERVICE_URL}/health"
if [[ -n "$DOMAIN_NAME" && "$DOMAIN_NAME" != CHANGE_ME_OPTIONAL_DOMAIN_OR_LEAVE_EMPTY ]]; then
  echo "Domain mapping requested for: $DOMAIN_NAME"
  echo "Verify DNS records with: gcloud run domain-mappings describe $DOMAIN_NAME --region $REGION --project $GCP_PROJECT_ID"
fi
