insert into storage.buckets (id, name, public)
values ('imports', 'imports', false)
on conflict (id) do update set public = false;

create policy "Users can upload own import files"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'imports'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy "Users can read own import files"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'imports'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy "Users can update own import files"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'imports'
  and (storage.foldername(name))[1] = auth.uid()::text
)
with check (
  bucket_id = 'imports'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy "Users can delete own import files"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'imports'
  and (storage.foldername(name))[1] = auth.uid()::text
);
