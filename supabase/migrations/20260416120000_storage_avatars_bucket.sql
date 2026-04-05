-- Profile avatars: bucket + RLS on storage.objects.
-- Apply in Supabase Dashboard → SQL (or `supabase db push`) so uploads from Settings work.

insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do update set
  public = true,
  name   = excluded.name;

drop policy if exists "Avatars public read" on storage.objects;
drop policy if exists "Avatars authenticated insert own folder" on storage.objects;
drop policy if exists "Avatars authenticated update own folder" on storage.objects;
drop policy if exists "Avatars authenticated delete own folder" on storage.objects;

-- Public URLs (getPublicUrl) work for reads; keeps profile images loadable without auth.
create policy "Avatars public read"
  on storage.objects for select
  using (bucket_id = 'avatars');

-- Upload path must be `{user_uuid}/...` (matches ProfileSettingsSection).
create policy "Avatars authenticated insert own folder"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (auth.uid())::text
  );

-- Required for upsert:overwrite on same path key.
create policy "Avatars authenticated update own folder"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (auth.uid())::text
  );

create policy "Avatars authenticated delete own folder"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (auth.uid())::text
  );
