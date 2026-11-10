-- Rider identity verification.
--
-- Riders must submit Aadhaar, PAN, driving license, and a police verification
-- record before the platform owner can approve them. The owner reviews the
-- uploaded documents and marks them verified; approval is blocked until all
-- four documents are on file and verified.

alter table public.users
  add column if not exists aadhaar_number text,
  add column if not exists pan_number text,
  add column if not exists driving_license_number text,
  add column if not exists police_verification_number text,
  add column if not exists aadhaar_document_path text,
  add column if not exists pan_document_path text,
  add column if not exists driving_license_document_path text,
  add column if not exists police_verification_document_path text,
  add column if not exists documents_verified boolean not null default false,
  add column if not exists documents_verified_at timestamptz,
  add column if not exists documents_verified_by text;

create index if not exists idx_users_rider_verified
  on public.users(documents_verified)
  where role = 'rider';

-- Private bucket for sensitive rider documents. Uploads are accepted from the
-- public rider registration form; reads are performed with the service role
-- (signed URLs) from the owner admin panel.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'rider-documents',
  'rider-documents',
  false,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
)
on conflict (id) do nothing;

drop policy if exists rider_documents_anon_upload on storage.objects;
create policy rider_documents_anon_upload
  on storage.objects
  for insert to anon, authenticated
  with check (bucket_id = 'rider-documents');
