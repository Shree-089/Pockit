-- =====================================================================
-- 001_paypal_checkout.sql
-- Adds PayPal Orders v2 identifiers, statuses and the charge currency to
-- payment orders, plus database-level guards against duplicate expenses.
--
-- SAFE TO RUN ON EXISTING DATA:
--   * no DROP TABLE, no DELETE, no data rewrite except back-filling the new
--     charge columns of old simulated orders from their existing INR amount
--   * every statement is idempotent (IF NOT EXISTS / DROP CONSTRAINT IF EXISTS)
--   * money stays NUMERIC(12,2); the app converts to integer paise/cents
-- Applied by `npm run db:migrate` (recorded in schema_migrations).
-- =====================================================================

-- Who processed the order: 'mock' for the old simulated orders, 'paypal' from now on.
ALTER TABLE payment_orders ADD COLUMN IF NOT EXISTS provider TEXT NOT NULL DEFAULT 'mock';

-- What PayPal is asked to charge. The accounting amount stays in `amount` / `currency` (INR).
-- For an INR charge these equal amount/currency; for a USD charge fx_rate records the
-- configured INR-per-USD rate that was used, so nothing is ever silently converted.
ALTER TABLE payment_orders ADD COLUMN IF NOT EXISTS charge_currency CHAR(3);
ALTER TABLE payment_orders ADD COLUMN IF NOT EXISTS charge_amount NUMERIC(12,2);
ALTER TABLE payment_orders ADD COLUMN IF NOT EXISTS fx_rate NUMERIC(12,4);

-- PayPal identifiers and audit fields.
ALTER TABLE payment_orders ADD COLUMN IF NOT EXISTS paypal_order_id TEXT;
ALTER TABLE payment_orders ADD COLUMN IF NOT EXISTS paypal_capture_id TEXT;
ALTER TABLE payment_orders ADD COLUMN IF NOT EXISTS paypal_status TEXT;
ALTER TABLE payment_orders ADD COLUMN IF NOT EXISTS failure_reason TEXT;
ALTER TABLE payment_orders ADD COLUMN IF NOT EXISTS captured_at TIMESTAMPTZ;

-- Back-fill old simulated orders (they were charged, if at all, in INR).
UPDATE payment_orders SET charge_currency = currency, charge_amount = amount WHERE charge_currency IS NULL;

-- Statuses: 'pending' = PayPal capture pending; 'needs_review' = PayPal reported a capture
-- that did not match the local order (never deducted from the budget).
ALTER TABLE payment_orders DROP CONSTRAINT IF EXISTS payment_orders_status_check;
ALTER TABLE payment_orders ADD CONSTRAINT payment_orders_status_check
  CHECK (status IN ('created', 'pending', 'completed', 'failed', 'cancelled', 'needs_review'));

ALTER TABLE payment_orders DROP CONSTRAINT IF EXISTS payment_orders_provider_check;
ALTER TABLE payment_orders ADD CONSTRAINT payment_orders_provider_check CHECK (provider IN ('mock', 'paypal'));

ALTER TABLE payment_orders DROP CONSTRAINT IF EXISTS payment_orders_charge_check;
ALTER TABLE payment_orders ADD CONSTRAINT payment_orders_charge_check
  CHECK (charge_amount IS NULL OR (charge_amount > 0 AND charge_currency ~ '^[A-Z]{3}$'));

-- One local order per PayPal order, one per PayPal capture.
CREATE UNIQUE INDEX IF NOT EXISTS payment_orders_paypal_order_unique ON payment_orders (paypal_order_id) WHERE paypal_order_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS payment_orders_paypal_capture_unique ON payment_orders (paypal_capture_id) WHERE paypal_capture_id IS NOT NULL;

-- Transactions keep the PayPal capture ID for auditability.
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS paypal_capture_id TEXT;

-- Database-level duplicate protection: a PayPal capture can create at most one transaction,
-- and a payment order (payment_reference) at most one SUCCESSFUL PayPal expense.
CREATE UNIQUE INDEX IF NOT EXISTS transactions_paypal_capture_unique ON transactions (paypal_capture_id) WHERE paypal_capture_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS transactions_paypal_success_ref_unique ON transactions (payment_reference)
  WHERE source = 'paypal' AND status = 'success';
