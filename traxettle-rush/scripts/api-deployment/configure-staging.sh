#!/usr/bin/env bash
set -euo pipefail

# Creates local (gitignored) config for API staging deploy.
#
# Output:
#   .traxettle/api-staging.env
# Optional:
#   scripts/api-deployment/smtp_staging.local.properties   (for deploy-staging-gmail.sh)
#
# Usage:
#   bash scripts/api-deployment/configure-staging.sh

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
OUT_DIR="${REPO_ROOT}/.traxettle"
OUT_FILE="${OUT_DIR}/api-staging.env"
SMTP_FILE="${SCRIPT_DIR}/smtp_staging.local.properties"

mkdir -p "$OUT_DIR"

escape_sq() {
  # Single-quote escape for bash: ' -> '\''.
  printf "%s" "$1" | sed "s/'/'\\\\''/g"
}

prompt() {
  local var="$1"
  local label="$2"
  local def="${3:-}"
  local secret="${4:-false}"

  local val=""
  if [[ "$secret" == "true" ]]; then
    read -r -s -p "${label}${def:+ [${def}]}: " val
    echo ""
  else
    read -r -p "${label}${def:+ [${def}]}: " val
  fi
  val="${val:-$def}"
  printf -v "$var" "%s" "$val"
}

echo ""
echo "═══════════════════════════════════════════════"
echo "  Traxettle — Configure API STAGING deploy"
echo "═══════════════════════════════════════════════"
echo ""
echo "This saves your staging deploy config locally in:"
echo "  $OUT_FILE"
echo ""
echo "What this script is for:"
echo "  - This is API deploy config only."
echo "  - WEB deploy uses .traxettle/web-staging.env from scripts/web-deployment/configure-staging.sh"
echo ""
echo "Note:"
echo "  Google sign-in requires roles/serviceusage.serviceUsageConsumer on:"
echo "    - traxettle-api-staging-runtime@${GCP_PROJECT_ID:-traxettle-staging}.iam.gserviceaccount.com"
echo "    - the Firebase Admin service account you enter below (FIREBASE_CLIENT_EMAIL)"
echo "  When gcloud asks for an IAM condition for this role, use: None"
echo ""
echo "JWT secrets:"
echo "  These do NOT come from Firebase/GCP. Generate them yourself, for example with:"
echo "    node -e \"const crypto=require('crypto'); console.log('JWT_SECRET='+crypto.randomBytes(48).toString('base64url')); console.log('JWT_REFRESH_SECRET='+crypto.randomBytes(48).toString('base64url'));\""
echo "  Use different values for staging and production."
echo ""
echo "Before you start, keep these values ready:"
echo "  1) Firebase Admin SDK key JSON:"
echo "     - Firebase Console → Project settings → Service accounts → Firebase Admin SDK → Generate new private key"
echo "     - Use the downloaded JSON file path for FIREBASE_PRIVATE_KEY_FILE"
echo "     - Use the exact client_email from that same JSON for FIREBASE_CLIENT_EMAIL"
echo "  2) Firebase Web App config:"
echo "     - Firebase Console → Project settings → Your apps → Web app"
echo "     - Copy: apiKey, authDomain, messagingSenderId, appId, optional measurementId"
echo "  3) RevenueCat webhook secret:"
echo "     - Choose any long random string yourself"
echo "     - Use the exact same value in RevenueCat webhook settings and here"
echo "  4) Gmail SMTP password (only if using Gmail deploy):"
echo "     - Use a Gmail App Password, not your normal Gmail password"
echo ""
echo "Optional values:"
echo "  - FIREBASE_DATABASE_URL: only if you use Firebase Realtime Database; otherwise leave blank"
echo "  - AUTH_EMAIL_LINK_CONTINUE_URL: only if you use Firebase email-link sign-in/passwordless auth; otherwise leave blank"
echo ""

prompt GCP_PROJECT_ID "GCP project id" "traxettle-staging"
prompt FIREBASE_PROJECT_ID "Firebase project id" "traxettle-staging"
prompt FIREBASE_CLIENT_EMAIL "Firebase service-account client_email (copy exact client_email from Admin SDK JSON)" ""
prompt FIREBASE_STORAGE_BUCKET "Firebase storage bucket" "traxettle-staging.firebasestorage.app"
prompt FIREBASE_PRIVATE_KEY_FILE "Absolute path to Firebase service-account key (.json or .pem, usually the downloaded Admin SDK JSON)" ""

prompt APP_URL "Web URL for STAGING (APP_URL — used in emails)" "https://traxettle-staging.web.app"

prompt JWT_SECRET "JWT secret" "" true
prompt JWT_REFRESH_SECRET "JWT refresh secret" "" true

prompt REVENUECAT_WEBHOOK_SECRET "RevenueCat webhook secret (same value you configured in RevenueCat)" "" true

prompt FIREBASE_WEB_API_KEY "Firebase Web API key (from Firebase Web app config)" ""
prompt FIREBASE_AUTH_DOMAIN "Firebase authDomain" "traxettle-staging.firebaseapp.com"
prompt FIREBASE_DATABASE_URL "Firebase databaseURL (optional, press Enter to skip)" ""
prompt FIREBASE_MESSAGING_SENDER_ID "Firebase messagingSenderId" ""
prompt FIREBASE_APP_ID "Firebase appId" ""
prompt FIREBASE_MEASUREMENT_ID "Firebase measurementId (optional, press Enter to skip)" ""
prompt AUTH_EMAIL_LINK_CONTINUE_URL "Auth email-link continue URL (optional; only for Firebase email-link sign-in/passwordless auth)" ""
prompt AUTH_ANDROID_PACKAGE_NAME "Android package name (optional)" "com.traxettle.app"
prompt AUTH_IOS_BUNDLE_ID "iOS bundle id (optional)" "com.traxettle.app"

if [[ -n "$FIREBASE_PRIVATE_KEY_FILE" && ! -f "$FIREBASE_PRIVATE_KEY_FILE" ]]; then
  echo ""
  echo "ERROR: File not found: $FIREBASE_PRIVATE_KEY_FILE"
  echo "Fix the path and rerun this configure script."
  exit 1
fi

for required_var in FIREBASE_WEB_API_KEY FIREBASE_AUTH_DOMAIN FIREBASE_MESSAGING_SENDER_ID FIREBASE_APP_ID; do
  if [[ -z "${!required_var}" ]]; then
    echo ""
    echo "ERROR: ${required_var} is required for runtime Firebase client config."
    echo "Fix the value and rerun this configure script."
    exit 1
  fi
done

cat > "$OUT_FILE" <<EOF
# Generated by scripts/api-deployment/configure-staging.sh on $(date)
# Never commit this file. It is gitignored.

GCP_PROJECT_ID='$(escape_sq "$GCP_PROJECT_ID")'
REGION='us-central1'
SERVICE_NAME='traxettle-api-staging'
RUNTIME_SA_NAME='traxettle-api-staging-runtime'
DOMAIN_NAME=''

APP_URL='$(escape_sq "$APP_URL")'
NODE_ENV_VALUE='staging'
MIN_INSTANCES='0'

FIREBASE_PROJECT_ID='$(escape_sq "$FIREBASE_PROJECT_ID")'
FIREBASE_CLIENT_EMAIL='$(escape_sq "$FIREBASE_CLIENT_EMAIL")'
FIREBASE_STORAGE_BUCKET='$(escape_sq "$FIREBASE_STORAGE_BUCKET")'
FIREBASE_PRIVATE_KEY_FILE='$(escape_sq "$FIREBASE_PRIVATE_KEY_FILE")'

JWT_SECRET='$(escape_sq "$JWT_SECRET")'
JWT_REFRESH_SECRET='$(escape_sq "$JWT_REFRESH_SECRET")'

REVENUECAT_WEBHOOK_SECRET='$(escape_sq "$REVENUECAT_WEBHOOK_SECRET")'

FIREBASE_WEB_API_KEY='$(escape_sq "$FIREBASE_WEB_API_KEY")'
FIREBASE_AUTH_DOMAIN='$(escape_sq "$FIREBASE_AUTH_DOMAIN")'
FIREBASE_DATABASE_URL='$(escape_sq "$FIREBASE_DATABASE_URL")'
FIREBASE_MESSAGING_SENDER_ID='$(escape_sq "$FIREBASE_MESSAGING_SENDER_ID")'
FIREBASE_APP_ID='$(escape_sq "$FIREBASE_APP_ID")'
FIREBASE_MEASUREMENT_ID='$(escape_sq "$FIREBASE_MEASUREMENT_ID")'
AUTH_EMAIL_LINK_CONTINUE_URL='$(escape_sq "$AUTH_EMAIL_LINK_CONTINUE_URL")'
AUTH_ANDROID_PACKAGE_NAME='$(escape_sq "$AUTH_ANDROID_PACKAGE_NAME")'
AUTH_ANDROID_MIN_VERSION='1'
AUTH_IOS_BUNDLE_ID='$(escape_sq "$AUTH_IOS_BUNDLE_ID")'
EOF

echo ""
echo "Saved: $OUT_FILE"
echo ""

read -r -p "Do you want to configure Gmail SMTP for staging deploy? (y/n): " yn
case "${yn:-n}" in
  y|Y)
    prompt SMTP_USER "Gmail address (SMTP_USER)" "traxettleapp@gmail.com"
    prompt SMTP_PASS "Gmail app password (SMTP_PASS)" "" true
    prompt SMTP_FROM "From display (SMTP_FROM)" "Traxettle Admin <${SMTP_USER}>"

    cat > "$SMTP_FILE" <<EOF
# Generated by scripts/api-deployment/configure-staging.sh on $(date)
# Never commit this file. It is gitignored.

SMTP_SERVICE='gmail'
SMTP_USER='$(escape_sq "$SMTP_USER")'
SMTP_PASS='$(escape_sq "$SMTP_PASS")'
SMTP_FROM='$(escape_sq "$SMTP_FROM")'
EOF

    echo ""
    echo "Saved: $SMTP_FILE"
    echo ""
    echo "Post-deploy dependency:"
    echo "  Verify Google sign-in IAM with:"
    echo "    bash scripts/api-deployment/verify-deployed-api-env.sh staging"
    echo "You can now deploy with:"
    echo "  bash scripts/api-deployment/deploy-staging-gmail.sh"
    ;;
  *)
    echo ""
    echo "Post-deploy dependency:"
    echo "  Verify Google sign-in IAM with:"
    echo "    bash scripts/api-deployment/verify-deployed-api-env.sh staging"
    echo ""
    echo "Skipping SMTP file. You can deploy without SMTP by running:"
    echo "  bash scripts/api-deployment/deploy-staging.sh"
    ;;
esac
