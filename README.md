# Pockit — AI-powered student budgeting app

Mobile-first, installable web app for student budgeting.

## Stack
- Frontend: React + Vite + Tailwind CSS (PWA support added later)
- Backend: Node.js + Express
- Database: PostgreSQL
- AI: Nebius Token Factory (server-side)
- Payments: PayPal Developer Sandbox

## Project status
This is the project scaffold and planning pack. It is not yet a working application.

## Start here
1. Read `docs/PHASE_PLAN.md`.
2. Read `docs/ARCHITECTURE.md`.
3. Follow `docs/CLAUDE_WEB_WORKFLOW.md`.
4. Start with Phase 0 using the prompt in `docs/CLAUDE_PROMPTS.md`.

## Important
- Never put API keys in frontend code or commit secrets.
- Use INR and PostgreSQL `NUMERIC` for monetary values.
- Budget buckets are virtual allocations, not separate PayPal balances.
- Only verified successful payments create paid transactions and reduce budgets.
- The user always decides whether to proceed after a Payment Guard warning.
