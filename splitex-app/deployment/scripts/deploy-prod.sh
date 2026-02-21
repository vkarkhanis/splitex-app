#!/usr/bin/env bash
set -euo pipefail

# ==============================
# Splitex production deploy script
# One command deploy after filling placeholders
# ==============================

# ---- Required placeholders ----
GCP_PROJECT_ID="CHANGE_ME_PROD_GCP_PROJECT_ID"
REGION="us-central1"
SERVICE_NAME="splitex-api-prod"
RUNTIME_SA_NAME="splitex-api-prod-runtime"
DOMAIN_NAME="CHANGE_ME_OPTIONAL_DOMAIN_OR_LEAVE_EMPTY"

APP_URL="https://splitex.app"
NODE_ENV_VALUE="production"
MIN_INSTANCES="1"

# Firebase Admin (prod)
FIREBASE_PROJECT_ID="CHANGE_ME_PROD_FIREBASE_PROJECT_ID"
FIREBASE_CLIENT_EMAIL="CHANGE_ME_PROD_FIREBASE_CLIENT_EMAIL"
FIREBASE_STORAGE_BUCKET="CHANGE_ME_PROD_FIREBASE_STORAGE_BUCKET"
FIREBASE_PRIVATE_KEY_FILE="CHANGE_ME_ABSOLUTE_PATH_TO_PROD_FIREBASE_PRIVATE_KEY_PEM"

# JWT (prod)
JWT_SECRET="CHANGE_ME_PROD_JWT_SECRET"
JWT_REFRESH_SECRET="CHANGE_ME_PROD_JWT_REFRESH_SECRET"

# Optional SMTP (leave empty to keep mock email mode)
SMTP_HOST=""
SMTP_PORT="587"
SMTP_SECURE="false"
SMTP_USER=""
SMTP_PASS=""
SMTP_FROM=""

# ---- Internal constants ----
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../../../splitex-rush" && pwd)"

SECRET_FIREBASE_PROJECT_ID="splitex-prod-firebase-project-id"
SECRET_FIREBASE_CLIENT_EMAIL="splitex-prod-firebase-client-email"
SECRET_FIREBASE_PRIVATE_KEY="splitex-prod-firebase-private-key"
SECRET_FIREBASE_STORAGE_BUCKET="splitex-prod-firebase-storage-bucket"
SECRET_JWT_SECRET="splitex-prod-jwt-secret"
SECRET_JWT_REFRESH_SECRET="splitex-prod-jwt-refresh-secret"

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

PROJECT_NUMBER="$(gcloud projects describe "$GCP_PROJECT_ID" --format='value(projectNumber)')"
RUNTIME_SA_EMAIL="${RUNTIME_SA_NAME}@${GCP_PROJECT_ID}.iam.gserviceaccount.com"

# Create runtime service account if missing
if ! gcloud iam service-accounts describe "$RUNTIME_SA_EMAIL" --project "$GCP_PROJECT_ID" >/dev/null 2>&1; then
  gcloud iam service-accounts create "$RUNTIME_SA_NAME" \
    --display-name "Splitex production API runtime" \
    --project "$GCP_PROJECT_ID" >/dev/null
fi

# Allow runtime SA to read secrets
gcloud projects add-iam-policy-binding "$GCP_PROJECT_ID" \
  --member="serviceAccount:${RUNTIME_SA_EMAIL}" \
  --role="roles/secretmanager.secretAccessor" >/dev/null

# ---- Upsert secrets ----
upsert_secret_text "$SECRET_FIREBASE_PROJECT_ID" "$FIREBASE_PROJECT_ID"
upsert_secret_text "$SECRET_FIREBASE_CLIENT_EMAIL" "$FIREBASE_CLIENT_EMAIL"
upsert_secret_file "$SECRET_FIREBASE_PRIVATE_KEY" "$FIREBASE_PRIVATE_KEY_FILE"
upsert_secret_text "$SECRET_FIREBASE_STORAGE_BUCKET" "$FIREBASE_STORAGE_BUCKET"
upsert_secret_text "$SECRET_JWT_SECRET" "$JWT_SECRET"
upsert_secret_text "$SECRET_JWT_REFRESH_SECRET" "$JWT_REFRESH_SECRET"

# ---- Build optional env vars ----
ENV_VARS="NODE_ENV=${NODE_ENV_VALUE},APP_URL=${APP_URL}"

if [[ -n "$SMTP_HOST" ]]; then
  ENV_VARS+="${ENV_VARS:+,}SMTP_HOST=${SMTP_HOST},SMTP_PORT=${SMTP_PORT},SMTP_SECURE=${SMTP_SECURE}"
  if [[ -n "$SMTP_USER" ]]; then ENV_VARS+=",SMTP_USER=${SMTP_USER}"; fi
  if [[ -n "$SMTP_PASS" ]]; then ENV_VARS+=",SMTP_PASS=${SMTP_PASS}"; fi
  if [[ -n "$SMTP_FROM" ]]; then ENV_VARS+=",SMTP_FROM=${SMTP_FROM}"; fi
fi

# ---- Deploy ----
gcloud run deploy "$SERVICE_NAME" \
  --source "$REPO_ROOT" \
  --region "$REGION" \
  --allow-unauthenticated \
  --service-account "$RUNTIME_SA_EMAIL" \
  --min-instances "$MIN_INSTANCES" \
  --set-env-vars "$ENV_VARS" \
  --set-secrets FIREBASE_PROJECT_ID=${SECRET_FIREBASE_PROJECT_ID}:latest \
  --set-secrets FIREBASE_CLIENT_EMAIL=${SECRET_FIREBASE_CLIENT_EMAIL}:latest \
  --set-secrets FIREBASE_PRIVATE_KEY=${SECRET_FIREBASE_PRIVATE_KEY}:latest \
  --set-secrets FIREBASE_STORAGE_BUCKET=${SECRET_FIREBASE_STORAGE_BUCKET}:latest \
  --set-secrets JWT_SECRET=${SECRET_JWT_SECRET}:latest \
  --set-secrets JWT_REFRESH_SECRET=${SECRET_JWT_REFRESH_SECRET}:latest \
  --project "$GCP_PROJECT_ID"

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
