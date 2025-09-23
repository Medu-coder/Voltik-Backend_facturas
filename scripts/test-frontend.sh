#!/usr/bin/env bash
set -euo pipefail

# Simple E2E smoke for frontend APIs that accept Bearer JWT (user access_token)
# Requirements:
#  - App running at NEXT_PUBLIC_APP_URL (default http://localhost:3000)
#  - .env.local configured
#  - Export envs before running:
#      export USER_JWT="<access_token de Supabase tras login>"
#      export CUSTOMER_NAME="Cliente QA"
#      export CUSTOMER_EMAIL="cliente.qa@example.com"
#      export PDF="/ruta/a/factura.pdf"

APP_URL=${NEXT_PUBLIC_APP_URL:-http://localhost:3000}

fail() { echo "[FAIL] $*" >&2; exit 1; }
pass() { echo "[OK]   $*"; }

[[ -n "${USER_JWT:-}" ]] || fail "Define USER_JWT con tu access_token (tras login)"
CUSTOMER_NAME=${CUSTOMER_NAME:-"Cliente QA"}
CUSTOMER_EMAIL=${CUSTOMER_EMAIL:-"cliente.qa@example.com"}
[[ -n "${PDF:-}" ]] || fail "Define PDF con ruta a un archivo .pdf"
[[ -f "$PDF" ]] || fail "No existe el archivo PDF en $PDF"

echo "== Using =="
echo "APP_URL=$APP_URL"
echo "CUSTOMER_NAME=$CUSTOMER_NAME"
echo "CUSTOMER_EMAIL=$CUSTOMER_EMAIL"

echo "\n[1] Test /api/invoices/export.csv (expect 200 CSV)"
code=$(curl -s -o /dev/null -w "%{http_code}" -H "Authorization: Bearer $USER_JWT" "$APP_URL/api/invoices/export.csv?from=1900-01-01&to=2999-12-31")
[[ "$code" == "200" ]] && pass "export.csv 200" || fail "export.csv $code"

echo "\n[2] Test /api/upload (expect 200 JSON)"
res=$(curl -s -w "\n%{http_code}" \
  -H "Authorization: Bearer $USER_JWT" \
  -F "customer_name=$CUSTOMER_NAME" \
  -F "customer_email=$CUSTOMER_EMAIL" \
  -F "file=@$PDF;type=application/pdf" \
  "$APP_URL/api/upload")
body=$(echo "$res" | sed '$d')
code=$(echo "$res" | tail -n1)
[[ "$code" == "200" ]] || { echo "$body"; fail "/api/upload $code"; }
invoice_id=$(echo "$body" | node -e "let s='';process.stdin.on('data',c=>s+=c).on('end',()=>{try{const o=JSON.parse(s);console.log(o.id||'')}catch{console.log('')}}")
[[ -n "$invoice_id" ]] || fail "No invoice id returned"
pass "upload 200 (invoice_id=$invoice_id)"

echo "\n[3] Test /api/invoices/[id]/download (expect 3xx redirect)"
code=$(curl -s -o /dev/null -w "%{http_code}" -H "Authorization: Bearer $USER_JWT" "$APP_URL/api/invoices/$invoice_id/download")
[[ "$code" =~ ^30[127]$ ]] && pass "download $code" || fail "download $code"

echo "\n[4] Test /api/invoices/[id]/reprocess (expect 3xx redirect)"
code=$(curl -s -o /dev/null -w "%{http_code}" -X POST -H "Authorization: Bearer $USER_JWT" "$APP_URL/api/invoices/$invoice_id/reprocess")
[[ "$code" =~ ^30[127]$ ]] && pass "reprocess $code" || fail "reprocess $code"

echo "\nAll checks passed."
