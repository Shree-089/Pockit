# Initial data model

Keep this deliberately small; Claude should review before creating migrations.

## users
- id (primary key)
- name
- email (unique)
- password_hash (only if implementing password auth)
- created_at

## wallets
- id
- user_id (foreign key)
- monthly_funds NUMERIC(12,2)
- currency CHAR(3), default INR
- period_start DATE
- period_end DATE
- created_at

## budgets
- id
- wallet_id (foreign key)
- name
- allocated_amount NUMERIC(12,2)
- category_icon (optional)
- is_savings BOOLEAN
- created_at
- updated_at

## transactions
- id
- wallet_id (foreign key)
- budget_id (nullable foreign key)
- amount NUMERIC(12,2)
- currency CHAR(3)
- description
- transaction_type (expense / income / adjustment)
- source (manual / paypal)
- status (pending / succeeded / failed / cancelled)
- occurred_at
- created_at

## payments
- id
- transaction_id (nullable until verified)
- paypal_order_id (unique)
- paypal_capture_id (unique, nullable)
- amount NUMERIC(12,2)
- currency CHAR(3)
- status
- created_at
- updated_at

## Optional later
- savings_goals
- ai_insights

Use database constraints and transactions for consistency. Avoid storing redundant `spent_amount` unless there is a clear consistency strategy.
