#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────────────────────
# Traxettle regression suite: every automated check, in one command.
#
#   bash scripts/regression/run.sh [quick|full|mobile|all] [--only <step>[,<step>…]]
#
#   quick   Type checks and every unit suite (shared, ui, api, web, mobile). ~3 min.
#   full    quick + every Playwright browser test (web app against a local API). ~7 min. Default.
#   mobile  The Maestro flows on a booted iOS simulator or Android emulator (see below).
#   all     full + mobile.
#
#   --only  Run just these steps, e.g. --only api,web or --only e2e. Steps:
#           build typecheck shared ui api web mobile e2e maestro
#
# Every step runs even if an earlier one fails, so one run shows every problem. Logs and a
# summary go to artifacts/regression/<timestamp>/. Exit code 1 if anything failed.
#
# Mobile (Maestro): needs the Maestro CLI (~/.maestro/bin/maestro), JDK 21+, a booted simulator
# or emulator with the dev app (com.traxettle.app) installed, and the Firebase emulator suite
# (started by apps/mobile/maestro/scripts/run-maestro.sh). See
# traxettle-app/docs/runbook/REGRESSION_SUITE.md.
# ──────────────────────────────────────────────────────────────────────────────
set -uo pipefail

ROOT="$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)"
TIER="full"
ONLY=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    quick|full|mobile|all) TIER="$1"; shift ;;
    --only) ONLY="${2:-}"; shift 2 ;;
    -h|--help) sed -n '2,24p' "$0"; exit 0 ;;
    *) echo "Unknown argument: $1 (try --help)"; exit 2 ;;
  esac
done

STAMP="$(date +%Y%m%d-%H%M%S)"
OUT="$ROOT/artifacts/regression/$STAMP"
mkdir -p "$OUT"
# Rush pins Node 24; newer Node works but Rush refuses without this.
export RUSH_ALLOW_UNSUPPORTED_NODEJS=1

# JDK 21+ for the Firebase emulator (Homebrew's keg-only openjdk@21, if that's what's installed).
if [[ -z "${JAVA_HOME:-}" && -x /opt/homebrew/opt/openjdk@21/bin/java ]]; then
  export JAVA_HOME=/opt/homebrew/opt/openjdk@21
  export PATH="$JAVA_HOME/bin:$PATH"
fi

# Playwright's own Chromium if installed, else the installed Google Chrome.
if [[ -z "${PLAYWRIGHT_CHANNEL:-}" ]] && ! ls "$HOME/Library/Caches/ms-playwright"/chromium-* >/dev/null 2>&1 \
  && ! ls "$HOME/.cache/ms-playwright"/chromium-* >/dev/null 2>&1; then
  if [[ -d "/Applications/Google Chrome.app" ]]; then export PLAYWRIGHT_CHANNEL=chrome; fi
fi

case "$TIER" in
  quick)  STEPS=(build typecheck shared ui api web mobile) ;;
  full)   STEPS=(build typecheck shared ui api web mobile e2e) ;;
  mobile) STEPS=(build maestro) ;;
  all)    STEPS=(build typecheck shared ui api web mobile e2e maestro) ;;
esac
if [[ -n "$ONLY" ]]; then IFS=',' read -r -a STEPS <<< "$ONLY"; fi

declare -a NAMES RESULTS TIMES
FAILED=0

run_step() {
  local name="$1"; shift
  local log="$OUT/$name.log"
  local start end status
  printf '▶ %-10s ' "$name"
  start=$(date +%s)
  ( cd "$ROOT" && eval "$@" ) >"$log" 2>&1
  status=$?
  # Don't rely on the exit code alone for Maestro: also fail the step if any flow failed or the
  # runner stopped (for example at its safety check).
  if [[ "$name" == "maestro" && $status -eq 0 ]] && grep -qE "^\[Failed\]|Flows? Failed|\[maestro-runner\] (STOP|ERROR)" "$log"; then
    status=1
  fi
  end=$(date +%s)
  NAMES+=("$name"); TIMES+=("$((end - start))s")
  if [[ $status -eq 0 ]]; then
    RESULTS+=("PASS"); echo "PASS ($((end - start))s)"
  else
    RESULTS+=("FAIL"); FAILED=1; echo "FAIL ($((end - start))s) — see $log"
    tail -n 25 "$log" | sed 's/^/    │ /'
  fi
}

# Jest prints "Tests: N passed, N total"; Playwright prints "N passed". Pull the counts for the summary.
counts() {
  local log="$OUT/$1.log"
  [[ -f "$log" ]] || return 0
  grep -E "^Tests:|^\s+[0-9]+ (passed|failed|skipped|flaky)|^[0-9/]+ Flows? (Passed|Failed)" "$log" | tr -s ' ' | tr '\n' ' ' | sed 's/ *$//'
}

echo "Traxettle regression — tier: $TIER — logs: $OUT"
for step in "${STEPS[@]}"; do
  case "$step" in
    build)     run_step build "node common/scripts/install-run-rush.js build --to @traxettle/shared --to @traxettle/ui" ;;
    typecheck) run_step typecheck "(cd apps/api && npx tsc --noEmit) && (cd apps/web && npx tsc --noEmit) && (cd apps/mobile && npx tsc --noEmit)" ;;
    shared)    run_step shared "cd libraries/shared && npx jest --ci" ;;
    ui)        run_step ui "cd libraries/ui && npx jest --ci" ;;
    api)       run_step api "cd apps/api && npx jest --ci" ;;
    web)       run_step web "cd apps/web && npx jest --ci" ;;
    mobile)    run_step mobile "cd apps/mobile && npx jest --ci" ;;
    e2e)       run_step e2e "cd e2e && npx playwright test --config=playwright.config.ts" ;;
    maestro)   run_step maestro "cd apps/mobile && RUN_ID=$STAMP sh maestro/scripts/run-maestro.sh ${MAESTRO_MODE:-normal}" ;;
    *) echo "Unknown step: $step"; FAILED=1 ;;
  esac
done

{
  echo "# Regression run $STAMP (tier: $TIER)"
  echo
  echo "Branch: $(git -C "$ROOT" rev-parse --abbrev-ref HEAD 2>/dev/null) @ $(git -C "$ROOT" rev-parse --short HEAD 2>/dev/null)"
  echo
  echo "| Step | Result | Time | Counts |"
  echo "|---|---|---|---|"
  for i in "${!NAMES[@]}"; do
    echo "| ${NAMES[$i]} | ${RESULTS[$i]} | ${TIMES[$i]} | $(counts "${NAMES[$i]}") |"
  done
} > "$OUT/summary.md"

echo
cat "$OUT/summary.md"
if [[ -d "$ROOT/e2e/playwright-report" && " ${STEPS[*]} " == *" e2e "* ]]; then
  echo
  echo "Browser test report: (cd e2e && npx playwright show-report)"
fi
exit $FAILED
