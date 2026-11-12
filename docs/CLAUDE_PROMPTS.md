# Claude Web prompts — use one phase at a time

## Master context
We are building Pockit, a mobile-first student budgeting PWA. Use React + Vite + Tailwind on the client, Node.js + Express on the server, PostgreSQL for persistence, Nebius Token Factory for AI, and PayPal Developer Sandbox for payments.

Use the Stitch screens I provide as the visual source of truth. Preserve the palette:
- Deep Indigo #252B68
- Royal Blue #4169E1
- Lavender #A78BFA
- Soft Violet #EDE9FE
- Background #F8FAFC
- Surface #FFFFFF
- Success #16A085
- Warning #E99A45
- Error #DC5656
- Primary text #20243A
- Secondary text #73788C

Typography: Plus Jakarta Sans headings, Inter body. Mobile-first layout with bottom navigation: Home, Budgets, Transactions, AI Insights, Profile.

We use Claude Web, not Claude Code. You cannot access my local filesystem. Always provide exact relative paths and complete file contents. Work in small batches, explain important code, provide commands to test, and wait for my test results. Never generate the whole application at once.

Product rules:
- Students describe lifestyle/expenses and receive editable AI budget allocations.
- Budgets are virtual allocations, not separate real accounts.
- Backend performs all authoritative money calculations.
- Nebius is the in-app AI provider; do not use Claude API.
- Payment Guard warns before payment but the user decides.
- PayPal sandbox payment must be verified server-side.
- Only verified successful payments affect transaction and budget records.
- Never expose API keys in frontend or commit secrets.
- Use PostgreSQL NUMERIC for monetary values.

## Phase 0 — Initialize
This is a brand-new project. Inspect the proposed structure and give me exact terminal commands to initialize a React + Vite client in `client/` and an Express server in `server/`. First explain the commands and dependencies. Do not generate all app features. Include a health endpoint and `.env.example` files. Check that the setup can run locally.

## Phase 1 — Mobile frontend
Implement the mobile-first app shell and bottom navigation. Then implement the Stitch-referenced screens in small batches, initially using mock data. Keep the existing design tokens and use reusable components. Make sure the UI works at approximately 390px width and remains usable on desktop. Provide complete files and test steps.

## Phase 2 — Backend and database
Implement Express configuration, PostgreSQL connection, schema/migrations, wallet, budgets and transactions APIs. Validate inputs, handle errors and test endpoints. Keep the schema small and explain how to run it locally.

## Phase 3 — AI and intelligence
Implement deterministic financial calculations first: allocation validation, spent/remaining totals, spending velocity, budget pace and purchase impact. Then integrate Nebius server-side using an OpenAI-compatible client. Confirm the exact model ID and base URL from my Nebius account/docs rather than guessing. Validate structured model output before returning it. Build editable AI allocation and Payment Guard experiences.

## Phase 4 — PayPal
Implement PayPal sandbox order creation and capture on the server. Verify capture status, amount and currency server-side. Use idempotency and do not create duplicate transactions. Handle cancel/failure. Explain required sandbox credentials and webhook verification.

## Phase 5 — Finalization
Run end-to-end checks, fix critical bugs, deploy, document environment variables, write README and prepare a short demo script. Do not claim a test passed unless it was actually run.
