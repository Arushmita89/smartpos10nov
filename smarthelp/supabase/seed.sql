-- ============================================================
-- seed.sql — SmartHelp demo accounts and a bookable marketplace.
--
-- Run AFTER supabase/migrations/*.sql, in the Supabase SQL editor or
-- via `supabase db reset`. Idempotent: re-running refreshes the demo
-- passwords and tops the catalogue back up; it never duplicates a row.
--
-- This file creates FOUR auth.users so that "login works for all three
-- role types" (§31.1 Phase 0 exit criteria) is verifiable without a
-- phone provider. Real customers and professionals authenticate by phone
-- OTP; demo accounts get an email + password so the flow is testable
-- on a laptop.
--
--   Role          Login                          Password
--   ------------  -----------------------------  -------------------------
--   customer      demo.customer@smarthelp.test  Demo@12345
--   professional  demo.pro@smarthelp.test        Demo@12345
--   admin         demo.admin@smarthelp.test      Demo@12345
--   support       demo.support@smarthelp.test    Demo@12345
--   ops           demo.ops@smarthelp.test        Demo@12345
--
-- The super_admin (owner) account is NOT seeded: it is created by
-- signing in with the login named in NEXT_PUBLIC_SUPARTHELP_OWNER_LOGIN,
-- which the auth route promotes to super_admin. See docs/SETUP.md.
--
-- !! NOT FOR PRODUCTION. Delete this file before the first real launch.
-- ============================================================

-- `extensions` is where Supabase keeps pgcrypto, which provides crypt() and
-- gen_salt() for the demo passwords. A search_path of `public` alone fails with
-- "function gen_salt(unknown) does not exist". On a plain Postgres where
-- pgcrypto was created into public, naming a schema that does not exist is
-- harmless, so this works in both places.
set search_path = public, extensions;

-- ── Helper: create or refresh one demo auth user ────────────
create or replace function public.seed_demo_user(
  p_email text,
  p_password text,
  p_full_name text,
  p_phone text,
  p_role public.user_role
) returns uuid
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_id uuid := gen_random_uuid();
  v_existing uuid;
begin
  select id into v_existing from auth.users where email = lower(p_email);
  if v_existing is not null then
    v_id := v_existing;
  end if;

  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data,
    created_at, updated_at, confirmation_token,
    email_change, email_change_token_new, recovery_token
  ) values (
    '00000000-0000-0000-0000-000000000000', v_id, 'authenticated', 'authenticated',
    lower(p_email), crypt(p_password, gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    jsonb_build_object('role', p_role::text, 'full_name', p_full_name, 'phone', p_phone),
    now(), now(), '', '', '', ''
  )
  on conflict (id) do update
    set encrypted_password = crypt(p_password, gen_salt('bf')),
        email_confirmed_at = now(),
        raw_user_meta_data = jsonb_build_object(
          'role', p_role::text, 'full_name', p_full_name, 'phone', p_phone
        ),
        updated_at = now();

  -- GoTrue requires an identity row for a password sign-in to resolve.
  --
  -- The column list is checked against the project's own auth.identities rather
  -- than documentation: this version has no email_confirmed_at here (it lives on
  -- auth.users only), and naming a column that does not exist is
  -- "column \"email_confirmed_at\" of relation \"identities\" does not exist".
  --
  -- `email` is deliberately absent: it is a stored generated column computed
  -- from identity_data, so writing it is
  -- 'cannot insert a non-DEFAULT value into column "email"'. The address goes
  -- in identity_data and the generated column follows.
  insert into auth.identities (
    id, provider_id, user_id, identity_data, provider,
    last_sign_in_at, created_at, updated_at
  ) values (
    v_id, v_id::text, v_id,
    jsonb_build_object('sub', v_id::text, 'email', lower(p_email),
                       'email_verified', true, 'phone_verified', false),
    'email', now(), now(), now()
  )
  on conflict (provider_id, provider) do nothing;

  return v_id;
end $$;

-- ── The five staff / consumer demo accounts ────────────────
select public.seed_demo_user('demo.customer@smarthelp.test', 'Demo@12345',
  'Ananya Iyer', '+919000000001', 'customer');
select public.seed_demo_user('demo.pro@smarthelp.test', 'Demo@12345',
  'Ravi Kumar', '+919000000002', 'professional');
select public.seed_demo_user('demo.admin@smarthelp.test', 'Demo@12345',
  'Deepa Menon', '+919000000003', 'admin');
select public.seed_demo_user('demo.support@smarthelp.test', 'Demo@12345',
  'Sameer Rao', '+919000000004', 'support');
select public.seed_demo_user('demo.ops@smarthelp.test', 'Demo@12345',
  'Farida Sheikh', '+919000000005', 'ops');

-- The handle_new_user() trigger creates the profile, and a `customers`
-- row for a customer. Two accounts it deliberately does not create are
-- created here, because both are staff grants rather than sign-ups.

-- Staff roles, assigned explicitly. handle_new_user() refuses to grant
-- these on sign-up; this file runs as a trusted local session.
update public.profiles set role = 'admin'
 where email = 'demo.admin@smarthelp.test';
update public.profiles set role = 'support'
 where email = 'demo.support@smarthelp.test';
update public.profiles set role = 'ops'
 where email = 'demo.ops@smarthelp.test';

-- Backfill anything the trigger missed (e.g. auth users created before 0001).
select public.backfill_profiles();

-- A verified, available, skilled professional — the Phase 0 exit criterion
-- "a professional exists in the DB", in a state the matching engine can use.
insert into public.professionals (
  profile_id, employee_code, verification_status, training_status,
  availability_status, is_available_today, current_lat, current_lng,
  location_updated_at, service_radius_km, commission_pct,
  rating, rating_count, total_offers, accepted_offers, completed_jobs,
  experience_months, kyc_verified_at, onboarded_at
)
select p.id, 'SH-DEMO-001', 'verified', 'completed', 'online', true,
       12.978400, 77.640800, now(), 12.00, 0.2000,
       4.80, 47, 60, 51, 44, 38, now(), now()
from public.profiles p
where p.email = 'demo.pro@smarthelp.test'
on conflict (profile_id) do update
  set verification_status  = 'verified',
      training_status     = 'completed',
      availability_status = 'online',
      is_available_today  = true,
      current_lat         = excluded.current_lat,
      current_lng         = excluded.current_lng,
      location_updated_at = now(),
      kyc_verified_at     = now(),
      onboarded_at        = now();

-- Skills: cleaning and kitchen, so he is a candidate for the seeded
-- categories without being a candidate for everything.
insert into public.professional_skills (professional_id, service_id, proficiency, verified_at)
select pr.id, s.id,
       case when cat.slug in ('cleaning','kitchen') then 5 else 3 end,
       now()
from public.professionals pr
join public.profiles p      on p.id = pr.profile_id
join public.services s      on true
join public.service_categories cat on cat.id = s.category_id
where p.email = 'demo.pro@smarthelp.test'
on conflict (professional_id, service_id) do update
  set proficiency = excluded.proficiency,
      verified_at = now();

-- Working hours, 09:00-19:00 every day (0 = Sunday), and a live location
-- so availability has something to work with in Phase 1.
insert into public.professional_working_hours
  (professional_id, weekday, start_time, end_time)
select pr.id, d, '09:00', '19:00'
from public.professionals pr
join public.profiles p on p.id = pr.profile_id
cross join generate_series(0, 6) as d
where p.email = 'demo.pro@smarthelp.test'
on conflict (professional_id, weekday, start_time) do nothing;

-- A verified KYC document set, so the Phase 4 review screen has a subject.
insert into public.professional_documents (professional_id, doc_type, file_path, status)
select pr.id, v.doc_type, v.doc_type || '/demo-document.pdf', 'verified'
from public.professionals pr
join public.profiles p on p.id = pr.profile_id
cross join (values
  ('aadhaar_front'), ('aadhaar_back'), ('pan'), ('selfie'), ('address_proof')
) as v(doc_type)
where p.email = 'demo.pro@smarthelp.test'
on conflict (professional_id, doc_type) do update
  set status = 'verified',
      reviewed_at = now();

-- Addresses belong to Phase 1 (0008_addresses.sql), so this seed stops
-- at the catalogue and the professional pool.

-- ── Clean up ───────────────────────────────────────────────
-- The helper is scaffolding, not a product function.
drop function if exists public.seed_demo_user(text, text, text, text, public.user_role);
