#!/usr/bin/env bash
set -euo pipefail

# End-to-end smoke tests for the frontend API using your provided data.
# You can override any variable by exporting it before running.

# Base URL of your running app
APP_URL=${APP_URL:-http://localhost:3000}

# Provided user access token (can be overridden via env)
USER_JWT=${USER_JWT:-"eyJhbGciOiJIUzI1NiIsImtpZCI6IjlTUVVPY3pXOFgrOXlqRFAiLCJ0eXAiOiJKV1QifQ.eyJpc3MiOiJodHRwczovL2xib3RiZmFjcG53YWtndGpnd3hzLnN1cGFiYXNlLmNvL2F1dGgvdjEiLCJzdWIiOiJlNTEyZDg3NS1lYjg2LTRhYTktYTI5OS04OTcyYTkwNzk3NWIiLCJhdWQiOiJhdXRoZW50aWNhdGVkIiwiZXhwIjoxNzU4NjE5OTI3LCJpYXQiOjE3NTg2MTYzMjcsImVtYWlsIjoiZWRlbGFyb3Nhb3J0aXpAZ21haWwuY29tIiwicGhvbmUiOiIiLCJhcHBfbWV0YWRhdGEiOnsicHJvdmlkZXIiOiJlbWFpbCIsInByb3ZpZGVycyI6WyJlbWFpbCJdLCJyb2xlIjoiYWRtaW4ifSwidXNlcl9tZXRhZGF0YSI6eyJlbWFpbF92ZXJpZmllZCI6dHJ1ZSwibmFtZSI6IkFkbWluIEVkdSJ9LCJyb2xlIjoiYXV0aGVudGljYXRlZCIsImFhbCI6ImFhbDEiLCJhbXIiOlt7Im1ldGhvZCI6Im1hZ2ljbGluayIsInRpbWVzdGFtcCI6MTc1ODYxMTQ5OX1dLCJzZXNzaW9uX2lkIjoiYmM1NjE3ZWMtMGM5Ni00NjQ3LTljOGUtMmMyZjRlMGUyNGEzIiwiaXNfYW5vbnltb3VzIjpmYWxzZX0.2QvkjWZTzscFpyvhFFDPtij5PaIY_oYp5aZcunl6Y9Q"}

# Customer data for the upload (can be overridden)
CUSTOMER_NAME=${CUSTOMER_NAME:-"Cliente Demo"}
CUSTOMER_EMAIL=${CUSTOMER_EMAIL:-"cliente.demo@example.com"}

# Create a small PDF if not provided
PDF=${PDF:-"$(pwd)/tmp/test.pdf"}
mkdir -p "$(dirname "$PDF")"
if [[ ! -f "$PDF" ]]; then
cat > "$PDF" <<'PDF'
%PDF-1.4
%âãÏÓ
1 0 obj
<< /Type /Catalog /Pages 2 0 R >>
endobj
2 0 obj
<< /Type /Pages /Kids [3 0 R] /Count 1 >>
endobj
3 0 obj
<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] >>
endobj
xref
0 4
0000000000 65535 f 
0000000010 00000 n 
0000000064 00000 n 
0000000126 00000 n 
trailer
<< /Root 1 0 R /Size 4 >>
startxref
188
%%EOF
PDF
fi

fail() { echo "[FAIL] $*" >&2; exit 1; }
pass() { echo "[OK]   $*"; }

echo "== Using =="
echo "APP_URL=$APP_URL"
echo "CUSTOMER_NAME=$CUSTOMER_NAME"
echo "CUSTOMER_EMAIL=$CUSTOMER_EMAIL"
echo "PDF=$PDF"

[[ -s "$PDF" ]] || fail "PDF not found or empty: $PDF"

echo "\n[1] GET /api/invoices/export.csv"
code=$(curl -s -o /dev/null -w "%{http_code}" -H "Authorization: Bearer $USER_JWT" "$APP_URL/api/invoices/export.csv?from=1900-01-01&to=2999-12-31")
[[ "$code" == "200" ]] && pass "export.csv 200" || fail "export.csv $code"

echo "\n[2] POST /api/upload"
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
[[ -n "$invoice_id" ]] || fail "Upload ok pero sin invoice_id en respuesta"
pass "upload 200 (invoice_id=$invoice_id)"

echo "\n[3] GET /api/invoices/[id]/download"
code=$(curl -s -o /dev/null -w "%{http_code}" -H "Authorization: Bearer $USER_JWT" "$APP_URL/api/invoices/$invoice_id/download")
[[ "$code" =~ ^30[127]$ ]] && pass "download $code" || fail "download $code"

echo "\n[4] POST /api/invoices/[id]/reprocess"
code=$(curl -s -o /dev/null -w "%{http_code}" -X POST -H "Authorization: Bearer $USER_JWT" "$APP_URL/api/invoices/$invoice_id/reprocess")
[[ "$code" =~ ^30[127]$ ]] && pass "reprocess $code" || fail "reprocess $code"

echo "\nAll checks passed."
