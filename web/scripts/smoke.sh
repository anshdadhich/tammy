#!/usr/bin/env bash
# Smoke test (API-only): GET / (JSON index) + unauthenticated POST /api/* -> 401 (auth runs before zod validation).
# Usage: BASE_URL=http://localhost:3000 bash web/scripts/smoke.sh
set -u
BASE_URL="${BASE_URL:-http://localhost:3000}"
PASS=0; FAIL=0

check() { # check <label> <expected_status> <actual_status>
  if [ "$2" = "$3" ]; then echo "PASS $1 ($3)"; PASS=$((PASS+1));
  else echo "FAIL $1 (want $2, got $3)"; FAIL=$((FAIL+1)); fi
}

code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/");            check "GET /" 200 "$code"

# Invalid job must 401 unauthenticated (auth runs before zod validation), not 500.
code=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE_URL/api/search" \
  -H "Content-Type: application/json" -d '{}')
check "POST /api/search {} -> 401" 401 "$code"

# Missing sessions must 401.
code=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE_URL/api/shortlists" \
  -H "Content-Type: application/json" -d '{}')
check "POST /api/shortlists {} -> 401" 401 "$code"
code=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE_URL/api/contacts" \
  -H "Content-Type: application/json" -d '{}')
check "POST /api/contacts {} -> 401" 401 "$code"

echo "--- $PASS passed, $FAIL failed ---"
[ "$FAIL" -eq 0 ]
