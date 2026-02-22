#!/usr/bin/env bash
set -euo pipefail

# ==============================
# Splitex staging deploy script
# One command deploy after filling placeholders
# ==============================

# ---- Required placeholders ----
GCP_PROJECT_ID="app-splitex-staging"
REGION="us-central1"
SERVICE_NAME="splitex-api-staging"
RUNTIME_SA_NAME="splitex-api-staging-runtime"
DOMAIN_NAME="CHANGE_ME_OPTIONAL_DOMAIN_OR_LEAVE_EMPTY"

APP_URL="https://staging.splitex.app"
NODE_ENV_VALUE="staging"
MIN_INSTANCES="0"

# Firebase Admin (staging)
FIREBASE_PROJECT_ID="app-splitex-staging"
FIREBASE_CLIENT_EMAIL="firebase-adminsdk-fbsvc@app-splitex-staging.iam.gserviceaccount.com"
FIREBASE_STORAGE_BUCKET="app-splitex-staging.firebasestorage.app"
FIREBASE_PRIVATE_KEY_FILE="/Users/vkarkhanis/Configs/Splitex/Staging/app-splitex-staging-firebase-sa.json"

# JWT (staging)
JWT_SECRET="xY5quFE7Yw5KFkla+I9jZ/COa9cHqhITsIuATeKM5+16LwUAQ9Nltnqgu5Y3NjHJ"
JWT_REFRESH_SECRET="VNbRPAQUgElN09t41lEEaOeKNvTavnIq9wtJ+mbEVymxJ7cssZMAmxRAhblQu86J"

# Optional (required only for email-link passwordless sign-in)
FIREBASE_WEB_API_KEY="AIzaSyBW2jrlsrUOYgBI7zR_A4cnLYQeC_oEew8"
AUTH_EMAIL_LINK_CONTINUE_URL="https://splitex-api-staging-862789756309.us-central1.run.app/auth/email-link"
AUTH_ANDROID_PACKAGE_NAME="com.splitex.app"
AUTH_ANDROID_MIN_VERSION="1"
AUTH_IOS_BUNDLE_ID="com.splitex.app"

# Optional SMTP (leave empty to keep mock email mode)
SMTP_HOST="smtp.gmail.com"
SMTP_PORT="465"
SMTP_SECURE="true"
SMTP_USER="vkarkhanis@gmail.com"
SMTP_PASS="rnqxzglexqzvaytr"
SMTP_FROM="vkarkhanis@gmail.com"

# ---- Internal constants ----
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../../../splitex-rush" && pwd)"

SECRET_FIREBASE_PROJECT_ID="splitex-stg-firebase-project-id"
SECRET_FIREBASE_CLIENT_EMAIL="splitex-stg-firebase-client-email"
SECRET_FIREBASE_PRIVATE_KEY="splitex-stg-firebase-private-key"
SECRET_FIREBASE_STORAGE_BUCKET="splitex-stg-firebase-storage-bucket"
SECRET_JWT_SECRET="splitex-stg-jwt-secret"
SECRET_JWT_REFRESH_SECRET="splitex-stg-jwt-refresh-secret"
SECRET_FIREBASE_WEB_API_KEY="splitex-stg-firebase-web-api-key"

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

require_not_placeholder "GCP_PROJECT_ID" "$GCP_PROJECT_ID"
require_not_placeholder "FIREBASE_PROJECT_ID" "$FIREBASE_PROJECT_ID"
require_not_placeholder "FIREBASE_CLIENT_EMAIL" "$FIREBASE_CLIENT_EMAIL"
require_not_placeholder "FIREBASE_STORAGE_BUCKET" "$FIREBASE_STORAGE_BUCKET"
require_not_placeholder "FIREBASE_PRIVATE_KEY_FILE" "$FIREBASE_PRIVATE_KEY_FILE"
require_not_placeholder "JWT_SECRET" "$JWT_SECRET"
require_not_placeholder "JWT_REFRESH_SECRET" "$JWT_REFRESH_SECRET"

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
    --display-name "Splitex staging API runtime" \
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
if [[ -n "$FIREBASE_WEB_API_KEY" ]]; then
  upsert_secret_text "$SECRET_FIREBASE_WEB_API_KEY" "$FIREBASE_WEB_API_KEY"
fi

# ---- Build optional env vars ----
ENV_VARS="NODE_ENV=${NODE_ENV_VALUE},APP_URL=${APP_URL}"

if [[ -n "$SMTP_HOST" ]]; then
  ENV_VARS+="${ENV_VARS:+,}SMTP_HOST=${SMTP_HOST},SMTP_PORT=${SMTP_PORT},SMTP_SECURE=${SMTP_SECURE}"
  if [[ -n "$SMTP_USER" ]]; then ENV_VARS+=",SMTP_USER=${SMTP_USER}"; fi
  if [[ -n "$SMTP_PASS" ]]; then ENV_VARS+=",SMTP_PASS=${SMTP_PASS}"; fi
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
  --project "$GCP_PROJECT_ID"
)
if [[ -n "$FIREBASE_WEB_API_KEY" ]]; then
  DEPLOY_CMD+=(--set-secrets "FIREBASE_WEB_API_KEY=${SECRET_FIREBASE_WEB_API_KEY}:latest")
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
