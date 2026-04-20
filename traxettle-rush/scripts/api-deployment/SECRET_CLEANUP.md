# Secret Manager Cleanup Guide

## Problem
Secret Manager was costing ₹1,085.49/month due to:
- 31 separate secrets (15 for prod + 16 for staging)
- Each deploy creates new versions of ALL secrets
- Old versions accumulate, causing storage costs

## Solution
Consolidated to 4 unified secrets (2 per environment):
- `traxettle-prod-api-config` (JSON with all API secrets)
- `traxettle-prod-mobile-config` (JSON with mobile SDK configs)
- `traxettle-stg-api-config` (JSON with all API secrets)
- `traxettle-stg-mobile-config` (JSON with mobile SDK configs)

This reduces from 31 secrets to 4, dramatically lowering storage costs.

## After Deploying with New Scripts

Once you've successfully deployed with the updated `deploy-prod.sh` and `deploy-staging.sh` scripts, clean up the old secrets to stop the cost leakage.

## Production Secret Cleanup

Run these commands for the production GCP project:

```bash
# Set your production project
export GCP_PROJECT_ID="your-prod-project-id"
gcloud config set project $GCP_PROJECT_ID

# Delete old production secrets
gcloud secrets delete traxettle-prod-firebase-project-id --quiet
gcloud secrets delete traxettle-prod-firebase-client-email --quiet
gcloud secrets delete traxettle-prod-firebase-private-key --quiet
gcloud secrets delete traxettle-prod-firebase-storage-bucket --quiet
gcloud secrets delete traxettle-prod-jwt-secret --quiet
gcloud secrets delete traxettle-prod-jwt-refresh-secret --quiet
gcloud secrets delete traxettle-prod-firebase-web-api-key --quiet
gcloud secrets delete traxettle-prod-firebase-auth-domain --quiet
gcloud secrets delete traxettle-prod-firebase-database-url --quiet
gcloud secrets delete traxettle-prod-firebase-messaging-sender-id --quiet
gcloud secrets delete traxettle-prod-firebase-app-id --quiet
gcloud secrets delete traxettle-prod-firebase-measurement-id --quiet
gcloud secrets delete traxettle-prod-revenuecat-webhook-secret --quiet
gcloud secrets delete traxettle-prod-smtp-pass --quiet
```

## Staging Secret Cleanup

Run these commands for the staging GCP project:

```bash
# Set your staging project
export GCP_PROJECT_ID="traxettle-staging"
gcloud config set project $GCP_PROJECT_ID

# Delete old staging secrets
gcloud secrets delete traxettle-stg-firebase-project-id --quiet
gcloud secrets delete traxettle-stg-firebase-client-email --quiet
gcloud secrets delete traxettle-stg-firebase-private-key --quiet
gcloud secrets delete traxettle-stg-firebase-storage-bucket --quiet
gcloud secrets delete traxettle-stg-jwt-secret --quiet
gcloud secrets delete traxettle-stg-jwt-refresh-secret --quiet
gcloud secrets delete traxettle-stg-firebase-web-api-key --quiet
gcloud secrets delete traxettle-stg-firebase-auth-domain --quiet
gcloud secrets delete traxettle-stg-firebase-database-url --quiet
gcloud secrets delete traxettle-stg-firebase-messaging-sender-id --quiet
gcloud secrets delete traxettle-stg-firebase-app-id --quiet
gcloud secrets delete traxettle-stg-firebase-measurement-id --quiet
gcloud secrets delete traxettle-stg-revenuecat-webhook-secret --quiet
gcloud secrets delete traxettle-stg-revenuecat-google-api-key --quiet
gcloud secrets delete traxettle-stg-revenuecat-apple-api-key --quiet
gcloud secrets delete traxettle-stg-smtp-pass --quiet
```

## Verify Cleanup

List remaining secrets to verify only the 4 unified secrets exist:

```bash
gcloud secrets list --project $GCP_PROJECT_ID
```

Expected output:
```
NAME
traxettle-prod-api-config
traxettle-prod-mobile-config
```

(Or `traxettle-stg-api-config` / `traxettle-stg-mobile-config` for staging)

## Cost Savings

- **Before**: 31 secrets × multiple versions = ₹1,085.49/month
- **After**: 4 secrets × minimal versions = ~₹50-100/month
- **Savings**: ~₹985-1,035/month

## Important Notes

1. **Deploy first, then delete**: Only delete old secrets AFTER you've successfully deployed with the new scripts
2. **Test staging first**: Clean up staging secrets first, verify everything works, then clean up production
3. **No downtime needed**: The new deployment creates the unified secrets before referencing them, so the transition is seamless
4. **Rollback**: If you need to rollback, you can recreate the old secrets from your local config files

## How It Works

The new deployment scripts:
1. Build a JSON object with all secret values
2. Upload it as a single unified secret to Secret Manager
3. Cloud Run injects the unified secret as an environment variable
4. The bootstrap script (`apps/api/scripts/bootstrap-secrets.js`) parses the JSON and sets individual `process.env` variables
5. The API code continues to use `process.env.*` as before - no code changes needed
