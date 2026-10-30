# 12 — V1 Roadmap

Built by **one developer**: web + API first, Flutter after the core is stable.
This follows the Master Prompt's phase order (§71), with a few items pulled earlier where a later
phase depends on them (marked ⤴).

Estimates are **focused-week ranges** for a solo developer. Treat them as planning guides, not promises.

## Phase 0: Setup (≈1 week)

- [x] Node 22 (nvm), pnpm 9, Google Cloud CLI installed on the dev Mac (2026-10-07)
- [ ] **Docker Desktop** (needs your admin password; see the note at the end)
- [ ] Git repo + GitHub (private), branch protection on `main`
- [ ] Buy the domain (placeholder `bastaa.in`) and add it to Cloudflare
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

### 2026-10-08: Phase 4 complete — exams ✅ (294 tests)

**Milestone M4 met:** a branded report card PDF for a whole class is generated in one click (25 cards in ~3 s with Chromium; "Download all" merges them into one printable PDF).

- [x] Grading scales with presets (CBSE 9-point, A–E, percentage only); a scale can't change once results are published with it
- [x] Exams: draft → date sheet published → marks entry → results published (archived instead of deleted once marks exist); class × subject grid with max/pass marks, dates and times, "copy to other classes"
- [x] Marks entry sheet: subject teacher (or class teacher where no subject teacher), Enter/↓ to move, A = absent, E = exempt, inline validation, 409 on stale sheets, audited corrections, lock/unlock, progress per teacher
- [x] Results: compute → preview → publish; totals, %, grade, pass/fail (absent fails the subject, exempt is left out), INCOMPLETE blocks publishing, competition ranks per section and class, attendance %, teacher/principal remarks, withhold one result, unpublish or forced (audited) recompute; parents notified
- [x] Report cards: Chromium HTML→PDF in the worker (`documents` queue), versioned files, merged section PDF, parent download after publishing
- [x] Parent web view: date sheet and results per child, report card download
- [x] Demo data: CBSE scale, "Unit Test 1" published for all 751 students, "Half-Yearly" in marks entry with Classes 8–9 still to fill

PDFs use **puppeteer-core** with the machine's Chrome locally and the container's Chromium in production (`CHROMIUM_PATH`). `PDF_RENDERER=basic` gives plain-text PDFs for CI without a browser.

Known follow-ups (small): co-scholastic areas and term-wise (multi-exam) consolidated report cards, custom report card layouts per school, marks import from Excel.

**Next: Phase 5 (finance)** — fee structures, invoices, Razorpay online payments, counter collection, receipts.

### 2026-10-08: Phase 5 complete — finance ✅ (347 tests)

**Milestone M5 met:** a parent paid ₹18,800 online (sandbox gateway) and got receipt RCPT/2026-27/001453 as a PDF; the accountant collected ₹27,400 at the counter (RCPT/…/001454) and the day close balanced (by method = by person = payments).

- [x] Fee heads; per-class structures with installments (exact per-fee splits), optional fees, late-fee rule; one live structure per class; editor with "split evenly"
- [x] Concession types (flat / %, per fee) and student concessions: request → approve / reject / revoke
- [x] Invoices: preview → issue (background job), gap-free `INV/2026-27/000001`, concessions applied per fee, append-only adjustments with reasons, cancellation without payments, overdue computed
- [x] Payments: one `apply()` for all money — locks invoices, caps at balances, excess → student credit, gap-free receipts, audit, outbox. Counter (W6): whole invoices, Idempotency-Key, concurrency-safe; void; use credit; day close
- [x] Receipts: A5 PDF (amount in words, method/reference, CANCELLED stamp after void), made in the worker, on demand for older payments
- [x] Razorpay: each school's own keys (AES-256-GCM), webhook secret shown once, HMAC-verified webhooks stored before processing (dedupe), checkout → verify (signature + gateway fetch), reconciliation every 10 min, refunds (credit first, then reopen invoices), amount-mismatch → credit + security flag
- [x] Scheduler: late fees 00:30, reminders 08:00 (7 and 1 days before, weekly overdue), reconciliation every 10 min — once per slot
- [x] Reports: daily collection, outstanding, defaulters, head-wise, concessions, reconciliation (+ CSV)
- [x] Parent: fees page with "Pay ₹X" (Razorpay Checkout, or the sandbox checkout in development), receipts
- [x] Demo: 5 structures, 2,253 invoices, 1,452 payments, late fees, sandbox gateway on

**Sandbox gateway:** `PAYMENTS_GATEWAY=mock` (default in development, refused in production) behaves like Razorpay — same signatures, states and webhooks — so everything is tested without an account. Switching to `razorpay` needs only each school's keys (⏸ SETUP-LATER).

Known follow-ups (small): duplicate-receipt marking on reprints, settlement (payout → bank UTR) reconciliation (V1.1), convenience fee (open question in docs/11).

**Pilot point reached** (docs/12): a school can run fees, attendance, homework, exams and parent communication on the web while the mobile apps are built. **Next: Phase 6 (platform)** — super-admin, plans/subscriptions, documents, reports engine.

### 2026-10-08: Phase 6 — platform ✅ (382 API tests)

**Milestone M6 (API proven by tests; console walkthrough in the browser still to do):** a super admin onboards a school (admin invited, trial started), sets its plan, limits and features, suspends/reactivates it, and gets support access only with the school's approval — all from `admin.localhost`, with every action audited.

- [x] Platform console at `admin.<domain>` (platform accounts only, password sign-in; school hosts never serve `/platform`): overview, schools (onboard, status, subscription, per-school feature overrides, usage), plans, feature flags (kill switch > override > plan > default), user lookup, support access, system (queues, dead-letter retry, outbox, webhooks, DB), cross-school audit
- [x] `@RequirePlatform` access rule (SUPER_ADMIN / SUPPORT), contract-checked like every route
- [x] Entitlements: student, storage and monthly SMS limits enforced (`PLAN_LIMIT_*`), per-school overrides, usage counters; a school with no subscription is never locked out
- [x] Support access: request with reason → school admin approves in Settings → time-boxed read-only membership (no contact details) → ends on revoke or expiry (delayed job + 15-min sweep); audited on both sides
- [x] Documents for students, guardians, teachers and the school; categories; "share with parents"; scope-aware; signed downloads; parent "Documents" page
- [x] Report engine: one table shape for 12 reports (students, attendance, exams, the 6 finance reports), on-screen preview, background PDF/Excel/CSV exports run **as the requester** (scopes re-checked), export history; spreadsheet formula injection neutralised
- [x] Audit viewers: school (Settings → Audit log, student Activity tab) and platform
- [x] Import v2: classes + sections, subjects + classes taught, students' optional fees; rows to fix as Excel
- [x] Settings sections: general (principal, affiliation, working days), fees (reminder schedule, receipt note), examinations (report card note, attendance), branding (signature image, logo on receipts), plan & usage, support access — reminders, receipts and report cards follow them
- [x] Dark mode: match device / light / dark, from a cookie (no flash)
- [x] Demo seed: Basic / Professional / Enterprise plans, 4 flags, demo school on Professional, `support@schoolos.local`

Known follow-ups (small): online subscription billing (V1.1), staff documents for non-teaching staff, AI-call metering once Phase 8 exists, saved/scheduled reports.

**Next: Phase 7 (mobile apps).**

### 2026-10-09: Phase 7 — mobile app, first slice (Flutter 3.47) 🚧

**Milestone M7 not reached yet:** store/TestFlight builds need Xcode, Android Studio, Firebase and store accounts (SETUP-LATER #12, #16–18). The app itself runs in Chrome against the local API; 16 Flutter tests + API route-drift test pass.

- [x] `apps/mobile`: one app, parent and teacher homes by role (switch for people who are both), school picker for multi-school accounts
- [x] Sign in with password or one-time code; refresh token in Keychain/Keystore; one shared refresh on 401; sessions recorded as ANDROID/IOS (60-day idle)
- [x] Design tokens → light/dark `ThemeData` with the school's accent
- [x] Parent: home (today's attendance and classes, fees due, homework, latest result), attendance calendar, homework with attachments, week timetable, results + report card PDF, fees (pick bills → Razorpay Checkout or sandbox → verify → receipt), documents
- [x] Teacher: home (registers to take, today's classes with "Now", marks to enter), **offline attendance** (cached class list, queued submission with `clientMutationId`, sync on open/resume/"Sync now", refusals shown), homework with camera/gallery photos, marks entry (A/E, validation, version conflict → reload)
- [x] Notifications inbox with filters; tapping opens the right tab (web routes mapped)
- [x] Forced-update gate (`GET /v1/app/config`), push-token API (`PUT/DELETE /v1/me/devices`, removed on sign-out), `GET /v1/openapi.json`, `GET /v1/exams/marks/mine`
- [ ] FCM push + deep links from push (needs Firebase project)
- [ ] iOS / Android builds, store listings, privacy labels, review prep (needs Xcode, Android Studio, accounts)

### 2026-10-09: Phase 8 — AI foundation ✅ (419 API tests)

- [x] `ai` module: provider interface with **Gemini** (REST, function calling) and an offline **rules provider** for development, tests and the evaluation set; `AI_PROVIDER=none|mock|gemini` (mock refused in production)
- [x] **Tool registry**: 8 tools (attendance by class, low-attendance students, exam results, subject performance, class strength, fee collection, outstanding, defaulters) — each is a report the person could run themselves, through `ReportsService` (permissions and teacher scopes apply; no direct DB access). Only tools the person may use are offered to the model
- [x] **Privacy**: names and phone numbers in tool results become `[P1]`-style placeholders before anything reaches the provider and are restored in the answer; `ai_logs` keeps tools used (ids/dates), sizes, timing and outcome — never the question or answer (RLS-protected)
- [x] Gate: `ai_assistant` feature flag (per-school override; on for the demo school), `ai.use` + a report permission to ask (`homework.manage` for worksheets), monthly `aiCallsPerMonth` from the plan, 20 questions/minute per person
- [x] Features: principal/admin Q&A, accountant fee summaries, teacher worksheet drafts (topic only — no student data sent); web Assistant page with sources and the data used
- [x] **Evaluation set** (15 real questions → expected lookup): offline in CI; live against Gemini with `pnpm ai:eval` before enabling for schools

Known follow-ups: run the live evaluation once a Gemini key exists (SETUP-LATER #19); Hindi/regional-language checks in the evaluation set; "use as homework" from a worksheet draft.

### 2026-10-09: Deployment setup (docs/10 lean mode) — ready, not yet run 🚧

Everything is scripted; nothing is created in Google Cloud until you run it (infra/README.md).

- [x] Dockerfiles: API (+ Chromium and Noto fonts for PDFs, `tini`, non-root) with a `migrate` target; web (Next.js standalone, non-root). `turbo prune` keeps each image to what it needs. Rehearsed locally without Docker (pruned install → build → production-only install → both servers answer); **built for real in CI** on every push (new `docker` job)
- [x] `infra/gcp/bootstrap.sh`: APIs, Artifact Registry, Cloud SQL Postgres 17, buckets, least-privilege service accounts, generated secrets, keyless GitHub deploys (Workload Identity Federation)
- [x] `infra/gcp/deploy.sh` + Cloud Build: build → migrate job → deploy API and web → smoke test; `roles` step for the one-time database roles (`scripts/setup-roles.mjs`, verified on a throwaway Postgres)
- [x] Cloudflare Worker (`infra/cloudflare`) instead of a load balancer: `*.domain` → web, `api.domain` → API; the apps trust `X-Forwarded-Host` / `CF-Connecting-IP` only with the edge secret and answer 404 to direct `run.app` traffic (tested)
- [x] RLS works without `BYPASSRLS` (Cloud SQL can't grant it): explicit `platform_all` policies for the platform role; local and test databases now match (421 tests pass)
- [x] `.github/workflows/deploy.yml`: staging after CI on `main`; production by hand behind the `production` environment
- [ ] Run it: Google Cloud project + billing, domain on Cloudflare (SETUP-LATER #5–7)

### 2026-10-09: Follow-ups from earlier phases ✅ (447 API tests)

- [x] **Homework submissions** (Phase 3): teachers mark who handed it in / checked it, with a note per student; parents see their child's status and the note (web + app); a parent opening it shows the teacher it was seen
- [x] **Consolidated term report cards** (Phase 4): a term combines published exams with weights (e.g. Unit Test 1 × 20% + Half-Yearly × 80%); per-subject weighted % (absent = 0, exempt or "not in that exam" drops out and the weights scale up), weighted pass mark, overall %, grade, rank; publish to parents (notified), one A4 card per student; staff see only their sections
- [x] **Duplicate receipts** (Phase 5): staff reprints after the first print are stamped DUPLICATE COPY and audited; parents' copies never are
- [x] **"Use as homework"** from AI worksheet drafts (Phase 8)
- [x] **Marks import from Excel** (Phase 4): download the section's sheet, fill it offline, upload; every row is checked and shown (new / changed / same / error) and nothing is saved until the whole sheet is clean
- [x] **Co-scholastic areas** (Phase 4): grades (school's own scale, default A/B/C) for areas like Work Education, Art, Discipline, entered per exam and printed on exam and term report cards; shown to parents on web and app
- [x] **Hindi and Hinglish in the AI evaluation set** (Phase 8): 7 more cases (e.g. "कक्षा 8 में किसकी फीस बकाया है?", "Is mahine fees kitni collect hui?"); the offline rules provider understands them, so the whole set runs in CI

Still open: settlement (bank UTR) reconciliation — needs a school's live Razorpay account to see real settlement files.

### 2026-10-10: Browser tests (Playwright) ✅ (21 tests)

- [x] `apps/e2e`: throwaway PostgreSQL + RLS + demo seed, the built API (:4100) and web app (:3100), real Chrome; `pnpm e2e`, and a CI job that uploads traces on failure
- [x] Critical paths: sign-in/out and redirects, today's register → parent sees the absence, counter cash with receipt, online payment success and failure (sandbox), marks entry with validation, admission with a duplicate check, platform console and its boundary, the assistant
- Bugs they found, now fixed:
  - the assistant page crashed after the first answer in current Chrome (`scrollIntoView` now returns a Promise, which React called as an effect cleanup)
  - receipts of older or imported payments could never be opened: the buttons waited for a file that's only made on request (parents' fees page and the staff payment dialog)
  - toasts sat on top of the bottom action bar (Save marks, Submit register) and, while hovered, never went away; they now appear top centre
  - a field the server rejected (e.g. a duplicate admission number) wasn't scrolled to; forms now focus the first one

### 2026-10-13: Parent–teacher features ✅ (492 API · 27 browser · 20 app tests)

- [x] **Attendance tracking for parents**: classes held / attended / missed and % for the whole session, month by month, and any day with its note (web + app); student profile → Attendance tab for staff
- [x] **Results charts**: performance radar by subject (tap a subject → every unit test and exam with marks, %, grade and the section average), progress line across exams, trend per subject (`GET /v1/students/:id/performance`; parents see published results only, staff also computed ones). Demo data has three published tests
- [x] **Live video meetings**: teachers/office book a meeting about a child; parents are notified (booked, moved, cancelled, 15 minutes before) and join a Jitsi room from the app or a browser — free, no paid video service (`MEETING_BASE_URL`, SETUP-LATER #20)
- [x] **Reminders**: a parent's own alarms (pick-up 1:30 PM, Monday to Saturday …) — edit, reschedule, done, delete; the scheduler sends an in-app alert + push at the time (always on; not a school setting)
- [x] **"Arrived at school"**: today's register marking a child present / late / half day tells the parents, with the time it was recorded — once per child per day, never for past days (school can switch it off)
- [x] **Messages & complaints**: threads about one child between a parent and a teacher or the school office; categories, Open / In progress / Resolved with alerts to the parent, read receipts ("Seen"), full history; teachers see only their own threads, the office can see every one
- [x] Student profile: Attendance, Homework, Exams and Fees tabs (were placeholders); tabs on several pages now live in the address (`?tab=`)
- Note: permissions for existing schools need a data migration that lifts FORCE RLS for the statement (`20261013110000_…`); the first attempt (`20261013100000`) saw no rows

### 2026-10-14: School calendar ✅ (500 API · 28 browser · 22 app tests)

- [x] Calendar of holidays, vacations, events and parent–teacher meetings, managed by the office (whole school or chosen classes), optionally announced to parents and staff
- [x] Exam dates come from the exams themselves; parents also see each of their child's papers with its time. Draft exams stay hidden from parents
- [x] Web `/calendar` (month grid, day details, coming up; add/edit/delete for the office) for staff and parents; app Calendar screen with the same colours — replaces Documents on the home grid (documents stay under Profile)
- [x] Parents can message their child's class and subject teachers (not only the office); teachers without an app login are listed as "not on the app yet"

### 2026-10-25: E-certificates and Achievements ✅ (546 API · 29 browser · 40 app tests)

- [x] Teachers (their own classes) and the office issue **participation** or **achievement** certificates: the type first, then the event, its date and, for an achievement, the position; one student or a whole team at once. Numbered per academic year (`CERT/2026-27/0001`), audited, withdrawable by whoever issued it (or the office)
- [x] The PDF (A4 landscape, school colour, logo, principal's signature, gold seal for achievements) is drawn on first download and kept
- [x] Parents are told (`certificate.issued`) and see every certificate under the child's **Achievements**: app tile on the parent home, web `/my/achievements`. Staff: web `/certificates` and an Achievements tab on the student profile; teachers can also issue from the app (Certificates tile)
- [x] New permissions `certificate.view` / `certificate.issue` with a data migration for existing schools; demo seed adds 9 certificates

### 2026-10-30: Hindi, Betu, printable receipts, app ID card ✅ (546 API · 29 browser · 41 app tests)

- [x] **English / हिन्दी** on the website, sign-in, dashboard shell (nav, header, account menu), dashboard home pages and owner console. Strings are keyed by their English text (`apps/web/src/lib/i18n*.ts`, cookie `bastaa-lang`, server-rendered); numbers in server text are matched as `{#}`. Deeper pages are still English. App: Profile → Language (saved on the phone), covering the bottom bar, home screens, Profile, ID card and Betu (`apps/mobile/lib/core/i18n.dart`)
- [x] **Betu**, a demo helper: a floating button on the website, demo login, school dashboards (admin, teacher, parent by permission), owner console and every app tab. Preset questions per role and canned answers in both languages with a link to the right page or tab; typed questions are matched on keywords. No server (`components/betu/`, `features/common/betu.dart`)
- [x] **Fee receipt** redesigned: logo (or the school's initials), PAID stamp, total box, numbered lines. Payments and Collect have **Print receipt** (hidden frame → the print window) and **Download**; phones, tablets, Safari and browsers without a PDF viewer download instead. Demo fixtures now include the admin's and parent's receipts. Sample: `docs/samples/Fee-Receipt-Sample.pdf`
- [x] **Student ID card in the app**: Profile → Student ID card, one per child, from `GET /students/:id` (school band, photo or initials, class and roll, admission no., date of birth, blood group, parent and phone, school year), to show at the school gate

### Implementation notes (where code differs from the plan, and why)

| Plan said | Built | Why |
|---|---|---|
| Local Postgres via Docker Compose | `embedded-postgres` (real PostgreSQL 17 from npm, `pnpm db:start`) | Docker not installed yet; tests use the same approach, so CI needs no service container |
| RLS SQL hand-written inside migration folders | `apps/api/scripts/apply-sql.mjs`, an idempotent script run after every migrate. It **discovers** every `school_id` table and fails if one is uncovered | A new table can't be forgotten |
| Redis (Upstash) for BullMQ queues | **BullMQ 6 PostgreSQL backend** | Saves an external service and ~$10–20/month; same Cloud SQL backups cover queued jobs. `QUEUE_BACKEND=redis` switches back |
| Session revocation via a Redis deny-list | Session row checked on each request (30 s in-process cache) | No Redis yet. Single instance is fine for V1; move to Redis pub/sub when scaling out |
| Rate limits in Redis | In-memory store behind a `RateLimitStore` interface | Same reason; swapping the store is one class |
| Design tokens in `packages/design-tokens` (JSON) | CSS variables in `packages/ui/src/styles.css` | Only one React client today; generate Flutter `ThemeData` from these in Phase 7 |
| Dart client generated from OpenAPI (`dart-dio`) | Hand-written typed client + models, guarded by `mobile-routes.test.ts` (every path the app calls must be a registered route) and model-parsing tests; `GET /v1/openapi.json` exists for tooling | Response types are TypeScript interfaces (no runtime schema), so a generator could only produce request types; the generator also needs Java |
| Drift (SQLite) for the offline queue | `shared_preferences` key-value store | The queue holds a few registers; no relational queries; works on web for testing |
| Google HTTPS load balancer for wildcard subdomains (docs/10 §3 option A) | Cloudflare Worker (option B) with an edge secret | ~$18/month saved while on credits; switching later changes no app code (drop `EDGE_SHARED_SECRET`) |
| Platform role with `BYPASSRLS` | `platform_all` RLS policies for that role | Cloud SQL can't grant `BYPASSRLS`; same isolation, works on any Postgres |
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
- [ ] Unit + integration tests; critical paths in Playwright e2e (`apps/e2e`)
- [ ] Responsive down to 375px; keyboard accessible; contrast checked
- [ ] Docs: module README (purpose, permissions, events emitted, jobs), API docs generated
- [ ] Demo seed data updated so the module looks alive in `demo.bastaa.in`

## What's deliberately not in V1

Transport/GPS, library, inventory, HRMS/payroll, advanced accounting, advanced AI, biometric/RFID,
WhatsApp automation, workflow engine, student login, public API, custom domains, multi-language UI.
The architecture leaves room for each (feature flags, module boundaries, i18n-ready strings).

## Next step after review

Once docs 01–11 have their open questions answered, Phase 1 starts with: `git init`, the monorepo scaffold, `docker-compose.yml`, and the first migration
(identity + tenancy + RLS), followed immediately by the tenant-isolation test harness, before any feature screens.
