# SmartHelp — Project State

## Current Phase

Phase 2 — Booking & pricing. **In progress.** Plan:
[`phases/02-booking-pricing/02-PLAN.md`](phases/02-booking-pricing/02-PLAN.md).

The database foundation is done and proven; no application code has been written
yet. Next is `lib/money.ts` and `lib/pricing.ts`.

## Phases Completed

- Phase 0 — Foundation. Migrations 0000–0007 and 0024–0027, email + password
  sign-in, the OTP ledger, roles and capabilities. Built before the phase list was
  tracked; summarised in `README.md`.
- Phase 1 — Catalogue & availability. Migration 0008, locality resolution, the
  slot engine, nine endpoints, three public pages, `docs/`.

## Phase 2 progress

| Task | What it delivered | Status |
|---|---|---|
| Legacy reconciliation | `0008a` drops the pre-spec `bookings`/`coupons`/`coupon_redemptions` | done |
| Booking enums | `0009` — `booking_type`, the 18-label `booking_status` | done |
| `bookings` | `0010` — bookings, items, status history, RLS, booking numbers | done |
| State machine | `0011` — transition trigger, history writer, version bump | done |
| Schedule | `0013` — `professional_schedule` with the overlap exclusion | done |
| Coupons | `0016` — `coupons`, `coupon_usage` ledger | done |
| Ratings | `0017` — `ratings` with the eligibility trigger | done |
| Address guard | `block_address_delete_with_future_bookings()` (deferred from 0008) | done |
| Tests | `test/db.booking.test.ts`, 28 live-database assertions | done |
| Migration dry-run | `scripts/check-migrations.mjs` | done |
| Pricing | `lib/money.ts`, `lib/pricing.ts` — 59 tests | done |
| Booking services | `lib/bookingServer.ts`, cancellation, status | not started |
| Endpoints | the eight `/api/bookings` routes | not started |
| Checkout UI | components and pages | not started |
| Saved-address picker | pass `addressId` from checkout (Phase 1 gap) | not started |
| Roles | customer capabilities in `lib/roles.ts` | not started |
| Seed + docs | bookings in the demo data, `docs/` refresh | not started |

**360 tests, 18 files.** 302 need nothing but the code; 58 run against a live
database. Lint, typecheck and build are clean.

## The pricing engine

`lib/money.ts` counts paise and never lets a fractional rupee into an
intermediate value; `lib/pricing.ts` is §7.1 evaluated in that arithmetic and
returns the breakdown, the two shares, and a `pricing_snapshot`.

- **§7.1 does not balance, and the engine departs from it deliberately.**
  `professional_gross = taxable - commission × taxable` pays a professional out
  of a `taxable` that already contains the platform fee, and `platform_revenue`
  then books the fee again. On ₹1000 with a ₹20 fee, a ₹100 coupon, 18% GST and
  20% commission the specification gives 736 + 370 = 1106 against a total of
  1086 — ₹20 out, scaling with the fee, so it is a structural error and not a
  rounding artefact. The engine charges the fee to the platform instead:
  `professional_gross = taxable - platform_fee - commission`, which reads as
  "the professional earns on the discounted service value, less commission" and
  never touches the fee or the tax, both of which the platform remits.
- **`assertBalanced()` throws if the two shares ever stop summing to the total**,
  so a rule added later that forgets a share fails a booking creation instead of
  quietly overpaying a professional.
- **A discount is apportioned across lines by largest remainder.** Flooring each
  line's share loses paise (₹10 over three equal lines is 999 paise, not 1000);
  rounding each share up overpays (three half-paiso shares each round to 2).
  Flooring and then handing out the leftover by largest fractional remainder,
  breaking ties on index, is exact — and the tie-break matters because the result
  is frozen into `pricing_snapshot` and must replay identically.
- **Two different scales for two similar-looking columns.** `tax_rate` and
  `commission_pct` are rates in [0,1]; `discount_value` for a percentage coupon
  and `max_discount_pct_of_total` are percents on a 0–100 scale. Conflating them
  is the easiest mistake in the file, so the conversion is written next to the
  comment that says which is which.
- **§7.1's floor guard is currently unreachable**, and the code says so. The
  guard allows a discount up to `subtotal + platformFee`, but
  `max_discount_pct_of_total` is clamped to 100% of the subtotal, which is
  strictly less. It stays as the thing that would stop `taxable` going negative
  if the ceiling were ever allowed above 100.
- **`parseNumeric()` throws rather than defaulting a broken value to zero.**
  PostgREST returns `numeric` as a JSON string; every money column on
  `bookings` is `not null`, so a null there is a wrong query, not an absent
  value, and zeroing it would create a booking worth nothing.
- **`pricing.test.ts` checks the engine against `priceForDuration()`** from the
  Phase 1 catalogue over a matrix of durations and duration-row overrides, so
  the display price and the invoiced price cannot drift the way `durationMinutes`
  drifted into `duration` in Phase 1.

## The Phase 2 database, and why it is shaped this way

The live project contained tables that no migration had ever created, built to an
older shape: `bookings` with paise `int` money, a 15-label status enum containing
`pending`, `quoted`, `en_route` and `awaiting_otp`, one `service_id` per booking,
and `coupons` with `kind`/`amount`/`min_subtotal`. All were empty. They were
dropped by `0008a` after checking they held no rows, and the specification's shape
was built in their place. `pricing_type` was **kept** — `services.pricing_type`
uses it, so dropping the enum to tidy up a dead table would have broken the live
catalogue.

- **The transition table is enforced twice, and the database half is the one that
  matters.** `enforce_booking_transition()` raises `ILLEGAL_TRANSITION` for any
  move outside §8.2 and writes `booking_status_history` for every legal one. The
  application guard exists to produce a readable error; the trigger is what makes
  the state safe, because a Route Handler written next year that forgets the
  guard cannot produce `refunded -> paid`.
- **The whole 18-value enum ships in Phase 2 while the code reaches four of its
  values.** A label added when it is first needed is an `ALTER TYPE` that
  rewrites `bookings` under an `ACCESS EXCLUSIVE` lock, on the one table with a
  history row behind every row. The unreached states are unreachable because
  nothing writes them, not because the database would refuse.
- **Actor identity is passed in, not read from `auth.uid()`.** §8.2 says to read
  the JWT, but every privileged write reaches Postgres through the service-role
  client, so `auth.uid()` is null precisely for the events that matter — a
  cancellation, a refund, an ops override. The caller sets `app.transition_actor`
  transaction-locally and the JWT remains a fallback.
- **Money is `numeric(12,2)` and rates are `numeric(5,4)`.** The scale is the
  guard: `numeric(5,2)` would hold `18.00` happily, and a tax rate stored as
  `18` instead of `0.18` survives to checkout, where the customer sees it.
  `tax_rate between 0 and 1` catches what does fit.
- **Double-booking is a GiST exclusion, not a check.** An availability check is a
  read followed by a write, and two customers booking the same professional at the
  same time both read "free". The constraint is atomic; the loser gets `23P01` and
  the server offers the next slot. The partial `where (status in
  ('reserved','in_progress'))` is what stops a completed window from blocking that
  slot forever.
- **A coupon is a ledger, not a counter.** `coupon_usage` has
  `unique (booking_id)`, so "one coupon per booking" is a property of the schema
  rather than a check the pricing engine must remember. `coupons.usage_count` is a
  cache for rendering "3 of 10 left" and is not what enforces `usage_limit`.
- **Ratings are gated in the database.** `validate_rating_booking()` checks the
  booking exists, belongs to that customer, was done by that professional, and has
  finished. A rating is what every professional's public score is computed from,
  so application-level checks would be only as strong as the least careful caller.

## Bugs the Phase 2 tests found

Written after the migrations and immediately wrong, which is what they were for.

- **The history trigger blocked the cascade from its own parent.** It raised on
  every delete, so `delete from bookings` failed with `BOOKING_HISTORY_IMMUTABLE`
  and no booking could ever be deleted. `audit_logs` never hits this because
  nothing cascades from it. Fixed by testing whether the parent row still exists:
  Postgres fires a referential action from an AFTER trigger on the parent, so a
  cascade finds no parent and a hand-rolled delete finds one.
- **`ratings` had the same bug**, so deleting a rated booking failed the same way.
  Fixed the same way.
- **The history trigger silently swallowed edits.** The DELETE branch returned
  `OLD` and the UPDATE branch fell through to it, so `update … set note = …` was
  discarded with no error. The caller would believe the note was rewritten. A
  guard that quietly does nothing is worse than none, because it looks like it
  worked.
- **A hand-written path table in the test was wrong in ten of twelve entries.**
  `paid` and `cancelled` omitted their own final state, so walks stopped a step
  short and the failure surfaced in an unrelated assertion. Replaced with
  `pathTo()`, derived from the one linear chain §8.2 defines.

## Decisions worth remembering from Phase 2

- **One global sequence for `booking_number`, not a per-day counter.** §24.7
  sketches `SH-20260926-00124` with a per-day counter, which needs a per-day row
  and a lock for two simultaneous first-bookings to agree on the suffix. One
  sequence gives the same shape and cannot collide; the unique constraint is the
  actual guarantee. The date part renders in `Asia/Kolkata`, because a booking made
  at 00:10 IST is the 26th in India even when the database is configured for UTC.
- **No `commission_amount` or `platform_revenue` column.** §24.7 does not list
  them, and both are arithmetic on `professional_gross` and `commission_pct`, which
  are stored. A third column would be a second thing to drift. They are derived
  and retained in `pricing_snapshot`.
- **The spec's geo index does not compile as written.** §24.7 says
  `point(address_snapshot->>'lng', …)`, but `jsonb ->> text` and there is no
  `point(text, text)`. Explicit `::double precision` casts, with `btree_gist`
  from `0002`.
- **`booking_assignments` and `assignment_status` are deferred to Phase 5.** They
  are declared in §24.9 beside `professional_schedule` but belong to the matching
  engine, and a table with no matching engine behind it can only ever hold rows
  nothing wrote. `favourites` is deferred from `0017` for the same reason.
- **`booking_status_history` is append-only but not untouchable by cascade**, and
  the distinction is the parent-existence test described above.

## An open product question, not a defect

`bookings.address_id` is `ON DELETE RESTRICT` per §24.7, and `RESTRICT` ignores
status — so **an address somebody once booked to can never be deleted**, even for
a cancelled booking. The trigger in `0010` was widened to count every non-`closed`
booking precisely so those cases get "this address is used by 2 bookings" rather
than a raw constraint name; a `closed` booking still falls through to the foreign
key. Deleting the booking is the escape hatch, and the Route Handler will have to
do it in that order. Whether a customer should be able to retire an address that
only appears on cancelled bookings is worth deciding; the schema as specified says
no.

## Known issues carried forward

- **`GET /api/availability` answers `VALIDATION_ERROR` (with a 422 status
  override) for an unresolvable locality**, where its own docstring and the plan
  both say `SERVICE_UNAVAILABLE`. A client branching on `code` therefore sees a
  different code for the same 422 that an uncovered *service* produces. Left as
  is, and documented in `docs/API.md`.
- **Idempotency is built but unused.** `claim_idempotency_key` /
  `complete_idempotency_key` exist with all four outcomes and a live test, but no
  Route Handler calls them, so `IDEMPOTENCY_CONFLICT` is unreachable today. Phase 2
  is the first phase that wants it.
- **The `/customer` "Browse services" button is disabled** with the title "Arrives
  in Phase 1", which is now false — the catalogue is public and built.
- **Dead code**: `noContent`, `requireCapability`/`requireStaff`/`requireAdmin`
  (the capability table is enforced by the UI only), `isUuid`, `parsePaging`,
  `createRequestClient`, a byte-identical private `maskEmail` in `send-otp`, and
  `components/ui/ImageUpload.tsx` — unreferenced, and pointed at a `menu-images`
  bucket that belongs to SmartPOS and does not exist here.
- **`sign-in` returns the raw `['*']` capability list to a `super_admin`**, where
  `/api/auth/me` expands the wildcard. A client checking capabilities must handle
  the literal `'*'`.
- **Comment drift**: two code comments point at files that do not exist, and
  `lib/validation.ts`'s header claims it is safe to import from the browser when it
  is not. `0007`'s header says twenty services and there are twenty-three; its
  coverage comment says thirteen localities and there are twelve; `seed.sql`'s
  header says four demo users and creates five, and misspells
  `SMARTHELP_OWNER_LOGIN`. None of these change behaviour; all are wrong.
- **`vercel.json` declares eight cron paths** with no handlers behind them.
- **The migration ledger holds one filename that is not on disk** — `0009_bookings.sql`,
  from the legacy era. Harmless, because the ledger is only consulted for files
  that exist, but it is a record of a file nobody can read.

## Quick Tasks Completed

| # | Description | Date | Commit | Directory |
|---|-------------|------|--------|-----------|
| 261003-01 | Continue building smarthelp phase 2 asap | 2026-10-03 | 97799f0 | [.planning/quick/261003-01-continue-smarthelp-phase2](./quick/261003-01-continue-smarthelp-phase2/) |


## Blockers/Concerns

- None outstanding. Migrations through `0017` are applied to the live project and
  `npm run test:db` passes against it (58 tests).
- The database tests need a migrated, seeded database and `SUPABASE_DB_URL`. Without
  one they skip loudly rather than passing quietly.
- `test/db.booking.test.ts` needs more than one customer and more than one
  professional to exist for the two rating-mismatch assertions; where only one
  exists, those tests clean up and return rather than failing.

---

Last activity: Phase 2 pricing engine -- `lib/money.ts` and `lib/pricing.ts`, 59 tests, and a departure from A7.1 because its commission split does not balance.

---

Last activity: Phase 2 pricing engine -- `lib/money.ts` and `lib/pricing.ts`, 59 tests, and a departure from A7.1 because its commission split does not balance.

















