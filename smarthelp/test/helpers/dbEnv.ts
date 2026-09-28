import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Client } from 'pg';

/**
 * Connection helper for the database suite.
 *
 * Two things it handles that the previous `psql`-based version did not.
 *
 * `.env.local` is loaded here rather than being expected in the process
 * environment. Vitest does not put env-file values into `process.env`, so the
 * suite skipped itself even with a perfectly good `.env.local` sitting next to
 * it. Values already present in the environment win, so CI can still override.
 *
 * `pg` is used rather than shelling out to `psql`, which is not installed on a
 * typical Windows dev box and made the file unrunnable anywhere the CLI was
 * absent. There is also no synchronous query API, so every call site below is
 * async; that is the only real cost.
 */

/** Reads `.env.local` and returns it, without mutating anything. */
function readEnvFile(): Record<string, string> {
  const path = join(__dirname, '..', '..', '.env.local');
  const out: Record<string, string> = {};

  let text: string;
  try {
    text = readFileSync(path, 'utf8');
  } catch {
    return out; // No .env.local is a legitimate state; the caller reports it.
  }

  for (const line of text.split('\n')) {
    if (line.trimStart().startsWith('#')) continue;
    const m = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/.exec(line);
    if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
  return out;
}

const envFile = readEnvFile();

/**
 * The connection string, or undefined when there is none. Checked before any
 * client is built so the suite can skip instead of throwing on import.
 */
export const dbUrl: string | undefined =
  process.env.SUPABASE_DB_URL || envFile.SUPABASE_DB_URL;

/**
 * The URL and service-role key, for the tests that have to go through the
 * auth API rather than through SQL.
 *
 * The env file is consulted *first*, which is the reverse of dbUrl above and
 * deliberate. `vitest.config.ts` puts placeholder values for
 * SUPABASE_SERVICE_ROLE_KEY and friends into process.env so that the Route
 * Handler tests can import modules that read them at module scope. Preferring
 * process.env here would hand those tests a fake key, and a request made with
 * it fails as an auth error rather than a database one — a failure that reads
 * like a bug in the code under test.
 *
 * In CI there is no .env.local, so envFile is empty and the real credentials
 * from the environment are used instead. Both paths are supported on purpose.
 */
export const supabaseUrl: string | undefined =
  envFile.NEXT_PUBLIC_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
export const serviceRoleKey: string | undefined =
  envFile.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

/** True when these tests can actually reach the auth API, and so should run. */
export const hasAuthAdmin = Boolean(dbUrl && supabaseUrl && serviceRoleKey);

let client: Client | undefined;

/** One shared connection for the file, opened lazily. */
export async function getClient(): Promise<Client> {
  if (!dbUrl) {
    throw new Error('SUPABASE_DB_URL is not set');
  }
  if (!client) {
    client = new Client({
      connectionString: dbUrl,
      // Supabase's pooler presents a certificate for a name that is not in the
      // chain we build locally, so the usual guidance applies: the transport is
      // encrypted, the CA chain is not verifiable here.
      ssl: { rejectUnauthorized: false },
    });
    await client.connect();
  }
  return client;
}

/** Runs SQL as the migration owner, which bypasses RLS. */
export async function sql(query: string): Promise<string> {
  const c = await getClient();
  const res = await c.query(query);
  // psql -t -A returned a single flat, newline-joined string; callers parse
  // that shape, so reproduce it rather than making them all change.
  return res.rows
    .flatMap((r) => Object.values(r))
    .map((v) => (v === null || v === undefined ? '' : String(v)))
    .join('\n')
    .trim();
}

/** Closes the connection. Call from afterAll so the runner can exit. */
export async function closeDb(): Promise<void> {
  if (client) {
    await client.end().catch(() => {});
    client = undefined;
  }
}
