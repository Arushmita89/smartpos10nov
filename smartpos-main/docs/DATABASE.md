# Database (Supabase)

SmartPOS uses a single Supabase PostgreSQL project. Core restaurant/ordering tables are queried directly from the browser with the anon key; subscription/admin routes use the **service-role key** server-side. All schema changes ship as migrations in `supabase/migrations/`.

## Migrations

Run these in order in the Supabase SQL editor (or with the Supabase CLI):

| Migration | Purpose |
| --------- | ------- |
| `0001_create_users_table.sql` | Staff accounts & roles (`users`) |
| `0002_subscription_tables.sql` | `subscription_plans`, `subscriptions`, `payments` + trial fields |
| `0003_subscription_schema_fix.sql` | Idempotent alignment of older subscription schemas |
| `0004_subscription_plan_codes.sql` | `country_code`, `plan_code`, `restaurant_id` on plans |
| `0005_missing_tables.sql` | `payment_history`, `payment_methods`, `profiles`, `subscription_notifications` + subscriptions period columns |
| `0006_menu_options.sql` | Per-item customization options on `menu.options` |
| `0007_parameters_item_options.sql` | Restaurant-level default options (`parameters.item_options`) |
| `0008_parameters_currency.sql` | Billing currency + country on `parameters` |

## Tables

### `parameters` — Restaurant profile & credentials

One row per restaurant. Used by `AuthContext` for all auth flows.

| Column            | Type       | Notes                                                            |
| ----------------- | ---------- | --------------------------------------------------------------- |
| `restaurant_id`   | `string`   | **PK** — generated as `REST` + 6 random alphanumerics (e.g. `REST7K2M9Q`) |
| `restaurant_name` | `string`   | Display name                                                      |
| `mpin`            | `string`   | 4-digit MPIN used to unlock Restaurant Mode (default `1234`)     |
| `created_at`      | `string`   | Timestamp                                                         |
| `login_name`      | `string?`  | Login email (lowercased + trimmed)                                |
| `password`        | `string?`  | **Plaintext password** (not declared in TS type — see SECURITY.md) |
| `password_hash`   | `string?`  | Unused/reserved column                                            |
| `gst_number`      | `string?`  | GSTIN                                                             |
| `phone`           | `string?`  | Contact phone                                                     |
| `address_line1..3`| `string?`  | Address lines                                                     |
| `owner1..4`       | `string?`  | Owner names                                                       |
| `tax_rate`        | `number`   | Tax percentage (default 18)                                       |
| `currency`        | `string`   | Billing currency (default `INR`; migration 0008)                  |
| `country_code`    | `string`   | ISO country code (default `IN`; migration 0008)                   |
| `trial_start`     | `string?`  | Trial start timestamp                                             |
| `trial_end`       | `string?`  | Trial expiry timestamp (30 days from sign-up)                     |
| `trial_used`      | `boolean`  | Whether the free trial was consumed (default `false`)             |
| `item_options`    | `jsonb`    | Restaurant default customization options (e.g. `["Spicy","No Salt",...]`) |

### `users` — Staff accounts & roles

One row per staff member, linked to a restaurant. Used by `AuthContext` for login and by `UserManagement` (admin) to add/edit staff.

| Column          | Type      | Notes                                                              |
| --------------- | --------- | ------------------------------------------------------------------ |
| `id`            | `string`  | PK (UUID)                                                          |
| `restaurant_id` | `string`  | FK → `parameters.restaurant_id`                                    |
| `name`          | `string`  | Display name                                                        |
| `login_name`    | `string`  | Login email (lowercased + trimmed, globally unique)                |
| `password`      | `string`  | Password (plaintext, consistent with the existing `parameters` auth system) |
| `role`          | `string`  | `admin`, `kitchen`, or `attendant`                                 |
| `active`        | `boolean` | Inactive users cannot log in                                        |
| `created_at`    | `string`  | Timestamp                                                          |

Role access:
- **admin** — full access (POS, orders, menu, inventory, customers, reports, settings, users, kitchen mode, customer mode).
- **kitchen** — Kitchen Mode only (view/update order statuses).
- **attendant** — POS, Quick Order, Order Status, Customer Mode. No menu/settings/users access.

Existing `parameters`-only accounts still work: on their first login the app auto-migrates them into `users` with role `admin`.

### `menu` — Menu items

| Column              | Type      | Notes                                   |
| ------------------- | --------- | --------------------------------------- |
| `id`                | `string`  | PK (UUID)                               |
| `restaurant_id`     | `string`  | FK → `parameters.restaurant_id`         |
| `name`              | `string`  | Item name                               |
| `description`       | `string?` | Short description                       |
| `price`             | `number`  | Price in the restaurant's currency      |
| `category`          | `string`  | Category name (free text; e.g. `Pizza`) |
| `image_url`         | `string?` | Public URL from `menu-images` bucket    |
| `available`         | `boolean` | Whether it appears in Customer Mode     |
| `preparation_time`  | `number`  | Minutes (default 15)                    |
| `options`           | `jsonb`   | Per-item customization options (e.g. `["Spicy","Extra Cheese"]`; migration 0006) |
| `created_at`        | `string`  | Timestamp                               |
| `updated_at`        | `string`  | Timestamp                               |

### `categories` — Menu category metadata

| Column          | Type      | Notes                                            |
| --------------- | --------- | ------------------------------------------------ |
| `id`            | `string`  | PK (UUID)                                        |
| `restaurant_id` | `string`  | FK → `parameters.restaurant_id`                  |
| `name`          | `string`  | Category name (unique per restaurant)            |
| `type`          | `string`  | `predefined` or `custom`                         |
| `created_at`    | `string`  | Timestamp                                        |

When a restaurant has no categories, `MenuManagement` auto-seeds 24 predefined categories (Appetizers, Main Course, Burgers, Pizza, Sandwiches, Salads, Soups, Desserts, Beverages, Hot Drinks, Cold Drinks, Snacks, Breakfast, Lunch, Dinner, Vegetarian, Non-Vegetarian, Vegan, Seafood, Chinese, Indian, Italian, Mexican, Continental). Custom categories can be added and deleted.

### `orders` — Completed orders

| Column                 | Type      | Notes                                                              |
| ---------------------- | --------- | ------------------------------------------------------------------ |
| `id`                   | `number`  | PK (auto-increment)                                                |
| `restaurant_id`        | `string`  | FK → `parameters.restaurant_id`                                    |
| `razorpay_order_id`    | `string?` | Razorpay order ID; for cash orders `cash_<timestamp>` is fabricated |
| `razorpay_payment_id`  | `string?` | Razorpay payment ID; for cash `cash_payment_<timestamp>`           |
| `items`                | `json[]`  | `{ name, price, quantity, options?, notes? }[]` snapshot           |
| `subtotal`             | `number`  | Sum of item prices before tax                                      |
| `tax`                  | `number`  | `tax_rate%` of subtotal (rounded)                                  |
| `total`                | `number`  | `subtotal + tax`                                                   |
| `customer_name`        | `string?` | `Walk-in` for quick orders                                         |
| `customer_phone`       | `string?` | `0000000000` for quick orders                                      |
| `customer_email`       | `string?` | Optional                                                           |
| `payment_method`       | `string`  | `online` or `cash`                                                 |
| `status`               | `string`  | `pending` → `in_progress` → `completed` / `cancelled`              |
| `order_type`           | `string`  | Always `customer` (set by `createOrder`)                           |
| `created_at`           | `string`  | Timestamp                                                          |
| `updated_at`           | `string`  | Timestamp (touched on status change)                               |

### `subscription_plans` — Subscription plans

| Column          | Type      | Notes                                                            |
| --------------- | --------- | ---------------------------------------------------------------- |
| `id`            | `string`  | PK (UUID)                                                        |
| `name`          | `string`  | Display name (e.g. `1 Month`)                                    |
| `duration_days` | `number`  | Billing period length                                            |
| `price`         | `number`  | Price in `currency`                                              |
| `currency`      | `string`  | ISO currency of the plan price (default `INR`)                   |
| `country_code`  | `string`  | ISO country (default `IN`; migration 0004)                       |
| `plan_code`     | `string?` | Stable internal code, e.g. `MONTHLY` or auto-generated `PLANXXXXXX` |
| `restaurant_id` | `string?` | `NULL` = global plan; otherwise scoped to one restaurant         |
| `is_active`     | `boolean` | Only active plans are offered to restaurants (default `true`)    |
| `created_at`    | `string`  | Timestamp                                                        |

### `subscriptions` — One active row per restaurant normally (keeps history)

| Column                    | Type      | Notes                                                          |
| ------------------------- | --------- | -------------------------------------------------------------- |
| `id`                      | `string`  | PK (UUID)                                                      |
| `restaurant_id`           | `string`  | FK → `parameters.restaurant_id`                                |
| `plan_id`                 | `string?` | FK → `subscription_plans.id`                                   |
| `status`                  | `string`  | `none`, `active`, or `expired`                                 |
| `subscription_start`      | `string?` | Legacy start column (0002)                                     |
| `subscription_end`        | `string?` | Legacy end column (0003)                                       |
| `current_period_start`    | `string?` | Current billing period start (0005)                            |
| `current_period_end`      | `string?` | Current billing period end (0005) — the effective expiry       |
| `next_billing_date`       | `string?` | Next billing date (0005)                                       |
| `cancelled_at`            | `string?` | Cancellation timestamp (0005)                                  |
| `payment_status`          | `string?` | `completed` on successful verification/webhook (0005)          |
| `razorpay_order_id`       | `string?` | Razorpay order ID                                              |
| `razorpay_payment_id`     | `string?` | Razorpay payment ID                                            |
| `razorpay_signature`      | `string?` | Payment HMAC signature (0003)                                  |
| `razorpay_subscription_id`| `string?` | Razorpay subscription ID (0005)                                |
| `created_at`              | `string`  | Timestamp                                                      |
| `updated_at`              | `string?` | Timestamp (0005)                                               |

### `payment_history` — One row per recorded payment

| Column                   | Type      | Notes                                              |
| ------------------------ | --------- | -------------------------------------------------- |
| `id`                     | `string`  | PK (UUID)                                          |
| `subscription_id`        | `string?` | FK → `subscriptions.id`                            |
| `payment_method_id`      | `string?` | FK-ish → `payment_methods.name`                    |
| `amount`                 | `number?` | Charged amount                                     |
| `currency`               | `string`  | Charged currency (default `INR`)                   |
| `status`                 | `string`  | `captured`/`completed`                             |
| `payment_gateway_id`     | `string?` | Razorpay payment ID                                |
| `payment_gateway_response`| `string?` | JSON blob (order id, signature)                    |
| `billing_period_start`   | `string?` | Period start                                       |
| `billing_period_end`     | `string?` | Period end                                         |
| `created_at`             | `string`  | Timestamp                                          |
| `updated_at`             | `string?` | Timestamp                                          |

### `payment_methods` — Payment method lookup (0005)

| Column      | Type      | Notes                                         |
| ----------- | --------- | --------------------------------------------- |
| `id`        | `string`  | PK (UUID)                                     |
| `name`      | `string`  | Unique — seeded `card`, `netbanking`, `upi`, `cash` |
| `is_active` | `boolean` | Default `true`                                |
| `created_at`| `string`  | Timestamp                                     |

### `profiles` — User profiles (0005; currently not used by the app)

`id`, `email`, `full_name`, `role`, `restaurant_id`, `trial_start`, `trial_end`, `trial_used`, `ad_free_trial_used`, `ad_free_trial_end`, `created_at`.

### `subscription_notifications` — Subscription event notifications (0005; currently not used by the app)

`id`, `subscription_id`, `restaurant_id`, `type`, `title`, `message`, `is_read`, `created_at`.

## Storage

- **Bucket:** `menu-images` (public read)
- **Path:** `<restaurant_id>/<timestamp>.<ext>` — uploaded by `ImageUpload.tsx` via the anon key.
- Uploads are capped at 5 MB client-side.
- The `ImageUpload` component falls back to a pasted URL if upload fails.

## Row-Level Security (RLS)

The migrations enable RLS but add **open anon policies** (`for select/insert/update/delete to anon, authenticated using (true)`), matching the rest of the schema. The app queries with the Supabase anon key directly, so RLS does **not** restrict access in practice. Any client can therefore read or modify any restaurant's data while these open policies are in place. See [SECURITY.md](SECURITY.md) for the full risk analysis.
