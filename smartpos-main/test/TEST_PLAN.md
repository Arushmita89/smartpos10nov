# SmartPOS — Test Plan (Simple)

This plan explains how we test the **SmartPOS** restaurant app (built with Next.js, Supabase and Razorpay).

## What we are testing

The main things a restaurant owner uses the app for:

1. **Login & Account** — sign up, log in, migrate, forgot password.
2. **Main screen** — the side menu and the MPIN lock.
3. **Menu & Cart** — browsing items, adding to cart, totals.
4. **Cash orders** — paying by cash and printing a receipt.
5. **Online payments** — paying through Razorpay (UPI / card / net banking).
6. **Order management** — tracking orders and changing their status.
7. **Menu management** — adding, editing and removing items and categories.
8. **Reports** — sales numbers and downloads.
9. **Settings** — changing restaurant details, email, password and MPIN.
10. **Safety & data separation** — each restaurant only sees its own data.
11. **Devices & browsers** — the app on desktop, phone, Firefox and Edge.

We are **not** testing: speed/load, hacking attempts, or the outside services themselves (Razorpay's own pages, Supabase's servers).

## How we test

- We go through each test in [TEST_CONDITIONS.md](TEST_CONDITIONS.md).
- For every test we write the result in [TEST_RESULTS.md](TEST_RESULTS.md):
  - **Pass** — the app does what it should.
  - **Fail** — it doesn't (we write a note and add it to the known problems).
  - **Blocked** — we can't test it here (it needs a real browser or a payment popup).
- Most checks were done by reviewing the code carefully; the payment API was tested live. A final quick check by hand is still recommended.

## Test setup

- Run the app: `npm run dev` (or `npm run build && npm start`), then open `http://localhost:3000`.
- Use the payment keys in **test mode** (not real money).
- Test with at least two restaurant accounts so we can check data separation.

## When we start / stop

- **Start:** when the app runs and the database is set up.
- **Done:** when every "Pass" test in the results is marked, all important (serious) known problems are fixed or written down, and the remaining "Blocked" tests have been done by hand.

## Known problems

The full list is in [TEST_RESULTS.md](TEST_RESULTS.md). The short version: passwords are stored in plain text, the database has no security rules, real secret keys are in the project files, tax is always 18%, the Excel/PDF downloads are not real Excel/PDF files, online payments are not checked on the server, and deleting a category leaves its items behind.

## Sign-off

| Who | Name | Signature | Date |
| --- | ---- | --------- | ---- |
| Test lead | | | |
| Tester | | | |
| Owner | | | |
