# 💜 Pockit — Make Every Rupee Count.

<p align="center">
  <strong>Your money. Your goals. Your control.</strong>
  <br/>
  An AI-powered financial companion built to help students budget smarter, understand spending habits, and make more confident financial decisions.
</p>

<p align="center">
  <img src="client/src/assets/hero.png" alt="Pockit" width="800"/>
</p>

<p align="center">
  <strong>Built with React · Node.js · PostgreSQL · Nebius AI · PayPal Sandbox</strong>
</p>

---

## ✨ The Idea

Managing money as a student isn't always easy.

Monthly allowances, food, subscriptions, college projects, shopping, travel and unexpected expenses compete for the same limited budget. Most expense trackers tell you where your money went. But what if your financial companion could help you decide where your money should go next?

**Pockit turns budgeting from passive expense tracking into proactive financial guidance.**

Instead of simply recording transactions, Pockit helps students plan their allowance, organise spending into virtual budget buckets, anticipate financial shortfalls and evaluate purchases before spending.

## 🚀 What Pockit Can Do

### 🧠 AI-Powered Budget Allocation
Tell Pockit about your allowance, expenses, lifestyle and financial goals in natural language.

Its AI analyses your financial context and suggests a personalised budget allocation. You remain in control: edit, regenerate and approve the proposed allocations.

### 💳 Smart Budget Buckets
Organise your money into virtual categories such as:
- Food & Dining
- Essentials
- Shopping
- Travel
- Projects
- Savings

Monitor allocations, spending and remaining balances without losing sight of your overall budget.

### 🛡️ Pre-Payment Budget Guard
A purchase shouldn't become a financial regret.

Before spending, Pockit evaluates the proposed expense against your available funds and category budget.

It can:
- Assess the impact of a proposed purchase.
- Identify potentially risky spending.
- Warn when a purchase could affect future expenses.
- Explain whether the purchase fits your current budget.

The user always makes the final decision. Pockit advises; it never silently blocks a purchase.

### 📊 Spending Intelligence
Understand not just how much you spend, but how your spending is progressing.

Pockit provides:
- Category-wise spending analysis.
- Spending velocity and budget depletion insights.
- Month-end financial forecasts.
- Personalised recommendations.

### 💬 AI Financial Copilot
Ask questions about your actual financial activity in natural language.

Examples:
- Am I spending too much on food?
- Can I afford a ₹1,000 purchase?
- How much money should I save this month?
- What is my current spending pace?
- Which category needs attention?

Responses are grounded in the user's financial data, with deterministic financial calculations handled separately from AI-generated explanations.

### 🎯 Savings Goals
Create savings goals, track progress and understand how everyday spending affects longer-term plans.

### 🌐 PayPal Sandbox Integration
Pockit includes a PayPal Orders API integration designed to support payment creation, buyer approval, server-side capture and transaction verification.

The integration includes automated tests for payment validation, idempotency, failed captures and currency consistency.

*Note: The actual Sandbox buyer approval flow currently has a merchant-currency compatibility limitation. End-to-end payment completion has not yet been verified.*

---

## 🏗️ How It's Built

Pockit follows a modular full-stack architecture, separating the user interface, business logic, financial calculations and AI services.

| Layer | Technology |
|---|---|
| Frontend | React, Vite |
| Styling | Tailwind CSS |
| Visualisation | Recharts |
| Backend | Node.js, Express |
| Database | PostgreSQL |
| AI | Nebius Token Factory |
| AI Model | Qwen3 235B |
| Payments | PayPal Orders API v2 (Sandbox) |
| Authentication | JWT |
| Icons | Lucide React |

### Architecture

```text
                  STUDENT
                     |
                     v
            React + Vite Frontend
                     |
                     v
              Express REST API
                     |
          +----------+----------+
          |          |          |
          v          v          v
      PostgreSQL  Nebius AI  PayPal API
          |          |          |
          v          v          v
       Financial   AI-powered  Sandbox
        records    insights    payments
          |
          v
    Deterministic
    calculations
```

### A Key Design Decision: AI vs Financial Logic

Financial applications require accuracy and consistency.

Pockit deliberately separates:
- **Deterministic logic:** Balances, allocations, transaction records, currency conversions and budget calculations.
- **AI reasoning:** Personalised recommendations, natural-language interaction and explanations.

AI does not independently modify financial balances or authorise transactions. Backend validation and verified payment capture govern financial updates.

---

## 🖥️ Getting Started

Want to run Pockit locally? Follow these steps.

### Prerequisites

- Node.js and npm
- PostgreSQL 16 or compatible PostgreSQL version
- Git

### 1. Clone the repository

```bash
git clone https://github.com/Shree-089/Pockit.git
cd Pockit
```

### 2. Configure the backend

```bash
cd server
npm install
cp .env.example .env
```

Update `server/.env` with your PostgreSQL connection, JWT secret and optional Nebius and PayPal Sandbox credentials.

**Never commit your `.env` file or expose API secrets.**

### 3. Set up PostgreSQL

Create a PostgreSQL database and configure its connection string in `server/.env`.

Initialise and seed the database using the available scripts:

```bash
npm run db:init
npm run db:seed
```

Apply subsequent migrations when required:

```bash
npm run db:migrate
```

### 4. Start the backend

```bash
npm run dev
```

The backend runs on:

`http://localhost:4000`

### 5. Configure and start the frontend

Open another terminal:

```bash
cd client
npm install
cp .env.example .env
npm run dev
```

Open:

`http://localhost:5173`

---

## 🔐 Environment Configuration

The project provides example environment files:

- `server/.env.example`
- `client/.env.example`

Important backend configuration includes:

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | PostgreSQL connection |
| `JWT_SECRET` | Authentication signing secret |
| `NEBIUS_API_KEY` | Nebius AI access |
| `NEBIUS_MODEL` | Selected AI model |
| `PAYPAL_CLIENT_ID` | PayPal application identifier |
| `PAYPAL_CLIENT_SECRET` | Server-side PayPal secret |
| `PAYPAL_CURRENCY` | Sandbox payment currency |

See the example files for the complete configuration.

---

## 🧪 Testing

Pockit includes automated tests and diagnostic scripts for its major subsystems.

From the `server/` directory:

```bash
npm run test:ai
npm run test:ai-live
npm run test:chat-live
npm run test:payments
npm run paypal:diagnose
```

Some tests require valid environment variables and external API access.

The payment test suite covers:
- Order creation validation.
- Currency consistency.
- Failed and pending payments.
- Duplicate and concurrent capture handling.
- Transaction integrity.
- Payment ownership and security checks.

Automated payment tests use mocked PayPal responses and should not be confused with a successful live buyer-approval flow.

---

## 🔮 What's Next?

Pockit is an evolving student-finance platform. Future improvements include:

- Automated expense capture through supported financial integrations.
- Receipt scanning and intelligent expense categorisation.
- More advanced financial forecasting.
- Recurring expense and subscription detection.
- Improved financial goal planning.
- Expanded payment-provider support.
- Production deployment with stronger operational monitoring.

---

## 💡 Why Pockit?

We believe financial literacy shouldn't begin when someone starts earning a salary.

Students should be able to understand their money, develop healthy spending habits and make informed financial decisions early.

Pockit aims to make that process simpler, smarter and more accessible.

**Because every rupee has a purpose. Make yours count.**

---

## 👩‍💻 Built With

Created as an AI-powered student-finance project exploring the intersection of generative AI, personal finance, full-stack development and responsible financial decision-making.

**Developed by Shreelekha and team.**

---

## 📄 License

This project is released under the MIT License. See [LICENSE](LICENSE) for details.
