# Setup & Configuration

## Prerequisites

- **Node.js** 18.17+ and **npm** (Next.js 14 requirement)
- A **Supabase** project (free tier is sufficient)
- A **Razorpay** merchant account (test mode is fine for development)

## 1. Install Dependencies

```bash
npm install
```

## 2. Configure Environment Variables

Copy or edit `.env` (the repo ships with an `.env` file; keep real values out of source control in production and use `.env.local` locally, which is gitignored by default in Next.js):

| Variable                          | Required | Description                                                                  |
| --------------------------------- | -------- | ---------------------------------------------------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`        | Yes      | Supabase project URL (e.g. `https://<ref>.supabase.co`)                       |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY`   | Yes      | Supabase anon (public) key — safe to expose to the browser                    |
| `SUPABASE_SERVICE_ROLE_KEY`       | Yes*     | Service-role key — used by subscription/admin/webhook routes; **never** expose client-side |
| `NEXT_PUBLIC_RAZORPAY_KEY_ID`     | Yes      | Razorpay key ID (public, used by Checkout.js)                                 |
| `RAZORPAY_KEY_SECRET`             | Yes      | Razorpay key secret — **server-side only** (`/api/create-order`, `/api/subscription/*`) |
| `RAZORPAY_WEBHOOK_SECRET`         | Optional | Secret for `/api/webhooks/razorpay` signature verification                    |
| `NEXT_PUBLIC_BASE_URL`            | Optional | Public base URL (e.g. `http://localhost:3003`)                                |
| `ALTASOFTWARE_OWNER_LOGIN`        | Yes*    | Owner email — server-side check for `/api/admin/*` (`assertOwner`)            |
| `NEXT_PUBLIC_ALTASOFTWARE_OWNER_LOGIN` | Yes* | Owner email (client-visible) — drives owner UI (admin links, no subscription lock) |
| `SMTP_HOST`                       | No*      | SMTP host for free receipt-by-email delivery (default `smtp.gmail.com`)       |
| `SMTP_PORT`                       | No*      | SMTP port (default `465`)                                                     |
| `SMTP_USER`                       | No*      | Gmail address used to send the receipt email                                  |
| `SMTP_PASS`                       | No*      | Gmail **app password** (Google Account → Security → App passwords)            |

> `SUPABASE_SERVICE_ROLE_KEY`, `ALTASOFTWARE_OWNER_LOGIN`, and `RAZORPAY_WEBHOOK_SECRET` are only needed for the subscription, admin, and webhook features. Without the service-role key, subscription status/plans/verify routes fail.

Other runtime defaults present in `.env`: `PORT` (default `3003`), `HOST`, `PROTOCOL`, `NEXT_PUBLIC_RAZORPAY_KEY_ID`, `DEFAULT_TAX_RATE`, `DEFAULT_CURRENCY`, `DEFAULT_PREP_TIME`, `DEFAULT_MPIN`, `DEFAULT_PAGE_LIMIT`, `DEFAULT_PAGE_OFFSET`, `LOW_STOCK_THRESHOLD`, `CRITICAL_STOCK_THRESHOLD`, `NEXTAUTH_SECRET`, `NEXTAUTH_URL`. Note that most of these are **not currently read by the application code**.

> The repo's committed `.env` currently contains a `VERCEL_OIDC_TOKEN`, an active Supabase anon key, a service-role key, a database connection string with credentials, and a Razorpay key secret. **Rotate these credentials and remove them from version control** before sharing or deploying (see [SECURITY.md](SECURITY.md)).

## 3. Set Up Supabase

Create a new Supabase project and run the migrations in order in the SQL editor (see [DATABASE.md](DATABASE.md)):

```
supabase/migrations/0001_create_users_table.sql
supabase/migrations/0002_subscription_tables.sql
supabase/migrations/0003_subscription_schema_fix.sql
supabase/migrations/0004_subscription_plan_codes.sql
supabase/migrations/0005_missing_tables.sql
supabase/migrations/0006_menu_options.sql
supabase/migrations/0007_parameters_item_options.sql
supabase/migrations/0008_parameters_currency.sql
```

This creates:

- Tables: `parameters`, `users`, `menu`, `categories`, `orders`, `subscription_plans`, `subscriptions`, `payment_history`, `payment_methods`, `profiles`, `subscription_notifications`
- Storage bucket: `menu-images`
- Seed plans (1 Month ₹299 / 3 Months ₹799 / 6 Months ₹1499 / 12 Months ₹2499) — adjust or manage via the owner Plan Value Change screen.

Then copy the project URL and anon key from **Project Settings → API** into your environment.

## 4. Run Locally

```bash
npm run dev
```

The `.env` sets `PORT=3003`, so the app runs at `http://localhost:3003` by default.

## 5. Production Build

```bash
npm run build
npm run start
```

## 6. Deploy (Vercel)

This project is configured for Vercel (`VERCEL_OIDC_TOKEN` present in `.env`). Steps:

1. Push the repository to a Git provider and import it in Vercel.
2. Add all environment variables above to the Vercel project (use a fresh Supabase/Razorpay project for production, and set `RAZORPAY_WEBHOOK_SECRET` + a webhook URL of `https://<your-domain>/api/webhooks/razorpay` in the Razorpay dashboard).
3. Deploy. The App Router API routes (orders, subscription, admin, webhooks) are deployed as serverless functions automatically.

## Smoke Test Checklist

- [ ] Sign up a new restaurant → you land on the dashboard with a 30-day trial banner.
- [ ] Restaurant Mode unlocks with the default MPIN `1234`.
- [ ] Add menu items under **Menu Management** (with image upload and customization options).
- [ ] Switch to **Customer Mode**, search/add items, pick options + a remark, complete a cash order → receipt shows.
- [ ] Complete an online order in Razorpay **test mode** → order appears in **Order Status**.
- [ ] Update an order status in Restaurant Mode; verify Kitchen Mode reflects it.
- [ ] Verify **Reports** totals and export CSV.
- [ ] Add a staff account as admin; log in as `kitchen` and `attendant` roles and confirm their limited views.
- [ ] On the `/subscription` page, complete a plan purchase in Razorpay test mode → subscription becomes active; re-login works.
- [ ] As the owner login, open `/admin` and `/owner/plans`; create/edit a plan code and confirm restaurants see updated pricing.
