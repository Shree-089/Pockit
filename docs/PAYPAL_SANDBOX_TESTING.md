# PayPal Sandbox: setup and manual testing

This guide takes Pockit's checkout from "code installed" to "verified with a real PayPal Sandbox
approval and server-side capture". Sandbox payments use test money only.

## 1. Create Sandbox credentials

1. Sign in at https://developer.paypal.com and switch the dashboard to **Sandbox**.
2. **Apps & Credentials → Create App** (type *Merchant*). Copy the **Client ID** and **Secret**.
3. **Testing Tools → Sandbox Accounts**: note the default **Personal** (buyer) account's email.
   Use *View/Edit account* to see or set its password. You log in to the PayPal popup with this account.

### Currency choice (important)

Pockit's budgets are always kept in **INR**. `PAYPAL_CURRENCY` decides what PayPal is asked to charge:

| Setting | When to use | What happens |
|---|---|---|
| `PAYPAL_CURRENCY=INR` | Your Sandbox **business** and **personal** accounts are both registered in **India** | PayPal charges the exact rupee amount |
| `PAYPAL_CURRENCY=USD` + `PAYPAL_INR_PER_USD=88.00` | Any other account country (e.g. the default US Sandbox accounts) | PayPal charges USD at your fixed test rate; the rate and USD amount are shown before paying and stored on the order; the budget is charged the original rupee amount |

PayPal only accepts INR when both parties' accounts are registered in India. If you use the default
(US) Sandbox accounts with `INR`, checkout fails with a clear `PAYPAL_CURRENCY_UNSUPPORTED` message.
To test INR, create a new Sandbox business account and personal account with country **India**,
create the app under that business account, and use its credentials.

## 2. Configure the server (never commit `.env`)

Add these to `server/.env` (see `server/.env.example`):

```bash
PAYPAL_CLIENT_ID=<sandbox client id>
PAYPAL_CLIENT_SECRET=<sandbox secret>
PAYPAL_BASE_URL=https://api-m.sandbox.paypal.com
PAYPAL_TIMEOUT_MS=15000
PAYPAL_CURRENCY=INR          # or USD
PAYPAL_INR_PER_USD=          # e.g. 88.00, required only for USD
```

The secret stays on the server. The browser gets only the public client ID from `GET /api/payments/config`.

## 3. Migrate and run

```bash
cd server
npm run db:migrate        # adds PayPal columns; keeps all existing data (safe to re-run)
npm run test:payments     # automated checks with a mocked PayPal (no network)
npm run dev

cd ../client
npm run dev               # http://localhost:5173 (VITE_DATA_SOURCE=auto or api)
```

Sign in (e.g. `demo@pockit.app` / `Pockit@123` after `npm run db:seed`).

## 4. Manual test script

Keep the server terminal visible: PayPal problems are logged as `[paypal] … issue … debug_id=…`
(never tokens or secrets).

| # | Do this | Expect |
|---|---|---|
| 1 | Home → **Pay** → ₹500, "Dinner order", Food → **Continue to payment** | Budget Guard modal (if Food is low). **Cancel & Save Money** returns to the form; nothing recorded |
| 2 | Continue again → **Proceed Anyway** | Payment summary + real **PayPal** buttons and a "Sandbox: test money only" badge. With USD, a note shows the test rate |
| 3 | Click **PayPal**, then close the popup | "Payment cancelled in PayPal. Nothing was deducted." Dashboard unchanged |
| 4 | Click **PayPal**, log in as the Sandbox **Personal** account, approve | "Confirming your payment…" then **Payment successful** with the reference and PayPal order ID |
| 5 | Open **Passbook** | One PayPal expense of ₹500, status success. Food's remaining budget dropped by exactly ₹500 |
| 6 | Refresh the success page / repeat step 4's capture (e.g. double-click) | Still exactly one expense (capture is idempotent) |
| 7 | In the PayPal dashboard: **Testing Tools → Sandbox Accounts → business account → Transactions** (or log in at https://www.sandbox.paypal.com) | The payment appears with the same amount and currency |

### Verify the database (optional)

```sql
-- latest PayPal orders: status, PayPal ids, charged amount
SELECT reference, status, amount, currency, charge_amount, charge_currency, fx_rate,
       paypal_order_id, paypal_capture_id, paypal_status, failure_reason, captured_at
FROM payment_orders WHERE provider = 'paypal' ORDER BY created_at DESC LIMIT 5;

-- the expense created by a capture (exactly one per order)
SELECT amount, status, payment_reference, paypal_capture_id, note
FROM transactions WHERE source = 'paypal' ORDER BY created_at DESC LIMIT 5;
```

Expect `status = completed`, a `paypal_capture_id` on both rows, and for USD a `note` like
`Paid USD 5.68 with PayPal (test rate ₹88.00/USD)`.

### Declines, pending and mismatches

These are covered by `npm run test:payments` with a mocked PayPal:
- `INSTRUMENT_DECLINED`: the buttons restart so the buyer can pick another method
- a declined capture: shown as a failed payment, not counted
- a pending capture: nothing deducted until PayPal completes it
- amount, currency or order ID mismatches: "needs review", nothing deducted

The server does not send PayPal's Sandbox negative-testing header, so you can't force a decline
from the UI.

## 5. Troubleshooting

| Message / code | Cause | Fix |
|---|---|---|
| `PAYPAL_NOT_CONFIGURED` (503) | Client ID or secret missing | Set both in `server/.env`, restart |
| `PAYPAL_AUTH` | Wrong ID/secret, or live credentials with the sandbox URL | Copy the Sandbox app credentials again; check `PAYPAL_BASE_URL` |
| `PAYPAL_CURRENCY_UNSUPPORTED` | INR with non-India accounts | Use India Sandbox accounts, or `PAYPAL_CURRENCY=USD` + `PAYPAL_INR_PER_USD` |
| Approval ends on `/checkoutweb/genericError` with `UNSUPPORTED_PAYEE_CURRENCY` | The **payee** (the Sandbox business account behind your Client ID) cannot receive the order's currency | Run `npm run paypal:diagnose` (below). Use a Client ID whose business account can receive that currency, e.g. a **US** business account for USD |
| "Checkout settings changed…" | `PAYPAL_CURRENCY` changed after the page loaded PayPal | Reload the page |
| Buttons never appear | SDK blocked (ad blocker, offline) or a currency mismatch | Disable blockers for localhost; check the browser console |
| `PAYPAL_UNAVAILABLE` (502) | PayPal timeout/5xx | Retry; capture retries are safe (same `PayPal-Request-Id`) |
| "Payment needs review" | PayPal's capture did not match the order | Nothing was deducted; check `failure_reason` in `payment_orders` |

## 6. Diagnosing currency / merchant problems

```bash
cd server
npm run paypal:diagnose
```

This creates one unapproved Sandbox order with your configured currency and prints:
- the order ID
- the currency PayPal recorded
- the **payee merchant ID** (from PayPal's own response)
- the currency the browser SDK loads
- PayPal's approval link

Open that link and approve with your Sandbox **personal** account. This skips Pockit's
frontend entirely:

- **Same error on PayPal's own page:** the merchant account can't receive that currency. In
  developer.paypal.com → **Testing Tools → Sandbox Accounts**, find the business account with that
  merchant ID and check its **country**. For USD, create a **US** business account and a US personal
  account, then under **Apps & Credentials** create (or edit) the app so it's linked to the US business
  account. Put that app's Client ID and Secret in `server/.env` and restart the server.
- **PayPal's page works but Pockit's doesn't:** compare the browser console line
  `[pockit:paypal] order … order_currency=… sdk_currency=…` with the server line
  `[paypal] order created … paypal_unit=… payee_merchant_id=…`.

Both logs contain only IDs and currency codes: no secrets, tokens or e-mail addresses.

## 7. Not included yet (before going live)

- **Webhooks** (`PAYMENT.CAPTURE.COMPLETED` / `DENIED` / `REFUNDED`) to settle pending captures
  automatically and record refunds. Today a pending capture is completed when the capture endpoint
  is called again.
- **Live credentials**: set `PAYPAL_BASE_URL=https://api-m.paypal.com` only with a verified live
  business account, and use real exchange rates. The fixed USD rate is for Sandbox testing only.
