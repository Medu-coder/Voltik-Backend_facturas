#!/usr/bin/env bash
set -euo pipefail

echo "== Admin: GET customers =="
curl -s \
  -H "apikey: ${ANON_KEY}" \
  -H "Authorization: Bearer ${ADMIN_ACCESS_TOKEN}" \
  -H "Accept-Profile: core" \
  "${SUPABASE_URL}/rest/v1/customers?select=id,name,email,created_at&limit=5" | jq .

echo "== Admin: GET invoices =="
curl -s \
  -H "apikey: ${ANON_KEY}" \
  -H "Authorization: Bearer ${ADMIN_ACCESS_TOKEN}" \
  -H "Accept-Profile: core" \
  "${SUPABASE_URL}/rest/v1/invoices?select=id,customer_id,issue_date,status,total_amount_eur&limit=5" | jq .

echo "== Admin: GET audit_logs =="
curl -s \
  -H "apikey: ${ANON_KEY}" \
  -H "Authorization: Bearer ${ADMIN_ACCESS_TOKEN}" \
  -H "Accept-Profile: core" \
  "${SUPABASE_URL}/rest/v1/audit_logs?select=id,event,entity,level,created_at&limit=5" | jq .
