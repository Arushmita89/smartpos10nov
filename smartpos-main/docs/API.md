# API

SmartPOS exposes API routes for Razorpay, subscription billing, the owner/admin panel, and receipt emails. Everything else talks to Supabase's REST API directly from the client with the anon key.

## Shared conventions

- Server routes that touch subscription/admin data use the Supabase **service-role key** (`SUPABASE_SERVICE_ROLE_KEY`) via a server-side `createClient` — never the anon key.
- `app/api/admin/*` routes are guarded by `assertOwner` (`app/api/admin/_auth.ts`), which requires `x-login-name` and `x-restaurant-id` headers matching the configured `ALTASOFTWARE_OWNER_LOGIN` owner account.

---

## `POST /api/create-order`

Creates a Razorpay **order** server-side so the Razorpay key secret never reaches the browser. Called by `PaymentModal` in Customer Mode before opening the Razorpay Checkout popup.

**Request body**

```json
{ "amount": 354 }
```

`amount` is the cart total including tax. The route converts it: `Math.round(amount * 100)`.

**Request headers**

| Header         | Value               |
| -------------- | ------------------- |
| `Content-Type` | `application/json`  |

**Success response** — `200 OK`, the Razorpay order object (`id`, `entity`, `amount`, `amount_paid`, `amount_due`, `currency: "INR"`, `receipt`, `status`, ...).

**Error responses**

| Status | Body                            | When                                                  |
| ------ | ------------------------------- | ----------------------------------------------------- |
| `500`  | `{ "error": "Razorpay keys not configured" }` | `NEXT_PUBLIC_RAZORPAY_KEY_ID` or `RAZORPAY_KEY_SECRET` missing |
| `4xx`  | `{ "error": "<razorpay message>" }` | Razorpay rejected the request (forwarded status)      |
| `500`  | `{ "error": "<message>" }`      | Unexpected server error                               |

---

## `POST /api/send-receipt-email`

Sends the order receipt to the customer's email via SMTP (free, Gmail app password). Called automatically by Customer Mode after a successful order.

**Request body**

```json
{
  "to": "customer@example.com",
  "subject": "Your SmartPOS Receipt - Order #1",
  "text": "SmartPOS Receipt\nOrder #1\n..."
}
```

**Error responses**

| Status | Body                                     | When                                    |
| ------ | ---------------------------------------- | --------------------------------------- |
| `400`  | `{ "error": "to, subject and text are required" }` | Missing fields            |
| `500`  | `{ "error": "SMTP credentials not configured" }` | `SMTP_USER` / `SMTP_PASS` missing |
| `500`  | `{ "error": "<message>" }`               | SMTP server error (e.g. bad app password) |

Uses `nodemailer` with `SMTP_HOST` (default `smtp.gmail.com`), `SMTP_PORT` (default `465`), and `SMTP_USER` / `SMTP_PASS` (Gmail app password).

---

## Subscription routes

### `POST /api/subscription/create`

Creates a Razorpay **order** for a subscription plan. Called by `/subscription` before Checkout.

**Request body**

```json
{ "planId": "uuid", "restaurantId": "RESTXXXXXX" }
```

- Loads the plan (`price`, `currency`) and the restaurant's `currency` with the service-role client.
- If the plan currency is not INR, the price is converted to INR (via `lib/currency.ts`, open.er-api.com) — Razorpay orders are always created in INR.
- Razorpay notes carry `restaurant_id`, `plan_id`, `plan_currency`, `restaurant_currency`.

**Success response** — `200 OK`:

```json
{ "orderId": "order_OXXXXXX", "amount": 35400, "currency": "INR", "razorpayKeyId": "rzp_test_..." }
```

**Error responses**

| Status | Body | When |
| ------ | ---- | ---- |
| `400`  | `{ "error": "planId and restaurantId are required" }` | Missing fields |
| `404`  | `{ "error": "Plan not found" }` | Unknown `planId` |
| `500`  | `{ "error": "Razorpay keys not configured" }` | Keys missing |
| `500`  | `{ "error": "Service role key not configured" }` | `SUPABASE_SERVICE_ROLE_KEY` missing |

### `POST /api/subscription/verify`

Verifies the Razorpay payment signature and activates the subscription. Called by the Checkout `handler`.

**Request body**

```json
{
  "razorpay_order_id": "order_OXXXXXX",
  "razorpay_payment_id": "pay_OXXXXXX",
  "razorpay_signature": "hex...",
  "restaurantId": "RESTXXXXXX",
  "planId": "uuid",
  "amount": 354,
  "currency": "INR"
}
```

- Recomputes `HMAC-SHA256(razorpay_key_secret, orderId|paymentId)` and rejects mismatches.
- Upserts the latest `subscriptions` row to `status: active`, `payment_status: completed`, period start/end (`now` + `duration_days`), `next_billing_date`, Razorpay IDs.
- Inserts a `payment_history` row.

**Success response** — `200 OK`: `{ "success": true, "expiresAt": "...", "planName": "1 Month" }`.

**Error responses**

| Status | Body | When |
| ------ | ---- | ---- |
| `400`  | `{ "error": "Missing payment verification fields" }` | Missing payment fields |
| `400`  | `{ "error": "Invalid payment signature" }` | HMAC mismatch |
| `404`  | `{ "error": "Plan not found" }` | Unknown `planId` |
| `500`  | `{ "error": "Razorpay key secret not configured" }` | Secret missing |

### `GET /api/subscription/status?restaurantId=RESTXXXXXX`

Returns the computed subscription status for a restaurant. Called by `AuthContext` on session restore and by `/subscription`.

**Success response** — `200 OK`:

```json
{
  "hasActiveSubscription": true,
  "hasActiveTrial": false,
  "trialUsed": true,
  "isLocked": false,
  "status": "active",
  "trialEnd": null,
  "trialDaysRemaining": 0,
  "subscriptionEnd": "2026-09-11T...",
  "subscriptionDaysRemaining": 30,
  "planName": "1 Month",
  "subscriptionId": "uuid"
}
```

**Error responses**

| Status | Body | When |
| ------ | ---- | ---- |
| `400`  | `{ "error": "restaurantId is required" }` | Missing param |
| `404`  | `{ "error": "Restaurant not found" }` | Unknown restaurant |
| `500`  | `{ "error": "Service role key not configured" }` | Key missing |

### `GET /api/subscription/plans?restaurantId=RESTXXXXXX`

Returns the active plans offered to a restaurant. Plans whose currency matches the restaurant's currency are returned as-is; others are converted to the restaurant's currency via FX rates.

**Success response** — `200 OK`:

```json
{
  "restaurant_id": "RESTXXXXXX",
  "currency": "INR",
  "plans": [
    {
      "id": "uuid",
      "name": "1 Month",
      "duration_days": 30,
      "price": 299,
      "currency": "INR",
      "country_code": "IN",
      "plan_code": "PLANXXXXXX",
      "display_price": 299,
      "display_currency": "INR",
      "converted": false
    }
  ]
}
```

---

## `POST /api/trial/activate`

Activates a 1-day free trial for a restaurant that has not used it.

**Request body**

```json
{ "restaurantId": "RESTXXXXXX" }
```

**Success response** — `200 OK`: `{ "success": true, "trialEnd": "..." }`.

**Error responses**

| Status | Body | When |
| ------ | ---- | ---- |
| `400`  | `{ "error": "Free trial has already been used" }` | `trial_used` and expired |
| `400`  | `{ "error": "Free trial is not available for this account..." }` | No trial columns |
| `404`  | `{ "error": "Restaurant not found" }` | Unknown restaurant |

---

## Admin routes (owner only)

All `app/api/admin/*` routes require `Content-Type: application/json`, `x-login-name`, and `x-restaurant-id` headers identifying the owner account (validated by `assertOwner`). Non-owner requests get `403 { "error": "Forbidden: owner access only" }`; missing server config yields `500`.

### `GET /api/admin/users`

Lists all restaurants (except the owner's own account) with subscription state, newest first. Each item: `id` (restaurant_id), `email`, `full_name`, `role: 'admin'`, `created_at`, `subscription_status`, `subscription_end`, `plan_name`.

### `GET /api/admin/payments`

Lists `payment_history` rows, newest first, joined with restaurant identity (`user_email`). Returns `[]` if the table doesn't exist (graceful degradation).

### `GET /api/admin/plans` — query params `q`, `country`, `restaurantId`

Lists `subscription_plans` ordered by country then duration. `q` searches `name`/`plan_code`; `country` and `restaurantId` filter exactly.

### `POST /api/admin/plans`

Creates a plan. Body: `name`, `duration_days`, `price` (required); `currency` (default `INR`), `country_code` (default `IN`), `plan_code`, `restaurant_id`, `is_active`. Returns the created row (`201`).

### `PATCH /api/admin/plans`

Updates a plan. Body: `id` (required) plus any of the plan fields. Returns the updated row.

### `DELETE /api/admin/plans?id=<uuid>`

Deletes a plan. Returns `{ "success": true }`.

### `PATCH /api/admin/activate`

Manages a restaurant's subscription manually. Body:

```json
{ "restaurantId": "RESTXXXXXX", "action": "deactivate" }
```

Actions:
- `activate` — marks the latest subscription active for 30 days (creates one if missing).
- `deactivate` — sets the latest subscription status to `expired`.
- `extend` — adds `days` to `subscription_end` (legacy column).

> The admin UI currently exposes **deactivate**; the activate/extend actions are implemented in the route but temporarily disabled in `app/admin/page.tsx`.

---

## `POST /api/webhooks/razorpay`

Razorpay webhook endpoint. Verifies the `x-razorpay-signature` header against the raw body using `RAZORPAY_WEBHOOK_SECRET`, then for `payment.captured` / `subscription.charged` / `subscription.activated` events with `restaurant_id` / `plan_id` notes, activates the restaurant's subscription and records a `payment_history` row.

**Error responses**

| Status | Body | When |
| ------ | ---- | ---- |
| `500`  | `{ "error": "Webhook secret not configured" }` | `RAZORPAY_WEBHOOK_SECRET` missing or placeholder |
| `400`  | `{ "error": "Missing signature" }` | No signature header |
| `400`  | `{ "error": "Invalid webhook signature" }` | HMAC mismatch |

---

## Supabase REST (used directly by the client)

The following table operations are performed with the anon key:

| Resource      | Operations                                                                   |
| ------------- | ---------------------------------------------------------------------------- |
| `parameters`  | `select` (by `restaurant_id`, `login_name`), `insert`, `update` (by `restaurant_id` / `login_name`) |
| `users`       | `select` (by `id`, `login_name`), `insert`, `update` (by `id`), `update` (by `login_name`) |
| `menu`        | `select` (by `restaurant_id`), `insert`, `update` (by `id`), `delete` (by `id`) |
| `categories`  | `select` (by `restaurant_id`), `insert`, `delete` (by `restaurant_id` + `name`) |
| `orders`      | `select` (by `restaurant_id`, with `gte/lte created_at`), `insert`, `update status` (by `id`) |
| Storage       | `upload` / `getPublicUrl` on bucket `menu-images`                            |

## Future API surface

Planned/placeholder dashboard sections (Inventory, Customers) have no API routes yet.
