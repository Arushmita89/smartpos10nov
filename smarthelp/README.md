# SmartHelp

A service marketplace for home services: customers book, professionals get
jobs, and four staff roles run the platform.

**This repository is at Phase 0.** The database schema, the sign-in flows for
every role, and the authorisation model are built and tested. The product
surface — booking, jobs, payments, KYC review — is not. The role dashboards are
placeholders that show a signed-in user's role and sections, so the access model
can be exercised before there is anything behind it.

Nothing here has been deployed. A live Supabase project is wired up locally: the
schema is migrated, the seed is applied, and all five demo accounts sign in for
real over the anon key.

---

## Quick start

```bash
npm install
cp .env.example .env.local     # then fill it in — see docs/SETUP.md
npm run db:migrate             # apply supabase/migrations/*.sql in order
npm run db:seed                # demo accounts and the bookable catalogue
npm run db:verify              # sign in as each demo account for real
npm run dev
```

`docs/SETUP.md` has the database steps, the environment variables, and the demo
accounts.

---

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Development server |
| `npm run build` | Production build |
| `npm run lint` | ESLint |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | 162 tests. 138 are mocked and need nothing; the other 24 need a real database and skip loudly without one |
| `npm run test:db` | The 24 RLS, OTP-ledger, trigger and account-provisioning tests, against a real database |
| `npm run db:migrate` | Applies `supabase/migrations/*.sql` in filename order |
| `npm run db:seed` | Demo accounts and the bookable catalogue |
| `npm run db:verify` | Signs in as each demo account for real, over the anon key |
| `npm run db:status` | Reports outstanding migrations, changes nothing |
| `npm run db:check` | Read-only look at what is in the database |
| `npm run db:schema` | Rebuilds `supabase/schema.sql` from `supabase/migrations/*.sql` |
| `npm run smtp:verify` | Checks the SMTP credentials without sending a mail |

---

## How sign-in works

Everyone signs in with an **email address and a password**, in the same way as
SmartPOS. There is no phone step in the sign-in flow.

| Flow | What happens |
|---|---|
| Sign in | Email and password. One request, one session. |
| Create account | Email, password, then a six-digit code emailed to that address. The account is created only once the code is proven. |
| Forgot password | A code is emailed to the address, the password is changed, the old one stops working. |

The three routes are `/api/auth/sign-in`, `/api/auth/sign-up/start` +
`/api/auth/sign-up/complete`, and `/api/auth/password-reset/start` +
`/api/auth/password-reset/complete`. `app/login/page.tsx` is one page with
three tabs over them.

Passwords are stored by Supabase Auth, never by us: the server never sees the
hash and never logs the password. A password must be 8–200 characters and
contain at least one letter and one digit.

### The codes

Sign-up and password-reset codes are issued, rate-limited and verified **in SQL**
(`issue_otp` and `consume_otp` in
`supabase/migrations/0001_core_identity.sql`) rather than in a Route Handler,
because two concurrent requests must not both slip past the 60-second resend
throttle. The stored code is a salted SHA-256 hash; the plain code never reaches
the database. `0026` added the `signup` and `password_reset` purposes to the
ledger's purpose check.

Codes are delivered by **email** over SMTP. Sign-in responses are deliberately
identical for a known and an unknown address, and the reset route answers the
same way whether or not the account exists, so neither can be used to discover
who has an account.

### Phone is a profile field, not an identity

A phone number is optional profile data (`profiles.phone`, nullable since
`0027`) that a professional adds and verifies during onboarding. Nothing keys
on it, and a new account has none.

It is worth recording why it became optional. It was once `NOT NULL`, and
`handle_new_user()` satisfied that for a signup that gave no number by
fabricating a placeholder from the user id — `+` followed by the first twelve
characters of the UUID. A UUID is hex, so those twelve characters are letters
about 99.7% of the time, the column's digits-only check rejected the row, and
**every** new signup failed. GoTrue reported it as the one unhelpful line
`Database error creating new user`. It stayed hidden because every existing
account had been seeded with a real number, so the fabricated branch was never
reached. `0027` stores `NULL` instead, which is what is actually true, and
`test/db.rls.test.ts` now creates a user through `admin.createUser` — the call
the mocked Route Handler tests cannot see — so the path is covered.

The synthetic `.invalid` email address scheme for phone-only logins
(`919876543210@auth.smarthelp.invalid`) is no longer part of any flow a person
can reach. The functions that produced it remain in the codebase, unreferenced
by the login page, for the record.

### Staff

Staff sign in with the same email and password. Optionally followed by an
emailed code for MFA.

---

## The authorisation model

There is no role hierarchy. Every capability is an explicit grant, and the same
table (`lib/roles.ts`) is used by both the browser and the Route Handlers, so
the two cannot disagree about who may do what.

| Role | Home | Holds |
|---|---|---|
| `customer` | `/customer` | nothing; a booking is theirs by ownership, not by permission |
| `professional` | `/professional` | accept an offer, start and complete a job, set availability, submit KYC |
| `support` | `/admin` | read and write tickets, request a refund |
| `ops` | `/admin` | read all bookings, assign, cancel any, execute refunds, resolve disputes |
| `admin` | `/admin` | services, pricing, coupons, KYC review, analytics, audit, role management |
| `super_admin` | `/admin` | `'*'` — every capability |

`super_admin` is the single owner account, created by signing in with the login
named in `SMARTHELP_OWNER_LOGIN` — the server-only variable. A
`NEXT_PUBLIC_SMARTHELP_OWNER_LOGIN` exists alongside it, as in SmartPOS, for any
owner-only UI, but the server does not read it: a `NEXT_PUBLIC_` value is
compiled into the client bundle, and gating a `super_admin` grant on something
every visitor can read is not a control. The sign-up handler refuses staff roles,
and `guard_profile_privileges()` refuses a role or status change from a browser
session that is not an admin, so a user cannot promote themselves.

> **Known gap.** The trigger permits an *admin* to change any role, including to
> `super_admin` — it distinguishes admin from everyone else, not owner from
> admin. Nothing exposes that today: there is no role-management API in Phase 0,
> and the only route that writes a role is `professional/apply`, which can only
> set `professional`. Whoever builds the admin role-management screen must refuse
> `super_admin` explicitly, or the owner stops being unique.

---

## Layout

```
app/                    Routes and pages. api/* are Route Handlers.
components/auth/        AuthGuard (who may render) and RoleShell (the chrome).
contexts/AuthContext.tsx  Session, profile, role, capabilities.
lib/
  roles.ts              The capability table. The one place permissions live.
  authServer.ts         Service-role client, and the owner allow-list lookup.
  sessionServer.ts      Turning valid credentials into a granted session.
  otp.ts                Issuing, verifying and delivering a code.
  owner.ts              The super_admin allow-list.
  validation.ts         One validator per payload, shared by client and server.
  api.ts                The response envelope and the error mapping.
supabase/migrations/    The schema, in order. This is the source of truth.
scripts/                Migration runner, seed, and the checks under scripts/.
test/                   Unit tests, Route Handler tests, and the DB tests.
```

`lib/supabase.ts` is a hand-maintained mirror of the database types, with the
RPC signatures and relationship types filled in by hand. After changing a
migration, run `npm run db:schema` to rebuild `supabase/schema.sql`, then check
that the types in `lib/supabase.ts` still describe the database.

---

## Testing

`npm test` runs 138 tests that need no database: the validators, the API
envelope, the role table, the OTP policy, the owner allow-list, the
`NEXT_PUBLIC_` inlining guard, and the Route Handlers against a fake
service-role client. The fake records every table a route touched, so a test can
assert *which row was written*, not merely that something was. A further 24 run
against a real database and are skipped, loudly, when there is not one.

`npm run test:db` runs those 24 tests, which a fake cannot answer: whether RLS is
on every table in `public`, whether any policy exposes every profile, whether the
six buckets exist, whether the OTP ledger throttles, locks, salts and expires as
it claims, whether the audit trail refuses to be edited, and whether
`admin.createUser` provisions a usable account. It reads `SUPABASE_DB_URL` from
the environment or from `.env.local`, and skips loudly, with a warning, when
there is neither. It needs a migrated and seeded database:

```bash
npm run db:migrate && npm run db:seed && npm run test:db
```

The last of those matters more than it looks. The fake service-role client always
succeeds, so the Route Handler tests cannot see a failure inside GoTrue — which
is exactly where the signup bug described above lived, and why the provisioning
tests call the real auth API instead.

These run as the migration owner, which bypasses RLS — so they assert that RLS
*exists*, not what each policy admits. What the policies actually allow is
covered by `npm run db:verify`, which signs in as each demo account with the anon
key and reads the role back through RLS.
