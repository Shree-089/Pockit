# Pockit implementation phases

Deadline: November 12, 2026. Work in small batches; test and commit each phase.

## Phase 0 — Initialize and de-risk (Nov 10)
- Create React + Vite frontend and Express backend.
- Set up Git and environment examples.
- Confirm Node/npm versions.
- Confirm PostgreSQL availability.
- Verify Nebius API access and model ID.
- Verify PayPal sandbox credentials and test a basic order if possible.
- Establish the shared design tokens from Stitch.

**Exit criteria:** Both apps start locally; health endpoint responds; no secrets are committed.

## Phase 1 — Mobile frontend (Nov 10)
- Implement app shell and bottom navigation.
- Build Home, Budgets, Transactions, AI Allocation, AI Insights, Payment Guard, Savings and Profile screens.
- Match supplied Stitch mobile screens.
- Use realistic mock data and working local interactions.

**Exit criteria:** Main screens navigate and render consistently at mobile widths.

## Phase 2 — Backend and database (Nov 11 morning)
- Express app, routes, controllers and services.
- PostgreSQL schema and connection.
- Wallet, budget and transaction APIs.
- Manual expense creation and analytics summary.
- Input validation and error handling.

**Exit criteria:** Frontend can retrieve and mutate persisted wallet, budget and transaction data.

## Phase 3 — AI and financial intelligence (Nov 11 afternoon)
- Deterministic budget calculations and spending velocity.
- Nebius-backed budget allocation suggestions.
- Validate model output on the server.
- AI explanations and spending recommendations.
- Payment assessment endpoint.

**Exit criteria:** AI suggestions are editable before saving; financial arithmetic is performed by backend code.

## Phase 4 — PayPal sandbox (Nov 11–12)
- Create order server-side.
- Approve checkout.
- Capture order server-side.
- Verify capture and amount/currency.
- Record transaction idempotently.
- Update budget only after verified capture.
- Handle cancel/failure and webhook verification where feasible.

**Exit criteria:** A sandbox payment completes end-to-end and creates exactly one transaction.

## Phase 5 — Integration, deployment and submission (Nov 12)
- End-to-end smoke tests.
- Fix critical defects.
- Deploy frontend/backend.
- Configure production environment variables.
- README, architecture diagram and demo script.
- Record demo and submit.

**Scope rule:** If time is tight, prioritize the working wallet, editable AI allocation, Payment Guard and one successful PayPal sandbox flow. Defer nonessential polish and secondary features.
