# HANDOFF — SchoolOS (School ERP)

Everything needed to continue this project without the original chat history.
Last updated **2026-10-17**. Last feature commit on `main`: `c3b31f3` (school calendar).

The deeper design pack lives in [`docs/`](docs/README.md). This file is the short, practical version
plus everything that was decided in conversation and never written down elsewhere.

---

## 1. What the app is

**SchoolOS** (placeholder name; placeholder domain `schoolos.in`) is a **multi-tenant School Management
SaaS**: one codebase and one database serving many independent schools, with strict isolation so no
school can ever see another school's data. It's a commercial product, not a college project. The
owner's guiding line: *"Powerful underneath, extremely simple on the surface."*

**Target users**
- **Platform staff** (super admin, support): onboard schools, set plans and feature flags, monitor, support
- **School staff on the web**: school admin, principal, accountant, teachers
- **Parents**: on the mobile app (and a responsive parent web view)
- **Teachers**: on the mobile app too
- No student logins in V1. Students are seen through their parents.

**Market**: small and medium Indian schools. UI is English-only but i18n-ready. Money is INR, the
gateway is Razorpay, SMS is MSG91 (needs DLT registration), and data stays in India (GCP `asia-south1`).

**Current stage**
- All 8 planned phases are built and tested **locally**, plus a round of parent–teacher features and a
  school calendar.
- **Nothing is deployed yet.** Deployment is fully scripted but has never run, because the owner hasn't
  created the cloud accounts or bought a domain.
- The mobile app runs in Chrome or as a Flutter web build. There are no store builds yet (no Xcode,
  Android Studio or Firebase).
- Test status at last run (2026-10-14):
  - API: 500 passed, 22 skipped (the skips are live-Gemini evaluation cases)
  - Browser (Playwright): 28 passed
  - Flutter: 22 passed
  - contracts and permissions package tests: passed
  - lint, typecheck and OpenAPI drift check: clean
- **Not confirmed**: whether GitHub Actions CI is green for `c3b31f3`. No `gh` CLI was available to check.

---

## 2. Tech stack and architecture

| Layer | Choice (pinned versions in each `package.json`) |
|---|---|
| Monorepo | pnpm 9.15.9 workspaces + Turborepo 2 · Node ≥ 22.18 (`.nvmrc`) |
| API | NestJS 12 (ESM, built with SWC) · TypeScript **5.9.3** (pinned on purpose) · Zod 4 |
| DB | PostgreSQL 17 · Prisma 7 (`prisma-client` generator, `@prisma/adapter-pg`, `prisma.config.ts`) · **Row-Level Security** on every tenant table |
| Jobs | BullMQ 6 **on PostgreSQL** (schema `bullmq`, no Redis) + transactional outbox |
| Web | Next.js 16 (App Router, Turbopack, `proxy.ts` instead of middleware) · React 19 · Tailwind 4 · TanStack Query 5 · React Hook Form · radix-ui · cmdk · sonner · lucide |
| Mobile | Flutter 3.47+ · Riverpod 3 · dio · flutter_secure_storage · shared_preferences · razorpay_flutter |
| PDFs | puppeteer-core with Chrome/Chromium (report cards, receipts) |
| AI | Provider interface: Gemini (REST function calling) or an offline "mock" rules provider |
| Video | Jitsi Meet (public `meet.jit.si` by default) |
| Tests | Vitest (API against a real Postgres with RLS) · Playwright (`apps/e2e`) · flutter test |
| Infra (scripted, not run) | Google Cloud Run + Cloud SQL + Cloud Storage + Secret Manager + Cloud Build; Cloudflare DNS + Worker at the edge |

### Folder structure

```
apps/
  api/                 NestJS API (+ worker entrypoint)
    prisma/schema.prisma       93 models; migrations in prisma/migrations/
    scripts/                   dev-db.mjs (embedded PG), pg-cluster.mjs, apply-sql.mjs (RLS + grants, run after
                               every migrate), generate-keys.mjs, gen-tenant-models.mjs, setup-roles.mjs (cloud)
    src/
      main.ts / bootstrap.ts   HTTP server; worker.ts = jobs-only process
      app.module.ts            wires every module
      config/env.ts            Zod-validated env (app refuses to start on bad config) — source of truth for env vars
      config/routes.ts         API_PREFIX (/v1)
      core/                    cross-cutting services:
        auth/                  guard, decorators (@Public/@Authenticated/@SchoolMember/@RequirePermission/@RequirePlatform),
                               token (EdDSA JWT), password (argon2id), route-access.check (every route must declare access)
        context/               RequestContextStore (AsyncLocalStorage): school(), tenant(), runAsSystem()
        prisma/                PrismaService (tenant-scoped `db`, `tenantTx`) + PlatformPrismaService (cross-school; lint-restricted)
        permissions/           ScopeService (ALL / ASSIGNED / OWN_CHILDREN / SELF → Prisma where clauses)
        audit/ outbox/ queue/ (QueueService, SchedulerService) idempotency/ rate-limit/ storage/ (local + GCS)
        notify/channel-gateway.ts   push / SMS / email providers (console now; FCM/MSG91/Resend slots)
        payments/              Razorpay client + mock sandbox gateway, AES-GCM secret box
        pdf/ entitlements/ settings/ errors/ logger/ health/ cache/ util/dates.ts
      modules/                 one folder per feature: academics, ai, attendance, auth, calendar, communication
                               (messages, meetings, reminders), dashboard, documents, exams (+ performance), fees,
                               finance, files, guardians, homework, imports, me, members, mobile, notices,
                               notifications, platform, public, reports, school, schools, search, students,
                               teachers, timetable, webhooks
      seed/seed.ts             demo school + idempotent top-up steps; demo logins listed at the top of the file
    test/                      *.e2e.test.ts per module; helpers.ts (createTestApp, createTenant fixtures);
                               isolation.e2e.test.ts (cross-tenant probes); contracts.e2e (route registry);
                               mobile-routes.test.ts (app calls only real routes); ai-eval.live.test.ts (needs Gemini)
  web/                 Next.js app
    src/proxy.ts               subdomain → school, token refresh
    src/app/api/v1/[...path]   BFF: relays to the API with httpOnly cookies (sos_at / sos_rt) + CSRF check
    src/app/(app)/             school pages (dashboard, students, attendance, exams, fees, calendar, messages, …)
    src/app/(app)/my/          parent web view (attendance, homework, timetable, results, fees, documents)
    src/app/platform/          super-admin console (served on admin.<domain>)
    src/components/            feature components; shell/nav.ts = navigation + permissions per item
    src/lib/                   api-client, hooks (useData, useAction, useTabParam…), me (useMe().can), child (parent's child switcher), edge, bff
  mobile/              Flutter app (one app; parent or teacher home by role) — see apps/mobile/README.md
    lib/core/                  api_client, session, token_store, models (mirror packages/contracts), theme, attendance_queue
    lib/features/              auth, parent, teacher, connect (messages/meetings/reminders/calendar), shell, common
    lib/widgets/               common.dart, charts.dart (radar, progress line), home_kit.dart (home screen design kit)
  e2e/                 Playwright browser tests — see apps/e2e/README.md
packages/
  contracts/           Zod request schemas + response types shared by API/web; src/endpoints.ts = ENDPOINTS registry
                       (must match real routes); openapi.json generated from it
  permissions/         catalog.ts (every permission key + allowed scopes), roles.ts (role templates copied into each new school)
  ui/                  design system (tokens in styles.css with per-school OKLCH accent; Button, Field, Dialog, Table…)
infra/                 gcp/ (bootstrap.sh, deploy.sh, cloudbuild.yaml, config.sh) and cloudflare/ (worker.js) — see infra/README.md
docs/                  planning pack 01–12, SETUP-LATER.md (every missing account/key), 12-roadmap.md (progress log)
.github/workflows/     ci.yml (lint → openapi drift → typecheck → test → build; e2e; flutter; docker images), deploy.yml
```

### How a request flows
1. Browser → `stmarys.<domain>` → Next.js `proxy.ts` resolves the school from the subdomain.
2. Browser calls `/api/v1/...` (the BFF). The BFF attaches the access token from the httpOnly cookie,
   plus the `X-School-Slug` and `X-Client-IP` headers (with `BFF_SHARED_SECRET`), and calls the API.
3. API guard checks the JWT, then checks that the token's school matches `X-School-Slug`. The route's
   declared access rule (permission + scope) comes next.
4. Services use `PrismaService.db`. The tenant extension injects `schoolId` and sets
   `app.school_id` per transaction, and Postgres RLS enforces it again at the database.
5. Side effects (notifications etc.) go through the outbox, then BullMQ queues on Postgres, then
   handlers. Locally they run inside the API process (`RUN_WORKERS=true`).
6. The mobile app calls the API directly with a Bearer token (no BFF).

**Tenant isolation has 3 layers**: JWT bound to a school; Prisma auto-scoping; Postgres RLS. The
`schoolos_app` role can't bypass RLS. `schoolos_platform` uses explicit `platform_all` policies,
because Cloud SQL can't grant `BYPASSRLS`.

---

## 3. How to run it locally

Requirements:
- Node 22 via nvm. Every new shell needs `export NVM_DIR="$HOME/.nvm"; . "$NVM_DIR/nvm.sh"`.
- pnpm 9.
- Chrome installed, for PDFs and Playwright.
- Flutter 3.47+ for the app.
- **No Docker needed.** Postgres comes from npm (`embedded-postgres`).

```bash
pnpm install
cp apps/api/.env.example apps/api/.env
pnpm --filter @schoolos/api keys:generate        # prints JWT_PRIVATE_KEY, JWT_PUBLIC_KEY, PAYMENT_SECRETS_KEY → paste into apps/api/.env
# also fill BFF_SHARED_SECRET and STORAGE_SIGNING_SECRET in apps/api/.env (any random 32+ chars)
cp apps/web/.env.example apps/web/.env.local     # BFF_SHARED_SECRET must equal the API's

pnpm db:start                                     # terminal 1 — PostgreSQL 17 on :54329 (data in apps/api/.data/pg), keep running
pnpm --filter @schoolos/api db:deploy             # once — apply migrations + RLS policies (see gotcha about migrate dev)
pnpm db:seed                                      # once — demo school (idempotent; safe to re-run)

pnpm --filter @schoolos/api build && (cd apps/api && RUN_WORKERS=true pnpm start)   # terminal 2 — API on :4000
#   or: pnpm --filter @schoolos/api dev          # watch mode (swc -w + node --watch)
pnpm --filter @schoolos/web dev                   # terminal 3 — web on :3000

cd apps/mobile && flutter run -d chrome           # app in a browser (API allows localhost CORS in development)
#   or: flutter run -d web-server --web-port 8686 --web-hostname localhost
#   Android emulator uses 10.0.2.2:4000 automatically; other API: --dart-define=API_URL=https://…
```

Open:
- School site: **http://demo.localhost:3000** (the "find your school" screen takes `demo`)
- Platform console: **http://admin.localhost:3000**
- App: http://localhost:8686, or the Chrome window that Flutter opens

Demo logins are listed at the top of `apps/api/src/seed/seed.ts`:
- `admin@`, `principal@`, `accountant@`, `teacher@` and `parent@demo.school`
- `emp-002@demo.school` … `emp-040@demo.school` (one per teacher)
- `superadmin@schoolos.local` and `support@schoolos.local`

The password for all of them is `SEED_PASSWORD` from `apps/api/.env`. One-time codes print to the API
log as `[dev OTP]`; no SMS is sent.

The demo parent's children are Rahul (8-A) and Ananya (5-B). The demo teacher is the 8-A class teacher.

**Checks** (CI runs all of these):

```bash
pnpm lint
pnpm typecheck
pnpm test                                         # API tests spin up their own throwaway Postgres
pnpm build
pnpm --filter @schoolos/contracts openapi         # regenerate openapi.json; CI fails if it's stale
pnpm e2e                                          # Playwright: builds API+web, own DB, ports 4100/3100
cd apps/mobile && flutter analyze && flutter test
pnpm --filter @schoolos/api ai:eval               # live AI evaluation — only once GEMINI_API_KEY exists
```

`pnpm db:reset` wipes and re-seeds the local DB. It asks for confirmation, and Prisma refuses to run it
from an AI agent without explicit human consent. Don't bypass that.

---

## 4. Environment variables

All names are in [`.env.example`](.env.example) at the root, with empty values. The files the apps
actually read are listed below; their committed `.example` versions contain **local-only** defaults.
The authoritative list, with validation rules, is `apps/api/src/config/env.ts`.

**API: `apps/api/.env`**

| Variable | Purpose |
|---|---|
| `NODE_ENV`, `PORT`, `LOG_LEVEL` | Runtime basics (API on 4000) |
| `PG_PORT` | Port of the embedded local Postgres (54329) |
| `DATABASE_URL` | Owner role: migrations only |
| `APP_DATABASE_URL` | Runtime role `schoolos_app`, subject to RLS |
| `PLATFORM_DATABASE_URL` | Platform role: auth, super admin, cross-school jobs |
| `QUEUE_DATABASE_URL` | Optional; BullMQ DB (defaults to the platform URL) |
| `DB_POOL_SIZE` | Optional pool size (default 5) |
| `JWT_PRIVATE_KEY`, `JWT_PUBLIC_KEY` | Ed25519 keys for access tokens (`keys:generate`) |
| `JWT_ISSUER`, `ACCESS_TOKEN_TTL_SECONDS` | Token issuer / lifetime (15 min) |
| `OTP_PEPPER` | Secret pepper for hashed one-time codes |
| `OTP_PROVIDER` | `console` (dev) or `msg91` |
| `MSG91_AUTH_KEY`, `MSG91_SENDER_ID`, `MSG91_OTP_TEMPLATE_ID` | SMS once DLT-registered |
| `APP_BASE_DOMAIN` | Schools live at `<slug>.<domain>` (`localhost` locally) |
| `SEED_PASSWORD` | Password for every demo user (local only) |
| `BFF_SHARED_SECRET` | Shared with the web BFF so the API trusts the forwarded client IP |
| `EDGE_SHARED_SECRET` | Cloud only: the Cloudflare Worker adds it; requests without it get 404 |
| `QUEUE_BACKEND`, `REDIS_URL` | `postgres` (default) or `redis` + URL |
| `RUN_WORKERS` | Run job processors + outbox relay inside the API ("lean mode") |
| `STORAGE_DRIVER` | `local` (dev) or `gcs` |
| `STORAGE_SIGNING_SECRET` | Signs local upload/download links |
| `STORAGE_LOCAL_DIR`, `STORAGE_LOCAL_URL_BASE` | Optional local-driver paths |
| `GCS_PROJECT_ID`, `GCS_PRIVATE_BUCKET`, `GCS_PUBLIC_BUCKET` | Cloud Storage |
| `PUSH_PROVIDER` | `none` / `console` / `fcm` (FCM slot not implemented yet) |
| `SMS_PROVIDER` | `none` / `console` / `msg91` |
| `EMAIL_PROVIDER` | `none` / `console` / `resend` |
| `RESEND_API_KEY`, `EMAIL_FROM` | Email via Resend |
| `PDF_RENDERER` | `chromium` or `basic` (plain-text PDFs for CI) |
| `CHROMIUM_PATH` | Browser binary (empty = default location) |
| `PAYMENTS_GATEWAY` | `mock` sandbox (refused in production) or `razorpay` |
| `PAYMENT_SECRETS_KEY` | AES-256-GCM key encrypting each school's Razorpay secret |
| `PUBLIC_API_URL` | Public API URL, shown to schools as their webhook URL |
| `AI_PROVIDER` | `mock` (offline, refused in production), `gemini` or `none` |
| `GEMINI_API_KEY`, `AI_MODEL` | Gemini (default model `gemini-2.5-flash`) |
| `MEETING_BASE_URL` | Jitsi host for parent–teacher video meetings (default `https://meet.jit.si`) |
| `MOBILE_MIN_VERSION`, `MOBILE_LATEST_VERSION` | Forced-update gate for the app |
| `MOBILE_ANDROID_URL`, `MOBILE_IOS_URL` | Store links |

**Web: `apps/web/.env.local`**

| Variable | Purpose |
|---|---|
| `API_URL` | Where the BFF reaches the API (server-side only) |
| `APP_BASE_DOMAIN` | Same as the API |
| `BFF_SHARED_SECRET` | Must equal the API's |
| `EDGE_SHARED_SECRET` | Cloud only |
| `CLIENT_IP_HEADER` | Cloud only (`cf-connecting-ip`) |

**Scripts and tests only**
- `ADMIN_DATABASE_URL`, `OWNER_PASSWORD`, `APP_PASSWORD`, `PLATFORM_PASSWORD`: used by
  `apps/api/scripts/setup-roles.mjs` to create database roles in the cloud.
- `TEST_LOG_LEVEL`: API test log level.
- `CI`: set by GitHub.

**Mobile**: there's no env file. The API URL defaults per platform; override it with
`--dart-define=API_URL=…`.

**GitHub Actions repository variables**, needed only for `deploy.yml`:
`GCP_STAGING_PROJECT`, `GCP_STAGING_WIF_PROVIDER`, `GCP_STAGING_DEPLOY_SA`, `DOMAIN`,
`GCP_PRODUCTION_PROJECT`, `GCP_PRODUCTION_WIF_PROVIDER`, `GCP_PRODUCTION_DEPLOY_SA`.

---

## 5. Done (finished, tested, working locally)

Details per phase are in `docs/12-roadmap.md` → *Progress log*.

**Foundation**
- Tenancy: 3-layer isolation, plus an automated cross-tenant probe suite and an RLS coverage check.
- Auth:
  - password and OTP sign-in
  - refresh rotation with reuse detection
  - devices / sessions, lockout, rate limits
- RBAC: permission catalog with scopes, editable roles per school, and a startup check that every
  route declares access.
- Platform services:
  - audit log
  - outbox and Postgres queues
  - storage with magic-byte checks
  - idempotency keys
  - OpenAPI generated from the contracts
  - ESLint guardrails

**Core school**
- Academic years, classes, sections, subjects and teaching assignments.
- Teachers, parents and students.
- Users and the roles editor.
- Excel/CSV import for students and teachers (v1); classes, subjects and fees (v2).
- School profile and branding, the 10-step onboarding wizard, year-end promotion, ⌘K search.

**Daily operations**
- Notification engine: per-school rules, in-app inbox, channel deliveries.
- Attendance:
  - fast register, edit window, offline replay
  - staff attendance and monthly grid
  - absence/late alerts and an "arrived at school" alert
- Homework, including submissions and teacher notes.
- Timetable with clash detection.
- Notices with audiences and read receipts.
- Role-aware dashboard and the parent web view.

**Exams**
- Grading scales and exams with date sheets.
- Marks entry: keyboard grid, lock/unlock, Excel import.
- Results: compute, publish, ranks.
- Report-card PDFs, consolidated term report cards, co-scholastic areas.
- Performance analytics (`GET /v1/students/:id/performance`): radar by subject, progress line, trends.

**Finance**
- Fee heads, structures with installments, concessions.
- Invoices with gap-free numbering.
- Counter payments, receipts (with DUPLICATE COPY on reprint), day close.
- Razorpay per school: checkout, webhooks, reconciliation, refunds. The mock sandbox mirrors it.
- Late-fee and reminder jobs.
- 6 finance reports.

**Platform**
- Super-admin console: schools, plans, feature flags, users, support access, system, audit.
- Entitlements and plan limits.
- Documents and the report engine (PDF/Excel/CSV exports).
- Settings sections and dark mode.

**Mobile app** (runs in Chrome / Flutter web)
- Sign-in, school picker, forced update.
- Parent:
  - new home design
  - academics (attendance, homework, timetable, results with radar chart)
  - fees with Razorpay checkout or the sandbox
  - calendar, messages, meetings, reminders
  - notifications, profile and documents
- Teacher:
  - home
  - offline attendance
  - homework with camera photos
  - marks entry
  - classes, calendar, messages, meetings

**AI assistant**
- 8 permission-checked report tools.
- Personal data is masked before it reaches the provider.
- Usage is metered per plan.
- Worksheet drafts, with "use as homework".
- 22-case evaluation set, including Hindi and Hinglish.
- Works offline with the mock provider.

**Parent–teacher features** (2026-10-13)
- Session attendance tracking.
- Results charts.
- Jitsi video meetings with reminders.
- Parent reminders and alarms.
- Messages and complaints: categories, statuses, read receipts.
- Parents can message their child's **class and subject teachers**. Teachers without an app login show
  as "not on the app yet".

**School calendar** (2026-10-14)
- Holidays, vacations, events and parent–teacher meetings, managed by the office, optionally announced.
- Exam dates come from the exams themselves; parents also see their child's papers.
- Available on the web at `/calendar` and on the app's Calendar screen. On the app home it replaced the
  Documents tile; Documents stays under Profile.

**Deployment tooling**
- Dockerfiles, built in CI.
- GCP bootstrap and deploy scripts.
- Cloud Build config.
- Cloudflare Worker.
- Deploy workflow. It does nothing until the repository variables exist.

**Browser tests**: 28 Playwright tests covering the critical paths. They found 4 real bugs, which were
then fixed.

---

## 6. In progress (half-built)

**There is no uncommitted or half-written code.** The working tree was clean at handoff, and every
feature in §5 is complete with tests. The following were started but stopped at a clear boundary:

| Item | State | Where it stopped |
|---|---|---|
| **Push notifications (FCM)** | API side ready: device tokens `PUT/DELETE /v1/me/devices`, deliveries queued per channel. The provider is a placeholder | `apps/api/src/core/notify/channel-gateway.ts` (the `fcm` branch only counts tokens). App: no `firebase_messaging` yet, so `flutterfire configure` has never been run |
| **Store builds (Phase 7, milestone M7)** | App works on the web. No iOS/Android release builds | `apps/mobile/android/app/build.gradle.kts` still has Flutter's TODOs (application id, release signing). Bundle id is `in.schoolos.schoolos` (rename with the product name) |
| **Deployment** | Fully scripted, never executed | `infra/README.md` steps 1–4. Needs a GCP project, a domain on Cloudflare, and GitHub repo variables |
| **Live AI evaluation** | Offline evaluation passes in CI. Live run never done | `apps/api/test/ai-eval.live.test.ts` and `pnpm --filter @schoolos/api ai:eval` need `GEMINI_API_KEY`. Then switch the `ai_assistant` flag on per school |
| **Platform console walkthrough (M6)** | API proven by tests. A full click-through in the browser was never done | `apps/web/src/app/platform/*` |
| **Phase 0 housekeeping** | Not done | Branch protection on `main`; closing the open questions at the end of docs 01–11 |

---

## 7. Pending (priority order)

1. **Confirm CI is green on GitHub** for `main`.
   - Go to the Actions tab of `manashsingh52/School_ERP`, or run `gh run list` with `gh` authenticated.
   - Jobs: `check`, `e2e`, `mobile`, `docker`.
   - If something fails, reproduce it locally with the commands in §3.
2. **Push notifications (FCM)**. This is the biggest functional gap: reminders, "arrived at school",
   meeting alerts and messages all go only to the in-app inbox today.
   - Needs the owner's Firebase project (SETUP-LATER #12).
   - Implement the `fcm` branch in `channel-gateway.ts` with the Firebase Admin SDK or the HTTP v1 API,
     using service-account JSON from Secret Manager, never committed.
   - App: add `firebase_messaging`, register the token via `PUT /v1/me/devices` after sign-in (the API
     already removes it on sign-out), and handle taps with `data.route`.
   - Route mapping already exists: `openConnectRoute` in `apps/mobile/lib/features/connect/connect_row.dart`
     and the notifications screen's mapper.
3. **Deploy staging** (`infra/README.md`). Needs a GCP project with billing (the owner has a **$300 /
   3-month trial credit**; keep lean mode; budget alerts at $50/$80/$100) and a domain on Cloudflare.
   - Run `bootstrap.sh`, then `deploy.sh roles`, then `deploy.sh`.
   - Then set the GitHub repo variables so `deploy.yml` auto-deploys staging after CI.
   - Staging scales to zero, so scheduled jobs (late fees, reminders, meeting alerts) run only while an
     instance is awake.
4. **Gemini key, then the live AI evaluation**. Every case must pass before `AI_PROVIDER=gemini` is
   used for a real school (SETUP-LATER #19).
5. **Store builds**: Xcode + CocoaPods, Android Studio, the Apple Developer and Google Play accounts
   (these need the company registration), application id, signing, privacy labels (SETUP-LATER #16–18).
6. **Real SMS/OTP via MSG91**. Blocked until the owner's company is registered and DLT-approved
   (SETUP-LATER #3–4). Until then, password login works and OTPs print to the log.
7. **Razorpay settlement (bank UTR) reconciliation**. Needs a school's live Razorpay account to see
   real settlement data. Order and refund reconciliation already exist (`modules/finance`).
8. **Email via Resend** (`EMAIL_PROVIDER=resend`; domain SPF/DKIM/DMARC). The code path exists in
   `channel-gateway.ts`.
9. **Module READMEs**: part of the Definition of Done in docs/12, never written. Each needs its
   purpose, permissions, events emitted and jobs.
10. **Smaller follow-ups** noted along the way:
    - promotion wizard: UI to detain individual students (the API supports it)
    - per-class subject editing beyond the grid
    - documents for non-teaching staff
    - saved/scheduled reports
    - custom report-card layouts per school
    - notification quiet hours and per-school send caps (planned in docs/12 Phase 3, not built)
    - convenience fee on online payments (open question in docs/11)
    - online subscription billing (V1.1; plans are billed manually today)
    - Sentry (`SENTRY_DSN` at deploy time)
11. **Before the first real school**: legal review (DPA, privacy policy, DPDP Act, docs/09 §7), a final
    product name and domain (replace "SchoolOS" / `schoolos.in` everywhere), and DNS + Cloudflare Access
    for `admin.<domain>`.

Everything that needs an account or key is tracked in [`docs/SETUP-LATER.md`](docs/SETUP-LATER.md),
and each slot is marked `⏸` in the code (`git grep ⏸`).

---

## 8. Decisions and why

**Confirmed by the owner (don't re-ask):**

| Decision | Why |
|---|---|
| Subdomain per school (`stmarys.<domain>`); `admin.<domain>` for the platform | Clean branding per school; one deployment |
| One shared Postgres, `school_id` on every row, Prisma auto-scoping **and** RLS | Cheapest to run; RLS is the safety net if app code forgets a filter |
| One global `User`, a `Membership` per school, roles per membership | Parents/teachers in two schools use one login with a school switcher |
| Own NestJS auth (JWT + rotating refresh, OTP) — no Auth0/Firebase Auth | Control and cost; OTP sends only to known phones (SMS-pumping defence) |
| Each school connects **its own Razorpay account**; the platform never holds school money | Regulatory simplicity |
| **Full payments only — no partial payments, no cheque/DD**. Counter takes cash, UPI, bank transfer, card | Owner: "as in apps which are in market" |
| No SMS/DLT yet — console OTP in dev; password login works | Company not registered yet |
| Cloud budget: **$300 GCP credit for 3 months** → build locally first, lean mode in cloud | Cost |
| Parent **web view** built early (Phase 3), before the Flutter app | Lets a school go live sooner |
| Mostly solo developer → web + API first, Flutter later | Team size |
| No student login in V1; English UI only, i18n-ready | Scope |
| Monolith (modular NestJS), **no microservices/Kafka/Kubernetes** | From the owner's master prompt |
| Placeholder brand "SchoolOS"; anything without an account gets a **slot** (marked `⏸`) | Owner: "whatever you don't have, keep a place for it; I'll add it at the end" |
| Docker optional — "install later, proceed with code" | Docker Desktop was never installed on the owner's Mac |
| Video meetings must be **free** (no paid Zoom) → Jitsi | Owner's requirement |
| App home redesigned after a reference screenshot (avatar header, colourful feature-icon grid, "Your Subjects" cards with score rings, pill bottom nav) | Owner asked for "good UI, combination of colours" |
| Parents message only teachers who actually teach their child (class + subject teachers), plus the office | Owner's requirement |
| Calendar replaces Documents on the app home; Documents moved to Profile/Settings | Owner's requirement |

**Technical choices (where code differs from the plan in docs; full table in docs/12 "Implementation notes"):**

| Plan | Built | Why |
|---|---|---|
| Postgres in Docker | `embedded-postgres` (real PG 17 from npm) | No Docker; CI needs no service container |
| Redis/Upstash for BullMQ | **BullMQ on PostgreSQL** | One less service, ~$10–20/month saved; `QUEUE_BACKEND=redis` switches back |
| RLS SQL inside migrations | `scripts/apply-sql.mjs`, run after every migrate; it **discovers** every `school_id` table and fails if one is uncovered | A new table can't be forgotten |
| Session revocation / rate limits in Redis | DB session check (30 s cache) / in-memory store behind an interface | No Redis; fine for one instance — revisit when scaling out |
| Generated Dart API client | Hand-written client + models, guarded by `mobile-routes.test.ts` and model-parsing tests | Response types are TS interfaces only; the generator also needs Java |
| Drift/SQLite offline queue | `shared_preferences` | Queue holds a few registers; works on web |
| Google HTTPS load balancer | Cloudflare Worker + edge secret | ~$18/month saved on credits |
| Platform role with `BYPASSRLS` | `platform_all` RLS policies | Cloud SQL can't grant `BYPASSRLS` |
| Latest TypeScript | Pinned **5.9.3** | TS 7 native compiler is new; Nest relies on decorator metadata |
| Design tokens package | CSS variables in `packages/ui/src/styles.css` | One React client |
| Scheduled publishing via cron | Delayed queue jobs that re-check state when they fire | Rescheduling/deleting is safe |

**Tried and dropped**
- Upstash Redis was the first choice for queues; dropped for BullMQ on Postgres.
- `prisma migrate dev` for creating migrations hung. Use `migrate diff` + `deploy` instead (see §9).
- The first permission backfill migration (`20261013100000_parent_communication`) silently inserted
  nothing because of FORCE RLS. It was fixed by `20261013110000_grant_communication_permissions`.
  Both are kept; never edit an applied migration.
- The old GitHub repo `manash0059/School_erp`, on another account, was abandoned. The current repo is
  `manashsingh52/School_ERP`.

---

## 9. Known bugs and gotchas

**Database and migrations**
- **New migration workflow**. `prisma migrate dev` hangs. Use this instead, then commit the folder:

  ```bash
  cd apps/api
  npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script > prisma/migrations/<YYYYMMDDHHMMSS>_<name>/migration.sql
  pnpm db:deploy
  pnpm generate
  ```

- **FORCE RLS applies even to the table owner.** A data migration that inserts or updates
  tenant rows (e.g. granting new permissions to existing schools' roles) must first run
  `ALTER TABLE … NO FORCE ROW LEVEL SECURITY`, then do the work, then `ALTER TABLE … FORCE ROW LEVEL
  SECURITY`. See `20261013110000_*` and `20261014090000_school_calendar`. `apply-sql.mjs` re-forces RLS
  after every deploy.
- **New permission keys** go in four places:
  - `packages/permissions/src/catalog.ts`
  - role templates in `roles.ts` (applies only to new schools)
  - a data migration for existing schools
  - the seed if needed
- **Nested Prisma creates are not auto-scoped.** Set `schoolId` explicitly on nested rows.
- **In background jobs use `RequestContextStore.school()`**, not `tenant()`. `tenant()` needs a signed-in
  member and throws in jobs.

**Registries the tests enforce**
Every new route needs all of these, or tests fail:
- an `ENDPOINTS` entry in `packages/contracts/src/endpoints.ts`, which must match the real routes and
  access rules
- for every `:id` route, a `CROSS_TENANT_PROBES` entry in `apps/api/test/isolation.e2e.test.ts` (or an
  entry in `NON_TENANT_ID_ROUTES`), with a fixture in `test/helpers.ts` `createTenant`
- a regenerated `openapi.json`
- if the app calls it, `mobile-routes.test.ts` checks the route exists

Routes for another school's record must return **404**. Probes catch 200/422 responses; validation
running before the existence check returns 422 instead of 404.

**Queues and tests**
- **BullMQ job ids can't contain `:`**. The scheduler strips them.
- **Date bombs**: test fixtures use 2026–27 dates. A fixture due date was already moved
  (`Term 2 due → 2027-01-10`) because it passed real time. If date-based tests start failing after a
  date passes, check fixtures in `test/helpers.ts` first.
- **Sign-in rate limit**: 5 per minute per account. Playwright signs each role in once
  (`tests/auth.setup.ts`) and reuses the storage state.
- Don't chain checks with `| tail`; it hides failing exit codes. One commit went in with lint errors
  that way.

**Next.js**
- Page files can't export extra names. Put shared constants in `lib/` or `components/`.
- `packages/ui` uses **extensionless imports**, because Turbopack couldn't resolve `.js` there.
- The ESLint hooks rule treats any function named `useX` as a hook. Name non-hooks differently, e.g.
  `applyCredit`, `sendToHomework`.
- `next dev` and `turbo` rewrite managed blocks in `AGENTS.md` / `apps/web/AGENTS.md`. Commit them as-is.
- Stale `.next/dev/types` errors after big changes: delete `.next/dev/types`. The production build is
  the truth.

**Flutter**
- **Don't run `dart format` on all of `apps/mobile/lib`.** The codebase uses long lines, and a
  whole-tree format creates a huge noise diff. Format only the files you touch, or not at all.
- Riverpod 3 automatic retry is disabled on purpose: `ProviderScope(retry: (_, _) => null)`.

**Environment**
- **iCloud-synced folders** (the project lived on an iCloud Desktop):
  - iCloud creates `" 2"` conflict copies, e.g. `routes.d 2.ts` in `.next/types`, `app.module 2.js` in
    `dist`, and files inside `apps/api/.data/pg`.
  - Fix: delete the generated ones (`find apps/web/.next -name "* [0-9].*" -delete`, or rebuild `dist`).
  - Never sync a live database folder. Keep the repo outside iCloud/Dropbox.
- **Starting the API**: root `pnpm start` doesn't exist. Build in `apps/api`, then start there, or use
  `pnpm --filter @schoolos/api dev`. `pnpm start` runs `dist/`, so rebuild after changes.

**Behaviour to know about**
- **Jitsi on the public `meet.jit.si`**: the first person to join must sign in with Google/GitHub to open
  the room. A self-hosted Jitsi or JaaS removes that (`MEETING_BASE_URL`, SETUP-LATER #20).
- Development-only modes are refused in production on purpose: the mock payment gateway, the mock AI,
  the console OTP and local storage.

**Repo conventions**
- Commit messages and docs must **not mention AI tools or assistants**: no `Co-Authored-By` trailers or
  similar. Write plain, descriptive commit messages. The owner asked for this explicitly.
- The owner approves every push to `main`.

---

## 10. Services and accounts

| Service | Used for | Status |
|---|---|---|
| GitHub — `manashsingh52/School_ERP` | Code, Actions CI | **Active** (owner's account). Pushing needs a token with `repo` **and** `workflow` scopes |
| GitHub Actions | CI (`ci.yml`), deploy (`deploy.yml`) | CI active; deploy idle until repo variables exist |
| Jitsi Meet (`meet.jit.si`) | Video meetings | **In use** (free, no account) |
| Google Cloud: Cloud Run, Cloud SQL (PG 17), Cloud Storage, Secret Manager, Artifact Registry, Cloud Build, Workload Identity Federation — region `asia-south1` | Hosting | Scripted, **not created**. Owner has a $300 trial credit |
| Cloudflare: DNS, TLS, WAF, Worker | Edge for `*.<domain>` and `api.<domain>` | Not created; no domain bought yet |
| Razorpay | Online fees (each school's own account) | Not set up; mock sandbox used |
| MSG91 | SMS / OTP | Blocked on company + DLT registration |
| Resend | Email | Not set up |
| Firebase Cloud Messaging | Push notifications | Not set up |
| Google AI Studio / Vertex — Gemini | AI assistant | No key yet; mock provider used |
| Sentry | Error monitoring | Planned at deploy time |
| Upstash Redis | Optional queue backend | Not needed |
| Apple Developer, Google Play Console | Store releases | Not set up (need company registration) |

No credentials for any of these are in the repo.

---

## 11. Exact next step

1. Clone the repo and follow §3 until all three of these work: http://demo.localhost:3000 (sign in as
   `admin@demo.school`), http://admin.localhost:3000, and the Flutter app in Chrome (sign in as
   `parent@demo.school`).
2. Run the full check suite in §3 and open the repo's **Actions** tab. Confirm that CI for the latest
   `main` commit is green, and fix anything red first.
3. Ask the owner which account they'll set up first:
   - **Firebase**, for push notifications (§7 item 2)
   - **GCP + domain**, to deploy staging (§7 item 3)
   - **Gemini key**, for the live AI evaluation (§7 item 4)

   Each one unblocks a ready-made slot. If none is available yet, start on account-free work: module
   READMEs and the small follow-ups in §7 item 10.
