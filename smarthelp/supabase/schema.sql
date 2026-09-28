-- ============================================================
-- SmartHelp full database schema for a fresh Supabase project.
--
-- GENERATED FILE - do not edit by hand.
-- Rebuild with: npm run db:schema
-- Source: supabase/migrations/*.sql, concatenated in filename order.
--
-- Run this in the Supabase SQL editor (SQL > New query). Every statement is
-- idempotent, so it is safe to re-run on a live project.
--
-- Then apply supabase/seed.sql for the demo accounts and a bookable
-- marketplace. Seed data is separate on purpose: schema.sql is the shape of
-- the system, seed.sql is sample content.
--
-- Phase 0 of the delivery plan (§31.1) covers migrations 0000-0007.
-- Phases 1-9 append 0008-0028; re-run `npm run db:schema` after each.
-- ============================================================


-- ------------------------------------------------------------
-- 0000_storage_buckets.sql
-- ------------------------------------------------------------

-- ============================================================
-- 0000_storage_buckets.sql
-- SmartHelp: the six Storage buckets, created before anything
-- else so Phase 0 can verify them in the Supabase dashboard.
--
-- Numbering note: the specification fixes the migration series
-- 0001-0028. This file sorts first because the bucket rows are
-- entirely self-contained and Phase 0 requires the buckets to
-- exist. It renumbers nothing.
--
-- The bucket *policies* are not here. They call public.is_admin()
-- (defined in 0001) and public.current_professional_id() (defined
-- in 0005), so a policy created before those would not resolve —
-- `create policy` does not defer its check to call time. They live
-- in 0025_storage_policies.sql, which sorts after both.
--
-- Idempotent: safe to re-run on a live project.
-- Spec: §24.15, §27
-- ============================================================

-- ── Buckets ─────────────────────────────────────────────────
-- Public buckets: catalogue art and professional photos are served
-- straight from a CDN URL.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('service-media',  'service-media',  true,  5242880,
   array['image/jpeg','image/png','image/webp','image/avif','image/svg+xml']),
  ('pro-photos',     'pro-photos',     true,  5242880,
   array['image/jpeg','image/png','image/webp']),
  ('kyc-documents',  'kyc-documents',  false, 5242880,
   array['image/jpeg','image/png','image/webp','application/pdf']),
  ('chat-media',     'chat-media',     false, 2097152,
   array['image/jpeg','image/png','image/webp']),
  ('support-media',  'support-media',  false, 2097152,
   array['image/jpeg','image/png','image/webp','application/pdf']),
  ('invoices',       'invoices',       false, 10485760,
   array['application/pdf'])
on conflict (id) do update
  set public             = excluded.public,
      file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- ── chat-media, support-media, invoices: private, no client
--    policies at all. Service role only until the phase that owns
--    them writes participant-scoped policies:
--      chat-media     -> 0019 / 0020_chat_notifications.sql
--      support-media  -> 0019_support.sql
--      invoices       -> 0012 / 0021 (Phase 3 payments)
--    A bucket with no policy is unreadable through the client API,
--    which is the correct default for every one of these.


-- ------------------------------------------------------------
-- 0001_core_identity.sql
-- ------------------------------------------------------------

-- ============================================================
-- 0001_core_identity.sql
-- SmartHelp: profiles, customers, roles, and the RLS helper
-- predicates every later policy depends on.
--
-- Idempotent: safe to re-run on a live project.
-- Spec: SmartHelp-Documentation.docx §24.2, §24.14, §3.1, §26.1
-- ============================================================

create extension if not exists pgcrypto;

-- ── Enums ───────────────────────────────────────────────────
do $$ begin
  create type user_role as enum (
    'customer',     -- books and pays for services
    'professional', -- performs services
    'admin',        -- full platform control
    'support',      -- tickets only, no pricing / KYC write access
    'ops',          -- bookings, assignment, refunds, disputes
    'super_admin'   -- owner account; only one, bootstrapped via env allow-list
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type user_status as enum (
    'active', 'suspended', 'blocked', 'deleted', 'pending_verification'
  );
exception when duplicate_object then null; end $$;

-- ── updated_at maintenance ──────────────────────────────────
create or replace function public.touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- ── profiles ────────────────────────────────────────────────
create table if not exists public.profiles (
  id                uuid primary key references auth.users(id) on delete cascade,
  role              user_role   not null default 'customer',
  status            user_status not null default 'active',
  full_name         text        not null,
  phone             text        not null,
  phone_verified_at timestamptz,
  email             text,
  avatar_url        text,
  locale            text        not null default 'en-IN',
  last_seen_at      timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint profiles_phone_format check (phone ~ '^\+?[0-9]{10,15}$')
);

-- A phone number identifies exactly one human across the whole platform.
create unique index if not exists uniq_profiles_phone on public.profiles (phone);
create unique index if not exists uniq_profiles_email on public.profiles (lower(email)) where email is not null;
create index if not exists idx_profiles_role_status on public.profiles (role, status);

drop trigger if exists trg_profiles_touch on public.profiles;
create trigger trg_profiles_touch before update on public.profiles
  for each row execute function public.touch_updated_at();

-- ── customers ───────────────────────────────────────────────
create table if not exists public.customers (
  id                 uuid primary key default gen_random_uuid(),
  profile_id         uuid not null unique references public.profiles(id) on delete cascade,
  referral_code      text not null unique,
  referred_by        uuid references public.customers(id) on delete set null,
  wallet_id          uuid, -- FK added in 0015_refunds_wallet.sql
  total_bookings     int not null default 0,
  completed_bookings int not null default 0,
  lifetime_value     numeric(12,2) not null default 0,
  cancelled_bookings int not null default 0,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create index if not exists idx_customers_referral on public.customers (referral_code);
create unique index if not exists uniq_customers_referral_per_profile
  on public.customers (referral_code, profile_id);

drop trigger if exists trg_customers_touch on public.customers;
create trigger trg_customers_touch before update on public.customers
  for each row execute function public.touch_updated_at();

-- ── RLS helper predicates ───────────────────────────────────
-- SECURITY DEFINER so they do not recurse through the RLS policies
-- of the very tables they read. Owned by postgres, which has BYPASSRLS.
create or replace function public.current_role() returns public.user_role
language sql security definer stable set search_path = public as $$
  select role from public.profiles where id = auth.uid() and status = 'active'
$$;

create or replace function public.current_status() returns public.user_status
language sql security definer stable set search_path = public as $$
  select status from public.profiles where id = auth.uid()
$$;

create or replace function public.is_staff(p_roles public.user_role[]) returns boolean
language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and status = 'active' and role = any (p_roles)
  )
$$;

create or replace function public.is_admin() returns boolean
language sql security definer stable set search_path = public as $$
  select public.is_staff(array['admin','super_admin']::public.user_role[])
$$;

create or replace function public.is_ops() returns boolean
language sql security definer stable set search_path = public as $$
  select public.is_staff(
    array['admin','super_admin','ops','support']::public.user_role[]
  )
$$;

-- The caller's own customer row, or null.
create or replace function public.current_customer_id() returns uuid
language sql security definer stable set search_path = public as $$
  select id from public.customers where profile_id = auth.uid()
$$;

-- public.current_professional_id() is defined in 0005, where `professionals` exists.

-- ── Referral codes ──────────────────────────────────────────
-- Human-friendly, collision-checked, derived from the profile id.
create or replace function public.generate_referral_code(p_profile_id uuid) returns text
language plpgsql security definer set search_path = public as $$
declare
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  candidate text;
  i int;
begin
  for i in 1..24 loop
    candidate := upper(substr(md5(random()::text || p_profile_id::text), 1, 6));
    candidate := translate(candidate, '0123456789', '23456789AB');
    candidate := regexp_replace(candidate, '[^A-Z0-9]', '', 'g');
    if not exists (select 1 from public.customers where referral_code = candidate) then
      return candidate;
    end if;
  end loop;
  raise exception 'REFERRAL_CODE_EXHAUSTED';
end $$;

-- ── Role and status integrity ───────────────────────────────
-- True for a direct SQL session: the Supabase SQL editor, `psql`, or a
-- migration run. PostgREST always sets the claim — 'anon' with no auth
-- header — so this can only ever be true with no user attached, and a
-- session that reaches the database directly already has full table
-- access. The privilege guards below use it to let migrations and the
-- seed script do their job while still refusing every browser request.
create or replace function public.is_trusted_session() returns boolean
language sql stable set search_path = public as $$
  select coalesce(current_setting('request.jwt.claim.role', true), '') = ''
$$;

-- A signed-in user can edit their own profile but must never be able to
-- grant themselves a role, unblock themselves, or re-activate themselves.
-- The service role (Route Handlers) and admins are allowed.
create or replace function public.guard_profile_privileges() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if (new.role is distinct from old.role) or (new.status is distinct from old.status) then
    if public.is_trusted_session()
       or auth.role() = 'service_role'
       or public.is_admin() then
      return new;
    end if;
    raise exception 'PROFILE_PRIVILEGE_CHANGE_FORBIDDEN'
      using errcode = 'insufficient_privilege';
  end if;
  return new;
end $$;

drop trigger if exists trg_profiles_guard_privileges on public.profiles;
create trigger trg_profiles_guard_privileges before update on public.profiles
  for each row execute function public.guard_profile_privileges();

-- ── Auth provisioning ───────────────────────────────────────
-- Creates the profile (and the customer / professional row) for every new
-- auth user. Runs as the auth server, so it is unaffected by RLS.
-- Idempotent, and safe to re-run via public.backfill_profiles().
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  requested_role public.user_role := 'customer';
  meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  wanted text := coalesce(meta->>'role', 'customer');
  p_full_name text := coalesce(new.raw_user_meta_data->>'full_name', split_part(coalesce(new.phone, new.email, 'User'), '@', 1));
  p_phone text;
  p_email text;
begin
  -- Only two roles may ever be self-assigned. Staff roles are granted by an
  -- admin or by the super_admin bootstrap allow-list, never by sign-up.
  if wanted = 'professional' then
    requested_role := 'professional';
  end if;

  p_phone := coalesce(new.phone, meta->>'phone');
  if p_phone is not null and p_phone !~ '^\+?[0-9]{10,15}$' then
    p_phone := null;
  end if;
  p_email := lower(coalesce(new.email, meta->>'email'));

  -- A phone already bound to another profile wins: never hijack an identity.
  if p_phone is not null
     and exists (select 1 from public.profiles where phone = p_phone) then
    return new;
  end if;

  insert into public.profiles (id, role, status, full_name, phone, email, phone_verified_at)
  values (
    new.id,
    requested_role,
    'active',
    left(coalesce(nullif(p_full_name, ''), 'User'), 120),
    coalesce(p_phone, '+' || substr(replace(new.id::text, '-', ''), 1, 12)),
    p_email,
    case when new.phone is not null then new.phone_confirmed_at end
  )
  on conflict (id) do nothing;

  if requested_role = 'customer' then
    insert into public.customers (profile_id, referral_code)
    values (new.id, public.generate_referral_code(new.id))
    on conflict (profile_id) do nothing;
  end if;

  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Backfill for projects where auth users predate the trigger.
create or replace function public.backfill_profiles() returns integer
language plpgsql security definer set search_path = public as $$
declare
  n integer := 0;
  u record;
begin
  for u in
    select id, phone, email, raw_user_meta_data
    from auth.users
    where id not in (select id from public.profiles)
  loop
    insert into public.profiles (id, role, full_name, phone, email)
    values (
      u.id,
      case when coalesce(u.raw_user_meta_data->>'role','') = 'professional'
           then 'professional'::public.user_role else 'customer'::public.user_role end,
      left(coalesce(nullif(u.raw_user_meta_data->>'full_name',''),
                    split_part(coalesce(u.phone, u.email, 'User'), '@', 1)), 120),
      coalesce(
        case when u.phone ~ '^\+?[0-9]{10,15}$' then u.phone end,
        '+' || substr(replace(u.id::text, '-', ''), 1, 12)
      ),
      lower(u.email)
    )
    on conflict (id) do nothing;
    n := n + 1;
  end loop;

  insert into public.customers (profile_id, referral_code)
  select p.id, public.generate_referral_code(p.id)
  from public.profiles p
  where p.role = 'customer'
    and not exists (select 1 from public.customers c where c.profile_id = p.id)
  on conflict (profile_id) do nothing;

  return n;
end $$;

-- ── OTP requests ───────────────────────────────────────────
-- Placement note: the specification lists `otp_requests` under
-- 0024_audit_idempotency.sql, but Phase 0 requires login to work for
-- all three role types, and the login code is the first consumer of
-- this table. It therefore lives here, in the migration that owns
-- authentication. 0024 does not re-create it.
--
-- Only a salted SHA-256 digest is stored. The plaintext exists in
-- exactly two places: the delivery request, and the response when
-- the delivery channel is a dev inbox.
create table if not exists public.otp_requests (
  id           uuid primary key default gen_random_uuid(),
  target       text not null,       -- E.164 phone, or lowercased email
  channel      text not null check (channel in ('phone','email')),
  purpose      text not null check (purpose in ('login','staff_login','admin_mfa')),
  code_hash    text not null,
  salt         text not null,
  attempts     int not null default 0,
  max_attempts int not null default 3,
  expires_at   timestamptz not null,
  locked_until timestamptz,
  consumed_at  timestamptz,
  created_at   timestamptz not null default now()
);

create index if not exists idx_otp_target on public.otp_requests (target, purpose, created_at desc);
create index if not exists idx_otp_open on public.otp_requests (target, purpose)
  where consumed_at is null;

-- Issue a code. Enforces the 60-second resend throttle here rather than in
-- the Route Handler, so two concurrent requests cannot both slip through.
create or replace function public.issue_otp(
  p_target          text,
  p_channel         text,
  p_purpose         text,
  p_code            text,
  p_ttl_minutes     int default 10,
  p_max_attempts    int default 3,
  p_resend_seconds  int default 60,
  p_lockout_minutes int default 15
) returns uuid
-- `extensions` carries pgcrypto, which supplies gen_random_bytes() and digest()
-- below. Supabase installs pgcrypto there rather than in public, so a
-- search_path of public alone fails at run time with
-- 'function gen_random_bytes(integer) does not exist'. Naming a schema that
-- does not exist is harmless on a plain Postgres, so this works in both.
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_id    uuid;
  v_salt  text;
begin
  if exists (
    select 1 from public.otp_requests
    where target = p_target and purpose = p_purpose and consumed_at is null
      and created_at > now() - make_interval(secs => p_resend_seconds)
  ) then
    -- The errcode must be a five-character SQLSTATE, not a word: `errcode =
    -- 'rate_limited'` makes the *raise itself* fail with
    -- 'unrecognized exception condition "rate_limited"', so the caller saw an
    -- internal error instead of a throttle and the 60 second window was never
    -- reported. 55000 (object_not_in_prerequisite_state) is the closest real
    -- class. The caller matches on the message, which is why that is the
    -- part that has to stay.
    raise exception 'OTP_THROTTLED' using errcode = '55000';
  end if;

  -- Only the newest unconsumed code for this target/purpose stays live.
  update public.otp_requests
     set consumed_at = now()
   where target = p_target and purpose = p_purpose and consumed_at is null;

  -- One salt, generated once, used for both the stored salt and the hash.
  -- consume_otp() re-derives the hash as digest(p_code || r.salt); hashing
  -- against anything else here would make every code unverifiable.
  v_salt := encode(gen_random_bytes(16), 'hex');

  insert into public.otp_requests (
    target, channel, purpose, code_hash, salt,
    max_attempts, expires_at
  ) values (
    p_target, p_channel, p_purpose,
    encode(digest(p_code || v_salt, 'sha256'), 'hex'),
    v_salt,
    p_max_attempts,
    now() + make_interval(mins => p_ttl_minutes)
  )
  returning id into v_id;

  return v_id;
end $$;

-- Consume a code. Returns 'ok' | 'invalid' | 'expired' | 'locked' | 'missing'.
-- The attempt counter and the consumption happen in one statement, so two
-- concurrent correct codes cannot both succeed.
create or replace function public.consume_otp(
  p_target  text,
  p_purpose text,
  p_code    text
) returns text
-- `extensions` for pgcrypto's digest(); see issue_otp() above.
language plpgsql security definer set search_path = public, extensions as $$
declare
  r public.otp_requests;
  v_ok text;
begin
  select * into r
  from public.otp_requests
  where target = p_target and purpose = p_purpose and consumed_at is null
  order by created_at desc
  limit 1
  for update;

  if not found then
    return 'missing';
  end if;

  if r.locked_until is not null and r.locked_until > now() then
    return 'locked';
  end if;

  if r.expires_at <= now() then
    return 'expired';
  end if;

  if r.code_hash = encode(digest(p_code || r.salt, 'sha256'), 'hex') then
    update public.otp_requests set consumed_at = now() where id = r.id;
    return 'ok';
  end if;

  update public.otp_requests set attempts = attempts + 1 where id = r.id;

  if r.attempts + 1 >= r.max_attempts then
    update public.otp_requests
       set locked_until = now() + make_interval(mins => 15)
     where id = r.id;
  end if;

  return 'invalid';
end $$;

-- ── Row Level Security: profiles & customers ────────────────
alter table public.profiles  enable row level security;
alter table public.customers enable row level security;

do $$ begin
  create policy profiles_select_own on public.profiles for select
    using (id = auth.uid() or public.is_staff(
      array['support','ops','admin','super_admin']::public.user_role[]));
exception when duplicate_object then null; end $$;

-- No client insert: profiles are provisioned by handle_new_user() as the
-- service role. A self-serve INSERT would let anyone pick their own role.
do $$ begin
  create policy profiles_no_insert on public.profiles for insert with check (false);
exception when duplicate_object then null; end $$;

-- UPDATE is narrowed further by the guard_profile_privileges() trigger, which
-- blocks role and status changes.
do $$ begin
  create policy profiles_update_own on public.profiles for update
    using (id = auth.uid())
    with check (id = auth.uid());
exception when duplicate_object then null; end $$;

do $$ begin
  create policy profiles_no_delete on public.profiles for delete using (false);
exception when duplicate_object then null; end $$;

do $$ begin
  create policy customers_select_own on public.customers for select
    using (profile_id = auth.uid() or public.is_staff(
      array['support','ops','admin','super_admin']::public.user_role[]));
exception when duplicate_object then null; end $$;

do $$ begin
  create policy customers_no_insert on public.customers for insert with check (false);
exception when duplicate_object then null; end $$;

do $$ begin
  create policy customers_update_own on public.customers for update
    using (profile_id = auth.uid())
    with check (profile_id = auth.uid());
exception when duplicate_object then null; end $$;

do $$ begin
  create policy customers_no_delete on public.customers for delete using (false);
exception when duplicate_object then null; end $$;

-- Nobody reads or writes the OTP table through the client. The two
-- functions above are the only way in, and they are callable by the
-- service role alone: a browser must never be able to mint a code.
alter table public.otp_requests enable row level security;

do $$ begin
  create policy otp_no_client_access on public.otp_requests for all using (false);
exception when duplicate_object then null; end $$;

revoke all on public.otp_requests from anon, authenticated;

-- Postgres grants EXECUTE to PUBLIC on every new function, so `revoke ...
-- from public` also strips it from service_role. The Route Handlers call
-- these through PostgREST as service_role, and a missing EXECUTE grant is a
-- hard `permission denied for function` — not a warning. Re-grant it to
-- service_role alone; the browser must never be able to mint or burn a code.
revoke all on function public.issue_otp(text, text, text, text, int, int, int, int) from public, anon, authenticated;
revoke all on function public.consume_otp(text, text, text) from public, anon, authenticated;
grant execute on function public.issue_otp(text, text, text, text, int, int, int, int) to service_role;
grant execute on function public.consume_otp(text, text, text) to service_role;

-- Grant the minimal surface to the browser clients. The service role bypasses
-- all of this and is used only inside Route Handlers.
grant usage on schema public to anon, authenticated;
grant select on public.profiles, public.customers to authenticated;
grant update (full_name, email, avatar_url, locale, last_seen_at)
  on public.profiles to authenticated;

-- customers is deliberately read-only for the browser. total_bookings,
-- lifetime_value and the referral counters are money-adjacent bookkeeping that
-- only ever moves as a side effect of a real booking, so a column-level UPDATE
-- grant would let any customer inflate their own history. The write path is
-- the service role inside the booking routes, and every such change is audited.
grant execute on function public.current_role() to anon, authenticated;
grant execute on function public.is_staff(public.user_role[]) to anon, authenticated;


-- ------------------------------------------------------------
-- 0002_geo.sql
-- ------------------------------------------------------------

-- ============================================================
-- 0002_geo.sql
-- SmartHelp: cities and localities — the resolution chain that
-- turns a typed address into a "serviceable" pair.
--
-- Idempotent: safe to re-run on a live project.
-- Spec: §24.3, §5.1
-- ============================================================

create table if not exists public.cities (
  id               uuid primary key default gen_random_uuid(),
  name             text not null,
  state            text not null,
  country          text not null default 'India',
  country_code     char(2) not null default 'IN',
  time_zone        text not null default 'Asia/Kolkata',
  default_currency char(3) not null default 'INR',
  pincode_prefixes text[] not null default '{}',
  lat              numeric(9,6),
  lng              numeric(9,6),
  business_hours   jsonb not null default '{"mon":{"open":"08:00","close":"21:00"},
                                           "tue":{"open":"08:00","close":"21:00"},
                                           "wed":{"open":"08:00","close":"21:00"},
                                           "thu":{"open":"08:00","close":"21:00"},
                                           "fri":{"open":"08:00","close":"21:00"},
                                           "sat":{"open":"08:00","close":"21:00"},
                                           "sun":{"open":"09:00","close":"20:00"}}'::jsonb,
  is_active        boolean not null default true,
  created_at       timestamptz not null default now()
);

create unique index if not exists uniq_cities_name_state on public.cities (lower(name), lower(state));
create index if not exists idx_cities_active on public.cities (is_active);

create table if not exists public.localities (
  id         uuid primary key default gen_random_uuid(),
  city_id    uuid not null references public.cities(id) on delete cascade,
  name       text not null,
  lat        numeric(9,6) not null,
  lng        numeric(9,6) not null,
  radius_km  numeric(5,2) not null default 8.00,
  is_active  boolean not null default true,
  created_at timestamptz not null default now()
);

create unique index if not exists uniq_locality_per_city on public.localities (city_id, lower(name));

-- "Find every locality within 5 km of me" is an index scan, not a seq scan.
-- point() takes (x, y) = (lng, lat) so the GiST operator matches.
create extension if not exists btree_gist;
create index if not exists idx_localities_geo
  on public.localities using gist (point(lng, lat));
create index if not exists idx_localities_city_active on public.localities (city_id, is_active);

-- ── RLS: geography is public reference data ─────────────────
alter table public.cities     enable row level security;
alter table public.localities enable row level security;

do $$ begin
  create policy cities_public_read on public.cities for select
    using (is_active or public.is_admin());
exception when duplicate_object then null; end $$;

do $$ begin
  create policy cities_admin_write on public.cities for all
    using (public.is_staff(array['admin','super_admin']::public.user_role[]))
    with check (public.is_staff(array['admin','super_admin']::public.user_role[]));
exception when duplicate_object then null; end $$;

do $$ begin
  create policy localities_public_read on public.localities for select
    using (is_active or public.is_admin());
exception when duplicate_object then null; end $$;

do $$ begin
  create policy localities_admin_write on public.localities for all
    using (public.is_staff(array['admin','super_admin']::public.user_role[]))
    with check (public.is_staff(array['admin','super_admin']::public.user_role[]));
exception when duplicate_object then null; end $$;

grant select on public.cities, public.localities to anon, authenticated;


-- ------------------------------------------------------------
-- 0003_catalogue.sql
-- ------------------------------------------------------------

-- ============================================================
-- 0003_catalogue.sql
-- SmartHelp: service categories, services, the scope contract,
-- gallery images and search keywords.
--
-- Idempotent: safe to re-run on a live project.
-- Spec: §24.4, §4.2, §4.4
-- ============================================================

create table if not exists public.service_categories (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  slug       text not null unique,
  icon_key   text not null,               -- lucide icon name, resolved in the UI
  image_url  text,
  sort_order int  not null default 0,
  is_active  boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists idx_service_categories_active
  on public.service_categories (sort_order) where is_active;

do $$ begin
  create type pricing_type as enum ('hourly','flat','per_unit');
exception when duplicate_object then null; end $$;

create table if not exists public.services (
  id                  uuid primary key default gen_random_uuid(),
  category_id         uuid not null references public.service_categories(id) on delete restrict,
  name                text not null,
  slug                text not null unique,
  short_description   text,
  description         text,
  image_url           text,
  base_price          numeric(10,2) not null check (base_price >= 0),
  pricing_type        pricing_type not null default 'hourly',
  unit_label          text,               -- 'kg' | 'piece' for per_unit
  unit_price          numeric(10,2),
  min_duration_min    int not null default 30  check (min_duration_min > 0),
  max_duration_min    int not null default 360 check (max_duration_min >= min_duration_min),
  prep_minutes        int not null default 0,  -- lead time before a slot can start
  max_active_jobs     int not null default 1,  -- concurrency cap for a single pro
  materials_included  boolean not null default false,
  materials_note      text,
  requires_photo_proof boolean not null default false,
  sort_order          int not null default 0,
  is_active           boolean not null default true,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint per_unit_needs_unit check (
    pricing_type <> 'per_unit' or (unit_label is not null and unit_price is not null)
  )
);

create index if not exists idx_services_category_active on public.services (category_id) where is_active;
create index if not exists idx_services_active_order on public.services (sort_order, name) where is_active;

create table if not exists public.service_tasks (
  id         uuid primary key default gen_random_uuid(),
  service_id uuid not null references public.services(id) on delete cascade,
  kind       text not null check (kind in ('included','excluded')),
  label      text not null,
  sort_order int not null default 0
);

create index if not exists idx_service_tasks_service
  on public.service_tasks (service_id, kind, sort_order);

create table if not exists public.service_images (
  id         uuid primary key default gen_random_uuid(),
  service_id uuid not null references public.services(id) on delete cascade,
  url        text not null,
  alt_text   text,
  sort_order int not null default 0
);

create index if not exists idx_service_images_service
  on public.service_images (service_id, sort_order);

-- Search keywords are unique per service, ignoring case, so "Leak" and "leak"
-- cannot both be attached to one service.
--
-- That constraint is a unique *index* rather than a primary key on purpose: a
-- PRIMARY KEY constraint takes column names only and cannot hold an expression,
-- so `primary key (service_id, lower(keyword))` is a syntax error (42601). The
-- index gives the same guarantee.
create table if not exists public.service_keywords (
  service_id uuid not null references public.services(id) on delete cascade,
  keyword    text not null
);

create unique index if not exists uq_service_keywords_case_insensitive
  on public.service_keywords (service_id, lower(keyword));

-- Lookups search by keyword alone, which the index above cannot serve: it is
-- keyed on service_id first.
create index if not exists idx_service_keywords_kw on public.service_keywords (lower(keyword));

drop trigger if exists trg_services_touch on public.services;
create trigger trg_services_touch before update on public.services
  for each row execute function public.touch_updated_at();

-- ── RLS: the catalogue is world-readable; only admins write it ──
alter table public.service_categories enable row level security;
alter table public.services           enable row level security;
alter table public.service_tasks       enable row level security;
alter table public.service_images      enable row level security;
alter table public.service_keywords    enable row level security;

do $$ begin
  create policy categories_public_read on public.service_categories for select
    using (is_active or public.is_admin());
exception when duplicate_object then null; end $$;

do $$ begin
  create policy categories_admin_write on public.service_categories for all
    using (public.is_staff(array['admin','super_admin']::public.user_role[]))
    with check (public.is_staff(array['admin','super_admin']::public.user_role[]));
exception when duplicate_object then null; end $$;

do $$ begin
  create policy services_public_read on public.services for select
    using (is_active or public.is_admin());
exception when duplicate_object then null; end $$;

do $$ begin
  create policy services_admin_write on public.services for all
    using (public.is_staff(array['admin','super_admin']::public.user_role[]))
    with check (public.is_staff(array['admin','super_admin']::public.user_role[]));
exception when duplicate_object then null; end $$;

-- Tasks, images and keywords inherit visibility from their service.
do $$ begin
  create policy service_tasks_public_read on public.service_tasks for select
    using (exists (select 1 from public.services s
                   where s.id = service_tasks.service_id
                     and (s.is_active or public.is_admin())));
exception when duplicate_object then null; end $$;

do $$ begin
  create policy service_tasks_admin_write on public.service_tasks for all
    using (public.is_staff(array['admin','super_admin']::public.user_role[]))
    with check (public.is_staff(array['admin','super_admin']::public.user_role[]));
exception when duplicate_object then null; end $$;

do $$ begin
  create policy service_images_public_read on public.service_images for select
    using (exists (select 1 from public.services s
                   where s.id = service_images.service_id
                     and (s.is_active or public.is_admin())));
exception when duplicate_object then null; end $$;

do $$ begin
  create policy service_images_admin_write on public.service_images for all
    using (public.is_staff(array['admin','super_admin']::public.user_role[]))
    with check (public.is_staff(array['admin','super_admin']::public.user_role[]));
exception when duplicate_object then null; end $$;

do $$ begin
  create policy service_keywords_public_read on public.service_keywords for select
    using (exists (select 1 from public.services s
                   where s.id = service_keywords.service_id
                     and (s.is_active or public.is_admin())));
exception when duplicate_object then null; end $$;

do $$ begin
  create policy service_keywords_admin_write on public.service_keywords for all
    using (public.is_staff(array['admin','super_admin']::public.user_role[]))
    with check (public.is_staff(array['admin','super_admin']::public.user_role[]));
exception when duplicate_object then null; end $$;

grant select on public.service_categories, public.services, public.service_tasks,
                   public.service_images, public.service_keywords to anon, authenticated;


-- ------------------------------------------------------------
-- 0004_service_areas_durations.sql
-- ------------------------------------------------------------

-- ============================================================
-- 0004_service_areas_durations.sql
-- SmartHelp: where a service is offered, and how long a booking of
-- it can be. Both are rows, never code.
--
-- Idempotent: safe to re-run on a live project.
-- Spec: §24.4, §4.3, §5.3
-- ============================================================

create table if not exists public.service_areas (
  id            uuid primary key default gen_random_uuid(),
  locality_id   uuid not null references public.localities(id) on delete cascade,
  service_id    uuid not null references public.services(id) on delete cascade,
  lead_minutes  int  not null default 0,
  slot_capacity int  not null default 4,
  is_active     boolean not null default true,
  created_at    timestamptz not null default now(),
  unique (locality_id, service_id),
  constraint slot_capacity_positive check (slot_capacity > 0)
);

create index if not exists idx_service_areas_lookup
  on public.service_areas (locality_id, service_id) where is_active;
create index if not exists idx_service_areas_service
  on public.service_areas (service_id) where is_active;

create table if not exists public.service_durations (
  id               uuid primary key default gen_random_uuid(),
  service_id       uuid not null references public.services(id) on delete cascade,
  minutes          int  not null check (minutes > 0),
  price            numeric(10,2),   -- flat override, nullable
  price_multiplier numeric(6,3),    -- or a multiplier on the hourly base
  is_active        boolean not null default true,
  unique (service_id, minutes),
  -- A row carries a flat price, a multiplier, or neither (base price applies).
  constraint duration_pricing_defined check (
    price is null or price_multiplier is null
  )
);

create index if not exists idx_service_durations_service
  on public.service_durations (service_id, minutes) where is_active;

-- ── Serviceability ──────────────────────────────────────────
-- The single gate every availability and booking check funnels
-- through: is this service offered at this locality right now?
create or replace function public.is_serviceable(
  p_locality_id uuid,
  p_service_id  uuid,
  p_at          timestamptz default now()
) returns boolean
language sql security definer stable set search_path = public as $$
  select exists (
    select 1
    from public.service_areas sa
    join public.services  s  on s.id  = sa.service_id
    join public.localities l  on l.id  = sa.locality_id
    where sa.locality_id = p_locality_id
      and sa.service_id  = p_service_id
      and sa.is_active
      and s.is_active
      and l.is_active
      and (p_at is null or s.created_at <= p_at)
  )
$$;

-- ── RLS: coverage is public reference data; only admins write it ──
alter table public.service_areas     enable row level security;
alter table public.service_durations enable row level security;

do $$ begin
  create policy service_areas_public_read on public.service_areas for select
    using (is_active or public.is_admin());
exception when duplicate_object then null; end $$;

do $$ begin
  create policy service_areas_admin_write on public.service_areas for all
    using (public.is_staff(array['admin','super_admin']::public.user_role[]))
    with check (public.is_staff(array['admin','super_admin']::public.user_role[]));
exception when duplicate_object then null; end $$;

do $$ begin
  create policy service_durations_public_read on public.service_durations for select
    using (is_active or public.is_admin());
exception when duplicate_object then null; end $$;

do $$ begin
  create policy service_durations_admin_write on public.service_durations for all
    using (public.is_staff(array['admin','super_admin']::public.user_role[]))
    with check (public.is_staff(array['admin','super_admin']::public.user_role[]));
exception when duplicate_object then null; end $$;

grant select on public.service_areas, public.service_durations to anon, authenticated;
grant execute on function public.is_serviceable(uuid, uuid, timestamptz) to anon, authenticated;


-- ------------------------------------------------------------
-- 0005_professionals.sql
-- ------------------------------------------------------------

-- ============================================================
-- 0005_professionals.sql
-- SmartHelp: the professional record, KYC documents, skills,
-- working hours and time off — plus the public pro profile view.
--
-- Idempotent: safe to re-run on a live project.
-- Spec: §24.5, §3.1, §9.1
-- ============================================================

do $$ begin
  create type verification_status as enum
    ('not_submitted','submitted','in_review','verified','rejected','expired');
exception when duplicate_object then null; end $$;

do $$ begin
  create type training_status as enum ('not_started','in_progress','completed');
exception when duplicate_object then null; end $$;

do $$ begin
  create type availability_status as enum ('offline','online','busy','break');
exception when duplicate_object then null; end $$;

create table if not exists public.professionals (
  id                 uuid primary key default gen_random_uuid(),
  profile_id         uuid not null unique references public.profiles(id) on delete cascade,
  employee_code      text unique,
  verification_status verification_status not null default 'not_submitted',
  training_status    training_status     not null default 'not_started',
  availability_status availability_status not null default 'offline',
  is_available_today boolean not null default false,
  current_lat        numeric(9,6),
  current_lng        numeric(9,6),
  location_updated_at timestamptz,
  service_radius_km  numeric(5,2) not null default 12.00,
  commission_pct     numeric(5,4) not null default 0.2000,
  rating             numeric(3,2) check (rating between 0 and 5),
  rating_count       int not null default 0,
  total_offers       int not null default 0,
  accepted_offers    int not null default 0,
  completed_jobs     int not null default 0,
  cancelled_jobs     int not null default 0,
  no_shows           int not null default 0,
  experience_months  int not null default 0,
  probation_until    timestamptz,
  suspended_reason   text,
  kyc_verified_at    timestamptz,
  onboarded_at       timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  constraint acceptance_rate_positive check (accepted_offers <= total_offers),
  constraint commission_range check (commission_pct between 0 and 0.5),
  constraint service_radius_positive check (service_radius_km > 0)
);

create index if not exists idx_prof_matchable
  on public.professionals (verification_status, training_status, availability_status);
create index if not exists idx_prof_rating
  on public.professionals (rating desc nulls last) where verification_status = 'verified';
create index if not exists idx_prof_geo
  on public.professionals using gist (point(current_lng, current_lat))
  where current_lat is not null;

drop trigger if exists trg_professionals_touch on public.professionals;
create trigger trg_professionals_touch before update on public.professionals
  for each row execute function public.touch_updated_at();

create table if not exists public.professional_documents (
  id               uuid primary key default gen_random_uuid(),
  professional_id  uuid not null references public.professionals(id) on delete cascade,
  doc_type         text not null check (doc_type in
                   ('aadhaar_front','aadhaar_back','pan','address_proof','selfie',
                    'police_verification','training_certificate','bank_passbook')),
  file_path        text not null,  -- storage path, never a public URL
  status           verification_status not null default 'submitted',
  rejection_reason text,
  reviewed_by      uuid references public.profiles(id) on delete set null,
  reviewed_at      timestamptz,
  expires_at       timestamptz,
  created_at       timestamptz not null default now()
);

create unique index if not exists uniq_prof_doc
  on public.professional_documents (professional_id, doc_type);
create index if not exists idx_prof_doc_status
  on public.professional_documents (status, created_at) where status in ('submitted','in_review');

create table if not exists public.professional_working_hours (
  id              uuid primary key default gen_random_uuid(),
  professional_id uuid not null references public.professionals(id) on delete cascade,
  weekday         smallint not null check (weekday between 0 and 6),  -- 0 = Sunday
  start_time      time not null,
  end_time        time not null,
  is_active       boolean not null default true,
  constraint valid_range check (end_time > start_time),
  unique (professional_id, weekday, start_time)
);

create table if not exists public.professional_time_off (
  id              uuid primary key default gen_random_uuid(),
  professional_id uuid not null references public.professionals(id) on delete cascade,
  starts_at       timestamptz not null,
  ends_at         timestamptz not null,
  reason          text,
  constraint valid_range check (ends_at > starts_at)
);

create index if not exists idx_time_off_range
  on public.professional_time_off (professional_id, starts_at, ends_at);

-- ── RLS helper, defined here because `professionals` now exists ──
create or replace function public.current_professional_id() returns uuid
language sql security definer stable set search_path = public as $$
  select id from public.professionals where profile_id = auth.uid()
$$;

-- ── Privilege guard ─────────────────────────────────────────
-- A professional may flip their own availability and push their own location.
-- They may never verify themselves, move their own commission, edit their own
-- rating, or clear their suspension. The service role and admins may.
create or replace function public.guard_professional_privileges() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.verification_status is distinct from old.verification_status
     or new.commission_pct   is distinct from old.commission_pct
     or new.rating           is distinct from old.rating
     or new.rating_count     is distinct from old.rating_count
     or new.employee_code    is distinct from old.employee_code
     or new.probation_until  is distinct from old.probation_until
     or new.suspended_reason is distinct from old.suspended_reason
     or new.kyc_verified_at  is distinct from old.kyc_verified_at
     or new.onboarded_at     is distinct from old.onboarded_at then
    if public.is_trusted_session()
       or auth.role() = 'service_role'
       or public.is_admin() then
      return new;
    end if;
    raise exception 'PROFESSIONAL_PRIVILEGE_CHANGE_FORBIDDEN'
      using errcode = 'insufficient_privilege';
  end if;
  return new;
end $$;

drop trigger if exists trg_professionals_guard_privileges on public.professionals;
create trigger trg_professionals_guard_privileges before update on public.professionals
  for each row execute function public.guard_professional_privileges();

-- The pro owns the upload, only staff own the verdict. A professional can
-- replace a file while it is still awaiting review, and never after that.
create or replace function public.guard_professional_document_review() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  -- Swapping the file behind a reviewed document is the whole attack: keep
  -- `status = 'verified'` and replace `file_path` with a document nobody ever
  -- looked at. So the *file* is guarded as firmly as the verdict, and a
  -- professional may only move it while the document is un-reviewed.
  if new.file_path is distinct from old.file_path
     or new.doc_type is distinct from old.doc_type then
    if public.is_trusted_session()
       or auth.role() = 'service_role'
       or public.is_admin() then
      return new;
    end if;
    if old.status in ('verified', 'in_review') then
      raise exception 'KYC_DOCUMENT_LOCKED'
        using errcode = 'insufficient_privilege',
              hint = 'A reviewed document cannot be replaced. Request a re-upload from support.';
    end if;
  end if;

  if new.status           is distinct from old.status
     or new.rejection_reason is distinct from old.rejection_reason
     or new.reviewed_by    is distinct from old.reviewed_by
     or new.reviewed_at    is distinct from old.reviewed_at then
    if public.is_trusted_session()
       or auth.role() = 'service_role'
       or public.is_admin() then
      return new;
    end if;
    raise exception 'KYC_REVIEW_FORBIDDEN' using errcode = 'insufficient_privilege';
  end if;

  -- Replacing a rejected or expired document restarts the review rather than
  -- inheriting the old verdict.
  if new.file_path is distinct from old.file_path
     and new.status is not distinct from old.status
     and old.status in ('rejected', 'expired', 'not_submitted') then
    new.status := 'submitted';
  end if;

  return new;
end $$;

drop trigger if exists trg_prof_documents_guard on public.professional_documents;
create trigger trg_prof_documents_guard before update on public.professional_documents
  for each row execute function public.guard_professional_document_review();

-- ── Public pro profile ──────────────────────────────────────
-- `professionals` holds live coordinates and the commission rate, so the
-- browser clients get no direct read on it. The public profile is this view:
-- a fixed, reviewed column list, no coordinates, no money.
create or replace view public.public_professionals as
select
  pr.id,
  p.full_name,
  p.avatar_url,
  pr.rating,
  pr.rating_count,
  pr.completed_jobs,
  pr.experience_months,
  pr.verification_status,
  pr.training_status,
  pr.is_available_today,
  pr.availability_status,
  pr.service_radius_km,
  pr.onboarded_at
from public.professionals pr
join public.profiles p on p.id = pr.profile_id
where p.status = 'active'
  and pr.verification_status = 'verified';

comment on view public.public_professionals is
  'Verified professionals, safe columns only. No live location, no commission.';

-- ── RLS ─────────────────────────────────────────────────────
-- public.professional_skills is deliberately absent: it is created by
-- 0006_professional_skills.sql, which enables RLS on it itself. Enabling it
-- here fails on a fresh database with
-- 'relation "public.professional_skills" does not exist'.
alter table public.professionals            enable row level security;
alter table public.professional_documents    enable row level security;
alter table public.professional_working_hours enable row level security;
alter table public.professional_time_off     enable row level security;

-- Read your own row; admins read all; staff can locate professionals by id.
do $$ begin
  create policy professionals_select_own on public.professionals for select
    using (profile_id = auth.uid() or public.is_staff(
      array['support','ops','admin','super_admin']::public.user_role[]));
exception when duplicate_object then null; end $$;

-- The professional row is created by the service role (apply endpoint / signup
-- handler), never by the client.
do $$ begin
  create policy professionals_no_insert on public.professionals for insert with check (false);
exception when duplicate_object then null; end $$;

do $$ begin
  create policy professionals_update_own on public.professionals for update
    using (profile_id = auth.uid())
    with check (profile_id = auth.uid());
exception when duplicate_object then null; end $$;

do $$ begin
  create policy professionals_no_delete on public.professionals for delete using (false);
exception when duplicate_object then null; end $$;

-- Metadata only. The file itself is fetched through a signed, staff-guarded URL.
do $$ begin
  create policy pro_docs_select_own on public.professional_documents for select
    using (professional_id = public.current_professional_id()
           or public.is_staff(array['admin','super_admin']::public.user_role[]));
exception when duplicate_object then null; end $$;

do $$ begin
  create policy pro_docs_insert_own on public.professional_documents for insert
    with check (professional_id = public.current_professional_id()
                and status = 'submitted');
exception when duplicate_object then null; end $$;

do $$ begin
  create policy pro_docs_update_own on public.professional_documents for update
    using (professional_id = public.current_professional_id())
    with check (professional_id = public.current_professional_id());
exception when duplicate_object then null; end $$;

do $$ begin
  create policy pro_docs_no_delete on public.professional_documents for delete
    using (public.is_staff(array['admin','super_admin']::public.user_role[]));
exception when duplicate_object then null; end $$;

do $$ begin
  create policy pro_hours_select_own on public.professional_working_hours for select
    using (professional_id = public.current_professional_id() or public.is_ops());
exception when duplicate_object then null; end $$;

do $$ begin
  create policy pro_hours_write_own on public.professional_working_hours for all
    using (professional_id = public.current_professional_id() or public.is_admin())
    with check (professional_id = public.current_professional_id() or public.is_admin());
exception when duplicate_object then null; end $$;

do $$ begin
  create policy pro_time_off_select_own on public.professional_time_off for select
    using (professional_id = public.current_professional_id() or public.is_ops());
exception when duplicate_object then null; end $$;

do $$ begin
  create policy pro_time_off_write_own on public.professional_time_off for all
    using (professional_id = public.current_professional_id() or public.is_admin())
    with check (professional_id = public.current_professional_id() or public.is_admin());
exception when duplicate_object then null; end $$;

-- The browser can read its own professional row and its own documents.
-- Everything else on `professionals` is service-role only.
grant select on public.professionals, public.professional_documents to authenticated;
grant update (availability_status, is_available_today, current_lat, current_lng,
              location_updated_at, service_radius_km)
  on public.professionals to authenticated;
grant insert, update on public.professional_documents to authenticated;
grant select, insert, update, delete on public.professional_working_hours,
                                     public.professional_time_off to authenticated;
grant select on public.public_professionals to anon, authenticated;
grant execute on function public.current_professional_id() to anon, authenticated;


-- ------------------------------------------------------------
-- 0006_professional_skills.sql
-- ------------------------------------------------------------

-- ============================================================
-- 0006_professional_skills.sql
-- SmartHelp: which professional is qualified for which service.
-- This is the table the matching engine (§9.2) filters on, so it
-- is the one place a "verified to do this" claim can live.
--
-- Idempotent: safe to re-run on a live project.
-- Spec: §24.5, §9.2
-- ============================================================

create table if not exists public.professional_skills (
  professional_id uuid not null references public.professionals(id) on delete cascade,
  service_id      uuid not null references public.services(id) on delete cascade,
  proficiency     int not null default 3 check (proficiency between 1 and 5),
  verified_at     timestamptz,
  primary key (professional_id, service_id)
);

create index if not exists idx_prof_skills_service on public.professional_skills (service_id);
create index if not exists idx_prof_skills_prof
  on public.professional_skills (professional_id) where verified_at is not null;

-- A skill may only be marked verified by the service role (the KYC workflow),
-- never by the professional holding it.
create or replace function public.guard_skill_verification() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.verified_at is distinct from old.verified_at then
    if public.is_trusted_session()
       or auth.role() = 'service_role'
       or public.is_admin() then
      return new;
    end if;
    raise exception 'SKILL_VERIFICATION_FORBIDDEN' using errcode = 'insufficient_privilege';
  end if;
  return new;
end $$;

drop trigger if exists trg_prof_skills_guard on public.professional_skills;
create trigger trg_prof_skills_guard before update on public.professional_skills
  for each row execute function public.guard_skill_verification();

-- ── RLS ─────────────────────────────────────────────────────
-- No PII here: an id pair plus a 1-5 proficiency. Safe to read
-- publicly, and it is what the public pro profile renders.
alter table public.professional_skills enable row level security;

do $$ begin
  create policy pro_skills_public_read on public.professional_skills for select using (true);
exception when duplicate_object then null; end $$;

do $$ begin
  create policy pro_skills_write_own on public.professional_skills for all
    using (professional_id = public.current_professional_id() or public.is_admin())
    with check (professional_id = public.current_professional_id() or public.is_admin());
exception when duplicate_object then null; end $$;

grant select, insert, update, delete on public.professional_skills to anon, authenticated;


-- ------------------------------------------------------------
-- 0007_service_catalogue_seed.sql
-- ------------------------------------------------------------

-- ============================================================
-- 0007_service_catalogue_seed.sql
-- SmartHelp: the launch city, its localities, the five service
-- categories, twenty services, their duration ladder, their
-- scope contract, and where each service is offered.
--
-- Everything here is a row an admin can edit. Nothing in the app
-- hardcodes a category, a service, a price or a coverage area.
--
-- Idempotent: safe to re-run. Inserts are keyed on the natural
-- unique key (slug / name / service+minutes / locality+service),
-- so a re-run updates nothing and inserts nothing.
--
-- Spec: §4.1, §4.3, §4.4, §5.1
-- ============================================================

-- ── City ────────────────────────────────────────────────────
insert into public.cities (name, state, lat, lng)
values ('Bengaluru', 'Karnataka', 12.971600, 77.594600)
on conflict do nothing;

-- ── Localities ──────────────────────────────────────────────
-- (name, lat, lng, radius_km)
insert into public.localities (city_id, name, lat, lng, radius_km)
select c.id, v.name, v.lat, v.lng, v.radius_km
from (values
  ('Indiranagar',       12.978400, 77.640800, 8.00),
  ('Koramangala',       12.935200, 77.624500, 8.00),
  ('HSR Layout',        12.911600, 77.647400, 8.00),
  ('Jayanagar',         12.925000, 77.593800, 8.00),
  ('Rajajinagar',       12.991500, 77.552000, 8.00),
  ('Malleshwaram',      13.003500, 77.570000, 8.00),
  ('Kalyan Nagar',      13.016700, 77.600000, 8.00),
  ('Whitefield',        12.969800, 77.750000, 10.00),
  ('Marathahalli',      12.959100, 77.697400, 10.00),
  ('Bannerghatta Road', 12.901000, 77.618000, 10.00),
  ('Yelahanka',         13.100700, 77.596300, 10.00),
  ('Electronic City',   12.845200, 77.660200, 12.00)
) as v(name, lat, lng, radius_km)
join public.cities c on lower(c.name) = 'bengaluru' and lower(c.state) = 'karnataka'
on conflict do nothing;

-- ── Categories ──────────────────────────────────────────────
-- (slug, name, icon_key, sort_order)
insert into public.service_categories (name, slug, icon_key, sort_order)
values
  ('Cleaning',  'cleaning',  'Sparkles',      10),
  ('Kitchen',   'kitchen',   'ChefHat',       20),
  ('Laundry',   'laundry',   'Shirt',         30),
  ('Household', 'household', 'House',         40),
  ('Appliance', 'appliance', 'Wrench',        50)
on conflict (slug) do update
  set name       = excluded.name,
      icon_key   = excluded.icon_key,
      sort_order = excluded.sort_order;

-- ── Services ────────────────────────────────────────────────
-- base_price is the HOURLY rate for hourly services, the total for flat
-- services, and the per-unit rate for per_unit services.
insert into public.services
  (category_id, name, slug, short_description, description,
   base_price, pricing_type, unit_label, unit_price,
   min_duration_min, max_duration_min, prep_minutes, max_active_jobs,
   materials_included, materials_note, requires_photo_proof, sort_order)
select
  cat.id, v.name, v.slug, v.short_description, v.description,
  v.base_price, v.pricing_type::public.pricing_type, v.unit_label, v.unit_price,
  v.min_duration_min, v.max_duration_min, v.prep_minutes, v.max_active_jobs,
  v.materials_included, v.materials_note, v.requires_photo_proof, v.sort_order
from (values
  -- Cleaning · hourly 30-240
  ('cleaning', 'Full House Cleaning', 'full-house-cleaning',
   'Deep clean for the whole home — rooms, kitchen, bathrooms and floors.',
   'A trained professional cleans every room in scope: dusting, surface wiping, floor mopping, bathroom and kitchen sanitising, and a final walkthrough with you before they leave. Bring your own supplies unless you opt for the included-materials variant.',
   249.00, 'hourly', null, null, 30, 240, 60, 1, false,
   'Please keep a broom, mop and a dry cloth accessible on each floor.', false, 10),

  ('cleaning', 'Bathroom Cleaning', 'bathroom-cleaning',
   'Tiles, fittings, floors and drains cleaned and sanitised.',
   'Specialist deep clean of one bathroom: floor and joint scrubbing, toilet bowl and exterior, basin, taps and mirror, shower area and glass fittings, and the small fixtures people forget. Ideal as a fortnightly or monthly reset.',
   349.00, 'hourly', null, null, 30, 180, 45, 1, false,
   'Keep cleaning liquids and a cloth within reach of the bathroom.', false, 20),

  ('cleaning', 'Kitchen Deep Clean', 'kitchen-deep-clean',
   'Oils, grease and residue removed from every kitchen surface.',
   'A full kitchen reset: platform, countertop, cabinet fronts, backsplash, sink and drain, stove and chimney exterior, and inside the empty fridge if you have switched it off. One of the highest-demand services on SmartHelp.',
   399.00, 'hourly', null, null, 60, 240, 60, 1, false,
   'Please empty the countertop and switch off the fridge the night before.', false, 30),

  ('cleaning', 'Balcony & Window Cleaning', 'balcony-window-cleaning',
   'Glass, rails, grills and floors in balconies and windows.',
   'Outside surfaces, reached from a balcony with a standard step stool: window glass both sides, frames, sills, railings, grillwork, and a wash-down of the balcony floor. High-reach or rope-access glass is not included.',
   299.00, 'hourly', null, null, 30, 180, 30, 1, false,
   'Remove drying clothes and unlock balcony access before arrival.', false, 40),

  ('cleaning', 'Fan & Appliance Cleaning', 'fan-appliance-cleaning',
   'Ceiling fans, geysers and small appliances cleaned in place.',
   'Dust-off and clean of ceiling and pedestal fans (blade, motor housing, regulator), geyser exterior, mixer and extension boards. Appliances are cleaned where they hang, not dismantled, unless the service detail says otherwise.',
   349.00, 'hourly', null, null, 30, 120, 30, 1, false,
   'Switch off the main breaker to the ceiling fan area before arrival.', false, 50),

  ('cleaning', 'Mopping & Floor Scrubbing', 'mopping-floor-scrubbing',
   'Grout, tile and stone floors scrubbed and machine-mopped.',
   'Floor-only service for homes where the rest is already clean: dry sweeping, scrub-in of grout and joints, and a uniform mop-down with a neutral solution so the floor does not streak. Ideal before a guest arrival or a festival.',
   229.00, 'hourly', null, null, 30, 180, 30, 2, false,
   'Please move furniture you want cleaned under before arrival.', false, 60),

  -- Kitchen · hourly 60-240
  ('kitchen', 'Dishwashing', 'dishwashing',
   'Every dish, pan and utensil washed, dried and put away.',
   'Post-meal or daily-load dishwashing with a sink-side soak, degreasing of the chimney filter, and the dishes dried and stacked back where you keep them. Utensils used for eating are washed separately with a food-safe solution.',
   199.00, 'hourly', null, null, 60, 180, 30, 2, false,
   'Please leave hot pans to cool and rinse before the professional arrives.', false, 70),

  ('kitchen', 'Daily Cooking Support', 'daily-cooking-support',
   'A cook in your kitchen for the prep, the meal and the cleanup.',
   'Support for your own recipes: shopping list and prep, cooking on the stove or in the oven, plating and serving, and washing up afterwards. Ingredients are cooked to your taste and dietary preference. Pantry management and recipe creation are agreed in the booking notes.',
   249.00, 'hourly', null, null, 60, 240, 30, 1, true,
   'Ingredients are included. Please keep a running list of what the cook should buy.', false, 80),

  ('kitchen', 'Vegetable Prep & Chopping', 'vegetable-prep-chopping',
   'Washing, peeling and chopping for a week of cooking.',
   'Bulk prep for a busy household: vegetables washed, peeled, cut and stored; lentils and grains portioned; and the prep area cleaned. Not a cooking service — prep only, ready for you to cook when you want.',
   199.00, 'hourly', null, null, 60, 180, 30, 2, false,
   'Keep storage containers and a labelled box ready for the prepped items.', false, 90),

  ('kitchen', 'Counter & Platform Cleaning', 'counter-platform-cleaning',
   'Kitchen counters, platform and sink scrubbed and degreased.',
   'Every exposed horizontal surface in the kitchen: counter, platform, sink, mixer and chimney exterior, backsplash tiles, and the area behind the gas stove. A fast, high-frequency service for a kitchen that is used daily.',
   199.00, 'hourly', null, null, 60, 180, 30, 2, false,
   'Please move countertop appliances you want cleaned under before arrival.', false, 100),

  ('kitchen', 'Gas Stove & Chimney Wipe-down', 'gas-stove-chimney-wipe',
   'Burners, knobs, chimney and its filter degreased.',
   'Degreasing of the gas stove top, burners, knobs and counter around it, plus the chimney body, glass and the removable filter. The filter is washed, dried and refitted. Deep internal servicing is a different service.',
   249.00, 'hourly', null, null, 60, 120, 30, 1, false,
   'Switch off the stove at the regulator before the professional arrives.', false, 110),

  -- Laundry · per kg or hourly, 60-240
  ('laundry', 'Washing & Dry', 'washing-and-dry',
   'Per kilogram wash, dry and fold, collected from your door.',
   'Sorted, washed, dried and folded laundry billed per kilogram. Common-garment, bedsheet and towel rates are at the per-kilogram rate; delicate and dry-clean-only items are returned untouched and are not billed.',
   45.00, 'per_unit', 'kg', 45.00, 60, 240, 120, 1, true,
   'Detergent is included. A separate laundry bag keeps your colours apart.', false, 120),

  ('laundry', 'Ironing & Folding', 'ironing-and-folding',
   'Per kilogram pressed, folded and sorted by type.',
   'Collected laundry pressed and folded, and returned sorted into your own cupboards or onto a rail. Shirt and trouser creases are set properly; heavier items such as curtains and blankets are quoted before starting.',
   18.00, 'per_unit', 'kg', 18.00, 60, 180, 60, 2, true,
   'An iron and a clean surface are provided. Iron-on embellished items are excluded.', false, 130),

  ('laundry', 'Stain Removal', 'stain-removal',
   'Oil, grease, ink and tea stains worked on the spot.',
   'Per-hour stain treatment for washable garments and household linen: stain identification, pre-treatment, agitation or solvent work, rinse and a dry-off. Heavily set-in or dyed stains may not clear completely; the professional will tell you honestly before starting.',
   299.00, 'hourly', null, null, 60, 180, 60, 1, false,
   'Please check the care label — dry-clean-only items are refused on arrival.', false, 140),

  ('laundry', 'Blanket & Heavy Curtain Wash', 'blanket-curtain-wash',
   'Per piece wash for blankets, comforters and heavy drapes.',
   'Per-piece machine wash and dry for bulky items: cotton and wool blankets, comforters, mattress covers, and heavy blackout or velvet drapes. Pieces are laundered individually and returned dry, folded and covered.',
   120.00, 'per_unit', 'piece', 120.00, 60, 240, 180, 1, true,
   'Detergent is included. Very large drapes are quoted after a photo check.', false, 150),

  -- Household · hourly 60-360
  ('household', 'Decluttering & Organising', 'decluttering-organising',
   'Sort, label, store — the clutter actually leaves the house.',
   'A systematic second pair of hands: sort and categorise, label and store, and dispose of or donate what you no longer want. You decide what leaves; the professional handles the sorting, the labelling and the carrying.',
   299.00, 'hourly', null, null, 60, 360, 60, 1, false,
   'Keep storage boxes, labels and spare hangers ready on the day.', false, 160),

  ('household', 'Moving Help (Packing)', 'moving-help-packing',
   'Packing, labelling and unpacking for a house move.',
   'Two or more professionals for the heavy part of a move: wrapping and packing by room and category, labelling every carton, and reassembly at the other end. Packing material is included; the vehicle and the transport are not.',
   349.00, 'hourly', null, null, 120, 360, 120, 1, true,
   'Bubble wrap, cartons and tape are included. Fragile items are declared in the notes.', true, 170),

  ('household', 'Post-Partition Deep Clean', 'post-partition-deep-clean',
   'A whole-home reset after a move in or a move out.',
   'The heaviest clean on the platform: inside cupboards, ceiling fans, light fittings, window tracks, balcony, and the kitchen and bathrooms in full. Intended for a home that was previously occupied or is being vacated.',
   449.00, 'hourly', null, null, 180, 360, 180, 1, false,
   'Please ensure the home is empty of furniture and the water supply is on.', false, 180),

  ('household', 'Errand & Shopping Run', 'errand-shopping-run',
   'One fixed run: your list, the shops, the doorstep.',
   'A flat-fee run for errands: a shopping list up to 10 kg of provisions, pharmacy pickups, document drop-offs, or returning something across the city. Receipts are shared back with you. Multiple stops are priced by agreement in the notes.',
   199.00, 'flat', null, null, 90, 90, 30, 2, false,
   'No materials needed. Keep the shopping list and any prescription handy.', false, 190),

  -- Appliance · fixed or hourly, 60-180
  ('appliance', 'Refrigerator Deep Clean', 'refrigerator-deep-clean',
   'Shelves, drawers, coils and gasket scrubbed and sanitised.',
   'Unplugged, emptied, and cleaned inside and out: shelves, drawers, door gasket, interior walls, the condenser coil and the back panel, then deodorised and dried. Food must be removed and transported by you.',
   599.00, 'flat', null, null, 120, 120, 60, 1, false,
   'Please empty the refrigerator and store the food elsewhere before arrival.', true, 200),

  ('appliance', 'Microwave Clean', 'microwave-clean',
   'Interior, glass turntable and door seal degreased.',
   'The microwave is cleaned inside and out: cavity, ceiling and floor, glass turntable, waveguide cover, door seal and the outer body, then deodorised. Leftover spills and reheated odours are the usual reason for booking.',
   349.00, 'flat', null, null, 60, 60, 30, 1, false,
   'Please unplug the microwave before the professional arrives.', true, 210),

  ('appliance', 'Air Conditioner Service', 'air-conditioner-service',
   'Filter clean, coil wash, full function check.',
   'A service visit for split and window AC: filter removal and clean, indoor unit coil wash, drain line flush, and a full function check with a temperature reading. Refrigerant top-up, if needed, is quoted separately and in advance.',
   899.00, 'flat', null, null, 90, 90, 60, 1, false,
   'The unit must be accessible and the AC switched off at the isolator.', true, 220),

  ('appliance', 'Chimney Deep Clean', 'chimney-deep-clean',
   'Filters, motor and duct interior degreased.',
   'A proper chimney clean: both removable filters washed, the impeller and motor housing degreased, the interior duct and hood walls wiped down, and the unit reassembled and tested. Kitchen grease, not a wipe-down.',
   799.00, 'flat', null, null, 90, 90, 60, 1, false,
   'Please keep the chimney switch accessible and clear the platform below it.', true, 230)
) as v(cat_slug, name, slug, short_description, description,
       base_price, pricing_type, unit_label, unit_price,
       min_duration_min, max_duration_min, prep_minutes, max_active_jobs,
       materials_included, materials_note, requires_photo_proof, sort_order)
join public.service_categories cat on cat.slug = v.cat_slug
on conflict (slug) do update
  set category_id          = excluded.category_id,
      name                 = excluded.name,
      short_description    = excluded.short_description,
      description          = excluded.description,
      base_price           = excluded.base_price,
      pricing_type         = excluded.pricing_type,
      unit_label           = excluded.unit_label,
      unit_price           = excluded.unit_price,
      min_duration_min     = excluded.min_duration_min,
      max_duration_min     = excluded.max_duration_min,
      prep_minutes         = excluded.prep_minutes,
      max_active_jobs      = excluded.max_active_jobs,
      materials_included   = excluded.materials_included,
      materials_note       = excluded.materials_note,
      requires_photo_proof = excluded.requires_photo_proof,
      sort_order           = excluded.sort_order;

-- ── Duration ladder ─────────────────────────────────────────
-- Default ladder: 30, 45, 60, 90, 120, 180, 240, 300, 360 minutes.
-- A row may carry a flat `price` OR a `price_multiplier`, never both.
-- Flat-priced services get exactly one row: the time the job takes.
insert into public.service_durations (service_id, minutes, price_multiplier)
select s.id, v.minutes, v.price_multiplier::numeric
from (values
  (30,  0.600), (45,  0.850), (60,  1.000), (90,  1.350),
  (120, 1.700), (180, 2.400), (240, 3.100), (300, 3.800), (360, 4.500)
) as v(minutes, price_multiplier)
join public.services s
  on s.pricing_type = 'hourly'
 and v.minutes between s.min_duration_min and s.max_duration_min
on conflict (service_id, minutes) do update
  set price_multiplier = excluded.price_multiplier,
      is_active = true;

-- Flat-priced services: one row, no ladder, no multiplier.
insert into public.service_durations (service_id, minutes, price)
select s.id, s.max_duration_min, s.base_price
from public.services s
where s.pricing_type = 'flat'
on conflict (service_id, minutes) do update
  set price = excluded.price,
      is_active = true;

-- Per-unit services are priced on the weight or the piece, but the
-- professional still spends time: give them the standard ladder.
insert into public.service_durations (service_id, minutes, price_multiplier)
select s.id, v.minutes, v.price_multiplier::numeric
from (values
  (60, 1.000), (90, 1.350), (120, 1.700), (180, 2.400), (240, 3.100)
) as v(minutes, price_multiplier)
join public.services s
  on s.pricing_type = 'per_unit'
 and v.minutes between s.min_duration_min and s.max_duration_min
on conflict (service_id, minutes) do nothing;

-- ── Scope contract (service_tasks) ──────────────────────────
-- The ✓ included / ✕ excluded list on the service detail screen. A
-- dispute is adjudicated against these rows, so they are written as
-- specific, checkable statements — never "general cleaning".
insert into public.service_tasks (service_id, kind, label, sort_order)
select s.id, v.kind, v.label, v.sort_order
from (values
  -- Bathroom Cleaning: the canonical example from the specification
  ('bathroom-cleaning', 'included', 'Floor cleaning (tiles, joints, drains)', 10),
  ('bathroom-cleaning', 'included', 'Toilet bowl, seat, exterior & flush cleaning', 20),
  ('bathroom-cleaning', 'included', 'Basin, taps, mirror & tap stains', 30),
  ('bathroom-cleaning', 'included', 'Shower area, glass & fittings', 40),
  ('bathroom-cleaning', 'included', 'Soap dish, holder, tissue, door handle', 50),
  ('bathroom-cleaning', 'excluded', 'Hazardous / bleach chemical deep treatment', 60),
  ('bathroom-cleaning', 'excluded', 'Outdoor or high-reach glass cleaning', 70),
  ('bathroom-cleaning', 'excluded', 'Moving heavy or fixed furniture', 80),
  ('bathroom-cleaning', 'excluded', 'Construction stain / paint removal', 90),

  ('full-house-cleaning', 'included', 'Dust-off of all surfaces, ledges and shelves', 10),
  ('full-house-cleaning', 'included', 'Mopping and wiping of all floors', 20),
  ('full-house-cleaning', 'included', 'Kitchen counter, platform and sink cleaning', 30),
  ('full-house-cleaning', 'included', 'Bathroom fixtures and floors', 40),
  ('full-house-cleaning', 'included', 'Beds, mattress top and side surfaces', 50),
  ('full-house-cleaning', 'included', 'Dustbins emptied and relined', 60),
  ('full-house-cleaning', 'excluded', 'Inside the refrigerator or oven', 70),
  ('full-house-cleaning', 'excluded', 'Interior of cupboards and wardrobe shelves', 80),
  ('full-house-cleaning', 'excluded', 'Window glass outside, from a rope or a high ledge', 90),
  ('full-house-cleaning', 'excluded', 'Pest control, termite treatment or shampooing', 100),

  ('kitchen-deep-clean', 'included', 'Platform, counter and backsplash degreasing', 10),
  ('kitchen-deep-clean', 'included', 'Cabinet doors and handles, outside surfaces', 20),
  ('kitchen-deep-clean', 'included', 'Sink, drain and the area under the sink', 30),
  ('kitchen-deep-clean', 'included', 'Gas stove, burners, knobs and surrounding counter', 40),
  ('kitchen-deep-clean', 'included', 'Chimney exterior, glass and filter', 50),
  ('kitchen-deep-clean', 'excluded', 'Duct interior beyond the filter', 60),
  ('kitchen-deep-clean', 'excluded', 'Refrigerator interior (a separate service)', 70),
  ('kitchen-deep-clean', 'excluded', 'Repainting, retiling or re-grouting', 80),

  ('daily-cooking-support', 'included', 'Shopping and ingredient preparation', 10),
  ('daily-cooking-support', 'included', 'Cooking your recipes on the stove or in the oven', 20),
  ('daily-cooking-support', 'included', 'Plating and serving', 30),
  ('daily-cooking-support', 'included', 'Washing up and cleaning of the cooking area', 40),
  ('daily-cooking-support', 'excluded', 'Baking cakes, bread or pastries', 50),
  ('daily-cooking-support', 'excluded', 'Dietary planning or nutrition advice', 60),
  ('daily-cooking-support', 'excluded', 'Serving non-vegetarian food without prior agreement', 70),

  ('washing-and-dry', 'included', 'Sorting, washing and drying', 10),
  ('washing-and-dry', 'included', 'Folding and bagging by category', 20),
  ('washing-and-dry', 'excluded', 'Dry cleaning or steam ironing of special fabrics', 30),
  ('washing-and-dry', 'excluded', 'Stain removal above 30 minutes (a separate service)', 40),

  ('ironing-and-folding', 'included', 'Ironing and creasing of foldable garments', 10),
  ('ironing-and-folding', 'included', 'Sorting and folding by type', 20),
  ('ironing-and-folding', 'excluded', 'Iron-on embellishments, velvet and wool coats', 30),

  ('refrigerator-deep-clean', 'included', 'Shelves, drawers and interior walls', 10),
  ('refrigerator-deep-clean', 'included', 'Door gasket and seal cleaned', 20),
  ('refrigerator-deep-clean', 'included', 'Condenser coil and back panel dust-off', 30),
  ('refrigerator-deep-clean', 'excluded', 'Compressor repair or gas refilling', 40),
  ('refrigerator-deep-clean', 'excluded', 'Disposal of the food you removed', 50),

  ('air-conditioner-service', 'included', 'Filter removal, clean and refit', 10),
  ('air-conditioner-service', 'included', 'Indoor unit coil wash', 20),
  ('air-conditioner-service', 'included', 'Drain line flush', 30),
  ('air-conditioner-service', 'included', 'Full function check with a temperature reading', 40),
  ('air-conditioner-service', 'excluded', 'Refrigerant top-up (quoted separately, in advance)', 50),
  ('air-conditioner-service', 'excluded', 'Outdoor unit, installation or shifting', 60),

  ('post-partition-deep-clean', 'included', 'Inside cupboards, almirahs and wardrobe shelves', 10),
  ('post-partition-deep-clean', 'included', 'Ceiling fans and light fittings', 20),
  ('post-partition-deep-clean', 'included', 'Window tracks, sills and glass from the inside', 30),
  ('post-partition-deep-clean', 'included', 'Balcony, walls and skirting boards', 40),
  ('post-partition-deep-clean', 'included', 'Full kitchen and bathroom clean', 50),
  ('post-partition-deep-clean', 'excluded', 'Paint, whitewash and wall treatment', 60),
  ('post-partition-deep-clean', 'excluded', 'Carpets, sofa and mattress shampooing', 70),
  ('post-partition-deep-clean', 'excluded', 'Removal and disposal of furniture or debris', 80)
) as v(slug, kind, label, sort_order)
join public.services s on s.slug = v.slug
on conflict do nothing;

-- ── Service areas (coverage) ────────────────────────────────
-- A service is bookable only where an active service_areas row exists.
-- The ten core localities carry the full catalogue; the three outer
-- localities carry Cleaning and Kitchen only, so the
-- SERVICE_UNAVAILABLE path (§25.2) is reachable with real data.
insert into public.service_areas (locality_id, service_id, lead_minutes, slot_capacity)
select l.id, s.id,
       greatest(s.prep_minutes, case when l.name in ('Electronic City','Yelahanka') then 45 else 0 end),
       case when l.name in ('Electronic City','Yelahanka','Bannerghatta Road') then 2 else 4 end
from public.localities l
join public.cities c on c.id = l.city_id
join public.services s on true
join public.service_categories cat on cat.id = s.category_id
where lower(c.name) = 'bengaluru'
  and (l.name not in ('Electronic City','Yelahanka','Bannerghatta Road')
       or cat.slug in ('cleaning','kitchen'))
on conflict (locality_id, service_id) do update
  set lead_minutes  = excluded.lead_minutes,
      slot_capacity = excluded.slot_capacity,
      is_active     = true;


-- ------------------------------------------------------------
-- 0008_addresses.sql
-- ------------------------------------------------------------

-- ============================================================
-- 0008_addresses.sql
-- SmartHelp: a customer's saved addresses, and the one
-- transaction that makes a default address.
--
-- Everything downstream of Phase 1 gates on a locality:
-- a service is bookable where an active service_areas row
-- exists, and that row is keyed on locality. An address is
-- how a locality gets resolved from something a person can
-- actually type or grant from the browser.
--
-- Idempotent: safe to re-run on a live project.
-- Spec: §24.6, §5.2, §5.4
-- ============================================================

do $$ begin
  create type address_type as enum ('home','work','other');
exception when duplicate_object then null; end $$;

create table if not exists public.addresses (
  id           uuid primary key default gen_random_uuid(),
  customer_id  uuid not null references public.customers(id) on delete cascade,
  locality_id  uuid references public.localities(id) on delete set null,
  label        text not null default 'Home',
  address_type address_type not null default 'home',
  line1        text not null,          -- flat / house
  line2        text,                   -- building / society
  area         text not null,          -- locality name, as typed
  city         text not null,
  state        text not null,
  pincode      text not null,
  lat          numeric(9,6) not null,
  lng          numeric(9,6) not null,
  landmark     text,
  -- Gate code, floor, "no lift on 4th", parking. Shown to the
  -- professional during the approach, and the field whose absence
  -- loses the most jobs on arrival.
  access_notes text,
  -- 'exact' when the browser gave us a pin, 'locality_centre' when the
  -- person typed an area and we fell back to the locality's middle. §5.4
  -- makes the professional's approach depend on which, and §9.1 warns the
  -- customer to add a landmark in the second case — so the difference has
  -- to outlive the write, not just the response that carried it.
  location_precision text not null default 'locality_centre',
  is_default   boolean not null default false,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),

  -- Cheap here, expensive to debug later. A latitude of 191 or a
  -- four-digit pincode is always a bad geocode, never a real address.
  constraint latitude_in_range  check (lat between -90 and 90),
  constraint longitude_in_range check (lng between -180 and 180),
  constraint pincode_shape     check (pincode ~ '^[0-9]{6}$'),
  constraint line1_present     check (length(btrim(line1)) > 0),
  constraint area_present      check (length(btrim(area)) > 0),
  constraint precision_known   check (location_precision in ('exact','locality_centre'))
);

-- The precision column was added after 0008 had already been applied on some
-- projects, and `create table if not exists` will not add a column to a table
-- that exists. Without this, a re-run would leave the old table without the
-- column every insert now writes.
alter table public.addresses
  add column if not exists location_precision text not null default 'locality_centre';

do $$ begin
  alter table public.addresses
    add constraint precision_known
      check (location_precision in ('exact','locality_centre'));
exception when duplicate_object then null; end $$;

comment on column public.addresses.locality_id is
  'Resolved from `area` or `lat`/`lng` at save time, and re-used by every
   availability check. NULL happens only when a locality is deleted from under
   the row (`on delete set null`): an address that cannot be placed in the
   first place is refused by the API, because lat/lng are not null and a
   guessed point sends the professional to the wrong building. When the id is
   NULL the API answers with `coverage: ''not_yet_available''` and the UI shows
   a badge. The resolution rule lives in lib/geo.ts, not here, because it is
   business logic with radius semantics and wants unit tests.';

-- Exactly one default per customer. A partial unique index, because the
-- column is nullable and a plain unique would count the NULLs.
create unique index if not exists uniq_default_address
  on public.addresses (customer_id) where is_default;
create index if not exists idx_addresses_customer
  on public.addresses (customer_id, created_at desc);
create index if not exists idx_addresses_locality
  on public.addresses (locality_id) where locality_id is not null;

drop trigger if exists trg_addresses_touch on public.addresses;
create trigger trg_addresses_touch before update on public.addresses
  for each row execute function public.touch_updated_at();

-- ── Set the default, in one transaction ─────────────────────
-- Two statements from a Route Handler ("clear all, then set this")
-- can interleave with a second request and leave a customer with no
-- default address at all. The whole thing is one statement here,
-- so the invariant holds even under two simultaneous calls.
create or replace function public.set_default_address(
  p_customer_id uuid,
  p_address_id  uuid
) returns uuid
language plpgsql security definer set search_path = public as $$
begin
  -- The function is callable directly, so it checks ownership itself
  -- rather than trusting whoever wired it up.
  if not (
       public.is_trusted_session()
       or auth.role() = 'service_role'
       or public.is_admin()
       or public.current_customer_id() = p_customer_id
     ) then
    raise exception 'ADDRESS_NOT_OWNED'
      using errcode = 'insufficient_privilege';
  end if;

  if not exists (
    select 1 from public.addresses where id = p_address_id and customer_id = p_customer_id
  ) then
    raise exception 'ADDRESS_NOT_FOUND'
      using errcode = 'foreign_key_violation';
  end if;

  update public.addresses set is_default = false where customer_id = p_customer_id and is_default;
  update public.addresses set is_default = true  where id = p_address_id;

  return p_address_id;
end $$;

comment on function public.set_default_address(uuid, uuid) is
  'Clears the customer''s default and sets this one, atomically.';

-- ── RLS ─────────────────────────────────────────────────────
-- An address is the most sensitive row a customer owns: it is
-- where they live, and `access_notes` describes how to get in.
-- So there is no anon grant at all, and no policy an anonymous
-- session can satisfy — `current_customer_id()` is NULL without
-- an `auth.uid()`, and NULL = NULL is false in a `using` clause.
--
-- The Route Handlers use the service role and enforce ownership in
-- the handler, which is what allows staff support tooling to read
-- an address; a browser session cannot take that path.
alter table public.addresses enable row level security;

do $$ begin
  create policy addresses_select_own on public.addresses for select
    using (customer_id = public.current_customer_id());
exception when duplicate_object then null; end $$;

do $$ begin
  create policy addresses_insert_own on public.addresses for insert
    with check (customer_id = public.current_customer_id());
exception when duplicate_object then null; end $$;

do $$ begin
  create policy addresses_update_own on public.addresses for update
    using (customer_id = public.current_customer_id())
    with check (customer_id = public.current_customer_id());
exception when duplicate_object then null; end $$;

do $$ begin
  create policy addresses_delete_own on public.addresses for delete
    using (customer_id = public.current_customer_id());
exception when duplicate_object then null; end $$;

revoke all on public.addresses from anon;
grant select, insert, update, delete on public.addresses to authenticated;
grant execute on function public.set_default_address(uuid, uuid) to authenticated, service_role;

-- ── Deferred to Phase 2 ─────────────────────────────────────
-- §24.6 also defines block_address_delete_with_future_bookings(),
-- which refuses to delete an address a live booking points at. It is
-- not here because it references `bookings`, and a migration that
-- names a table that does not exist fails to apply. Nothing can
-- reference an address yet, so there is nothing to guard; the
-- function ships with the booking tables.
--
-- Likewise, addresses.area is compared to localities.name in §5.3
-- rather than joined on a stored locality_id. The stored id is the
-- better key — it survives a locality being renamed — so it is what
-- Phase 1 uses, and locality_id is nullable only so that deleting a
-- locality cannot fail on the rows that pointed at it.


-- ------------------------------------------------------------
-- 0024_audit_idempotency.sql
-- ------------------------------------------------------------

-- ============================================================
-- 0024_audit_idempotency.sql
-- SmartHelp: the append-only audit trail and the idempotency
-- ledger.
--
-- Placement note: the delivery plan places this migration in Phase 9,
-- but the Phase 0 auth routes are already privileged writes, and the
-- Definition of Done requires every privileged route to leave an
-- audit row. The two tables are self-contained — no Phase 1-8 table is
-- referenced — so the file is applied in Phase 0 and needs no edit in
-- the phase it was named for.
--
-- Idempotent: safe to re-run on a live project.
-- Spec: §24.13, §28.2, §26.2
-- ============================================================

-- ── Audit log ──────────────────────────────────────────────
-- Append only. No UPDATE, no DELETE, from anyone: the trigger refuses
-- them even for the service role, because an audit trail that can be
-- rewritten is not a trail.
create table if not exists public.audit_logs (
  id               uuid primary key default gen_random_uuid(),
  actor_profile_id uuid references public.profiles(id) on delete set null,
  actor_role       public.user_role,
  action           text not null,          -- 'booking.create', 'refund.execute', …
  entity_type      text not null,          -- 'bookings', 'payments', …
  entity_id        text,
  before_state     jsonb,
  after_state      jsonb,
  metadata         jsonb,
  ip_address       text,
  user_agent       text,
  request_id       text,
  created_at       timestamptz not null default now()
);

create index if not exists idx_audit_created on public.audit_logs (created_at desc);
create index if not exists idx_audit_entity  on public.audit_logs (entity_type, entity_id, created_at desc);
create index if not exists idx_audit_actor   on public.audit_logs (actor_profile_id, created_at desc);
create index if not exists idx_audit_action  on public.audit_logs (action, created_at desc);

create or replace function public.audit_logs_are_immutable() returns trigger
language plpgsql as $$
begin
  raise exception 'AUDIT_LOG_IMMUTABLE' using errcode = 'insufficient_privilege';
end $$;

drop trigger if exists trg_audit_logs_immutable on public.audit_logs;
create trigger trg_audit_logs_immutable before update or delete on public.audit_logs
  for each row execute function public.audit_logs_are_immutable();

-- The single writer. Every privileged Route Handler calls this; nothing
-- else may insert, so a stray client INSERT cannot forge a trail.
create or replace function public.write_audit(
  p_actor_profile_id uuid,
  p_action           text,
  p_entity_type      text,
  p_entity_id        text default null,
  p_before_state     jsonb default null,
  p_after_state      jsonb default null,
  p_metadata         jsonb default null,
  p_ip_address       text default null,
  p_user_agent       text default null,
  p_request_id       text default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
  v_role public.user_role;
begin
  select role into v_role from public.profiles where id = p_actor_profile_id;

  insert into public.audit_logs (
    actor_profile_id, actor_role, action, entity_type, entity_id,
    before_state, after_state, metadata, ip_address, user_agent, request_id
  ) values (
    p_actor_profile_id, v_role, p_action, p_entity_type, p_entity_id,
    p_before_state, p_after_state, p_metadata, p_ip_address, p_user_agent, p_request_id
  )
  returning id into v_id;

  return v_id;
end $$;

-- ── Idempotency ledger ─────────────────────────────────────
-- One row per (key, operation, caller). A replay of the same key with
-- the same body returns the stored response; a replay with a different
-- body is a conflict, because it means the client changed its mind
-- under a key it had already spent.
create table if not exists public.idempotency_keys (
  id             uuid primary key default gen_random_uuid(),
  key            text not null,
  operation      text not null,
  actor_profile_id uuid references public.profiles(id) on delete cascade,
  request_hash   text not null,          -- sha256 of the canonical body
  response_status int,
  response_body  jsonb,
  created_at     timestamptz not null default now(),
  completed_at   timestamptz,
  unique (key, operation, actor_profile_id)
);

create index if not exists idx_idempotency_created on public.idempotency_keys (created_at desc);

-- Claim a key, or return the already-stored response.
-- Returns: 'claimed' | 'replay' | 'in_flight' | 'conflict'
create or replace function public.claim_idempotency_key(
  p_key             text,
  p_operation       text,
  p_actor_profile_id uuid,
  p_request_hash    text
) returns table (
  outcome          text,
  stored_status    int,
  stored_body      jsonb
)
language plpgsql security definer set search_path = public as $$
declare
  r public.idempotency_keys;
begin
  select * into r
  from public.idempotency_keys
  where key = p_key and operation = p_operation and actor_profile_id = p_actor_profile_id;

  if not found then
    insert into public.idempotency_keys (key, operation, actor_profile_id, request_hash)
    values (p_key, p_operation, p_actor_profile_id, p_request_hash)
    on conflict do nothing;
    return query select 'claimed'::text, null::int, null::jsonb;
    return;
  end if;

  if r.request_hash <> p_request_hash then
    return query select 'conflict'::text, null::int, null::jsonb;
    return;
  end if;

  if r.completed_at is null then
    return query select 'in_flight'::text, null::int, null::jsonb;
    return;
  end if;

  return query select 'replay'::text, r.response_status, r.response_body;
end $$;

create or replace function public.complete_idempotency_key(
  p_key         text,
  p_operation   text,
  p_actor_profile_id uuid,
  p_status       int,
  p_body         jsonb
) returns void
language plpgsql security definer set search_path = public as $$
begin
  update public.idempotency_keys
     set response_status = p_status,
         response_body   = p_body,
         completed_at    = now()
   where key = p_key and operation = p_operation and actor_profile_id = p_actor_profile_id;
end $$;

-- ── RLS ────────────────────────────────────────────────────
alter table public.audit_logs      enable row level security;
alter table public.idempotency_keys enable row level security;

-- Staff-readable, nobody-writable. The insert path is write_audit() only.
do $$ begin
  create policy audit_read_staff on public.audit_logs for select
    using (public.is_staff(array['admin','super_admin']::public.user_role[]));
exception when duplicate_object then null; end $$;

do $$ begin
  create policy audit_no_write on public.audit_logs for insert with check (false);
exception when duplicate_object then null; end $$;

do $$ begin
  create policy audit_no_update on public.audit_logs for update using (false);
exception when duplicate_object then null; end $$;

do $$ begin
  create policy audit_no_delete on public.audit_logs for delete using (false);
exception when duplicate_object then null; end $$;

-- A caller sees only their own keys, and only while they are in flight.
do $$ begin
  create policy idempotency_select_own on public.idempotency_keys for select
    using (actor_profile_id = auth.uid() and completed_at is null);
exception when duplicate_object then null; end $$;

do $$ begin
  create policy idempotency_claim_own on public.idempotency_keys for insert
    with check (actor_profile_id = auth.uid());
exception when duplicate_object then null; end $$;

do $$ begin
  create policy idempotency_complete_own on public.idempotency_keys for update
    using (actor_profile_id = auth.uid())
    with check (actor_profile_id = auth.uid());
exception when duplicate_object then null; end $$;

do $$ begin
  create policy idempotency_no_delete on public.idempotency_keys for delete using (false);
exception when duplicate_object then null; end $$;

-- Nobody writes directly. The only insert path is write_audit().
-- SELECT is retained for `authenticated` so that the RLS policies above are
-- the thing that actually decides visibility — revoking the table grant
-- instead would make every policy on it decorative.
revoke all on public.audit_logs from anon;
revoke insert, update, delete on public.audit_logs from authenticated;
grant select on public.audit_logs to authenticated;

revoke all on public.idempotency_keys from anon;
revoke delete on public.idempotency_keys from authenticated;
grant select, insert, update on public.idempotency_keys to authenticated;

-- The functions are security definer, so their bodies already run with the
-- owner's rights; the EXECUTE grant is what the *caller* needs. Default ACL
-- gives EXECUTE to PUBLIC, and revoking from PUBLIC also takes it away from
-- service_role — which would make every privileged route's RPC fail with
-- `permission denied for function`. Re-grant it explicitly, to service_role
-- only: the browser must never be able to write an audit row.
revoke all on function public.write_audit(uuid, text, text, text, jsonb, jsonb, jsonb, text, text, text) from public, anon, authenticated;
revoke all on function public.claim_idempotency_key(text, text, uuid, text) from public, anon, authenticated;
revoke all on function public.complete_idempotency_key(text, text, uuid, int, jsonb) from public, anon, authenticated;

grant execute on function public.write_audit(uuid, text, text, text, jsonb, jsonb, jsonb, text, text, text) to service_role;
grant execute on function public.claim_idempotency_key(text, text, uuid, text) to service_role;
grant execute on function public.complete_idempotency_key(text, text, uuid, int, jsonb) to service_role;


-- ------------------------------------------------------------
-- 0025_storage_policies.sql
-- ------------------------------------------------------------

-- ============================================================
-- 0025_storage_policies.sql
-- The object policies for the six buckets created in
-- 0000_storage_buckets.sql.
--
-- These were originally in 0000, which cannot work: a policy body
-- is checked when the policy is created, and they call
-- public.is_admin() (0001) and public.current_professional_id()
-- (0005). On a fresh project, applying in filename order therefore
-- failed at the very first file with
-- "function public.is_admin() does not exist".
--
-- 0025 sorts after both, so the functions exist when these are
-- created. Nothing here depends on anything later.
--
-- Idempotent: every policy is created inside a block that swallows
-- duplicate_object, so a re-run is a no-op rather than an error.
-- Spec: §24.15, §27
-- ============================================================

-- ── service-media: world-readable, admin-written ────────────
do $$ begin
  create policy service_media_public_read on storage.objects for select
    using (bucket_id = 'service-media');
exception when duplicate_object then null; end $$;

do $$ begin
  create policy service_media_admin_write on storage.objects for insert
    with check (bucket_id = 'service-media' and public.is_admin());
exception when duplicate_object then null; end $$;

do $$ begin
  create policy service_media_admin_update on storage.objects for update
    using (bucket_id = 'service-media' and public.is_admin())
    with check (bucket_id = 'service-media' and public.is_admin());
exception when duplicate_object then null; end $$;

do $$ begin
  create policy service_media_admin_delete on storage.objects for delete
    using (bucket_id = 'service-media' and public.is_admin());
exception when duplicate_object then null; end $$;

-- ── pro-photos: public bucket, but a pro may only write its own folder.
--    Objects are named '<profileId>/<filename>' by the upload route.
do $$ begin
  create policy pro_photos_public_read on storage.objects for select
    using (bucket_id = 'pro-photos');
exception when duplicate_object then null; end $$;

do $$ begin
  create policy pro_photos_insert_own on storage.objects for insert
    with check (bucket_id = 'pro-photos'
                and (public.is_admin()
                     or (storage.foldername(name))[1] = auth.uid()::text));
exception when duplicate_object then null; end $$;

do $$ begin
  create policy pro_photos_update_own on storage.objects for update
    using (bucket_id = 'pro-photos'
           and (public.is_admin()
                or (storage.foldername(name))[1] = auth.uid()::text))
    with check (bucket_id = 'pro-photos'
                and (public.is_admin()
                     or (storage.foldername(name))[1] = auth.uid()::text));
exception when duplicate_object then null; end $$;

do $$ begin
  create policy pro_photos_delete_own on storage.objects for delete
    using (bucket_id = 'pro-photos'
           and (public.is_admin()
                or (storage.foldername(name))[1] = auth.uid()::text));
exception when duplicate_object then null; end $$;

-- ── kyc-documents: private. There is deliberately NO select policy,
--    so a signed-in professional cannot read the object back with the
--    anon key. Metadata lives in professional_documents; the bytes are
--    fetched through a staff-guarded signed URL (Phase 4).
--    Objects are named '<professionalId>/<docType>/<file>'.
do $$ begin
  create policy kyc_insert_own on storage.objects for insert
    with check (bucket_id = 'kyc-documents'
                and (public.is_admin()
                     or (storage.foldername(name))[1] =
                         public.current_professional_id()::text));
exception when duplicate_object then null; end $$;

do $$ begin
  create policy kyc_update_own on storage.objects for update
    using (bucket_id = 'kyc-documents'
           and (public.is_admin()
                or (storage.foldername(name))[1] =
                    public.current_professional_id()::text))
    with check (bucket_id = 'kyc-documents'
                and (public.is_admin()
                     or (storage.foldername(name))[1] =
                         public.current_professional_id()::text));
exception when duplicate_object then null; end $$;

do $$ begin
  create policy kyc_admin_delete on storage.objects for delete
    using (bucket_id = 'kyc-documents' and public.is_admin());
exception when duplicate_object then null; end $$;


-- ------------------------------------------------------------
-- 0026_otp_signup_and_reset_purposes.sql
-- ------------------------------------------------------------

-- ============================================================
-- 0026_otp_signup_and_reset_purposes.sql
-- Widens public.otp_requests.purpose for the email + password
-- sign-up flow.
--
-- 0001 constrained purpose to ('login','staff_login','admin_mfa'),
-- which was correct while the only email codes were staff MFA.
-- The passwordless phone login has been replaced by SmartPOS-style
-- email + password sign-up, which needs two codes of its own:
--
--   'signup'         proves the person controls the mailbox before
--                    the auth user is created at all
--   'password_reset' proves the same before a password is changed
--
-- Both are keyed on the same (target, purpose) throttle, attempt
-- counter and lockout that already exist, so each gets an
-- independent budget and cannot be used to exhaust the others.
--
-- The channel stays 'email' for both. The 'phone' channel remains
-- supported by issue_otp/consume_otp for phone verification later
-- on, but the sign-up and reset paths only ever use email.
--
-- Idempotent: drops the old check by name if present, then adds one
-- with the full set. Safe to re-run.
-- Spec: §26.1
-- ============================================================

do $$ begin
  alter table public.otp_requests
    drop constraint if exists otp_requests_purpose_check;
exception
  when undefined_table then null;
end $$;

do $$ begin
  alter table public.otp_requests
    add constraint otp_requests_purpose_check
    check (purpose in (
      'login',
      'staff_login',
      'admin_mfa',
      'signup',
      'password_reset'
    ));
exception
  when duplicate_object then null;
end $$;

-- The audit action allow-list also enumerates purposes indirectly, so
-- make sure an existing account cannot be re-pointed at a purpose the
-- server does not recognise. The check constraint above is the single
-- source of truth; this index is the lookup the routes use to find an
-- open reset code for a target.
create index if not exists idx_otp_open_reset
  on public.otp_requests (target, purpose)
  where consumed_at is null and purpose = 'password_reset';


-- ------------------------------------------------------------
-- 0027_phone_is_optional.sql
-- ------------------------------------------------------------

-- ============================================================
-- 0027_phone_is_optional.sql
-- Makes public.profiles.phone nullable, and stops handle_new_user()
-- inventing a placeholder for it.
--
-- THE BUG
-- 0001 declared profiles.phone NOT NULL with a check of
-- '^\+?[0-9]{10,15}$' — digits only. To satisfy NOT NULL for an
-- account created without a phone, handle_new_user() fabricated
-- one out of the user id:
--
--     '+' || substr(replace(new.id::text, '-', ''), 1, 12)
--
-- A UUID is hex, so twelve characters of it contain letters
-- roughly 99.7% of the time (all-digits is (10/16)^12). The
-- check then rejected the row and the whole signup died with
--
--   new row for relation "profiles" violates check constraint
--   "profiles_phone_format"
--
-- which GoTrue reports to the API as the useless
-- "Database error creating new user".
--
-- It went unnoticed because the only accounts that existed were
-- seeded with real phone numbers, so coalesce() never reached
-- the fallback. The passwordless phone sign-up was broken for
-- effectively everyone; 0026 replaced it with email + password,
-- and this fixes the provisioning path underneath that.
--
-- WHY NULLABLE IS THE FIX
-- A new email + password account genuinely has no phone. Storing
-- a made-up one put a fragment of a UUID into a column that means
-- "a dialable number", and it would eventually collide with a real
-- one under uniq_profiles_phone. NULL says what is true, needs no
-- reservation scheme, and the check constraint is satisfied by it
-- (a check passes on NULL). uniq_profiles_phone still holds:
-- Postgres treats NULLs as distinct, which is what we want.
--
-- A professional adds and verifies a real number during
-- onboarding, as before.
--
-- Idempotent. Safe to re-run.
-- Spec: §26.1
-- ============================================================

-- ── the column ──────────────────────────────────────────────
alter table public.profiles
  alter column phone drop not null;

-- The constraint is kept as-is. It now reads "a phone, if there
-- is one, is 10-15 digits", which is the real requirement, and it
-- passes on NULL. Re-adding it makes the intent explicit and keeps
-- it present if a previous run somehow dropped it.
do $$ begin
  alter table public.profiles
    drop constraint if exists profiles_phone_format;
exception when undefined_table then null; end $$;

do $$ begin
  alter table public.profiles
    add constraint profiles_phone_format check (phone is null or phone ~ '^\+?[0-9]{10,15}$');
exception when duplicate_object then null; end $$;

-- ── the trigger ─────────────────────────────────────────────
-- Body is the 0001 version with exactly one change: the fabricated
-- placeholder is replaced by p_phone, which is NULL when the signup
-- supplied no number. Everything else — the two self-assignable
-- roles, the never-hijack-an-identity guard, the customers row, the
-- on-conflict clause — is unchanged.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  requested_role public.user_role := 'customer';
  meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  wanted text := coalesce(meta->>'role', 'customer');
  p_full_name text := coalesce(
    new.raw_user_meta_data->>'full_name',
    split_part(coalesce(new.phone, new.email, 'User'), '@', 1)
  );
  p_phone text;
  p_email text;
begin
  -- Only two roles may ever be self-assigned. Staff roles are granted by an
  -- admin or by the super_admin bootstrap allow-list, never by sign-up.
  if wanted = 'professional' then
    requested_role := 'professional';
  end if;

  p_phone := coalesce(new.phone, meta->>'phone');
  if p_phone is not null and p_phone !~ '^\+?[0-9]{10,15}$' then
    p_phone := null;
  end if;
  p_email := lower(coalesce(new.email, meta->>'email'));

  -- A phone already bound to another profile wins: never hijack an identity.
  if p_phone is not null
     and exists (select 1 from public.profiles where phone = p_phone) then
    return new;
  end if;

  insert into public.profiles (id, role, status, full_name, phone, email, phone_verified_at)
  values (
    new.id,
    requested_role,
    'active',
    left(coalesce(nullif(p_full_name, ''), 'User'), 120),
    p_phone,
    p_email,
    case when new.phone is not null then new.phone_confirmed_at end
  )
  on conflict (id) do nothing;

  if requested_role = 'customer' then
    insert into public.customers (profile_id, referral_code)
    values (new.id, public.generate_referral_code(new.id))
    on conflict (profile_id) do nothing;
  end if;

  return new;
end $$;

-- backfill_profiles() (0001) already wrote
--   case when u.phone ~ '^\+?[0-9]{10,15}$' then u.phone end
-- which yields NULL rather than a fabrication, so it needs no
-- change. It is called on re-provision and must not reintroduce the
-- placeholder, and it no longer can.
