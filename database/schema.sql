-- =====================================================================
-- POCKIT DATABASE SCHEMA (PostgreSQL 13+)
-- Money is stored as NUMERIC(12,2) rupees. The API converts to/from
-- integer paise at the boundary; no floating-point money anywhere.
-- Safe to re-run: drops and recreates all Pockit tables.
-- =====================================================================

BEGIN;

DROP TABLE IF EXISTS notifications, payment_orders, transactions, savings_goals, categories, wallets, users CASCADE;

-- gen_random_uuid() is built in from PostgreSQL 13.

CREATE TABLE users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email         TEXT NOT NULL,
  password_hash TEXT NOT NULL,                       -- bcrypt hash, never the password
  name          TEXT NOT NULL CHECK (char_length(name) BETWEEN 1 AND 80),
  college       TEXT NOT NULL DEFAULT '',
  program       TEXT NOT NULL DEFAULT '',
  residence     TEXT NOT NULL DEFAULT 'Hostel',
  preferences   JSONB NOT NULL DEFAULT '{}'::jsonb,  -- guard/notification toggles (non-financial)
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX users_email_unique ON users (lower(email));

-- One virtual wallet per user. The balance is NEVER stored: it is computed
-- from the allowance and the user's successful transactions.
CREATE TABLE wallets (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  monthly_allowance NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (monthly_allowance >= 0),
  currency          CHAR(3) NOT NULL DEFAULT 'INR' CHECK (currency = 'INR'),
  cycle_reset_day   SMALLINT NOT NULL DEFAULT 1 CHECK (cycle_reset_day BETWEEN 1 AND 28),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Budget buckets (virtual allocations, not bank accounts).
CREATE TABLE categories (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name       TEXT NOT NULL CHECK (char_length(name) BETWEEN 2 AND 30),
  kind       TEXT NOT NULL DEFAULT 'spending' CHECK (kind IN ('spending', 'savings')),
  allocated  NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (allocated >= 0),
  icon       TEXT NOT NULL DEFAULT 'wallet',
  color      TEXT NOT NULL DEFAULT '#4169E1' CHECK (color ~ '^#[0-9A-Fa-f]{6}$'),
  position   INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX categories_user_name_unique ON categories (user_id, lower(name));
CREATE UNIQUE INDEX categories_one_savings_per_user ON categories (user_id) WHERE kind = 'savings';
CREATE INDEX categories_user_idx ON categories (user_id, position);

CREATE TABLE savings_goals (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name        TEXT NOT NULL CHECK (char_length(name) BETWEEN 2 AND 40),
  label       TEXT NOT NULL DEFAULT 'Personal',
  icon        TEXT NOT NULL DEFAULT 'target',
  target      NUMERIC(12,2) NOT NULL CHECK (target > 0),
  saved       NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (saved >= 0),
  target_date DATE NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX savings_goals_user_idx ON savings_goals (user_id, target_date);

-- Every money movement. Only status = 'success' affects balances.
CREATE TABLE transactions (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  category_id       UUID NOT NULL REFERENCES categories(id) ON DELETE RESTRICT,
  goal_id           UUID REFERENCES savings_goals(id) ON DELETE SET NULL,
  type              TEXT NOT NULL CHECK (type IN ('expense', 'savings')),
  amount            NUMERIC(12,2) NOT NULL CHECK (amount > 0 AND amount <= 100000),
  description       TEXT NOT NULL CHECK (char_length(description) BETWEEN 2 AND 60),
  merchant          TEXT NOT NULL CHECK (char_length(merchant) BETWEEN 1 AND 60),
  note              TEXT NOT NULL DEFAULT '' CHECK (char_length(note) <= 120),
  occurred_on       DATE NOT NULL,
  occurred_time     TIME NOT NULL DEFAULT '12:00',
  payment_method    TEXT NOT NULL CHECK (payment_method IN ('upi-gpay', 'upi-paytm', 'campus-card', 'debit-card', 'cash', 'paypal', 'pockit-vault')),
  status            TEXT NOT NULL DEFAULT 'success' CHECK (status IN ('success', 'failed', 'cancelled', 'pending')),
  source            TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'paypal', 'seed')),
  payment_reference TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK ((type = 'savings') = (goal_id IS NOT NULL OR payment_method = 'pockit-vault'))
);
CREATE INDEX transactions_user_date_idx ON transactions (user_id, occurred_on DESC, occurred_time DESC);
CREATE INDEX transactions_user_category_idx ON transactions (user_id, category_id);
CREATE INDEX transactions_user_status_idx ON transactions (user_id, status);

-- Simulated payment orders (PayPal integration arrives in a later phase).
-- No card numbers, bank credentials or PayPal secrets are ever stored.
CREATE TABLE payment_orders (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  category_id    UUID NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  reference      TEXT NOT NULL UNIQUE,
  amount         NUMERIC(12,2) NOT NULL CHECK (amount > 0 AND amount <= 100000),
  currency       CHAR(3) NOT NULL DEFAULT 'INR',
  description    TEXT NOT NULL,
  merchant       TEXT NOT NULL,
  status         TEXT NOT NULL DEFAULT 'created' CHECK (status IN ('created', 'completed', 'failed', 'cancelled')),
  transaction_id UUID REFERENCES transactions(id) ON DELETE SET NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX payment_orders_user_idx ON payment_orders (user_id, created_at DESC);

CREATE TABLE notifications (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind       TEXT NOT NULL DEFAULT 'info' CHECK (kind IN ('info', 'warning', 'success')),
  title      TEXT NOT NULL,
  body       TEXT NOT NULL,
  read       BOOLEAN NOT NULL DEFAULT false,
  created_on DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX notifications_user_idx ON notifications (user_id, created_at DESC);

COMMIT;
