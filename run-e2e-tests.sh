#!/usr/bin/env bash
set -euo pipefail

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'

echo -e "${YELLOW}== E2E Test Runner: Next.js API + Supabase ==${NC}"

if [ ! -f .env.local ]; then
  echo -e "${RED}Missing .env.local${NC}"; exit 1
fi

# Load env (bash-compatible .env)
set -a
. ./.env.local
set +a

BASE_URL=${BASE_URL:-"http://localhost:3000"}
echo -e "Using BASE_URL=${BASE_URL}"

req() { curl -sS -H 'content-type: application/json' "$@"; }

node_json() { node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{try{const j=JSON.parse(d);console.log(JSON.stringify(j));}catch(e){console.error('invalid json');process.exit(1)}})"; }

gen_admin_jwt() {
  node -e '
    (async () => {
      const { SignJWT } = await import("jose")
      const { createSecretKey } = await import("node:crypto")
      const secret = process.env.SUPABASE_JWT_SECRET
      if (!secret) { console.error("Missing SUPABASE_JWT_SECRET"); process.exit(1) }
      let key
      try { key = createSecretKey(Buffer.from(secret, "base64")) } catch { key = createSecretKey(Buffer.from(secret)) }
      const userId = process.env.ADMIN_USER_ID || "11111111-1111-1111-1111-111111111111"
      const email = process.env.ADMIN_EMAIL || "admin@example.com"
      const token = await new SignJWT({ sub: userId, email, role: "authenticated", admin: true, app_metadata: { role: "admin" } })
        .setProtectedHeader({ alg: "HS256", typ: "JWT" })
        .setIssuedAt()
        .setIssuer("supabase")
        .setExpirationTime("15m")
        .sign(key)
      console.log(token)
    })()
  '
}

ensure_test_customer() {
  local email="$1"
  local supa="${NEXT_PUBLIC_SUPABASE_URL}"
  local key="${SUPABASE_SERVICE_ROLE_KEY}"
  if [ -z "${supa:-}" ] || [ -z "${key:-}" ]; then
    echo -e "${RED}Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY${NC}"; exit 1
  fi
  # Find by email
  local out
  out=$(curl -sS -H "apikey: $key" -H "Authorization: Bearer $key" -H 'Accept-Profile: core' \
    "$supa/rest/v1/customers?select=id,email&email=eq.$email")
  local id
  id=$(node -e "const a=${out:-'[]'};if(Array.isArray(a)&&a.length){console.log(a[0].id)}") || true
  if [ -n "${id:-}" ]; then
    echo "$id"; return 0
  fi
  # Insert new
  local user_id
  user_id=${ADMIN_USER_ID:-"11111111-1111-1111-1111-111111111111"}
  out=$(curl -sS -X POST -H "apikey: $key" -H "Authorization: Bearer $key" \
    -H 'Content-Type: application/json' -H 'Accept-Profile: core' -H 'Content-Profile: core' -H 'Prefer: return=representation' \
    -d "{\"user_id\":\"$user_id\",\"name\":\"E2E Test\",\"email\":\"$email\"}" \
    "$supa/rest/v1/customers?select=id")
  id=$(node -e "const a=${out:-'[]'};if(Array.isArray(a)&&a.length){console.log(a[0].id)}") || true
  if [ -z "${id:-}" ]; then
    # Fallback: re-fetch by email in case the server ignored Prefer header
    out=$(curl -sS -H "apikey: $key" -H "Authorization: Bearer $key" -H 'Accept-Profile: core' \
      "$supa/rest/v1/customers?select=id,email&email=eq.$email")
    id=$(node -e "const a=${out:-'[]'};if(Array.isArray(a)&&a.length){console.log(a[0].id)}") || true
  fi
  if [ -z "${id:-}" ]; then echo -e "${RED}Failed to create test customer${NC}"; echo "$out"; exit 1; fi
  echo "$id"
}

make_sample_pdf() {
  local f="$1"
  # Tiny valid PDF
  cat > "$f" <<'PDF'
%PDF-1.4
1 0 obj <</Type /Catalog /Pages 2 0 R>> endobj
2 0 obj <</Type /Pages /Kids [3 0 R] /Count 1>> endobj
3 0 obj <</Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] /Contents 4 0 R>> endobj
4 0 obj <</Length 44>> stream
BT /F1 12 Tf 72 120 Td (Hello Invoice) Tj ET
endstream endobj
5 0 obj <</Type /Font /Subtype /Type1 /BaseFont /Helvetica>> endobj
xref
0 6
0000000000 65535 f 
0000000010 00000 n 
0000000060 00000 n 
0000000115 00000 n 
0000000210 00000 n 
0000000320 00000 n 
trailer <</Size 6/Root 1 0 R>>
startxref
380
%%EOF
PDF
}

check_server() {
  local code
  code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL") || code="000"
  if [ "$code" = "000" ]; then
    echo -e "${RED}Server not reachable at ${BASE_URL}. Please run your Next.js app.${NC}"
    exit 1
  fi
}

PASS_COUNT=0; FAIL_COUNT=0
pass() { echo -e "${GREEN}✓ $1${NC}"; PASS_COUNT=$((PASS_COUNT+1)); }
fail() { echo -e "${RED}✗ $1${NC}"; FAIL_COUNT=$((FAIL_COUNT+1)); }

check_server

# Prepare data
ADMIN_JWT=$(gen_admin_jwt)
TEST_EMAIL=${TEST_CUSTOMER_EMAIL:-"e2e.customer+$(date +%s)@voltik.test"}
CUSTOMER_ID=$(ensure_test_customer "$TEST_EMAIL")
PDF_FILE="/tmp/e2e_invoice.pdf"; make_sample_pdf "$PDF_FILE"

# 1) /api/upload
UP_OUT=$(mktemp)
UP_CODE=$(curl -sS -w "%{http_code}" -o "$UP_OUT" -X POST \
  -F "file=@${PDF_FILE};type=application/pdf" \
  -F "customer_id=${CUSTOMER_ID}" \
  "$BASE_URL/api/upload" || true)
if [ "$UP_CODE" = "201" ]; then
  INVOICE_ID=$(node -e "const o=JSON.parse(require('fs').readFileSync(process.argv[1],'utf8'));console.log(o.invoice_id||'')" "$UP_OUT")
  STORAGE_PATH=$(node -e "const o=JSON.parse(require('fs').readFileSync(process.argv[1],'utf8'));console.log(o.storage_path||'')" "$UP_OUT")
  if [ -n "${INVOICE_ID:-}" ] && [ -n "${STORAGE_PATH:-}" ]; then pass "/api/upload 201"; else fail "/api/upload response missing fields"; fi
else
  echo "Response ($UP_CODE):"; cat "$UP_OUT"; echo; fail "/api/upload expected 201"
fi

# 2) /api/email/inbound
INB_OUT=$(mktemp)
INB_CODE=$(curl -sS -w "%{http_code}" -o "$INB_OUT" -X POST \
  -H "X-INBOUND-SECRET: ${INBOUND_EMAIL_SECRET}" \
  -F "from=${TEST_EMAIL}" -F "subject=E2E Test" \
  -F "attachment1=@${PDF_FILE};type=application/pdf" \
  "$BASE_URL/api/email/inbound" || true)
if [ "$INB_CODE" = "200" ]; then pass "/api/email/inbound 200"; else echo "Response ($INB_CODE):"; cat "$INB_OUT"; echo; fail "/api/email/inbound expected 200"; fi

# 3) /api/files/signed-url
SIG_OUT=$(mktemp)
SIG_CODE=$(curl -sS -w "%{http_code}" -o "$SIG_OUT" \
  -H "Authorization: Bearer ${ADMIN_JWT}" \
  "$BASE_URL/api/files/signed-url?path=${STORAGE_PATH}&expiresIn=60" || true)
if [ "$SIG_CODE" = "200" ]; then
  SIGNED_URL=$(node -e "const o=JSON.parse(require('fs').readFileSync(process.argv[1],'utf8'));console.log(o.url||'')" "$SIG_OUT")
  if [ -n "${SIGNED_URL:-}" ]; then pass "/api/files/signed-url 200"; else fail "signed-url missing url"; fi
else
  echo "Response ($SIG_CODE):"; cat "$SIG_OUT"; echo; fail "/api/files/signed-url expected 200"; fi

# 4) /api/export/csv
CSV_HEADERS=$(mktemp); CSV_OUT=$(mktemp)
CSV_CODE=$(curl -sS -D "$CSV_HEADERS" -o "$CSV_OUT" -w "%{http_code}" \
  -H "Authorization: Bearer ${ADMIN_JWT}" \
  "$BASE_URL/api/export/csv" || true)
CT=$(awk 'tolower($1) ~ /^content-type:/ {print tolower($2)}' "$CSV_HEADERS" | tr -d '\r')
if [ "$CSV_CODE" = "200" ] && [[ "$CT" == text/csv* ]]; then pass "/api/export/csv 200 CSV"; else echo "Headers:"; cat "$CSV_HEADERS"; echo; cat "$CSV_OUT"; fail "/api/export/csv expected 200 CSV"; fi

echo -e "${YELLOW}Summary: PASS=${PASS_COUNT} FAIL=${FAIL_COUNT}${NC}"
test "$FAIL_COUNT" = 0 || exit 1
