# Features

This guide documents each feature of the application, where the code lives, and how it behaves.

## 1. Authentication & Onboarding

**Files:** `app/page.tsx`, `contexts/AuthContext.tsx`

The landing page is a client-side auth portal with Login, Sign Up, Migrate, and Forgot Password.

### Login
- Email + password are matched against `users` first (role accounts), then against `parameters.login_name` / `parameters.password` (plaintext, exact match).
- Inactive staff accounts are rejected (`This account has been deactivated. Contact your admin.`).
- `parameters`-only accounts are auto-migrated into `users` as `admin` on their first login.
- On success, `smartpos_restaurant_id` and `smartpos_user_id` are written to `localStorage` and the dashboard renders.
- If the restaurant has no active subscription/trial (and isn't the owner), the login redirects to `/subscription?restaurantId=...&email=...`.

### Sign Up
- Captures restaurant name (required), GST number, phone, **currency (required)** + country code (auto-derived), tax rate (default 18), 3 address lines, up to 4 owners, login email/password (min 6 chars), and a 4-digit MPIN (default `1234`).
- Generates a unique `RESTXXXXXX` restaurant ID (retries up to 10 times on collision).
- Inserts a row into `parameters` with a **30-day free trial** (`trial_start`/`trial_end`, `trial_used=true`); duplicate `login_name` yields `An account with this email already exists`.
- Creates a matching `users` row with role `admin`.

### Migrate
- For legacy accounts that only have a `restaurant_id` (no email/password yet).
- Validates the restaurant ID exists and the email is unused, then sets `login_name` + `password` (and creates a `users` row).

### Forgot Password
- Verifies the email exists (in `users` or `parameters`), then overwrites the password with the new value. (No email delivery is involved.)

**Session restoration:** On mount, `AuthContext` reads `smartpos_restaurant_id` / `smartpos_user_id` from `localStorage`, re-fetches the rows, and computes subscription status. There is no token expiry or server-side session.

## 2. Application Shell (Dashboard)

**File:** `app/features/dashboard/Dashboard.tsx`

- Mode switching between **Restaurant Mode**, **Customer Mode**, and **Kitchen Mode**.
- Sidebar sections for role `admin`: **POS**, **Order Now**, **Order Status**, **Menu Management**, **Inventory** (placeholder), **Customers** (placeholder), **Reports**, **Settings**, **Users**.
- Role `kitchen` sees only Kitchen Mode; role `attendant` sees only Customer Mode.
- Owner accounts see an owner home with **Admin Panel** (`/admin`) and **Plan Value Change** (`/owner/plans`).
- Mobile: off-canvas sidebar + hamburger menu; a floating cart button appears in ordering screens.
- Header contains "Customer Mode" / "Kitchen Mode" quick-access buttons.
- Sign-out clears `localStorage` and returns to the auth page.

### MPIN Gate
- `components/auth/MPINAuth.tsx` overlays a 4-digit MPIN prompt when entering Restaurant Mode.
- The MPIN is compared against `parameters.mpin` (default `1234`; shown as a hint on the lock screen).
- Note: on first load the dashboard auto-authenticates as restaurant mode, so the MPIN prompt effectively only appears when returning from Customer Mode.

## 3. Subscription Billing & Access Gating

**Files:** `app/subscription/page.tsx`, `lib/subscription.ts`, `components/subscription/SubscriptionLocked.tsx`, `app/api/subscription/*`

- **Trial:** New sign-ups receive 30 days free (`parameters.trial_start/end/used`). A `/api/trial/activate` route also supports a 1-day ad-free trial activation.
- **Status:** On login/session restore, `AuthContext` calls `/api/subscription/status` (or uses the owner shortcut in `lib/subscription.ts`) to compute `status: active | trial | expired | none`, `isLocked`, remaining days, and plan name.
- **Lock:** When `subscription.isLocked`, `app/page.tsx` renders `SubscriptionLocked` instead of the dashboard; the user is sent to `/subscription`.
- **Plans:** `/subscription` loads plans from `/api/subscription/plans`, which returns plans matching the restaurant's currency, or converts other currencies live (via `lib/currency.ts`, open.er-api.com).
- **Checkout:** Choosing a plan calls `/api/subscription/create` (Razorpay order in the restaurant's currency converted to INR for charging) → Razorpay Checkout → `/api/subscription/verify` (HMAC-checked) activates the subscription (`status: active`, period dates, `payment_status: completed`) and records a `payment_history` row.
- **Webhook:** `/api/webhooks/razorpay` also activates subscriptions for `payment.captured` / `subscription.charged` / `subscription.activated` events.
- Success/failure pages (`/payment-success`, `/payment-failed`) confirm the outcome and redirect back to the login/dashboard.

## 4. Customer Mode (Self-Ordering POS)

**File:** `app/features/customer-mode/CustomerMode.tsx`

Flow: browse → cart → customer info → payment → receipt.

- **Menu browse:** only `available` items shown; category chips (`All` + categories derived from menu data); a **search box** filters items by name/description; responsive grid with images (hidden on load error), name, description, price, and item `options`.
- **Cart:** side panel on desktop, slide-out sheet on mobile. Quantity +/- controls, per-line totals, **selected customization options and free-text remarks (notes)**, subtotal, tax (restaurant `tax_rate`), grand total, "Place & Pay", "Clear Cart".
- **Item customization:** clicking an item opens an options dialog showing the restaurant's default options (`parameters.item_options`) plus the item's own `options`; the customer picks options and can type a remark. Both are stored on the order line.
- **Customer info modal:** name + 10-digit phone required, email optional.
- **Payment modal:**
  - **Pay Online** → loads Razorpay Checkout script, calls `/api/create-order`, opens the popup (UPI / Card / Net Banking). On success, captures `razorpay_order_id` / `razorpay_payment_id`.
  - **Pay with Cash** → enter cash received; change computed and displayed; validation rejects amounts below the total.
- **Order creation:** `createOrder()` (in `lib/store.ts`) inserts into `orders` with `status: 'pending'`, `order_type: 'customer'`, items `{ name, price, quantity, options, notes }`. Cash orders get fabricated `cash_<ts>` / `cash_payment_<ts>` IDs.
- **Receipt modal:** printable via `window.print()`, shows order #, date, customer details, line items (with options/remarks), subtotal, tax, total, payment method, cash received, and change.
- **Receipt email:** `/api/send-receipt-email` emails the receipt to the customer via SMTP.

## 5. Order Now (Walk-in / Quick Orders)

**File:** `components/dashboard/RestaurantOrdering.tsx`

- Same menu/category browse and cart behavior as Customer Mode but simplified.
- Places a cash order immediately with `customer_name: 'Walk-in'`, `customer_phone: '0000000000'`, `payment_method: 'cash'`.
- No customer info, payment, or receipt flow.

## 6. Order Management

**File:** `app/features/order-management/OrderManagement.tsx`

- Loads all orders for the restaurant, newest first.
- Stats cards: total orders, pending orders, completed today.
- Filter by status (`all`, `pending`, `in_progress`, `completed`, `cancelled`) + manual refresh button.
- Each order card shows id, timestamp, payment method, customer, itemized breakdown (including options/remarks), subtotal/tax/total, and "last updated".
- Status actions:
  - `pending` → **Start Preparing** (`in_progress`)
  - `in_progress` → **Mark Complete** (`completed`)
  - `pending` / `in_progress` → **Cancel** (`cancelled`)
- Status colors: pending (yellow), in_progress (blue), completed (green), cancelled (red).

## 7. Kitchen Mode

**File:** `app/features/kitchen-mode/KitchenMode.tsx`

- Dedicated screen for `kitchen`-role staff (or any admin via the Kitchen Mode button).
- Shows incoming orders and lets kitchen staff update order statuses (`pending` → `in_progress` → `completed`).
- Includes a back/sign-out action (`onBack`).

## 8. Menu Management

**File:** `app/features/menu-management/MenuManagement.tsx`

- **Menu item CRUD:**
  - Add/edit via modal form: name (required), category (required, selectable or free-text custom), price (required, > 0), preparation time (default 15 min), description, **customization options** (per-item), image (upload to Supabase Storage or paste URL), available toggle.
  - Delete with a native `confirm()` prompt.
  - Search by name/description and filter by category.
- **Category management:**
  - Auto-seeds 24 predefined categories when none exist.
  - Add custom categories; delete any category (via `ConfirmationDialog`).
- Menu cards show image (or placeholder), availability badge, category, prep time, price, and edit/delete actions.
- Uses `LoadingSpinner` during loads and a `ConfirmationDialog` for category deletion.

## 9. Analytics / Reports

**File:** `app/features/analytics/Analytics.tsx`

- Date filters: Today / This Week / This Month / This Year / All Time (custom range fields exist but the UI does not surface a date picker).
- KPI cards: **Total Sales**, **Total Orders**, **Avg Order Value**.
- **Popular Items** — top 10 by quantity sold, with revenue.
- **Sales by Date** — last 10 days with sales + order counts.
- **All Orders table** — up to 50 rows (see note), with order id, date, customer, status, total.
- **Export:** CSV (real), Excel (a CSV saved with an `.xlsx` extension and `text/csv`-like MIME), and PDF (a `.txt` text report). These are client-side downloads; "Excel"/"PDF" formats are approximations.

> Notes: tax for KPIs is included in order totals; the table intentionally caps at 50 rows with a hint to export for full data.

## 10. Settings (Restaurant Profile)

**File:** `components/dashboard/RestaurantDashboard.tsx`

- Edits restaurant name, GST, phone, tax rate, address, owners, login email, new password (optional), and MPIN.
- "Save Changes" runs a single `parameters` update and refreshes the in-memory restaurant via `updateRestaurant`.
- Shows the read-only `restaurant_id`.

## 11. User Management (Staff Accounts)

**File:** `components/dashboard/UserManagement.tsx`

- Admin-only section: lists staff accounts for the restaurant.
- Add staff (name, email, password, role: `admin` / `kitchen` / `attendant`), edit name/email/password/role, and toggle account active/inactive.
- Powered by `AuthContext` (`addUser`, `updateUser`, `toggleUserActive`).

## 12. Owner Panels

**Files:** `app/admin/page.tsx`, `app/owner/plans/page.tsx`, `app/features/owner/PlanCodesManager.tsx`, `lib/owner.ts`

Access is restricted to the login configured via `NEXT_PUBLIC_ALTASOFTWARE_OWNER_LOGIN`; server routes additionally enforce it via `assertOwner` (`ALTASOFTWARE_OWNER_LOGIN` + `x-login-name`/`x-restaurant-id` headers). Owner accounts are exempt from subscription locking.

- **Admin Panel** (`/admin`) — tabs:
  - **Users**: all restaurants with email, owner name, created date, subscription status/end and plan; search/filters; deactivate a restaurant's subscription.
  - **Subscriptions**: subscription status overview.
  - **Payments**: payment history with amounts, status, dates, and total revenue.
  - **Plans**: plan CRUD with search and country/currency/restaurant filters.
- **Plan Value Change** (`/owner/plans`) — the full plan-code manager:
  - Create/edit/delete plans: name, duration (days), price, currency, country code, optional `plan_code` (auto-generated `PLANXXXXXX`), optional restaurant scoping, active flag.
  - Filters by country, currency, and restaurant; searchable.

## 13. Placeholder Features

- **Inventory Management** — placeholder.
- **Customer Management** — placeholder.

## 14. Payments (Razorpay)

**Files:** `app/api/create-order/route.ts`, `app/api/subscription/create/route.ts`, Customer Mode `PaymentModal`, `/subscription` page

- **Online (orders):** server-created Razorpay order → Checkout popup (UPI/card/netbanking) → payment IDs stored on the order.
- **Online (subscriptions):** server-created Razorpay order for the plan price (converted to INR) → Checkout popup → signature-verified activation + `payment_history`.
- **Webhook:** `/api/webhooks/razorpay` verifies `payment.captured` / `subscription.*` events and activates subscriptions.
- **Cash:** staff-entered tendered amount with automatic change.
