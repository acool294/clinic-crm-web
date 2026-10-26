-- Private bucket for patient documents. Paths are <clinic_id>/<patient_id>/<file>.
-- Files are only reachable through short-lived signed URLs created on the server.
-- (Skipped where there is no Supabase Storage, e.g. the PGlite test database.)

do $outer$
begin
  if not exists (select 1 from pg_namespace where nspname = 'storage') then
    raise notice 'storage schema not found; skipping bucket setup';
    return;
  end if;

  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('patient-documents', 'patient-documents', false, 15728640,
          array['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/heic'])
  on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('clinic-assets', 'clinic-assets', false, 2097152, array['image/png', 'image/jpeg', 'image/webp'])
  on conflict (id) do nothing;

  execute $p$
    create policy patient_documents_read on storage.objects for select to authenticated
    using (
      bucket_id = 'patient-documents'
      and (storage.foldername(name))[1] = (select app.current_clinic_id())::text
      and (select app.has_permission('documents.read'))
      and app.can_see_patient(((storage.foldername(name))[2])::uuid)
    )
  $p$;
  execute $p$
    create policy patient_documents_write on storage.objects for insert to authenticated
    with check (
      bucket_id = 'patient-documents'
      and (storage.foldername(name))[1] = (select app.current_clinic_id())::text
      and (select app.has_permission('documents.write'))
    )
  $p$;
  execute $p$
    create policy clinic_assets_read on storage.objects for select to authenticated
    using (bucket_id = 'clinic-assets' and (storage.foldername(name))[1] = (select app.current_clinic_id())::text)
  $p$;
  execute $p$
    create policy clinic_assets_write on storage.objects for insert to authenticated
    with check (
      bucket_id = 'clinic-assets'
      and (storage.foldername(name))[1] = (select app.current_clinic_id())::text
      and ((select app.has_permission('settings.manage')) or (select app.has_permission('staff.manage'))
           or (storage.foldername(name))[2] = 'signatures')
    )
  $p$;
end;
$outer$;
