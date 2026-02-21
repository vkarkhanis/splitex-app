#!/usr/bin/env bash

set -euo pipefail

# Local Free/Pro entitlement verification script.
# Prereq: backend exposes non-prod endpoint:
#   POST /api/internal/entitlements/switch
# and enforces FX gating on:
#   POST /api/events

API_BASE="${API_BASE:-http://localhost:3001}"
TOKEN="${TOKEN:-}"
USER_ID="${USER_ID:-}"
TEST_NAME="${TEST_NAME:-Local Tier Test Event}"
EVENT_TYPE="${EVENT_TYPE:-event}"
EVENT_CURRENCY="${EVENT_CURRENCY:-USD}"
SETTLEMENT_CURRENCY="${SETTLEMENT_CURRENCY:-INR}"
FX_RATE_MODE="${FX_RATE_MODE:-predefined}"
FX_RATE_VALUE="${FX_RATE_VALUE:-83.50}"

usage() {
  cat <<EOF
Usage:
  TOKEN="<jwt>" USER_ID="<uid>" $0

Optional env vars:
  API_BASE=http://localhost:3001
  TEST_NAME="Local Tier Test Event"
  EVENT_TYPE=event
  EVENT_CURRENCY=USD
  SETTLEMENT_CURRENCY=INR
  FX_RATE_MODE=predefined
  FX_RATE_VALUE=83.50

Example:
  TOKEN="eyJ..." USER_ID="mock-user-1" $0
EOF
}

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
  usage
  exit 0
fi

if [[ -z "$TOKEN" || -z "$USER_ID" ]]; then
  echo "ERROR: TOKEN and USER_ID are required."
  usage
  exit 1
fi

auth_header=(-H "Authorization: Bearer ${TOKEN}" -H "Content-Type: application/json")

pass() { echo "[PASS] $1"; }
fail() { echo "[FAIL] $1"; exit 1; }
step() { echo; echo "==> $1"; }

set_entitlement() {
  local tier="$1"

  local resp
  resp="$(curl -sS -o /tmp/splitex_entitlement_set.json -w "%{http_code}" \
    -X POST "${API_BASE}/api/internal/entitlements/switch" \
    "${auth_header[@]}" \
    -d "{\"userId\":\"${USER_ID}\",\"tier\":\"${tier}\"}")"

  if [[ "$resp" != "200" && "$resp" != "201" ]]; then
    echo "Response code: $resp"
    echo "Body:"
    cat /tmp/splitex_entitlement_set.json || true
    fail "Unable to set entitlement to ${tier}. Check local API config and internal test route."
  fi
  pass "Entitlement set to ${tier}"
}

create_event_with_fx() {
  local out_file="$1"
  local code
  code="$(curl -sS -o "${out_file}" -w "%{http_code}" \
    -X POST "${API_BASE}/api/events" \
    "${auth_header[@]}" \
    -d "{
      \"name\":\"${TEST_NAME}\",
      \"description\":\"Created by local-entitlement-test.sh\",
      \"type\":\"${EVENT_TYPE}\",
      \"startDate\":\"$(date -u +"%Y-%m-%dT%H:%M:%SZ")\",
      \"currency\":\"${EVENT_CURRENCY}\",
      \"settlementCurrency\":\"${SETTLEMENT_CURRENCY}\",
      \"fxRateMode\":\"${FX_RATE_MODE}\",
      \"predefinedFxRates\":{\"${EVENT_CURRENCY}_${SETTLEMENT_CURRENCY}\":${FX_RATE_VALUE}}
    }")"
  echo "$code"
}

step "Checking API health"
health_code="$(curl -sS -o /tmp/splitex_health.json -w "%{http_code}" "${API_BASE}/health")"
[[ "$health_code" == "200" ]] || fail "API health check failed at ${API_BASE}/health (code ${health_code})"
pass "API is reachable"

step "Scenario A: Free user cannot create FX event"
set_entitlement "free"
free_code="$(create_event_with_fx /tmp/splitex_fx_free.json)"
if [[ "$free_code" == "403" ]]; then
  pass "Free user was blocked from FX event creation (expected)"
else
  echo "Unexpected status code for Free scenario: ${free_code}"
  echo "Body:"
  cat /tmp/splitex_fx_free.json || true
  fail "Free user should not be able to create FX event"
fi

step "Scenario B: Pro user can create FX event"
set_entitlement "pro"
pro_code="$(create_event_with_fx /tmp/splitex_fx_pro.json)"
if [[ "$pro_code" == "201" || "$pro_code" == "200" ]]; then
  pass "Pro user can create FX event (expected)"
else
  echo "Unexpected status code for Pro scenario: ${pro_code}"
  echo "Body:"
  cat /tmp/splitex_fx_pro.json || true
  fail "Pro user should be able to create FX event"
fi

echo
echo "All tier checks passed."
echo "Artifacts:"
echo "  /tmp/splitex_entitlement_set.json"
echo "  /tmp/splitex_fx_free.json"
echo "  /tmp/splitex_fx_pro.json"
