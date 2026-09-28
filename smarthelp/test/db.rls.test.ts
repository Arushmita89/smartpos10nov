import { afterAll, describe, expect, it } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { closeDb, dbUrl, hasAuthAdmin, serviceRoleKey, sql, supabaseUrl } from './helpers/dbEnv';

/**
 * The database tests — the part of §29.1 that cannot be faked.
 *
 * Every other suite mocks Supabase, and that is right: a mock proves the
 * *route* takes the right branch, but it proves nothing about who may read a
 * row. Only Postgres answers that, so these assertions run against a real
 * database with the real migration history applied.
 *
 * These are the only tests here that talk to a live service, so they need
 * SUPABASE_DB_URL — read from the environment or from `.env.local`, which
 * ./helpers/dbEnv loads for us. Without it the file skips, loudly, rather than
 * passing quietly: a green suite that never checked row-level security would
 * be worse than no suite at all.
 *
 * The database must be migrated and seeded first:
 *
 *   npm run db:migrate && npm run db:seed && npm run test:db
 *
 * Everything runs as the migration owner, which bypasses RLS — so these assert
 * that RLS *exists*, not what it lets through. The RLS-enabled behaviour itself
 * is covered by the seeded accounts signing in through the anon key, which
 * `npm run db:verify` does.
 */

const describeDb = dbUrl ? describe : describe.skip;

if (!dbUrl) {
  console.warn(
    '\n[db] Skipping the database tests — no SUPABASE_DB_URL in the environment\n' +
      '     or in .env.local. Row-level security, the OTP ledger and the audit\n' +
      '     triggers are NOT covered by this run.\n'
  );
}

afterAll(closeDb);

/** A phone number nobody can be holding, so the ledger starts empty. */
function freshTarget(): string {
  return `+9199${Date.now().toString().slice(-8)}${Math.floor(Math.random() * 1000)}`;
}

/**
 * The id of a seeded profile, to act as the author of an audit row or an
 * idempotency key.
 *
 * A throwaway uuid is not usable here: audit_logs.actor_profile_id and
 * idempotency_keys.actor_profile_id both reference public.profiles, and
 * profiles.id is in turn the auth user's id with no default, so a test cannot
 * invent a profile. A row written to audit_logs then cannot be removed — the
 * immutability trigger blocks the delete — so making one per run would litter
 * the trail. Borrowing a seeded account keeps the run side-effect free apart
 * from the audit row itself, which is the thing under test.
 */
async function seededProfileId(email: string): Promise<string> {
  const id = await sql(`select id from public.profiles where id in
      (select id from auth.users where email = '${email}');`);
  if (!/^[0-9a-f-]{36}$/i.test(id)) {
    throw new Error(`no seeded profile for ${email} — run "npm run db:seed" first`);
  }
  return id;
}

const issue = (target: string, code: string, purpose = 'login') =>
  sql(`select public.issue_otp('${target}', 'phone', '${purpose}', '${code}', 10, 3, 60, 15);`);
const consume = (target: string, code: string, purpose = 'login') =>
  sql(`select public.consume_otp('${target}', '${purpose}', '${code}');`);

describeDb('database: the schema is actually there', () => {
  it('has RLS enabled on every table in public', async () => {
    const unprotected = await sql(
      `select coalesce(string_agg(c.relname, ', '), '')
         from pg_class c
         join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public'
          and c.relkind = 'r'
          and c.relrowsecurity = false;`
    );
    expect(unprotected, `tables without RLS: ${unprotected}`).toBe('');
  });

  it('created the tables the code imports', async () => {
    const missing = await sql(
      `select coalesce(string_agg(t, ', '), '') from unnest(array[
         'profiles','customers','professionals','services',
         'professional_skills','professional_documents',
         'otp_requests','audit_logs','idempotency_keys'
       ]) as t
       where not exists (
         select 1 from information_schema.tables
          where table_schema = 'public' and table_name = t
       );`
    );
    expect(missing, `missing tables: ${missing}`).toBe('');
  });

  it('gives the anon role policies on profiles rather than no access at all', async () => {
    // Not "no grants": on Supabase, anon and authenticated are granted table
    // privileges on the public schema and RLS is what decides rows. Asserting
    // the absence of grants would only be true on a hand-built database, and
    // would pass while the policies were all missing. What matters is that
    // policies exist and admit nobody, which the next two tests check.
    const policies = await sql(
      `select count(*) from pg_policies
        where schemaname = 'public' and tablename = 'profiles';`
    );
    expect(Number(policies)).toBeGreaterThan(0);
  });

  it('has no policy that lets anyone read every profile', async () => {
    // A `for select ... using (true)` on profiles would hand the public every
    // row in the table, including phone numbers and roles. This is the single
    // most damaging policy mistake available here, so it is named explicitly.
    const wideOpen = await sql(
      `select coalesce(string_agg(policyname, ', '), '') from pg_policies
        where schemaname = 'public' and tablename = 'profiles'
          and cmd = 'SELECT' and qual = 'true';`
    );
    expect(wideOpen, `profiles readable by anyone: ${wideOpen}`).toBe('');
  });

  it('created the six storage buckets', async () => {
    const missing = await sql(
      `select coalesce(string_agg(b, ', '), '') from unnest(array[
         'service-media','pro-photos','kyc-documents',
         'chat-media','support-media','invoices'
       ]) as b
       where not exists (select 1 from storage.buckets where id = b);`
    );
    expect(missing, `missing buckets: ${missing}`).toBe('');
  });

  it('seeded the five demo accounts as confirmed email logins', async () => {
    const unusable = await sql(
      `select coalesce(string_agg(u.email, ', '), '')
         from auth.users u
         join public.profiles p on p.id = u.id
        where u.email like '%@smarthelp.test'
          and (u.email_confirmed_at is null or not exists (
                select 1 from auth.identities i
                 where i.user_id = u.id and i.provider = 'email'));`
    );
    expect(unusable, `demo accounts not usable for email sign-in: ${unusable}`).toBe('');
  });
});

describeDb('database: the OTP ledger', () => {
  it('stores a salted hash, so the code is not recoverable from the row', async () => {
    const target = freshTarget();
    const code = '135790';
    await issue(target, code);

    const row = await sql(
      `select code_hash || '|' || salt from public.otp_requests
        where target = '${target}' and consumed_at is null;`
    );
    const [hash, salt] = row.split('|');

    expect(hash).toHaveLength(64); // sha256, hex
    expect(salt).toHaveLength(32); // 16 random bytes, hex
    expect(hash).not.toContain(code);
    expect(row).not.toContain(code);
  });

  it('salts each code separately, so two equal codes hash differently', async () => {
    const first = freshTarget();
    const second = freshTarget();
    await issue(first, '246813');
    await issue(second, '246813');

    const hashes = await Promise.all(
      [first, second].map((t) =>
        sql(`select code_hash from public.otp_requests where target = '${t}';`)
      )
    );
    expect(hashes[0]).not.toBe(hashes[1]);
  });

  it('accepts the right code and refuses a wrong one', async () => {
    const target = freshTarget();
    await issue(target, '112233');
    expect(await consume(target, '999999')).toBe('invalid');
    expect(await consume(target, '112233')).toBe('ok');
  });

  it('will not accept the same code twice', async () => {
    const target = freshTarget();
    await issue(target, '112234');
    expect(await consume(target, '112234')).toBe('ok');
    expect(await consume(target, '112234')).toBe('missing');
  });

  it('ignores a code issued for a different purpose', async () => {
    const target = freshTarget();
    await issue(target, '556677', 'login');
    expect(await consume(target, '556677', 'staff_login')).toBe('missing');
  });

  it('throttles a resend inside the 60 second window', async () => {
    const target = freshTarget();
    await issue(target, '445566');
    // The ledger signals this by raising, so the rejection is the assertion.
    await expect(issue(target, '445567')).rejects.toThrow(/OTP_THROTTLED/);
  });

  it('keeps only the newest code live', async () => {
    const target = freshTarget();
    // Issue two codes far enough apart to clear the throttle.
    await issue(target, '778899');
    await sql(`update public.otp_requests set created_at = now() - interval '10 minutes'
          where target = '${target}';`);
    await issue(target, '778800');

    // 'invalid', not 'missing': issuing supersedes the old row by stamping
    // consumed_at, but consume_otp reads the newest *unconsumed* row — which
    // is now the new code's — and simply fails to match. What matters is that
    // the superseded code does not verify.
    expect(await consume(target, '778899')).not.toBe('ok');
    expect(await consume(target, '778800')).toBe('ok');
  });

  it('locks the target on the third wrong attempt, and says so on the fourth', async () => {
    // Three failures are reported as 'invalid' — the third is what sets the
    // lock. The lock is visible on the next attempt, which is what the
    // Route Handler turns into a 429.
    const target = freshTarget();
    await issue(target, '121212');
    expect(await consume(target, '000001')).toBe('invalid');
    expect(await consume(target, '000002')).toBe('invalid');
    expect(await consume(target, '000003')).toBe('invalid');
    expect(await consume(target, '121212')).toBe('locked');
  });

  it('reports an expired code as expired rather than wrong', async () => {
    const target = freshTarget();
    await issue(target, '343434');
    await sql(`update public.otp_requests set expires_at = now() - interval '1 second'
          where target = '${target}';`);
    expect(await consume(target, '343434')).toBe('expired');
  });
});

describeDb('database: audit trail', () => {
  it('refuses to update or delete a row', async () => {
    const actor = await seededProfileId('demo.admin@smarthelp.test');
    const id = await sql(
      `select public.write_audit('${actor}', 'test.action', 'profiles', '${actor}');`
    );

    await expect(
      sql(`update public.audit_logs set action = 'tampered' where id = '${id}';`)
    ).rejects.toThrow(/AUDIT_LOG_IMMUTABLE/);

    await expect(sql(`delete from public.audit_logs where id = '${id}';`)).rejects.toThrow(
      /AUDIT_LOG_IMMUTABLE/
    );

    // The rows stay: their immutability is the point, and the run is a reading
    // of the trail rather than a clean-up of it.
  });
});

describeDb('database: idempotency ledger', () => {
  it('claims a key once, replays it after completion, and refuses a changed body', async () => {
    const key = `test-${Date.now()}`;
    const actor = await seededProfileId('demo.ops@smarthelp.test');

    const claim = (hash: string) =>
      sql(
        `select outcome from public.claim_idempotency_key('${key}', 'test.op', '${actor}', '${hash}');`
      );

    expect(await claim('hash-a')).toBe('claimed');
    // Same key, still running: the caller must wait, not start a second write.
    expect(await claim('hash-a')).toBe('in_flight');
    // Same key, different body: the client changed its mind — refuse.
    expect(await claim('hash-b')).toBe('conflict');

    await sql(
      `select public.complete_idempotency_key('${key}', 'test.op', '${actor}', 200, '{"ok":true}');`
    );

    expect(await claim('hash-a')).toBe('replay');
  });
});

/*
 * Account provisioning, and the bug that made every signup fail.
 *
 * `admin.createUser` is the one call in the sign-up path that talks to GoTrue
 * rather than to our own tables, so the mocked Route Handler tests cannot
 * cover it: they replace the admin client with a fake that always succeeds.
 * That is exactly the gap a real bug fell through.
 *
 * The bug: 0001 declared profiles.phone NOT NULL with a digits-only check, and
 * satisfied the NOT NULL for a user who gave no number by fabricating one from
 * the user id — '+' followed by the first twelve characters of the uuid. A
 * uuid is hex, so those twelve characters are letters about 99.7% of the time
 * and the check rejected the row. GoTrue collapsed that into the one line
 * "Database error creating new user", so nothing pointed at the real cause.
 *
 * It stayed hidden because every existing account was seeded with a phone, so
 * coalesce() never reached the fabricated branch. A test that only seeds
 * therefore cannot find it; one that creates a user the way a signup does can.
 */

const describeAuth = hasAuthAdmin ? describe : describe.skip;

if (!hasAuthAdmin) {
  console.warn(
    '\n[db] Skipping the auth provisioning tests — no NEXT_PUBLIC_SUPABASE_URL or\n' +
      '     SUPABASE_SERVICE_ROLE_KEY in .env.local. The fix for the "Database\n' +
      '     error creating new user" signup failure is NOT covered by this run.\n'
  );
}

let admin: SupabaseClient;

function adminClient(): SupabaseClient {
  if (!admin) {
    admin = createClient(supabaseUrl!, serviceRoleKey!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return admin;
}

/** An address no real signup is using, so the run cannot collide with a person. */
function freshEmail(tag: string): string {
  return `probe.${tag}.${Date.now()}.${Math.floor(Math.random() * 1e6)}@example.invalid`;
}

/**
 * Creates a user exactly as `/api/auth/sign-up/complete` does and hands its id
 * to `body`, deleting it again afterwards whether or not the body passed.
 *
 * The teardown has to be inside the test rather than in an afterAll: a failed
 * assertion would otherwise leave a real auth user and a real profile behind,
 * and the next run would then fail for a reason that has nothing to do with
 * what it is testing.
 */
async function provisioned(
  userMetadata: Record<string, unknown>,
  body: (userId: string, email: string) => Promise<void>
): Promise<void> {
  const email = freshEmail('prov');
  const created = await adminClient().auth.admin.createUser({
    email,
    password: 'Provision-Me-2026',
    email_confirm: true,
    user_metadata: userMetadata,
  });

  // This is the assertion that was missing when the bug shipped. GoTrue reports
  // a failing trigger as this same opaque string, so checking it here is what
  // turns "signup is broken" into "the profile constraint rejected the row".
  if (created.error) {
    throw new Error(
      `createUser failed, which is the bug this test exists to catch: ${created.error.message}`
    );
  }

  const userId = created.data.user!.id;
  try {
    await body(userId, email);
  } finally {
    await adminClient().auth.admin.deleteUser(userId);
  }
}

describeAuth('database: a new auth user is provisioned', () => {
  it('creates a profile with no phone rather than inventing one', async () => {
    await provisioned({ full_name: 'No Phone Person' }, async (userId) => {
      const row = await sql(
        `select coalesce(phone, '<null>') from public.profiles where id = '${userId}';`
      );

      // The regression. Before 0027 this was '+' plus twelve uuid characters,
      // which is letters 99.7% of the time and so failed profiles_phone_format.
      expect(row).toBe('<null>');
    });
  });

  it('stores the name, marks the account active and records the address', async () => {
    await provisioned({ full_name: 'Ada Lovelace' }, async (userId, email) => {
      const row = await sql(
        `select full_name || '|' || status || '|' || coalesce(email, '<null>') || '|' ||
                (phone_verified_at is null)::text
           from public.profiles where id = '${userId}';`
      );

      expect(row).toBe(`Ada Lovelace|active|${email}|true`);
    });
  });

  it('gives a customers row to a customer', async () => {
    await provisioned({ full_name: 'Buyer', role: 'customer' }, async (userId) => {
      const row = await sql(
        `select count(*) from public.customers where profile_id = '${userId}';`
      );
      expect(row).toBe('1');
    });
  });

  it('does not give a professional a customers row', async () => {
    await provisioned({ full_name: 'Fixer', role: 'professional' }, async (userId) => {
      const role = await sql(`select role from public.profiles where id = '${userId}';`);
      const rows = await sql(
        `select count(*) from public.customers where profile_id = '${userId}';`
      );

      expect(role).toBe('professional');
      expect(rows).toBe('0');
    });
  });

  it('will not let a signup grant itself a staff role', async () => {
    for (const claimed of ['admin', 'support', 'ops', 'super_admin']) {
      await provisioned({ full_name: 'Aspirant', role: claimed }, async (userId) => {
        const role = await sql(`select role from public.profiles where id = '${userId}';`);

        // Only 'customer' and 'professional' may be self-assigned; anything
        // else falls back to customer, so a signup cannot mint itself access.
        expect(role).toBe('customer');
      });
    }
  });

  it('does not take over a phone number that already belongs to someone', async () => {
    // demo.pro holds +919000000002. A signup claiming it must be refused
    // rather than re-pointed at the account that already exists.
    const before = await sql(
      `select count(*) from public.profiles where phone = '+919000000002';`
    );

    await provisioned({ full_name: 'Impostor', phone: '+919000000002' }, async (userId) => {
      const rows = await sql(`select count(*) from public.profiles where id = '${userId}';`);

      // No profile at all: the trigger returns early rather than provisioning a
      // second account onto an identity that is already in use.
      expect(rows).toBe('0');
    });

    const after = await sql(
      `select count(*) from public.profiles where phone = '+919000000002';`
    );
    expect(after).toBe(before);
  });

  it('keeps two phone-less accounts distinct, since NULL is not a shared phone', async () => {
    // uniq_profiles_phone cannot use a plain unique index to stop one person
    // claiming another's number when the number is absent, so this is the
    // assertion that the nullable column did not quietly become a shared
    // sentinel value.
    const first = await adminClient().auth.admin.createUser({
      email: freshEmail('dup'),
      password: 'Provision-Me-2026',
      email_confirm: true,
    });
    const second = await adminClient().auth.admin.createUser({
      email: freshEmail('dup'),
      password: 'Provision-Me-2026',
      email_confirm: true,
    });

    expect(first.error).toBeNull();
    expect(second.error).toBeNull();

    try {
      const bothNull = await sql(
        `select count(*) from public.profiles
          where id in ('${first.data.user!.id}', '${second.data.user!.id}')
            and phone is null;`
      );
      expect(bothNull).toBe('2');
    } finally {
      await adminClient().auth.admin.deleteUser(first.data.user!.id);
      await adminClient().auth.admin.deleteUser(second.data.user!.id);
    }
  });
});
