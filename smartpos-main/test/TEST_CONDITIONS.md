# SmartPOS — Test Conditions (Simple)

This is the list of things we test in the SmartPOS restaurant app.

## How to use this list

- **Test** — what we are checking (plain English).
- **Expected** — what the app should do if everything works.

For each test: if the app does the "Expected" thing, mark **Pass** in the results. If it doesn't, mark **Fail** and write a note. If you can't test it (you need a browser, a payment popup, etc.), mark **Blocked**.

Results are recorded in [TEST_RESULTS.md](TEST_RESULTS.md).

---

## A. Login & Account

| ID | Test | Expected |
| -- | ---- | -------- |
| TC-001 | Signing up with correct details. | Account is created and you are logged in. |
| TC-002 | Signing up with an email that is already used. | A clear error is shown and no second account is made. |
| TC-003 | Signing up with empty fields. | The form blocks it and tells you what is missing. |
| TC-004 | Entering a password shorter than 6 characters. | A message says the password must be at least 6 characters. |
| TC-005 | Typing letters or more than 4 digits in the MPIN box. | Only 4 digits can be typed. |
| TC-006 | Entering a wrongly written email. | The form rejects it. |
| TC-007 | Logging in with the correct email and password. | You are logged in and see the main screen. |
| TC-008 | Logging in with a wrong password. | An error is shown and you stay on the login screen. |
| TC-009 | Logging in with an unknown email. | An error is shown. |
| TC-010 | Logging in with capital letters in the email. | It works the same as lower-case (email is case-insensitive). |
| TC-011 | Setting up email/password for an existing Restaurant ID (Migrate). | The ID gets login details and you can log in. |
| TC-012 | Migrating with a wrong Restaurant ID. | An error is shown; nothing changes. |
| TC-013 | Migrating with an email that is already used. | An error is shown. |
| TC-014 | Resetting a forgotten password. | The new password is saved and you can log in with it. |
| TC-015 | Resetting with a different "confirm" password. | An error is shown. |
| TC-016 | Resetting with an unknown email. | An error is shown. |
| TC-017 | Refreshing the page while logged in. | You stay logged in. |
| TC-018 | Removing the saved session and refreshing. | You are sent back to the login screen. |
| TC-019 | Logging out. | Your session is cleared and you return to login. |

## B. Main Screen & MPIN Lock

| ID | Test | Expected |
| -- | ---- | -------- |
| TC-020 | Looking at the side menu after login. | All 9 areas are shown (POS, Order Now, Order Status, Menu, Inventory, Customers, Reports, Settings, Admin). |
| TC-021 | Opening Inventory, Customers or Admin. | A "coming soon" message is shown. |
| TC-022 | Entering the correct MPIN. | Restaurant Mode unlocks. |
| TC-023 | Entering a wrong MPIN. | Access is denied with an error. |
| TC-024 | Typing letters or more than 4 digits in the MPIN box. | Only 4 digits can be typed. |
| TC-025 | Clicking the "Customer Mode" button. | The customer ordering screen opens. |
| TC-026 | Coming back from Customer Mode to Restaurant Mode. | The MPIN box appears first. |
| TC-027 | Opening the side menu on a phone. | The menu slides out from the side. |

## C. Menu & Cart

| ID | Test | Expected |
| -- | ---- | -------- |
| TC-028 | Looking at the menu as a customer. | Only items marked "available" are shown. |
| TC-029 | Clicking the category buttons. | The menu filters by category; "All" shows everything. |
| TC-030 | Clicking Add on an item. | The item goes into the cart and the count updates. |
| TC-031 | Using the + and − buttons on a cart item. | The quantity changes and totals update. |
| TC-032 | Reducing a quantity to 0. | The item is removed from the cart. |
| TC-033 | Checking the totals for a few items. | Subtotal + 18% tax = total, all correct. |
| TC-034 | Clicking "Clear Cart". | The cart becomes empty. |
| TC-035 | Clicking "Place & Pay" with an empty cart. | You cannot continue to payment. |
| TC-036 | Opening the cart on a phone. | The cart slides out from the side. |

## D. Cash Orders

| ID | Test | Expected |
| -- | ---- | -------- |
| TC-037 | Paying by cash with enough money. | The order is created and a receipt is shown. |
| TC-038 | Going to payment without a name or phone. | The form asks for a name and a 10-digit phone number. |
| TC-039 | Entering less cash than the total. | An error tells you to enter enough cash. |
| TC-040 | Entering more cash than the total. | The change (cash − total) is shown. |
| TC-041 | Looking at the receipt. | It shows order no., date, customer, items, tax, total, method, cash and change. |
| TC-042 | Clicking Print on the receipt. | The browser print window opens. |
| TC-043 | Checking a cash order after paying. | The order is saved as "pending" with a cash payment ID. |
| TC-044 | Placing an order from "Order Now". | The order is placed instantly with a "Walk-in" customer. |
| TC-045 | Setting a tax rate other than 18% in Settings. | Tax is still 18% (known problem DEF-004). |

## E. Online Payment (Razorpay)

| ID | Test | Expected |
| -- | ---- | -------- |
| TC-046 | The payment API creating an order. | A correct Razorpay order is created (₹354 → 35400 paise). |
| TC-047 | Calling the payment API without the payment keys set. | A clear error is returned. |
| TC-048 | Sending a bad amount (0, negative, text). | The API rejects it; decimal amounts are rounded. |
| TC-049 | Completing a real payment in the Razorpay popup. | The payment popup opens and the payment can be finished. |
| TC-050 | Cancelling the payment popup. | The popup closes, no order is made, and the cart stays. |
| TC-051 | Checking the order after a real online payment. | The order is saved with the payment IDs and marked "online". |
| TC-052 | Checking for a server-side payment check. | None exists (known problem DEF-006). |

## F. Order Management

| ID | Test | Expected |
| -- | ---- | -------- |
| TC-053 | Opening the order list. | Orders load with the newest first. |
| TC-054 | Checking the numbers at the top. | Total / Pending / Completed-today match the list. |
| TC-055 | Filtering by status. | Only orders of the chosen status are shown. |
| TC-056 | Clicking the Refresh button. | New orders appear without reloading the page. |
| TC-057 | Clicking "Start Preparing" on a pending order. | The order changes to In Progress (blue). |
| TC-058 | Clicking "Mark Complete" on an in-progress order. | The order changes to Completed (green). |
| TC-059 | Clicking "Cancel" on a pending/in-progress order. | The order changes to Cancelled (red). |
| TC-060 | Looking at a Completed/Cancelled order. | No action buttons are shown. |
| TC-061 | Looking at an order card. | Full details are shown (items, tax, total, customer, time). |

## G. Menu Management

| ID | Test | Expected |
| -- | ---- | -------- |
| TC-062 | Opening Menu Management with no categories. | 24 default categories are created automatically. |
| TC-063 | Adding a menu item. | The item is added and shows up. |
| TC-064 | Adding an item with no name/category or price 0. | The form rejects it. |
| TC-065 | Editing a menu item. | The changes are saved. |
| TC-066 | Deleting a menu item. | The item is removed. |
| TC-067 | Typing in the search box. | Items filter by what you type. |
| TC-068 | Choosing a category filter. | Items filter by that category. |
| TC-069 | Uploading an image (up to 5 MB). | The image uploads and shows on the item. |
| TC-070 | Uploading a file bigger than 5 MB. | The file is rejected. |
| TC-071 | Pasting an image link. | The image shows on the item. |
| TC-072 | Adding a custom category. | The category is added. |
| TC-073 | Deleting a category. | The category is removed, but its items stay (known problem DEF-007). |
| TC-074 | Turning "available" off for an item. | The item is hidden from customers. |

## H. Reports

| ID | Test | Expected |
| -- | ---- | -------- |
| TC-075 | Opening Reports and choosing a period. | Sales, orders and average order value are shown for that period. |
| TC-076 | Checking the numbers against the orders. | They match. |
| TC-077 | Looking at the most popular items. | The list is correct (top 10 by quantity). |
| TC-078 | Looking at the sales-by-date list. | The list is correct. |
| TC-079 | Clicking the CSV export. | A CSV file downloads and opens. |
| TC-080 | Clicking the Excel export. | A file downloads (but it is really a CSV — known problem DEF-005). |
| TC-081 | Clicking the PDF export. | A file downloads (but it is really text — known problem DEF-005). |
| TC-082 | Having more than 50 orders in the table. | The table shows 50 rows and suggests exporting. |

## I. Settings

| ID | Test | Expected |
| -- | ---- | -------- |
| TC-083 | Changing restaurant details and saving. | The changes are saved. |
| TC-084 | Changing the login email. | The new email works; the old one stops working. |
| TC-085 | Changing the password. | The new password works. |
| TC-086 | Changing the MPIN. | The new MPIN unlocks Restaurant Mode. |
| TC-087 | Looking at the Restaurant ID in Settings. | It is shown but cannot be changed. |

## J. Safety & Data Separation

| ID | Test | Expected |
| -- | ---- | -------- |
| TC-088 | Logging in as a different restaurant. | Each restaurant sees only its own menu. |
| TC-089 | Comparing orders between restaurants. | Each restaurant sees only its own orders. |
| TC-090 | Uploading an image for a restaurant. | The image is stored in that restaurant's own folder. |
| TC-091 | Checking how passwords are stored. | They are saved in plain text (known problem DEF-001). |
| TC-092 | Checking the database security rules. | No security rules are set up (known problem DEF-002). |
| TC-093 | Checking the project files for secret keys. | Real secret keys are committed in the files (known problem DEF-003). |

## K. Payment API

| ID | Test | Expected |
| -- | ---- | -------- |
| TC-094 | Calling the payment API without logging in. | It still works (known problem DEF-006). |
| TC-095 | Checking the payment API's answers. | The secret key is never shown. |

## L. Devices & Browsers

| ID | Test | Expected |
| -- | ---- | -------- |
| TC-096 | Looking at the app on a desktop screen. | Everything fits and works. |
| TC-097 | Using the app on a phone. | Menu, cart and checkout work. |
| TC-098 | Using Firefox and Edge. | The app works the same as in Chrome. |
