# SchoolOS

Multi-tenant school management SaaS — one platform, many schools, strict isolation.
Design and decisions live in [`docs/`](docs/README.md) (start there).

> "SchoolOS" / `schoolos.in` is a placeholder name.

## Repository

```
apps/api            NestJS 12 API (+ BullMQ worker entrypoint later) · Prisma 7 · PostgreSQL 17
apps/web            Next.js 16 web app (school subdomains, BFF with cookie sessions)
packages/contracts  Zod request/response schemas shared by API and web
packages/permissions Permission catalog + default role templates (single source of truth)
packages/ui         Design system (tokens, components)
docs/               Planning pack (architecture, DB, tenancy, RBAC, API, UI, security, infra, payments, roadmap)
```

## Run it locally (no Docker needed)

Requires Node 22 (`nvm use`) and pnpm 9.

```bash
pnpm install
cp apps/api/.env.example apps/api/.env          # then: pnpm --filter @schoolos/api keys:generate → paste keys
cp apps/web/.env.example apps/web/.env.local    # BFF_SHARED_SECRET must match apps/api/.env
pnpm db:start                                   # terminal 1 — PostgreSQL 17 on :54329 (embedded)
pnpm db:migrate && pnpm db:seed                 # once — schema, RLS policies, demo school
pnpm --filter @schoolos/api build && pnpm --filter @schoolos/api start   # terminal 2 — API on :4000
pnpm --filter @schoolos/web dev                 # terminal 3 — web on :3000
```

Open **http://demo.localhost:3000** — demo logins are listed at the top of
[`apps/api/src/seed/seed.ts`](apps/api/src/seed/seed.ts) (password = `SEED_PASSWORD` in `.env`).
OTP codes are printed in the API log (`[dev OTP]`) — no SMS is sent until a DLT-registered provider is configured.

Background jobs run inside the API locally (`RUN_WORKERS=true`, queues stored in PostgreSQL — no Redis).
`pnpm --filter @schoolos/api worker` runs them as a separate process instead.

`pnpm db:reset` wipes and re-seeds the **local** database (asks for confirmation).

Accounts and keys still to be added (SMS, storage bucket, domain…): [docs/SETUP-LATER.md](docs/SETUP-LATER.md).

## Checks

```bash
pnpm lint          # ESLint incl. tenancy/permission guardrails
pnpm typecheck     # all packages
pnpm test          # unit + API integration tests (real Postgres with RLS, tenant-isolation suite)
pnpm build
```
