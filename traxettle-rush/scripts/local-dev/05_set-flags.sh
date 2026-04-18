#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)"
FLAGS_FILE="$ROOT_DIR/scripts/local-dev/.runtime.env"

tier="free"
payments="mock"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --tier)
      tier="${2:-free}"
      shift 2
      ;;
    --payments)
      payments="${2:-mock}"
      shift 2
      ;;
    *)
      echo "Unknown argument: $1"
      exit 1
      ;;
  esac
done

if [[ "$tier" != "free" && "$tier" != "pro" ]]; then
  echo "Invalid --tier value: $tier (allowed: free|pro)"
  exit 1
fi

if [[ "$payments" != "mock" && "$payments" != "real" ]]; then
  echo "Invalid --payments value: $payments (allowed: mock|real)"
  exit 1
fi

if [[ "$payments" == "real" ]]; then
  real_payments="true"
else
  real_payments="false"
fi

cat > "$FLAGS_FILE" <<EOF
DEV_TIER=$tier
DEV_REAL_PAYMENTS=$real_payments
EOF

echo "Saved local dev flags to $FLAGS_FILE"
echo "  DEV_TIER=$tier"
echo "  DEV_REAL_PAYMENTS=$real_payments"

