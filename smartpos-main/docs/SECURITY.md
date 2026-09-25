# Security

This document describes the current security model, known gaps, and recommended hardening. **The codebase ships with known gaps and committed credentials — address these before sharing or deploying.**

## Auth Model

- **Custom email/password auth** (not Supabase Auth). Login queries `users` first, then `parameters`, comparing passwords in plaintext.
- Session is a `localStorage` flag (`smartpos_restaurant_id` / `smartpos_user_id`) — there is **no token expiry, no server-side session, and no password hashing**.
- Passwords and the 4-digit MPIN are stored as **plaintext** in `parameters` / `users`.

## Row-Level Security (RLS)

- Migrations enable RLS on `users`, `subscription_plans`, `subscriptions`, `payments`/`payment_history`, `payment_methods`, `profiles`, `subscription_notifications`, but add **open policies** (`for ... to anon, authenticated using (true)`).
- The app reads/writes core tables (`parameters`, `menu`, `categories`, `orders`) with the **anon key** directly from the browser.
- **Net effect:** any client holding the public anon key can read or modify any restaurant's data. RLS provides no isolation today.

## Secrets in the Repository

The committed `.env` file contains live credentials:

- `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_DB_URL` (connection string with credentials)
- `RAZORPAY_KEY_SECRET` and a Razorpay key ID
- `VERCEL_OIDC_TOKEN`

Because `.env` is committed, `git log` and any clone of the repo expose all of these.

## Server-Side Routes & Secrets

- `/api/create-order` and `/api/subscription/create` keep `RAZORPAY_KEY_SECRET` server-side — good.
- Subscription/admin/webhook routes use `SUPABASE_SERVICE_ROLE_KEY` server-side — good, but they trust the anon-key session:
  - `/api/subscription/status`, `/api/subscription/plans`, `/api/subscription/create`, `/api/subscription/verify`, `/api/trial/activate` accept a `restaurantId` from the client with no authentication, so any client can activate/extend/subscribe **any** restaurant.
- **Admin endpoints** (`/api/admin/*`) are guarded by `assertOwner`, which trusts client-supplied headers `x-login-name` and `x-restaurant-id` (plus the owner email from `NEXT_PUBLIC_ALTASOFTWARE_OWNER_LOGIN`, which is public). A client can forge these headers unless the server additionally verifies the header values against something the client cannot spoof. The current check does query `parameters` for the login+restaurant combo, but the login email is public knowledge.
- `NEXT_PUBLIC_ALTASOFTWARE_OWNER_LOGIN` is a public env var — it only gates UI, never authorization.

## Payment Verification

- **Orders:** there is no webhook for POS orders; the app trusts the Razorpay Checkout.js callback and stores returned payment IDs without server-side verification.
- **Subscriptions:** `/api/subscription/verify` does verify the HMAC signature server-side (good), and `/api/webhooks/razorpay` verifies the webhook signature. The webhook secret must be set to something other than the placeholder.

## Known Issues / Gaps (summary)

1. Plaintext passwords and MPIN.
2. No RLS isolation — anon key can read/write all data.
3. Committed credentials in `.env`.
4. Client-controlled `restaurantId` on subscription/trial routes.
5. Admin routes authenticate via client-supplied headers.
6. POS order payments not verified server-side.
7. Sessions never expire server-side.

## Hardening Checklist

- [ ] Rotate all credentials (Supabase anon + service-role + DB URL, Razorpay keys, Vercel OIDC token) and remove `.env` from version control (use `.env.local` + `.env.example`).
- [ ] Hash passwords (bcrypt/argon2) and store only hashes; hash the MPIN or replace it with a server-verified gate.
- [ ] Implement real RLS policies keyed to `restaurant_id` (authenticate via Supabase Auth or a verifiable token).
- [ ] Replace the custom header-based admin auth with a verifiable server-side session/token and enforce `NEXT_PUBLIC_ALTASOFTWARE_OWNER_LOGIN` never being trusted server-side alone.
- [ ] Authenticate subscription/trial routes (verify the caller owns `restaurantId`).
- [ ] Add a Razorpay webhook (or server-side fetch) to verify POS order payments before marking them complete.
- [ ] Add session expiry / server-side session management.
