# SmartPOS Documentation

Full-stack restaurant management system — Next.js 14 (App Router), Supabase, Tailwind CSS, Razorpay.

## Documentation

| Document | Contents |
| -------- | -------- |
| [README](../README.md) | Project overview, quick start, scripts |
| [ARCHITECTURE.md](ARCHITECTURE.md) | Tech stack, data flow, folder structure, key modules |
| [SETUP.md](SETUP.md) | Prerequisites, environment variables, Supabase setup, deployment |
| [DATABASE.md](DATABASE.md) | Tables, migrations, storage bucket |
| [API.md](API.md) | API routes (orders, subscription, admin, webhooks) |
| [FEATURES.md](FEATURES.md) | Feature-by-feature walkthrough |
| [SECURITY.md](SECURITY.md) | Security model, known risks, hardening checklist |

## Quick Facts

- **Version:** 0.1.0
- **Framework:** Next.js 14 (App Router), React 18, TypeScript (strict)
- **Backend:** Supabase (PostgreSQL + Storage)
- **Payments:** Razorpay (UPI / Card / Net Banking) + cash
- **Subscriptions:** Plan-based billing with free trial, managed via an owner/admin panel
- **State:** Zustand (`lib/store.ts`) + React Context (`contexts/AuthContext.tsx`)
- **Styling:** Tailwind CSS 3 + shadcn/ui + lucide-react
- **Currency:** Multi-currency (per-restaurant `currency` / `country_code`); flat 18% tax on cart subtotal

## Report / Contribute

- Issues and feature requests: report via the project's Git host.
- Before contributing, review [SECURITY.md](SECURITY.md) — the codebase currently ships with known security gaps and committed credentials that should be addressed first.
