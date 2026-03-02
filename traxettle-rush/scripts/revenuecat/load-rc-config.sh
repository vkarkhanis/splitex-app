#!/usr/bin/env bash
set -euo pipefail

# Usage (must be sourced):
#   source scripts/revenuecat/load-rc-config.sh <local|staging|prod>
#
# This loads rc_<env>.properties from repo root and maps values to runtime env
# vars consumed by mobile/web/api build and runtime paths.

if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  echo "This script must be sourced, not executed."
  echo "Example: source scripts/revenuecat/load-rc-config.sh staging"
  exit 1
fi

RC_ENV_RAW="${1:-}"
if [[ -z "$RC_ENV_RAW" ]]; then
  echo "Missing environment argument. Use one of: local, staging, prod."
  return 1
fi

case "$RC_ENV_RAW" in
  local|staging|prod) RC_ENV="$RC_ENV_RAW" ;;
  production) RC_ENV="prod" ;;
  *) echo "Unsupported environment: $RC_ENV_RAW (expected local|staging|prod)" ; return 1 ;;
esac

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/../.." && pwd)"
RC_FILE="${ROOT_DIR}/rc_${RC_ENV}.properties"

if [[ ! -f "$RC_FILE" ]]; then
  echo "Missing RevenueCat properties file: $RC_FILE"
  return 1
fi

while IFS= read -r line || [[ -n "$line" ]]; do
  line="${line%$'\r'}"
  [[ -z "$line" ]] && continue
  [[ "$line" =~ ^[[:space:]]*# ]] && continue
  [[ "$line" == *=* ]] || continue

  key="${line%%=*}"
  value="${line#*=}"

  # Trim whitespace around key/value.
  key="${key#"${key%%[![:space:]]*}"}"
  key="${key%"${key##*[![:space:]]}"}"
  value="${value#"${value%%[![:space:]]*}"}"
  value="${value%"${value##*[![:space:]]}"}"

  [[ -n "$key" ]] || continue
  export "$key=$value"
done < "$RC_FILE"

# Canonical mappings used by this repository.
export EXPO_PUBLIC_REVENUECAT_APPLE_KEY="${EXPO_PUBLIC_REVENUECAT_APPLE_KEY:-${RC_REVENUECAT_APPLE_PUBLIC_KEY:-}}"
export EXPO_PUBLIC_REVENUECAT_GOOGLE_KEY="${EXPO_PUBLIC_REVENUECAT_GOOGLE_KEY:-${RC_REVENUECAT_GOOGLE_PUBLIC_KEY:-}}"
export EXPO_PUBLIC_REVENUECAT_PRO_ENTITLEMENT="${EXPO_PUBLIC_REVENUECAT_PRO_ENTITLEMENT:-${RC_REVENUECAT_PRO_ENTITLEMENT_ID:-pro}}"
export EXPO_PUBLIC_REVENUECAT_OFFERING="${EXPO_PUBLIC_REVENUECAT_OFFERING:-${RC_REVENUECAT_OFFERING_ID:-default}}"

export NEXT_PUBLIC_REVENUECAT_APPLE_KEY="${NEXT_PUBLIC_REVENUECAT_APPLE_KEY:-${RC_REVENUECAT_APPLE_PUBLIC_KEY:-}}"
export NEXT_PUBLIC_REVENUECAT_GOOGLE_KEY="${NEXT_PUBLIC_REVENUECAT_GOOGLE_KEY:-${RC_REVENUECAT_GOOGLE_PUBLIC_KEY:-}}"
export NEXT_PUBLIC_REVENUECAT_PRO_ENTITLEMENT="${NEXT_PUBLIC_REVENUECAT_PRO_ENTITLEMENT:-${RC_REVENUECAT_PRO_ENTITLEMENT_ID:-pro}}"
export NEXT_PUBLIC_REVENUECAT_OFFERING="${NEXT_PUBLIC_REVENUECAT_OFFERING:-${RC_REVENUECAT_OFFERING_ID:-default}}"

export REVENUECAT_WEBHOOK_SECRET="${REVENUECAT_WEBHOOK_SECRET:-${RC_REVENUECAT_WEBHOOK_SECRET:-}}"
export REVENUECAT_API_KEY="${REVENUECAT_API_KEY:-${RC_REVENUECAT_SECRET_API_KEY:-}}"
export REVENUECAT_PRO_ENTITLEMENT_ID="${REVENUECAT_PRO_ENTITLEMENT_ID:-${RC_REVENUECAT_PRO_ENTITLEMENT_ID:-pro}}"

rc_require_nonempty() {
  local missing=()
  local var_name
  for var_name in "$@"; do
    if [[ -z "${!var_name:-}" ]]; then
      missing+=("$var_name")
    fi
  done

  if (( ${#missing[@]} > 0 )); then
    echo "Missing required config keys: ${missing[*]}"
    return 1
  fi
}

