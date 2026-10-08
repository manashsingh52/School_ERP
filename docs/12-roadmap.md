# 12 — V1 Roadmap

Built by **one developer working with Claude**: web + API first, Flutter after the core is stable.
This follows the Master Prompt's phase order (§71), with a few items pulled earlier where a later
phase depends on them (marked ⤴).

Estimates are **focused-week ranges** for a solo developer. Treat them as planning guides, not promises.

## Phase 0: Setup (≈1 week)

- [x] Node 22 (nvm), pnpm 9, Google Cloud CLI installed on the dev Mac (2026-10-07)
- [ ] **Docker Desktop** (needs your admin password; see the note at the end)
- [ ] Git repo + GitHub (private), branch protection on `main`
- [ ] Buy the domain (placeholder `schoolos.in`) and add it to Cloudflare
- [ ] GCP: create `schoolos-staging` and `schoolos-prod` projects, link billing/credits, set **budget alerts**
- [ ] ⏸ **DLT registration** for SMS is blocked until the company is registered. Meanwhile OTP uses a console provider in dev, and password login works without SMS
- [ ] Razorpay **test** account (for development)
- [ ] Sentry org; Upstash account
- [ ] Close the open questions in docs 01–11

## Progress log

### 2026-10-07: Phase 1 foundation, first slice ✅

Built and verified (70 automated tests passing; checked in the browser at desktop and phone width):

- [x] Monorepo (pnpm + Turborepo), CI workflow (`.github/workflows/ci.yml`: typecheck → test → build)
- [x] Prisma 7 schema (84 models) + first migration; **RLS on all 76 tenant tables** + `schools` and `users`; three DB roles
- [x] Tenant isolation, all three layers + automated suite (cross-tenant probes, `:id`-route registry, raw-SQL RLS checks)
- [x] Auth: password, OTP (console sender), refresh rotation with reuse detection, devices, logout, reset, lockout, rate limits
- [x] RBAC: permission catalog + role templates (`packages/permissions`), guard, scopes (ALL / ASSIGNED / OWN_CHILDREN), startup check that every route declares access
- [x] Audit log (append-only), error format with `supportRef`, structured logs without PII
- [x] Students API (list/search/get/create/update) as the first tenant resource
- [x] Web: subdomain → school, BFF with httpOnly cookie sessions + CSRF guard, login (password / OTP / reset), "find your school", app shell (collapsible sidebar, phone drawer, ⌘K palette), dashboard (staff + parent), students list and profile, honest "coming soon" pages
- [x] Design system core (`packages/ui`): tokens with per-school OKLCH accent, Button, Input/Field, Card, Badge, Avatar, Skeleton, Empty/Error states, Table, Pagination, Tooltip, Dialog, Menu, Command palette, Toasts
- [x] Demo seed: 15 classes, 30 sections, 750 students, one login per role + super admin

### 2026-10-07: Phase 1 foundation, second slice ✅ (86 tests)

- [x] **Background jobs without Redis:** BullMQ 6 on PostgreSQL (schema `bullmq`), transactional outbox + relay (`FOR UPDATE SKIP LOCKED`), tenant-scoped job context, worker entrypoint (`dist/worker.js`) and lean mode (`RUN_WORKERS=true`). Redis is a config switch
- [x] Storage abstraction: local driver (HMAC-signed links, dev only) + Google Cloud Storage driver (slot, configured later); upload → verify real type (magic bytes) → READY; signed download links
- [x] `Idempotency-Key` support (replays results and business errors; required on money endpoints later)
- [x] OpenAPI 3.1 generated from the Zod contracts (`packages/contracts/openapi.json`); a test keeps it in sync with the real routes
- [x] ESLint with guardrails (no RLS-bypass client in feature modules, no role-name checks, no unsafe raw SQL); runs in CI
- [x] `docker-compose.yml` ready for when Docker is installed
- [x] [SETUP-LATER.md](SETUP-LATER.md): every account/key slot in one checklist

Phase 1 is complete apart from items that need your accounts (see SETUP-LATER.md). **Next: Phase 2 (core school).**

### 2026-10-08: Phase 2 complete — core school ✅ (177 tests)

API and web, both tested end to end (tests + browser):

- [x] Academic years (create, make current, close), classes, per-year sections with class teacher, subjects, class × subject grid, teaching assignments (they widen a teacher's ASSIGNED scope instantly)
- [x] Teachers (invite to sign in, profile, photo, "left" ends access); parents (one per phone, many children, primary contact, link/unlink, invite); full student records (parents inline with sibling reuse, photo, address, emergency contact)
- [x] Users (invite, roles, suspend) and a roles editor with per-permission scope, confirmation before broadening student access, and a lockout guard (permission-based)
- [x] Excel/CSV import for students and teachers: auto column matching, every row checked with plain reasons, duplicates flagged, background commit, rows-to-fix CSV, Excel templates
- [x] School profile and branding (live colour preview, logo on sign-in page), 10-step onboarding wizard + dashboard prompt, go-live checklist
- [x] Year-end promotion (promote / graduate / detain; history kept; safe to re-run)
- [x] ⌘K search across students, teachers and parents; page-level "no access" gates
- [x] Demo data: 40 teachers, class teachers for all 30 sections, subjects for every class, subject teachers for Classes 6–12 (seed top-up is idempotent)

Known follow-ups (small): detaining individual students in the promotion wizard (API supports it), per-class subject editing UI beyond the grid, parent web view (Phase 3).

**Next: Phase 3 (daily operations)** — attendance, homework, timetable, notices, notification engine, parent web view.

### 2026-10-08: Phase 3 complete — daily operations ✅ (249 tests)

API and web, tested end to end (229 API + 15 contracts + 5 permissions tests, browser checks on desktop and phone width):

- [x] **Notification engine**: per-school rules (event on/off, channels), templated in-app inbox with unread badge, one queued delivery per extra channel through a single `ChannelGateway` (push / SMS / email providers are ⏸ placeholders), dedupe keys, settings page
- [x] **Attendance**: fast register (mark rest present, P/A/L/H/V keys, reasons), draft/submit, roster as of the date, edit window vs "edit past", class-teacher-only marking (configurable), offline replay (`clientMutationId`), audited corrections, school overview, monthly grid, staff attendance, settings; parents of absent/late students alerted once per child per day
- [x] **Homework**: sections × subject a teacher actually teaches, attachments, publish now / schedule / draft, archive on delete, parents notified per child
- [x] **Timetable**: bell schedules, weekly grid editor, teacher clash detection by clock time (works across different bell schedules), publish, teacher week, "today" for teachers and parents
- [x] **Notices**: audiences (everyone, all parents/teachers/staff, role, class, section, person), teachers limited to their sections, schedule, pin, attachments, safe markdown, read receipts and read stats
- [x] **Dashboard v1**: role-aware KPIs, "attention required" (pending registers, absences, students under 75 % this month, unpublished timetables, scheduled/draft notices), the teacher's open registers and today's classes
- [x] **Parent web view**: own navigation, child switcher, home (today's status, the child's day, homework, notices), attendance calendar, homework, timetable (day view on phones)
- [x] Demo data: bell schedule, published clash-free timetables for all 30 sections, 20 days of attendance, 60 homework, 3 notices (seed stays idempotent)

Scheduled publishing uses **delayed queue jobs** (no cron): each job re-checks the item is still scheduled for that time, so rescheduling or deleting is safe.

Known follow-ups (small): homework submissions/review by students (schema is ready), attendance reports export (Phase 6 reports), push to devices once Firebase exists (Phase 7).

**Next: Phase 4 (exams)** — exam setup, marks entry, grading, report cards.

### Implementation notes (where code differs from the plan, and why)

| Plan said | Built | Why |
|---|---|---|
| Local Postgres via Docker Compose | `embedded-postgres` (real PostgreSQL 17 from npm, `pnpm db:start`) | Docker not installed yet; tests use the same approach, so CI needs no service container |
| RLS SQL hand-written inside migration folders | `apps/api/scripts/apply-sql.mjs`, an idempotent script run after every migrate. It **discovers** every `school_id` table and fails if one is uncovered | A new table can't be forgotten |
| Redis (Upstash) for BullMQ queues | **BullMQ 6 PostgreSQL backend** | Saves an external service and ~$10–20/month; same Cloud SQL backups cover queued jobs. `QUEUE_BACKEND=redis` switches back |
| Session revocation via a Redis deny-list | Session row checked on each request (30 s in-process cache) | No Redis yet. Single instance is fine for V1; move to Redis pub/sub when scaling out |
| Rate limits in Redis | In-memory store behind a `RateLimitStore` interface | Same reason; swapping the store is one class |
| Design tokens in `packages/design-tokens` (JSON) | CSS variables in `packages/ui/src/styles.css` | Only one React client today; generate Flutter `ThemeData` from these in Phase 7 |
| TypeScript latest | Pinned **5.9.3** | TypeScript 7 (native compiler) is new; Nest relies on decorator metadata. Revisit later |

## Phase 1: Foundation (≈3–4 weeks)

**Milestone M1:** log in on `demo.localhost`, see a permission-aware app shell, and the tenant-isolation suite passes in CI.

| Area | Deliverables |
|---|---|
| Repo | Turborepo + pnpm workspaces, shared tsconfig/eslint/prettier, `docker-compose.yml` (Postgres, Redis, fake-GCS, Mailpit) |
| API skeleton | NestJS app + worker entrypoint, config validation, pino logging, request id, error filter with `supportRef`, health checks |
| Database | Prisma 7 setup, migrations from `docs/schema.prisma` (core tables first), DB roles, **RLS policy generator + coverage check** |
| Tenancy | Tenant context (AsyncLocalStorage), `TenantPrisma` extension, `PlatformPrisma`, slug resolution, tenant-mismatch guard |
| Auth | Password + OTP login (OTP logged locally), refresh rotation and reuse detection, sessions/devices, logout, password reset, invitation activation |
| RBAC | `packages/permissions` catalog + role templates, guard + `@RequirePermission`, scope policy helpers, permission cache |
| Core services | Audit log service, outbox + relay, BullMQ queue wrapper (tenant-aware processors), storage service (GCS adapter + local fake), idempotency middleware, rate limiting |
| Contracts | `packages/contracts` with Zod → Nest validation pipe → OpenAPI generation |
| Web | Next.js app, middleware for subdomain → branding, BFF proxy with cookie sessions, login/OTP screens, **app shell** (sidebar collapsed/expanded, top bar, user menu, school switcher), ⌘K palette (navigation only) |
| Design system | `packages/design-tokens` + `packages/ui` core: Button, Input, Select/Combobox, Checkbox/Switch, Modal, Drawer, Tabs, Toast, Tooltip, Badge, Avatar, Card, Skeleton, EmptyState, ErrorState, PageHeader, DataTable v1 |
| Tests & CI | Vitest unit tests, integration tests against real Postgres, **tenant-isolation suite** (03 §7), GitHub Actions CI |
| Seed | Platform admin, School A, School B (for tests), demo school skeleton |

## Phase 2: Core school (≈3–4 weeks)

**Milestone M2:** a new school completes onboarding and has its classes, teachers and students loaded from Excel.

- Schools (super admin creates school + first admin invite), school profile & branding (logo upload, accent)
- Academic years (create/activate/close), classes, sections (per year), subjects, class-subjects, teaching assignments
- Students (CRUD, profile with tabs, photo), enrollments, guardians (link, multi-child), teachers (CRUD, profile)
- Members & roles UI (invite, assign roles, edit role permissions)
- ⤴ **Import v1** (students, guardians, teachers): upload → map → validate → preview → commit → report. Onboarding needs it
- ⤴ Basic settings pages (general, academic, users, roles)
- **Onboarding wizard** (10 steps, resumable) with checklist on the dashboard
- Global search (students, teachers, guardians) + palette entity actions
- Year-end promotion wizard (preview → commit), since it creates the next year's enrollments
- Demo seed: 500 students, 40 teachers, classes 1–12, multiple sections, guardians

## Phase 3: Daily operations (≈3–4 weeks)

**Milestone M3:** teachers take attendance in under 30 seconds per class; parents get notified of absences.

- Attendance: register (mark all present, keyboard), submit/lock/edit window, school overview, staff attendance, monthly view, reports
- Homework: create (multi-section, attachments), list, publish/schedule, per-student progress model
- Timetable: bell schedules, visual weekly grid editor, teacher clash detection, class/teacher/"today" views
- Notices: compose (markdown, attachments), audiences, schedule, read stats
- **Notification engine:** event → rules → recipients → channels (in-app, push-ready, SMS via MSG91, email); templates per school; delivery tracking; quiet hours; per-school caps
- Dashboard v1 (role-aware KPIs, attention items, quick actions, activity timeline)
- ⤴ **Parent web view** (responsive, same Next.js app): home, child switcher, attendance, homework, notices. Fees & pay are added in Phase 5

## Phase 4: Exams (≈3 weeks)

**Milestone M4:** a branded report card PDF for a whole class is generated in one click.

- Grading scales (presets: CBSE-style 9-point, A–E, percentage-only), exams, class × subject grid (max/pass marks, dates)
- Marks entry sheet (fast keyboard grid, absent/exempt, save draft, lock), progress tracking per teacher
- Result compute (totals, %, grade, pass/fail, optional ranks) → preview → publish (snapshot)
- Report cards: HTML template → PDF in worker (logo, student info, marks, grades, attendance, remarks, signature areas); bulk generation
- Parent notification on publish

## Phase 5: Finance (≈4–5 weeks)

**Milestone M5:** a parent pays online with a test card and gets a receipt; a school's day-close report balances.

- Fee heads, structures (items, installments, splits), class assignment, optional heads, late-fee rules
- Concession types, requests and approvals (sibling, scholarship, staff ward, …)
- Bulk invoice generation (preview → issue), invoice detail, adjustments, cancellation
- Counter collection screen (W6), receipts (gap-free numbering, PDF), void (full payments only, no cheque/DD)
- Razorpay connect flow, online orders, verify, **webhooks**, reconciliation job, refunds, student credits
- Reminders and late fee jobs
- Finance reports: daily collection, outstanding, defaulters, head-wise, reconciliation, student statement
- Full payment test suite (11 §11)

> **Pilot point:** after Phase 5. The parent web view (built in Phase 3, fees added here) lets a school run live
> while the Flutter apps are built. That is about 4–5 months in.

## Phase 6: Platform (≈3–4 weeks)

**Milestone M6:** the super admin can onboard, configure, monitor and support a school without touching the database.

- Documents (per student/teacher/school, categories, guardian visibility, signed URLs)
- Report engine (catalog, filters, async exports in PDF/XLSX/CSV, export history)
- Audit log viewer (settings + per-record activity tabs)
- Import v2 (classes, subjects, fee assignments; error-row Excel download)
- Settings: all sections (attendance, fees, exams, notifications matrix, branding for receipts/report cards, billing)
- Super admin: dashboard metrics, schools, users lookup, plans/subscriptions (manual billing), feature flags + per-school overrides, support access grants, system (queues, DLQ), audit
- Entitlement service enforcing plan limits (students, SMS, storage)
- Dark mode

## Phase 7: Mobile apps (≈5–6 weeks)

**Milestone M7:** parent and teacher apps in TestFlight / Play internal testing, then store release.

- Flutter project, generated API client, design tokens → ThemeData, auth (OTP), school picker, secure storage
- Parent: home, child switcher, attendance calendar, homework, timetable, exams/results/report card, fees + Razorpay checkout + receipts, notifications inbox, documents, profile/devices
- Teacher: home (today's classes, pending attendance/marks), **offline-capable attendance** (local queue, `clientMutationId`, sync), homework create with camera attachments, marks entry, notifications
- FCM push, deep links from notifications, forced-update gate
- Store listings, privacy labels, app review prep

## Phase 8: AI foundation (≈2–3 weeks)

- `ai` module: provider abstraction (Gemini first), **tool registry**. Each tool is an existing permission-checked service call (e.g. `attendance.summary`, `fees.collectionSummary`)
- Tenant/permission context passed to every tool; no direct DB access; prompts and outputs logged without PII; usage metered by entitlement
- First features behind the `ai_assistant` flag: principal Q&A ("Which classes are below 75% attendance this month?"), admin fee summaries, teacher worksheet drafts
- Evaluation set of real questions with expected answers before enabling for schools

## Timeline view

```
Month:    1        2        3        4        5        6        7        8
Phase 0  ▇
Phase 1   ▇▇▇▇
Phase 2       ▇▇▇▇
Phase 3           ▇▇▇▇
Phase 4               ▇▇▇
Phase 5                  ▇▇▇▇▇      ← pilot-ready (+ parent web view)
Phase 6                       ▇▇▇▇
Phase 7                           ▇▇▇▇▇▇
Phase 8                                 ▇▇▇
```

## Definition of Done (every module)

A module is done only when **all** of these are true:

- [ ] Backend implemented (service, controller, policy, validation via shared Zod contract)
- [ ] Web UI implemented with the design system (no one-off components)
- [ ] Mobile implemented where applicable (or ticket created for Phase 7)
- [ ] Permissions declared on every route; scope checks in the service
- [ ] Tenant isolation covered by the auto-discovered isolation suite (and module-specific cases)
- [ ] Loading (skeleton), empty, error and permission-denied states designed
- [ ] Audit logging for sensitive actions
- [ ] Unit + integration tests; critical paths in Playwright e2e
- [ ] Responsive down to 375px; keyboard accessible; contrast checked
- [ ] Docs: module README (purpose, permissions, events emitted, jobs), API docs generated
- [ ] Demo seed data updated so the module looks alive in `demo.schoolos.in`

## What's deliberately not in V1

Transport/GPS, library, inventory, HRMS/payroll, advanced accounting, advanced AI, biometric/RFID,
WhatsApp automation, workflow engine, student login, public API, custom domains, multi-language UI.
The architecture leaves room for each (feature flags, module boundaries, i18n-ready strings).

## Next step after review

Once docs 01–11 have their open questions answered, Phase 1 starts with: `git init`, the monorepo scaffold, `docker-compose.yml`, and the first migration
(identity + tenancy + RLS), followed immediately by the tenant-isolation test harness, before any feature screens.
