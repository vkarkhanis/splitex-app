#!/usr/bin/env node

/**
 * Secret Bootstrap Script
 * 
 * This script reads unified JSON secrets from environment variables (injected by Cloud Run)
 * and sets them as individual environment variables.
 * This reduces the number of Secret Manager secrets from 31 to 4, dramatically lowering storage costs.
 * 
 * Usage: node scripts/bootstrap-secrets.js && node dist/index.js
 */

function parseAndSetJsonEnv(envVarName, prefix = '') {
  const jsonStr = process.env[envVarName];
  if (!jsonStr) {
    console.log(`No ${envVarName} found, using existing environment variables`);
    return;
  }

  try {
    const config = JSON.parse(jsonStr);
    for (const [key, value] of Object.entries(config)) {
      if (value !== undefined && value !== null) {
        const envKey = prefix ? `${prefix}_${key}` : key;
        process.env[envKey] = String(value);
      }
    }
    console.log(`Loaded config from ${envVarName}`);
  } catch (error) {
    console.warn(`Warning: Could not parse ${envVarName} as JSON: ${error.message}`);
  }
}

// Load and set API config secrets (injected as API_CONFIG_SECRET env var by Cloud Run)
parseAndSetJsonEnv('API_CONFIG_SECRET');

// Load and set mobile config secrets (injected as MOBILE_CONFIG_SECRET env var by Cloud Run)
// These are prefixed with REVENUECAT_ to match existing env var naming
parseAndSetJsonEnv('MOBILE_CONFIG_SECRET', 'REVENUECAT');
