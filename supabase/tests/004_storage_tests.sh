#!/usr/bin/env bash
set -euo pipefail

export SUPABASE_PROJECT_ID="lbotbfacpnwakgtjgwxs"
export SUPABASE_URL="https://${SUPABASE_PROJECT_ID}.supabase.co"
export ANON_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imxib3RiZmFjcG53YWtndGpnd3hzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTgyODI3NzIsImV4cCI6MjA3Mzg1ODc3Mn0._aaDgL3ukBA--lYYJNvHSVFDlvru2TEyi5cCFzz85tg"
export SERVICE_ROLE_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imxib3RiZmFjcG53YWtndGpnd3hzIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1ODI4Mjc3MiwiZXhwIjoyMDczODU4NzcyfQ.UoW1yZfCc87M2qfLOtYnt5eP8_JEMVC4sjK8mk8JMHU"
export ADMIN_ACCESS_TOKEN="eyJhbGciOiJIUzI1NiIsImtpZCI6IjlTUVVPY3pXOFgrOXlqRFAiLCJ0eXAiOiJKV1QifQ.eyJpc3MiOiJodHRwczovL2xib3RiZmFjcG53YWtndGpnd3hzLnN1cGFiYXNlLmNvL2F1dGgvdjEiLCJzdWIiOiJlNTEyZDg3NS1lYjg2LTRhYTktYTI5OS04OTcyYTkwNzk3NWIiLCJhdWQiOiJhdXRoZW50aWNhdGVkIiwiZXhwIjoxNzU4MzAwNDEzLCJpYXQiOjE3NTgyOTY4MTMsImVtYWlsIjoiZWRlbGFyb3Nhb3J0aXpAZ21haWwuY29tIiwicGhvbmUiOiIiLCJhcHBfbWV0YWRhdGEiOnsicHJvdmlkZXIiOiJlbWFpbCIsInByb3ZpZGVycyI6WyJlbWFpbCJdLCJyb2xlIjoiYWRtaW4ifSwidXNlcl9tZXRhZGF0YSI6eyJlbWFpbF92ZXJpZmllZCI6dHJ1ZSwibmFtZSI6IkFkbWluIEVkdSJ9LCJyb2xlIjoiYXV0aGVudGljYXRlZCIsImFhbCI6ImFhbDEiLCJhbXIiOlt7Im1ldGhvZCI6InBhc3N3b3JkIiwidGltZXN0YW1wIjoxNzU4Mjk2ODEzfV0sInNlc3Npb25faWQiOiI1MGI4MjdkMy01NmU0LTQwMzQtYWZjNy0zYTIyNWI3NzkyZWMiLCJpc19hbm9ueW1vdXMiOmZhbHNlfQ.Dxq89ywm2Oa630UVPtKBfBEbXNFKhCNyMA63i2P1bxc"

echo "== Storage: listar como admin =="
curl -s -S -X POST "${SUPABASE_URL}/storage/v1/object/list/invoices" \
  -H "apikey: ${ANON_KEY}" \
  -H "Authorization: Bearer ${ADMIN_ACCESS_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{"prefix":"2025/09/","limit":50,"offset":0}' | jq .

echo "== Storage: descargar dummy como admin (si existe) =="
curl -s -S \
  -H "apikey: ${ANON_KEY}" \
  -H "Authorization: Bearer ${ADMIN_ACCESS_TOKEN}" \
  "${SUPABASE_URL}/storage/v1/object/invoices/2025/09/inv_dummy.pdf" \
  -o /tmp/inv_dummy.pdf || true
ls -lh /tmp/inv_dummy.pdf || echo "No se descargó (no existe o policies)"

echo "== Storage: subir con service_role (permitido) =="
echo "PDF FAKE" > /tmp/fake.pdf
curl -i -s -S -X POST "${SUPABASE_URL}/storage/v1/object/invoices/2025/09/fake_$RANDOM.pdf" \
  -H "Authorization: Bearer ${SERVICE_ROLE_KEY}" \
  -H "apikey: ${SERVICE_ROLE_KEY}" \
  -H "Content-Type: application/pdf" \
  --data-binary @/tmp/fake.pdf

echo "== Storage: subir con admin (esperado: 401/403) =="
curl -i -s -S -X POST "${SUPABASE_URL}/storage/v1/object/invoices/2025/09/forbidden.pdf" \
  -H "Authorization: Bearer ${ADMIN_ACCESS_TOKEN}" \
  -H "apikey: ${ANON_KEY}" \
  -H "Content-Type: application/pdf" \
  --data-binary @/tmp/fake.pdf
