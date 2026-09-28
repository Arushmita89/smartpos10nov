import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { connect } from './_db.mjs';

/**
 * Proves the seeded demo accounts are real, by actually signing in as one.
 *
 * Checking that a row exists in auth.users is not the same as being able to
 * authenticate: a wrong identity_data, a missing identity row, or a password
 * hash GoTrue cannot verify all leave a row that looks correct but cannot log
 * in. This signs in over the same anon path the app uses.
 *
 *   node scripts/verify-seed.mjs
 *
 * The password is compared server-side via the RLS-protected profiles view, and
 * the anon key is only ever used for the sign-in call itself.
 */

const ACCOUNTS = [
  ['demo.customer@smarthelp.test', 'customer'],
  ['demo.pro@smarthelp.test', 'professional'],
  ['demo.admin@smarthelp.test', 'admin'],
  ['demo.support@smarthelp.test', 'support'],
  ['demo.ops@smarthelp.test', 'ops'],
];

const env = {};
for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
  const m = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/.exec(line);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}

const url = env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
if (!url || !anonKey) {
  console.error('NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY missing');
  process.exit(1);
}

const db = connect();
await db.connect();
let failed = false;

try {
  const { rows } = await db.query(`
    select u.email,
           p.role::text       as role,
           p.full_name,
           u.email_confirmed_at is not null as confirmed
      from auth.users u
      join public.profiles p on p.id = u.id
     order by u.email;`);

  console.log(`\nSeeded profiles: ${rows.length}\n`);
  for (const r of rows) {
    console.log(`  ${r.email.padEnd(34)} ${String(r.role).padEnd(14)} confirmed=${r.confirmed}`);
  }

  console.log(`\nPassword sign-in over the anon key:\n`);
  for (const [email, expectedRole] of ACCOUNTS) {
    const supabase = createClient(url, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password: 'Demo@12345',
    });

    if (error) {
      failed = true;
      console.log(`  FAIL ${email.padEnd(34)} ${error.message}`);
      continue;
    }

    const { data: profile, error: pErr } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', data.user.id)
      .single();

    if (pErr) {
      failed = true;
      console.log(`  FAIL ${email.padEnd(34)} sign-in ok but profiles read: ${pErr.message}`);
      continue;
    }

    const ok = profile.role === expectedRole;
    if (!ok) failed = true;
    console.log(
      `  ${ok ? 'ok  ' : 'FAIL'} ${email.padEnd(34)} uid=${data.user.id.slice(0, 8)} role=${profile.role}`
    );
  }
} catch (e) {
  failed = true;
  console.error(e.message);
} finally {
  await db.end().catch(() => {});
}

console.log(failed ? '\nSeed verification FAILED' : '\nSeed verification passed');
process.exitCode = failed ? 1 : 0;
