#!/usr/bin/env bash
set -euo pipefail

# Traxettle Web production deploy:
# 1) Build/deploy Next.js web on Cloud Run using monorepo Dockerfile.web
# 2) Put Firebase Hosting in front with rewrite to Cloud Run service

GCP_PROJECT_ID="CHANGE_ME_PROD_GCP_PROJECT_ID"
REGION="us-central1"
WEB_SERVICE_NAME="traxettle-web-prod"
HOSTING_SITE_ID="CHANGE_ME_PROD_FIREBASE_HOSTING_SITE_ID"

# Public client-side env (used at build-time and runtime)
NEXT_PUBLIC_API_URL="CHANGE_ME_PROD_API_URL"
NEXT_PUBLIC_APP_ENV="production"
NEXT_PUBLIC_FIREBASE_API_KEY="CHANGE_ME_PROD_FIREBASE_WEB_API_KEY"
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN="CHANGE_ME_PROD_FIREBASE_AUTH_DOMAIN"
NEXT_PUBLIC_FIREBASE_PROJECT_ID="CHANGE_ME_PROD_FIREBASE_PROJECT_ID"
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET="CHANGE_ME_PROD_FIREBASE_STORAGE_BUCKET"
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID="CHANGE_ME_PROD_MESSAGING_SENDER_ID"
NEXT_PUBLIC_FIREBASE_APP_ID="CHANGE_ME_PROD_WEB_APP_ID"
NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID=""

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../../../traxettle-rush" && pwd)"
BUILD_SOURCE_DIR="$(mktemp -d)"
TMP_CONFIG="$REPO_ROOT/.firebase-hosting-prod.generated.json"

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

require_cmd gcloud
require_cmd firebase
require_cmd rsync

require_not_placeholder "GCP_PROJECT_ID" "$GCP_PROJECT_ID"
require_not_placeholder "HOSTING_SITE_ID" "$HOSTING_SITE_ID"
require_not_placeholder "NEXT_PUBLIC_API_URL" "$NEXT_PUBLIC_API_URL"
require_not_placeholder "NEXT_PUBLIC_FIREBASE_API_KEY" "$NEXT_PUBLIC_FIREBASE_API_KEY"
require_not_placeholder "NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN" "$NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN"
require_not_placeholder "NEXT_PUBLIC_FIREBASE_PROJECT_ID" "$NEXT_PUBLIC_FIREBASE_PROJECT_ID"
require_not_placeholder "NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET" "$NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET"
require_not_placeholder "NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID" "$NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID"
require_not_placeholder "NEXT_PUBLIC_FIREBASE_APP_ID" "$NEXT_PUBLIC_FIREBASE_APP_ID"

[[ -f "$REPO_ROOT/Dockerfile.web" ]] || fail "Missing $REPO_ROOT/Dockerfile.web"
trap 'rm -rf "$BUILD_SOURCE_DIR"; rm -f "$TMP_CONFIG"' EXIT

BUILD_ENV_VARS="NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL},NEXT_PUBLIC_APP_ENV=${NEXT_PUBLIC_APP_ENV},NEXT_PUBLIC_FIREBASE_API_KEY=${NEXT_PUBLIC_FIREBASE_API_KEY},NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=${NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN},NEXT_PUBLIC_FIREBASE_PROJECT_ID=${NEXT_PUBLIC_FIREBASE_PROJECT_ID},NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=${NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET},NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=${NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID},NEXT_PUBLIC_FIREBASE_APP_ID=${NEXT_PUBLIC_FIREBASE_APP_ID},NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID=${NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID}"

RUNTIME_ENV_VARS="$BUILD_ENV_VARS"

gcloud config set project "$GCP_PROJECT_ID" >/dev/null
echo "Using GCP project: $GCP_PROJECT_ID"

gcloud services enable \
  run.googleapis.com \
  cloudbuild.googleapis.com \
  artifactregistry.googleapis.com \
  firebasehosting.googleapis.com \
  --project "$GCP_PROJECT_ID" >/dev/null
echo "Required APIs are enabled"

rsync -a \
  --exclude=".git" \
  --exclude=".firebase" \
  --exclude=".vercel" \
  --exclude="**/node_modules" \
  --exclude="**/.next" \
  --exclude="**/coverage" \
  --exclude="**/dist" \
  "$REPO_ROOT/" "$BUILD_SOURCE_DIR/"
cp "$REPO_ROOT/Dockerfile.web" "$BUILD_SOURCE_DIR/Dockerfile"
cat > "$BUILD_SOURCE_DIR/apps/web/.env.production" <<ENVFILE
NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL}
NEXT_PUBLIC_APP_ENV=${NEXT_PUBLIC_APP_ENV}
NEXT_PUBLIC_FIREBASE_API_KEY=${NEXT_PUBLIC_FIREBASE_API_KEY}
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=${NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN}
NEXT_PUBLIC_FIREBASE_PROJECT_ID=${NEXT_PUBLIC_FIREBASE_PROJECT_ID}
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=${NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET}
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=${NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID}
NEXT_PUBLIC_FIREBASE_APP_ID=${NEXT_PUBLIC_FIREBASE_APP_ID}
NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID=${NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID}
ENVFILE
echo "Prepared Cloud Run build source at: $BUILD_SOURCE_DIR"

# Build/deploy web service from source using monorepo Dockerfile.web
echo "Deploying Cloud Run service: $WEB_SERVICE_NAME"
gcloud run deploy "$WEB_SERVICE_NAME" \
  --source "$BUILD_SOURCE_DIR" \
  --region "$REGION" \
  --allow-unauthenticated \
  --min-instances 1 \
  --set-build-env-vars "$BUILD_ENV_VARS" \
  --set-env-vars "$RUNTIME_ENV_VARS" \
  --project "$GCP_PROJECT_ID"
echo "Cloud Run deploy completed"

# Ensure Hosting site exists (no-op if already exists)
echo "Ensuring Firebase Hosting site exists: $HOSTING_SITE_ID"
firebase hosting:sites:create "$HOSTING_SITE_ID" --project "$GCP_PROJECT_ID" --non-interactive >/dev/null 2>&1 || true

cat > "$TMP_CONFIG" <<JSON
{
  "hosting": {
    "site": "${HOSTING_SITE_ID}",
    "public": "apps/web/public",
    "ignore": ["firebase.json", "**/.*", "**/node_modules/**"],
    "rewrites": [
      {
        "source": "**",
        "run": {
          "serviceId": "${WEB_SERVICE_NAME}",
          "region": "${REGION}"
        }
      }
    ]
  }
}
JSON
echo "Generated hosting config: $TMP_CONFIG"

(
  cd "$REPO_ROOT"
  echo "Deploying Firebase Hosting rewrite -> $WEB_SERVICE_NAME"
  firebase deploy --project "$GCP_PROJECT_ID" --only hosting --config "$TMP_CONFIG" --non-interactive
)
echo "Firebase Hosting deploy completed"

HOSTING_URL="https://${HOSTING_SITE_ID}.web.app"
RUN_URL="$(gcloud run services describe "$WEB_SERVICE_NAME" --region "$REGION" --project "$GCP_PROJECT_ID" --format='value(status.url)')"

echo ""
echo "Web production deploy complete"
echo "Cloud Run URL: ${RUN_URL}"
echo "Firebase Hosting URL: ${HOSTING_URL}"
