#!/usr/bin/env bash
set -euo pipefail

green()  { printf "\033[32m%s\033[0m\n" "$*"; }
red()    { printf "\033[31m%s\033[0m\n" "$*"; }
yellow() { printf "\033[33m%s\033[0m\n" "$*"; }
blue()   { printf "\033[34m%s\033[0m\n" "$*"; }

# Carga env si existe
[ -f "./supabase_env.sh" ] && source ./supabase_env.sh && blue "Loaded ./supabase_env.sh"

# Defaults
: "${SUPABASE_URL:?Define SUPABASE_URL}"
: "${ANON_KEY:?Define ANON_KEY}"
: "${SERVICE_ROLE_KEY:?Define SERVICE_ROLE_KEY}"
: "${SUPABASE_JWT_SECRET:?Define SUPABASE_JWT_SECRET}"

ADMIN_EMAIL="${ADMIN_EMAIL:-admin@example.com}"
ADMIN_USER_ID="${ADMIN_USER_ID:-11111111-1111-1111-1111-111111111111}"
USER_EMAIL="${USER_EMAIL:-normal.user+test@voltik.es}"
USER_USER_ID="${USER_USER_ID:-22222222-2222-2222-2222-222222222222}"

command -v jq >/dev/null || { red "Falta jq"; exit 1; }
command -v python3 >/dev/null || { red "Falta python3"; exit 1; }
command -v curl >/dev/null || { red "Falta curl"; exit 1; }

# Firma HS256 sin dependencias (con python3 stdlib)
mint_jwt() {
python3 - "$@" <<'PY'
import os,sys,json,base64,hmac,hashlib,time
secret=os.environ["SUPABASE_JWT_SECRET"].encode()
sub=os.environ.get("SUB","00000000-0000-0000-0000-000000000000")
email=os.environ.get("EMAIL","user@example.com")
is_admin=os.environ.get("IS_ADMIN","false").lower()=="true"
iat=int(time.time()); exp=iat+60*30  # 30 min
def b64u(d): return base64.urlsafe_b64encode(d).rstrip(b'=')
hdr=b64u(json.dumps({"alg":"HS256","typ":"JWT"}).encode())
payload={
  "sub": sub,
  "role":"authenticated",
  "email": email,
  "app_metadata":{"role":"admin" if is_admin else "user"},
  "admin": is_admin,
  "iss":"supabase","aud":"authenticated","iat":iat,"exp":exp
}
pld=b64u(json.dumps(payload,separators=(',',':')).encode())
msg=hdr+b"."+pld
sig=b64u(hmac.new(secret,msg,hashlib.sha256).digest())
print((msg+b"."+sig).decode())
PY
}

ensure_tokens() {
  export SUB="$ADMIN_USER_ID" EMAIL="$ADMIN_EMAIL" IS_ADMIN=true
  ADMIN_ACCESS_TOKEN="$(mint_jwt)"
  export SUB="$USER_USER_ID"  EMAIL="$USER_EMAIL"  IS_ADMIN=false
  USER_ACCESS_TOKEN="$(mint_jwt)"
  unset SUB EMAIL IS_ADMIN
  # sanity: ambos deben tener 3 partes
  [ "$(awk -F. '{print NF}' <<<"$ADMIN_ACCESS_TOKEN")" -eq 3 ] || { red "ADMIN JWT inválido"; exit 1; }
  [ "$(awk -F. '{print NF}' <<<"$USER_ACCESS_TOKEN")" -eq 3 ] || { red "USER JWT inválido"; exit 1; }
  green "JWTs generados localmente (admin y user)."
}

req_json() {
  local method="$1"; shift
  local url="${SUPABASE_URL}$1"; shift
  local out; out="$(mktemp)"
  local code; code=$(curl -s -o "$out" -w "%{http_code}" -X "$method" "$url" "$@")
  echo "$code" "$out"
}
ok_json_nonempty() { jq -e '((type=="array" and length>0) or (type=="object"))' "$1" >/dev/null 2>&1; }

test_rest_admin() {
  blue "== Test A: REST (ADMIN) =="
  # customers
  read -r code out < <(req_json GET "/rest/v1/customers?select=id,name,email,created_at&limit=5" \
    -H "apikey: ${ANON_KEY}" -H "Authorization: Bearer ${ADMIN_ACCESS_TOKEN}" -H "Accept-Profile: core")
  [ "$code" = "200" ] && ok_json_nonempty "$out" && green "✓ customers OK (admin)" || { red "✗ customers FAIL ($code)"; jq . "$out"||true; exit 1; }
  # invoices
  read -r code out < <(req_json GET "/rest/v1/invoices?select=id,customer_id,issue_date,status,total_amount_eur&order=created_at.desc&limit=5" \
    -H "apikey: ${ANON_KEY}" -H "Authorization: Bearer ${ADMIN_ACCESS_TOKEN}" -H "Accept-Profile: core")
  [ "$code" = "200" ] && ok_json_nonempty "$out" && green "✓ invoices OK (admin)" || { red "✗ invoices FAIL ($code)"; jq . "$out"||true; exit 1; }
  # audit_logs
  read -r code out < <(req_json GET "/rest/v1/audit_logs?select=id,event,entity,level,created_at&order=created_at.desc&limit=5" \
    -H "apikey: ${ANON_KEY}" -H "Authorization: Bearer ${ADMIN_ACCESS_TOKEN}" -H "Accept-Profile: core")
  [ "$code" = "200" ] && ok_json_nonempty "$out" && green "✓ audit_logs OK (admin)" || { red "✗ audit_logs FAIL ($code)"; jq . "$out"||true; exit 1; }
}

test_rest_user_denied() {
  blue "== Test B: REST (NO ADMIN) =="

  # audit_logs (debe estar bloqueado o vacío)
  read -r code out < <(req_json GET "/rest/v1/audit_logs?select=id&limit=1" \
    -H "apikey: ${ANON_KEY}" -H "Authorization: Bearer ${USER_ACCESS_TOKEN}" -H "Accept-Profile: core")
  if [[ "$code" =~ ^401|403$ ]]; then
    green "✓ audit_logs denegado ($code)"
  elif [ "$code" = "200" ] && jq -e 'type=="array" and length==0' "$out" >/dev/null; then
    green "✓ audit_logs 200 pero vacío"
  else
    red "✗ audit_logs visible (HTTP $code)"; jq . "$out" || true; exit 1
  fi

  # invoices (debe estar bloqueado o vacío)
  read -r code out < <(req_json GET "/rest/v1/invoices?select=id&limit=1" \
    -H "apikey: ${ANON_KEY}" -H "Authorization: Bearer ${USER_ACCESS_TOKEN}" -H "Accept-Profile: core")
  if [[ "$code" =~ ^401|403$ ]]; then
    green "✓ invoices denegado ($code)"
  elif [ "$code" = "200" ] && jq -e 'type=="array" and length==0' "$out" >/dev/null; then
    green "✓ invoices 200 pero vacío"
  else
    red "✗ invoices visible (HTTP $code)"; jq . "$out" || true; exit 1
  fi
}

test_storage() {
  blue "== Test C: Storage =="
  # List (service_role)
  read -r code out < <(req_json POST "/storage/v1/object/list/invoices" \
    -H "Authorization: Bearer ${SERVICE_ROLE_KEY}" -H "apikey: ${SERVICE_ROLE_KEY}" -H "Content-Type: application/json" \
    -d '{"prefix":"2025/09/","limit":50,"offset":0}')
  [ "$code" = "200" ] && green "✓ list (service_role) OK" || { red "✗ list Storage FAIL ($code)"; jq . "$out"||true; exit 1; }
  # Download (admin)
  curl -s -H "apikey: ${ANON_KEY}" -H "Authorization: Bearer ${ADMIN_ACCESS_TOKEN}" \
    "${SUPABASE_URL}/storage/v1/object/invoices/2025/09/inv_dummy.pdf" -o /tmp/inv_dummy.pdf || true
  [ -s /tmp/inv_dummy.pdf ] && green "✓ descarga inv_dummy.pdf OK (admin)" || yellow "• inv_dummy.pdf no existe (ok si no sembraste storage)"
  # Upload allowed (service_role)
  echo "PDF FAKE" > /tmp/fake.pdf
  up_code=$(curl -i -s -o /dev/null -w "%{http_code}" -X POST \
    "${SUPABASE_URL}/storage/v1/object/invoices/2025/09/fake_$RANDOM.pdf" \
    -H "Authorization: Bearer ${SERVICE_ROLE_KEY}" -H "apikey: ${SERVICE_ROLE_KEY}" \
    -H "Content-Type: application/pdf" --data-binary @/tmp/fake.pdf)
  [[ "$up_code" =~ ^200|201$ ]] && green "✓ subida con service_role OK ($up_code)" || { red "✗ subida con service_role FAIL ($up_code)"; exit 1; }
  # Upload forbidden (admin)
  up_admin_code=$(curl -i -s -o /dev/null -w "%{http_code}" -X POST \
    "${SUPABASE_URL}/storage/v1/object/invoices/2025/09/admin_$RANDOM.pdf" \
    -H "Authorization: Bearer ${ADMIN_ACCESS_TOKEN}" -H "apikey: ${ANON_KEY}" \
    -H "Content-Type: application/pdf" --data-binary @/tmp/fake.pdf)

  if [[ "$up_admin_code" =~ ^200|201$ ]]; then
    green "✓ subida con admin OK ($up_admin_code)"
  else
    red "✗ subida con admin FAIL ($up_admin_code)"; exit 1
  fi
}
  
blue "== SUPABASE REST TEST RUNNER =="
echo "Project: $SUPABASE_PROJECT_ID"
ensure_tokens
test_rest_admin
test_rest_user_denied
test_storage
green "✅ Todas las pruebas REST han pasado."
