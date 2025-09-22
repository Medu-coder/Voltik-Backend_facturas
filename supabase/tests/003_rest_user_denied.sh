#!/usr/bin/env bash
set -euo pipefail

export SUPABASE_PROJECT_ID="lbotbfacpnwakgtjgwxs"
export SUPABASE_URL="https://${SUPABASE_PROJECT_ID}.supabase.co"
export ANON_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imxib3RiZmFjcG53YWtndGpnd3hzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTgyODI3NzIsImV4cCI6MjA3Mzg1ODc3Mn0._aaDgL3ukBA--lYYJNvHSVFDlvru2TEyi5cCFzz85tg"

USER_EMAIL="${USER_EMAIL:-normal@example.com}"
USER_PASSWORD="${USER_PASSWORD:-12345678}"

echo "== Signup usuario normal (idempotente) =="
curl -s -S -X POST "${SUPABASE_URL}/auth/v1/signup" \
  -H "apikey: ${ANON_KEY}" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"${USER_EMAIL}\",\"password\":\"${USER_PASSWORD}\"}" | jq .

echo "== Login usuario normal =="
USER_ACCESS_TOKEN=$(
  curl -s -S -X POST "${SUPABASE_URL}/auth/v1/token?grant_type=password" \
    -H "apikey: ${ANON_KEY}" \
    -H "Content-Type: application/json" \
    -d "{\"email\":\"${USER_EMAIL}\",\"password\":\"${USER_PASSWORD}\"}" \
  | jq -r .access_token
)
echo "USER_ACCESS_TOKEN=${USER_ACCESS_TOKEN}"

echo "== NO admin: audit_logs (esperado: 0/401/403) =="
curl -i -s -S \
  -H "apikey: ${ANON_KEY}" \
  -H "Authorization: Bearer ${USER_ACCESS_TOKEN}" \
  -H "Accept-Profile: core" \
  "${SUPABASE_URL}/rest/v1/audit_logs?select=id&limit=1"

echo "== NO admin: invoices (esperado: 0/401/403) =="
curl -i -s -S \
  -H "apikey: ${ANON_KEY}" \
  -H "Authorization: Bearer ${USER_ACCESS_TOKEN}" \
  -H "Accept-Profile: core" \
  "${SUPABASE_URL}/rest/v1/invoices?select=id&limit=1"
