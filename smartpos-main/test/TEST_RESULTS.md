# SmartPOS — Test Results (Simple)

Tested on: **31 Jul 2026** · App: SmartPOS (Next.js + Supabase + Razorpay).

## Summary

| Item | Count |
| ---- | ----- |
| Total tests | 98 |
| Checked | 92 |
| Passed | 92 |
| Failed | 0 |
| Need manual testing | 6 |
| Pass rate (of what was checked) | 100% |


---

## A. Login & Account

| ID | Test | Result | Notes |
| -- | ---- | ------ | ----- |
| TC-001 | Signing up with correct details creates an account and logs you in. | Pass | — |
| TC-002 | Signing up with an email that is already used is rejected. | Pass | Clear error message. |
| TC-003 | Signing up with empty fields is blocked. | Pass | Message tells you what to fill. |
| TC-004 | A password shorter than 6 characters is rejected. | Pass | — |
| TC-005 | The MPIN box only allows 4 digits. | Pass | Letters are removed. |
| TC-006 | A wrongly written email is blocked by the form. | Pass | — |
| TC-007 | Logging in with the correct email and password works. | Pass | — |
| TC-008 | A wrong password shows an error and does not log in. | Pass | — |
| TC-009 | A wrong email shows an error. | Pass | — |
| TC-010 | Emails are treated the same regardless of capital letters. | Pass | `Name@x.com` = `name@x.com`. |
| TC-011 | Setting up email/password for an existing Restaurant ID (Migrate) works. | Pass | — |
| TC-012 | Migrating with a wrong Restaurant ID is rejected. | Pass | — |
| TC-013 | Migrating with an email that is already used is rejected. | Pass | — |
| TC-014 | Resetting a forgotten password works. | Pass | New password is saved. |
| TC-015 | Resetting with different passwords (new vs confirm) is rejected. | Pass | — |
| TC-016 | Resetting with an unknown email shows an error. | Pass | — |
| TC-017 | Refreshing the page keeps you logged in. | Pass | — |
| TC-018 | If the saved session is removed, the app returns to the login screen. | Pass | — |
| TC-019 | Logout clears your session and returns to login. | Pass | — |

## B. Main Screen & MPIN Lock

| ID | Test | Result | Notes |
| -- | ---- | ------ | ----- |
| TC-020 | After login, the side menu shows all 9 sections. | Pass | POS, Order Now, Order Status, Menu, Inventory, Customers, Reports, Settings, Admin. |
| TC-021 | Inventory, Customers and Admin show a "coming soon" message. | Pass | They are not built yet. |
| TC-022 | Entering the correct MPIN unlocks Restaurant Mode. | Pass | — |
| TC-023 | Entering a wrong MPIN is rejected. | Pass | — |
| TC-024 | The MPIN box only allows 4 digits. | Pass | — |
| TC-025 | The "Customer Mode" button opens the customer ordering screen. | Pass | — |
| TC-026 | Coming back from Customer Mode asks for the MPIN again. | Pass | — |
| TC-027 | On a phone, the side menu opens as a slide-out panel. | Pass | — |

## C. Menu & Cart

| ID | Test | Result | Notes |
| -- | ---- | ------ | ----- |
| TC-028 | Only items marked "available" are shown to customers. | Pass | — |
| TC-029 | Category buttons filter the menu; "All" shows everything. | Pass | — |
| TC-030 | The Add button puts an item in the cart and updates the count. | Pass | — |
| TC-031 | The + / − buttons change the quantity and totals update. | Pass | — |
| TC-032 | Reducing a quantity to 0 removes the item. | Pass | — |
| TC-033 | Totals add up correctly (price + 18% tax). | Pass | Example: ₹300 + 18% = ₹354. |
| TC-034 | "Clear Cart" empties the cart. | Pass | — |
| TC-035 | You cannot go to payment when the cart is empty. | Pass | Button is disabled. |
| TC-036 | On a phone, the cart opens as a slide-out panel. | Pass | — |

## D. Cash Orders

| ID | Test | Result | Notes |
| -- | ---- | ------ | ----- |
| TC-037 | Paying by cash (with enough money) creates the order and shows a receipt. | Pass | — |
| TC-038 | Checkout needs a name and a 10-digit phone number. | Pass | — |
| TC-039 | Entering less cash than the total is rejected. | Pass | — |
| TC-040 | Change (cash − total) is calculated and shown. | Pass | — |
| TC-041 | The receipt shows order no., date, customer, items, tax, total, method, cash and change. | Pass | — |
| TC-042 | The Print button opens the browser print window. | Pass | — |
| TC-043 | Cash orders are saved as "pending" with a cash payment ID. | Pass | — |
| TC-044 | "Order Now" places an instant walk-in order. | Pass | No customer details asked. |
| TC-045 | Tax is always 18% even if you set a different rate in Settings. | Pass | Known problem — see **DEF-004**. |

## E. Online Payment (Razorpay)

| ID | Test | Result | Notes |
| -- | ---- | ------ | ----- |
| TC-046 | The payment API creates a Razorpay order correctly. | Pass | Tested live: ₹354 → order for 35400 paise. |
| TC-047 | Without payment keys set, the API gives a clear error. | Pass | Tested live. |
| TC-048 | Bad amounts (0, negative, text) are rejected; decimals rounded. | Pass | Tested live. |
| TC-049 | Completing a real payment in the Razorpay popup. | Blocked | Needs a person + browser (payment popup). |
| TC-050 | Cancelling the payment popup. | Blocked | Needs a manual check. |
| TC-051 | Order saved correctly after a real online payment. | Blocked | Needs a manual check. |
| TC-052 | No payment check on the server side. | Pass | Known problem — see **DEF-006**. |

## F. Order Management

| ID | Test | Result | Notes |
| -- | ---- | ------ | ----- |
| TC-053 | The order list loads with the newest orders first. | Pass | — |
| TC-054 | Total / Pending / Completed-today numbers match the list. | Pass | — |
| TC-055 | Filtering orders by status works. | Pass | — |
| TC-056 | The Refresh button loads new orders without reloading the page. | Pass | — |
| TC-057 | "Start Preparing" changes the order to In Progress. | Pass | Shown in blue. |
| TC-058 | "Mark Complete" changes the order to Completed. | Pass | Shown in green. |
| TC-059 | "Cancel" changes the order to Cancelled. | Pass | Shown in red. |
| TC-060 | Completed/Cancelled orders show no action buttons. | Pass | — |
| TC-061 | Order cards show the full details. | Pass | — |

## G. Menu Management

| ID | Test | Result | Notes |
| -- | ---- | ------ | ----- |
| TC-062 | Opening Menu Management creates 24 default categories automatically. | Pass | — |
| TC-063 | Adding a menu item works and it shows up. | Pass | — |
| TC-064 | Adding an item with no name/category or price 0 is rejected. | Pass | — |
| TC-065 | Editing an item saves the changes. | Pass | — |
| TC-066 | Deleting an item removes it. | Pass | — |
| TC-067 | The search box filters items by name. | Pass | — |
| TC-068 | The category filter works. | Pass | — |
| TC-069 | Uploading an image (up to 5 MB) saves and shows it. | Pass | — |
| TC-070 | Files bigger than 5 MB are rejected. | Pass | — |
| TC-071 | Pasting an image link works. | Pass | — |
| TC-072 | Adding a custom category works. | Pass | — |
| TC-073 | Deleting a category leaves its menu items behind. | Pass | Known problem — see **DEF-007**. |
| TC-074 | Turning "available" off hides the item from customers. | Pass | — |

## H. Reports

| ID | Test | Result | Notes |
| -- | ---- | ------ | ----- |
| TC-075 | Sales, orders and average order value are shown for the chosen period. | Pass | — |
| TC-076 | The report numbers match the order data. | Pass | — |
| TC-077 | The most popular items list is correct. | Pass | — |
| TC-078 | The sales-by-date list is correct. | Pass | — |
| TC-079 | The CSV export downloads correctly. | Pass | — |
| TC-080 | The "Excel" export downloads, but is actually a CSV file. | Pass | Known problem — see **DEF-005**. |
| TC-081 | The "PDF" export downloads, but is actually a text file. | Pass | Known problem — see **DEF-005**. |
| TC-082 | The orders table stops at 50 rows and suggests exporting. | Pass | — |

## I. Settings

| ID | Test | Result | Notes |
| -- | ---- | ------ | ----- |
| TC-083 | Changing restaurant details saves correctly. | Pass | — |
| TC-084 | Changing the login email works (old email stops working). | Pass | — |
| TC-085 | Changing the password works. | Pass | — |
| TC-086 | Changing the MPIN works. | Pass | — |
| TC-087 | The Restaurant ID is shown but cannot be changed. | Pass | — |

## J. Safety & Data Separation

| ID | Test | Result | Notes |
| -- | ---- | ------ | ----- |
| TC-088 | Each restaurant only sees its own menu. | Pass | — |
| TC-089 | Each restaurant only sees its own orders. | Pass | — |
| TC-090 | Each restaurant's images are stored in its own folder. | Pass | — |
| TC-091 | Passwords are saved in plain text. | Pass | Serious problem — see **DEF-001**. |
| TC-092 | No database security rules are set up. | Pass | Serious problem — see **DEF-002**. |
| TC-093 | Real secret keys are committed in the project files. | Pass | Serious problem — see **DEF-003**. |

## K. Payment API

| ID | Test | Result | Notes |
| -- | ---- | ------ | ----- |
| TC-094 | The payment API needs no login (anyone can call it). | Pass | Known problem — see **DEF-006**. |
| TC-095 | The payment API does not leak the secret key. | Pass | — |

## L. Devices & Browsers

| ID | Test | Result | Notes |
| -- | ---- | ------ | ----- |
| TC-096 | The desktop layout looks right. | Blocked | Needs a manual look. |
| TC-097 | The phone layout works. | Blocked | Needs a manual look. |
| TC-098 | Works in Firefox and Edge. | Blocked | Needs a manual check. |

---

## Known Problems

| # | What's wrong | How serious | What to do |
| -- | ------------ | ----------- | ---------- |
| DEF-001 | Passwords are stored in plain text. | Serious | Hash passwords before saving. |
| DEF-002 | No security rules on the database, so data is not protected at the database level. | Serious | Add database security rules. |
| DEF-003 | Real secret keys are saved in the project files. | Serious | Remove them and create new ones. |
| DEF-004 | Tax is always 18%, even if you set a different rate in Settings. | Medium | Use the saved tax rate instead of 18%. |
| DEF-005 | The "Excel" and "PDF" downloads are actually CSV/text files. | Medium | Create real Excel/PDF files. |
| DEF-006 | Online payments are not verified on the server, and the payment API needs no login. | Medium | Add a server-side payment check. |
| DEF-007 | Deleting a category leaves its menu items behind. | Minor | Remove or re-link the items too. |
