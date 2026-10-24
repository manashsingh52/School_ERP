# Bastaa — project notes

**Read [HANDOFF.md](HANDOFF.md) first.** It has the full picture: what's done, what's pending,
decisions, gotchas and the exact next step. The design pack is in `docs/`, and the progress log is in
`docs/12-roadmap.md`.

## Stack
- pnpm 9 + Turborepo monorepo, Node 22 (`nvm use`; every new shell needs `. "$HOME/.nvm/nvm.sh"`).
- `apps/api`: NestJS 12 (ESM, SWC), Prisma 7, PostgreSQL 17 with Row-Level Security, BullMQ on Postgres (no Redis), Zod 4, TypeScript pinned to 5.9.3.
- `apps/web`: Next.js 16 (App Router, `proxy.ts`, BFF with httpOnly cookies), React 19, Tailwind 4, TanStack Query.
- `apps/mobile`: Flutter 3.47+, Riverpod 3. One app; parent or teacher home by role.
- `apps/e2e`: Playwright.
- `packages/contracts`: Zod schemas, plus the `ENDPOINTS` registry.
- `packages/permissions`: permission catalog and role templates.
- `packages/ui`: design system.

## Run
```bash
pnpm install
pnpm db:start                                   # embedded Postgres on :54329 (keep running)
pnpm --filter @schoolos/api db:deploy && pnpm db:seed
pnpm --filter @schoolos/api dev                 # API :4000 (or build, then `RUN_WORKERS=true pnpm start` inside apps/api)
pnpm --filter @schoolos/web dev                 # http://demo.localhost:3000 · console http://admin.localhost:3000
cd apps/mobile && flutter run -d chrome
```

## Check before committing
```bash
pnpm lint && pnpm typecheck && pnpm test && pnpm build
pnpm --filter @schoolos/contracts openapi       # CI fails if openapi.json is stale
pnpm e2e                                        # Playwright (own DB, ports 4100/3100)
cd apps/mobile && flutter analyze && flutter test
```

## Conventions
- **Tenant data**:
  - Use `PrismaService.db` / `tenantTx`. Never use `PlatformPrismaService` in feature modules; lint enforces this.
  - Set `schoolId` explicitly on nested creates.
  - Use `RequestContextStore.school()` in jobs.
- **Every route**:
  - It needs an access decorator (`@RequirePermission`, `@SchoolMember`, …).
  - It needs an `ENDPOINTS` entry in `packages/contracts/src/endpoints.ts`.
  - `:id` routes also need a cross-tenant probe in `apps/api/test/isolation.e2e.test.ts`.
  - Another school's ids must return 404.
- **Permissions**:
  - Check permission keys and scopes, never role names (lint enforces this).
  - New keys go in `packages/permissions/src/catalog.ts` and `roles.ts`, plus a data migration for existing schools that lifts FORCE RLS around the insert.
- **Migrations**: use `prisma migrate diff … --script` into a new folder, then `pnpm db:deploy`. `prisma migrate dev` hangs. Never edit applied migrations. Never run `db:reset` without the owner's OK.
- **Side effects**: audit sensitive writes (`AuditService.record`). Notifications go through `NotificationsService.notify` with a `dedupeKey`.
- **Web**:
  - Use the `useData`, `apiPost`/`apiPatch`/`apiDelete`, `Gate` and `useMe().can` helpers.
  - Keep tabs in the URL with `useTabParam`.
  - Page files export only the page.
  - Use components from `@schoolos/ui`, not one-off components.
- **Flutter**:
  - Data screens use `FutureProvider` + `AsyncView`, with pull-to-refresh.
  - Models mirror `packages/contracts`.
  - **Don't run `dart format` over the whole `lib/`**: the code uses long lines.
- **Style**: match the surrounding code, keep comments sparse, use plain English in UI copy.
- **Git**:
  - Write plain, descriptive commit messages.
  - **No mention of AI tools or assistants and no `Co-Authored-By` trailers** in commits, PRs, docs or code (owner's rule).
  - Never commit `.env` files or secrets.
  - The owner approves pushes to `main`.
- Accounts and keys that don't exist yet each have a slot marked `⏸` in the code. They're tracked in `docs/SETUP-LATER.md`.
