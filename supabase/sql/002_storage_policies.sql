-- Storage bucket and policies
-- Note: Buckets are managed by Supabase Storage API; create the bucket via REST or Dashboard.

-- Policies for storage.objects (bucket 'invoices')
drop policy if exists invoices_read_admin_or_service on storage.objects;
create policy invoices_read_admin_or_service
on storage.objects for select to authenticated
using (
  bucket_id = 'invoices'
  and (core.is_admin() or auth.role() = 'service_role')
);

drop policy if exists invoices_write_admin_or_service on storage.objects;
create policy invoices_write_admin_or_service
on storage.objects for insert, update, delete to authenticated
using (
  bucket_id = 'invoices'
  and (core.is_admin() or auth.role() = 'service_role')
)
with check (
  bucket_id = 'invoices'
  and (core.is_admin() or auth.role() = 'service_role')
);

