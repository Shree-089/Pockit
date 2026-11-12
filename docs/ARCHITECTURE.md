# Pockit architecture

## Shape
A modular monolith: one React client and one Express API. Do not split into microservices for this hackathon.

```text
Mobile browser / installed PWA
            |
            v
     React + Vite client
            |
       HTTPS / JSON
            |
            v
      Express API
       |    |     |
       |    |     +---- PayPal Orders API
       |    |
       |    +---------- Nebius Token Factory
       |
       +--------------- PostgreSQL
```

## Backend modules
- auth: authentication/session handling (keep minimal if time is limited).
- wallet: monthly funds and wallet summary.
- budgets: virtual category allocations.
- transactions: manual and verified payment transactions.
- analytics: deterministic calculations, pace and projections.
- ai: Nebius requests, structured output validation and explanations.
- payments: PayPal order creation, capture, verification and webhook handling.

## Core data entities
- users
- wallets
- budgets
- transactions
- payments
- savings_goals (optional)
- ai_insights (optional)

Use PostgreSQL `NUMERIC` for money. Use a consistent currency code (default INR). Keep the source of truth in the database; derive spent amounts from successful transactions where practical.

## Important invariants
1. Budget buckets are virtual allocations, not separate bank accounts or PayPal balances.
2. Total allocations cannot exceed the wallet's available monthly funds.
3. LLMs never calculate authoritative balances or approve payments.
4. Backend calculates remaining amounts, spending pace and purchase impact.
5. Payment Guard advises; the user can proceed or cancel.
6. Do not mark a payment successful based on frontend state or redirect alone.
7. Verify PayPal capture server-side; prevent duplicate recording with idempotency.
8. Only verified successful payments affect budget totals.

## Payment sequence
1. Client requests an assessment.
2. Server loads current budget and transaction data and calculates impact.
3. Client shows warning when appropriate; user chooses proceed or cancel.
4. Server creates PayPal order.
5. User approves PayPal checkout.
6. Server captures and verifies the order.
7. Server records payment/transaction once and updates derived budget totals.
