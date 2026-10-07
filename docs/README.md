# SchoolOS — V1 Planning Pack

> "SchoolOS" / `schoolos.in` is a **placeholder** product name and domain. Replace when the brand is final.

This folder is the design baseline that must be reviewed **before** feature code is written (Master Prompt §72).
Each document is short enough to review in one sitting and ends with **Open questions** that need a decision.

| # | Document | What it answers |
|---|----------|-----------------|
| 01 | [Architecture](01-architecture.md) | How the system is shaped: repo, apps, modules, request & job flow |
| 02 | [Database](02-database.md) + [`schema.prisma`](schema.prisma) | Entities, ER diagrams, key modelling decisions |
| 03 | [Multi-tenancy](03-multi-tenancy.md) | How School A can never see School B's data |
| 04 | [RBAC](04-rbac.md) | Roles, permissions, data scopes, permission matrix |
| 05 | [API conventions](05-api-conventions.md) | URL style, validation, errors, pagination, idempotency, endpoint map |
| 06 | [Navigation map](06-navigation-map.md) | Every screen for web admin, super admin, parent app, teacher app |
| 07 | [Design system](07-design-system.md) | Tokens, typography, colour, components, states |
| 08 | [Wireframes](08-wireframes.md) | Low-fi layouts of the key screens |
| 09 | [Security & privacy](09-security-privacy.md) | Auth, threat model, controls, DPDP / CERT-In notes |
| 10 | [Infrastructure](10-infrastructure.md) | Google Cloud layout, environments, CI/CD, backups, monitoring, cost |
| 11 | [Payments](11-payments.md) | Fees → invoice → Razorpay → webhook → receipt, with every failure case |
| 12 | [Roadmap](12-roadmap.md) | Build order, milestones, Definition of Done |

## Decisions already locked (2026-10-07)

| Topic | Decision | Doc |
|---|---|---|
| School addressing | Subdomain per school: `stmarys.schoolos.in`; `admin.schoolos.in` for platform | 03 |
| Tenant isolation | One PostgreSQL DB, `school_id` on every tenant row, Prisma auto-scoping **+ Postgres Row-Level Security** | 03 |
| Identity | One global `User`, a `Membership` per school, roles per membership, school switcher | 02, 04 |
| Auth | Own NestJS auth: JWT access + rotating refresh tokens, per-device sessions, SMS OTP (MSG91) | 09 |
| Jobs | Redis on **Upstash** + BullMQ; workers are a separate Cloud Run service | 01, 10 |
| Repo | pnpm + Turborepo monorepo | 01 |
| Payments | Each school connects **its own Razorpay account**; platform never holds school money | 11 |
| Team | Solo developer + Claude → web + API first, Flutter later | 12 |
| V1 scope | No student login (students visible via parents). English UI, i18n-ready | 04, 06 |
| Region | Google Cloud `asia-south1` (Mumbai); all personal data stays in India | 10 |
| Fees | **Full payment only** (no partial payments), **no cheque/DD**. Counter: cash, UPI, bank transfer, card | 11 |
| Parents before mobile | A responsive **parent web view** ships with Phase 3, ahead of the Flutter apps | 12 |
| SMS / OTP | Company not registered yet, so no DLT. OTP goes through a provider interface: console in dev; real SMS once registered | 09, 10 |
| Cloud budget | $300 Google trial credit for 3 months. Build locally first; cloud only for staging/pilot in **lean mode** | 10 |

## Library baseline (checked 2026-10-07, pin exact versions at scaffold time)

Next.js 16 · React 19 · TypeScript 5 · Tailwind CSS 4 · TanStack Query 5 · React Hook Form · Zod 4 ·
NestJS 12 · Prisma 7 (stable; 8 is still RC — do not adopt RCs) · BullMQ 6 · Turborepo 2 · pnpm 9 · Node 22 LTS ·
Flutter (stable at Phase 7).

## How to use this pack

1. Read 01 → 03 first. They are the expensive-to-change decisions.
2. Mark answers to every **Open questions** section (inline edits are fine).
3. When all open questions are closed, Phase 1 (Foundation) starts — see [12-roadmap.md](12-roadmap.md).
