# SmartHelp — Project State

## Current Phase

Phase 1 — Catalogue & availability. Plan:
[`phases/01-catalogue-availability/01-PLAN.md`](phases/01-catalogue-availability/01-PLAN.md).

## Phases Completed

- Phase 0 — Foundation. Migrations 0000–0007 and 0024–0027, email + password
  sign-in, the OTP ledger, roles and capabilities, 162 tests. Built before the
  phase list was tracked; summarised in `README.md`.

## Phase 1 Progress

| Task | What it delivers | Status |
|---|---|---|
| 0008 migration | `addresses`, `address_type`, RLS, one-default-per-customer | pending |
| Type mirror | `addresses` in `lib/supabase.ts`, `supabase/schema.sql` rebuilt | pending |
| `lib/geo.ts` | Haversine + name-match locality resolution | pending |
| `lib/availability.ts` | Pure slot engine: lead time, working hours, time off, capacity | pending |
| Validators | Address payload, availability query | pending |
| Public catalogue routes | landing, categories, services, service detail, availability, estimate | pending |
| Address routes | list, create, update, delete, set default | pending |
| Components | `ServiceCard`, `EmptyState`, duration/slot pickers, site chrome, location selector | pending |
| Pages | `/`, `/services`, `/services/[slug]` | pending |
| Tests | geo, availability, catalogue routes, address routes, addresses RLS | pending |
| Docs | `docs/DATABASE.md`, `docs/API.md`, `docs/FEATURES.md` | pending |

## Decisions worth remembering

- **No PostGIS.** `0002` indexes `point(lng, lat)` with `btree_gist` and nothing
  more, so `ST_Distance` is not available. Distance is Haversine in TypeScript
  (`lib/geo.ts`) over the locality rows, which is a handful of rows per city.
- **Locality resolution lives in TypeScript, not SQL**, for the same reason:
  the radius rule (`localities.radius_km`) is business logic that wants unit
  tests, and it is re-used by the address form, the catalogue and the slot
  engine.
- **Availability is computed, never stored.** `lib/availability.ts` is a pure
  function; the Route Handler only gathers rows and hands them over. The one
  input that cannot be honoured yet — "not already reserved", §9.1 — is isolated
  behind one input parameter so Phase 5 plugs `professional_schedule` in
  without touching the algorithm.
- **A slot list is a 200 with an empty array**, not a 422. `NO_SLOT_AVAILABLE`
  stays in the catalogue for `POST /api/bookings`, where it is an error rather
  than an answer.
- **Addresses are private.** No `anon` grant at all on `addresses`: the RLS
  policy is `customer_id = current_customer_id()`, and an address is the most
  sensitive row a customer owns.

## Blockers/Concerns

- `test:db` needs `SUPABASE_DB_URL` and a migrated, seeded database. The
  migration has **not** been applied to the live project yet; that is a
  deliberate, pending step, not an oversight.

---

Last activity: Phase 1 planned.
