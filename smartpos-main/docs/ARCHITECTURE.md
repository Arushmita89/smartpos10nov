# Architecture

## Overview

SmartPOS is a client-rendered Next.js application backed by Supabase. Most application data (restaurants, menu items, categories, orders) is stored in Supabase PostgreSQL and accessed **directly from the browser** using the Supabase anon key.

Server-side API routes are used where secrets must not reach the browser:

- **Razorpay** order creation (`/api/create-order`, `/api/subscription/create`) so the Razorpay key secret stays server-side.
- **Subscription & trial** logic (`/api/subscription/status`, `/api/subscription/verify`, `/api/trial/activate`) using the Supabase **service-role key**.
- **Owner/admin panel** endpoints (`/api/admin/*`) gated by the owner login.
- **Razorpay webhook** verification (`/api/webhooks/razorpay`).

Authentication is **not** Supabase Auth; it is a custom email/password system on the `parameters` table plus role accounts in the `users` table (see [SECURITY.md](SECURITY.md) for implications).

## High-Level Data Flow

```
┌───────────────────────┐        ┌────────────────────┐        ┌──────────────────────┐
│  Browser (React/Next) │ ─────► │  Supabase REST API │ ─────► │ PostgreSQL (Supabase) │
│                       │ ◄───── │  (anon key)        │ ◄───── │ parameters / users /  │
│                       │        │                    │        │ menu / categories /   │
│  Razorpay Checkout.js │ ─────► │  Razorpay API      │        │ orders / subscription │
└───────────────────────┘        └────────────────────┘        │ plans / subscriptions │
        │                               ▲                       │ / payment_history      │
        │                               │                       │ Storage: menu-images  │
        └── server API routes ──────────┘   (Razorpay secret +   └──────────────────────┘
             /api/create-order              service-role key)
             /api/subscription/*
             /api/admin/*
             /api/webhooks/razorpay
```

1. The user signs in/up via `AuthContext` → the restaurant row is fetched from `parameters`, and `smartpos_restaurant_id` (and `smartpos_user_id` for staff) is stored in `localStorage`.
2. On app load, `AuthContext` restores the session by reading `localStorage`, re-fetching the `parameters` row (and the `users` row if a `smartpos_user_id` is present), then computing the subscription status via `/api/subscription/status`.
3. If the restaurant has no active subscription/trial (and is not the owner account), the app shows the subscription lock; if the user is signed out or the plan was just purchased, the `/subscription` page handles plan selection.
4. The POS store (`lib/store.ts`) loads products from the `menu` table for the active restaurant.
5. In Customer Mode, the cart total + tax is sent to `/api/create-order`, which creates a Razorpay order using the server-side secret; the Checkout popup completes the payment.
6. On payment success (or for cash orders), the order is inserted into `orders` via `createOrder()`.
7. Restaurant Mode components (orders, analytics, settings, users, kitchen) read/write the same Supabase tables directly.
8. Subscription payments go through `/api/subscription/create` → Razorpay Checkout → `/api/subscription/verify` (signature-checked) → `subscriptions` + `payment_history` rows. The Razorpay webhook can also apply the same state change server-side.

## Folder Structure

```
smartpos-main/
├── app/                          # Next.js App Router
│   ├── layout.tsx                # Root layout, wraps app in AuthProvider + Toaster
│   ├── page.tsx                  # Landing/auth page (login, signup, migrate, forgot)
│   ├── globals.css               # Tailwind + shadcn design tokens
│   ├── admin/page.tsx            # Owner admin panel (users / subscriptions / payments / plans)
│   ├── owner/plans/page.tsx      # Owner "Plan Value Change" screen (PlanCodesManager)
│   ├── subscription/page.tsx     # Plan selection + Razorpay checkout
│   ├── payment-success/page.tsx  # Post-payment confirmation + redirect
│   ├── payment-failed/page.tsx   # Payment failure notice
│   ├── api/
│   │   ├── create-order/route.ts         # POST — Razorpay order for POS checkout
│   │   ├── send-receipt-email/route.ts   # POST — receipt by SMTP
│   │   ├── subscription/
│   │   │   ├── create/route.ts           # POST — Razorpay order for a plan
│   │   │   ├── verify/route.ts           # POST — verify payment, activate subscription
│   │   │   ├── status/route.ts           # GET  — subscription status for a restaurant
│   │   │   └── plans/route.ts            # GET  — active plans for a restaurant's currency
│   │   ├── trial/activate/route.ts       # POST — activate the 1-day free trial
│   │   ├── admin/
│   │   │   ├── _auth.ts                  # assertOwner() guard (owner login check)
│   │   │   ├── users/route.ts            # GET — all restaurants + subscription state
│   │   │   ├── payments/route.ts         # GET — payment history
│   │   │   ├── plans/route.ts            # GET/POST/PATCH/DELETE — plan CRUD
│   │   │   └── activate/route.ts         # PATCH — activate/deactivate/extend subscriptions
│   │   └── webhooks/razorpay/route.ts    # POST — webhook payment verification
│   └── features/
│       ├── analytics/Analytics.tsx        # Sales reports & export
│       ├── customer-mode/CustomerMode.tsx # Self-order POS with payment + receipt
│       ├── dashboard/Dashboard.tsx        # Main app shell (sidebar, modes, sections)
│       ├── kitchen-mode/KitchenMode.tsx   # Kitchen order screen
│       ├── menu-management/MenuManagement.tsx # Menu CRUD + categories + images + options
│       ├── order-management/OrderManagement.tsx # Order tracking & status updates
│       └── owner/PlanCodesManager.tsx     # Owner plan-code / pricing manager
├── components/
│   ├── auth/MPINAuth.tsx         # 4-digit MPIN gate for Restaurant Mode
│   ├── customer/CustomerMode.tsx # Re-export of app/features/customer-mode
│   ├── kitchen/KitchenMode.tsx   # Re-export of app/features/kitchen-mode
│   ├── subscription/SubscriptionLocked.tsx # Lock screen when no active plan/trial
│   ├── dashboard/                # Re-exports of feature components
│   │   ├── UserManagement.tsx    # Staff account editor (admin)
│   │   ├── RestaurantDashboard.tsx  # Settings editor
│   │   └── RestaurantOrdering.tsx   # Walk-in "Order Now" screen
│   └── ui/                       # shadcn/ui components (button, card, dialog, table, ...)
│       ├── ConfirmationDialog.tsx
│       ├── ImageUpload.tsx       # Uploads to Supabase Storage bucket `menu-images`
│       └── LoadingSpinner.tsx
├── contexts/
│   └── AuthContext.tsx           # Auth provider + useAuth() hook
├── hooks/
│   └── use-toast.ts              # shadcn toast hook (unused by main app; app uses react-hot-toast)
├── lib/
│   ├── store.ts                  # Zustand POS store (products, cart, orders)
│   ├── supabase.ts               # Supabase client + TypeScript Database type
│   ├── subscription.ts           # buildSubscriptionStatus() + helpers
│   ├── owner.ts                  # isOwner() — identifies the Alta Software owner login
│   ├── currency.ts               # getExchangeRates() / convertAmount() (open.er-api.com)
│   └── utils.ts                  # cn(), formatCurrency(), formatDate()
├── supabase/
│   └── migrations/               # 0001..0008 SQL migrations (users, subscription, options, currency)
├── public/images/                # Static assets
├── .env                          # Environment variables (see SETUP.md)
├── next.config.mjs
├── tailwind.config.ts
├── tsconfig.json                 # Path alias @/* -> ./*
└── components.json               # shadcn/ui config
```

## Key Modules

### `lib/supabase.ts`
Creates the Supabase client from `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` and exports a hand-written `Database` TypeScript type describing the tables the app touches (`parameters`, `users`, `menu`, `categories`, `orders`, `subscription_plans`, `subscriptions`, `payment_history`). The type and the runtime queries are maintained manually and can drift (e.g., `orders` item snapshots now carry `options`/`notes`; `parameters` rows carry a `password` column not declared in the type).

### `contexts/AuthContext.tsx`
Custom auth context that:
- Restores the session from `localStorage` on mount (`smartpos_restaurant_id` + `smartpos_user_id`).
- Provides `signInWithEmail`, `signUp`, `migrate`, `resetPassword`, `signOut`, `updateRestaurant`, `refreshSubscription`, and staff management (`addUser`, `updateUser`, `toggleUserActive`).
- Signs in against `users` first, then falls back to `parameters` (auto-migrating `parameters`-only accounts into `users` as role `admin`).
- Generates unique `RESTXXXXXX` restaurant IDs (random 6 chars) with a uniqueness retry loop.
- Gives new sign-ups a 30-day trial (`trial_start`/`trial_end`/`trial_used`).
- Computes the subscription state through `computeSubscription()`; the owner account (`isOwner`) is always unlocked.
- Stores passwords/MPIN as **plaintext** (see [SECURITY.md](SECURITY.md)).

### `lib/subscription.ts`
`buildSubscriptionStatus()` derives a `SubscriptionStatus` from the restaurant's trial fields and the latest `subscriptions` row (via the embedded `subscription_plans.name`). Produces `status: active | trial | expired | none`, `isLocked`, remaining days, and the plan name. Used by the status API route and by `AuthContext` for the owner-account shortcut.

### `lib/owner.ts`
`isOwner(loginName)` compares against the `NEXT_PUBLIC_ALTASOFTWARE_OWNER_LOGIN` env value (lowercased). Owner accounts get an owner-only dashboard (Admin Panel + Plan Value Change) and are exempt from subscription locking. The server-side admin routes independently re-check `ALTASOFTWARE_OWNER_LOGIN` via `assertOwner()`.

### `lib/currency.ts`
`getExchangeRates()` fetches USD-base rates from `https://open.er-api.com/v6/latest/USD` (cached in-memory for 6 h, tolerant of failures). `convertAmount()` converts between currency codes and is used by the subscription plans/create routes to show and charge plans in a restaurant's currency.

### `lib/store.ts` (Zustand)
Global POS state:
- `products` — menu items fetched by `fetchProducts(restaurantId)` / `refreshProducts()`.
- `cart` — `{id, name, price, quantity, options?, notes?}[]` with `addToCart`, `updateCartQuantity`, `clearCart`, `getCartTotal`.
- `createOrder()` — inserts into `orders` with `status: 'pending'` and `order_type: 'customer'`.

Tax is computed at the component level (`Math.round(cartTotal * taxRate/100)`) using the restaurant's `tax_rate` (default 18%).

### `app/features/dashboard/Dashboard.tsx`
The authenticated application shell:
- Mode switching between **Restaurant Mode**, **Customer Mode**, and **Kitchen Mode**.
- Restaurant Mode is gated by `MPINAuth`; Customer Mode is publicly reachable from the header.
- Sidebar sections for role `admin`: POS, Order Now, Order Status, Menu Management, Inventory, Customers, Reports, Settings, Users. **Inventory and Customers are still placeholders.**
- Role `kitchen` → renders `KitchenMode` only; role `attendant` → renders `CustomerMode` only.
- Owner accounts (`isOwner`) see an owner home with **Admin Panel** (`/admin`) and **Plan Value Change** (`/owner/plans`) entries.

### Owner / Admin panels
- `/admin` — owner-only dashboard with tabs: **Users** (all restaurants + subscription state, deactivate), **Subscriptions**, **Payments** (payment history + revenue), **Plans** (plan CRUD). All data flows through `/api/admin/*` endpoints guarded by `assertOwner`.
- `/owner/plans` — owner-only **Plan Value Change** screen (`PlanCodesManager`) for CRUD on `subscription_plans`: name, duration, price, currency, country, `plan_code` (auto-generated `PLANXXXXXX`), optional restaurant-scoping, active flag, search/filter.

### Payment Flow (Customer Mode)
1. `CustomerMode` filters available products (by category + search text), maintains the cart, and collects customer info (name, phone, email). Items can carry customization `options` and free-text `notes` (remarks).
2. `PaymentModal` offers **Pay Online** (Razorpay) or **Pay with Cash**.
3. Online: `POST /api/create-order` creates a Razorpay order; the popup handles the payment; the `handler` returns `razorpay_order_id` / `razorpay_payment_id`.
4. Cash: the staff enters the cash received; change is computed.
5. `handlePaymentSuccess` inserts the order via `createOrder()` and shows a printable `ReceiptModal`.
6. For cash orders the app fabricates `cash_<timestamp>` / `cash_payment_<timestamp>` IDs to satisfy the Razorpay fields.

### Subscription Payment Flow
1. `/subscription` loads plans from `/api/subscription/plans` (filtered to the restaurant's currency, converting others).
2. `handleSubscribe` calls `/api/subscription/create` → Razorpay Checkout.
3. On success, `/api/subscription/verify` validates the HMAC signature and upserts an `active` subscription (`current_period_start`/`end`, `next_billing_date`) plus a `payment_history` row.
4. The Razorpay webhook (`/api/webhooks/razorpay`) performs the same activation for `payment.captured` / `subscription.charged` / `subscription.activated` events.

## Design Notes / Known Divergences

- Components live in two places: `app/features/**` (real implementations) and `components/dashboard/**` (thin re-exports). `components/dashboard/RestaurantDashboard.tsx`, `components/dashboard/UserManagement.tsx`, and `components/dashboard/RestaurantOrdering.tsx` are implemented directly in `components/`.
- `app/features/*` are full `'use client'` components and are not route segments (no `page.tsx`), so they render only through `Dashboard` (or a wrapper component).
- Both `react-hot-toast` (app-wide) and shadcn's `sonner`/`use-toast` are bundled; the app uses `react-hot-toast`.
- Next.js metadata is set in `app/layout.tsx`; `next.config.mjs` is empty.
- Owner detection uses a **client-exposed** env value (`NEXT_PUBLIC_ALTASOFTWARE_OWNER_LOGIN`) for UI decisions; the authoritative check happens server-side in `assertOwner`.
- The `payments` table from migration 0002 is superseded by `payment_history` (0005); the app reads/writes `payment_history`.
