# 06 — Navigation Map

Four surfaces:

| Surface | Where | Users |
|---|---|---|
| School web app | `{slug}.bastaa.in` | School Admin, Principal, Accountant, Teacher (Parents can use it too, but mobile is primary) |
| Super admin | `admin.bastaa.in` | Super Admin, Support |
| Parent app | Flutter | Parents |
| Teacher app | Flutter (same app, role-based) | Teachers |

Menu items are shown **only if the user has the permission** (04) **and the feature is enabled** (feature flags/plan).

## 1. School web app

### Shell

```
┌───────────────┬──────────────────────────────────────────────────────────────┐
│ [logo] School │  ⌘K Search students, actions…        🔔  ?   (Avatar ▾)     │
│ 2026–27 ▾     ├──────────────────────────────────────────────────────────────┤
│               │                                                              │
│ Dashboard     │                      page content                            │
│ Students      │                                                              │
│ Teachers      │                                                              │
│ Academics     │                                                              │
│ Attendance    │                                                              │
│ Homework      │                                                              │
│ Timetable     │                                                              │
│ Examinations  │                                                              │
│ Fees          │                                                              │
│ Payments      │                                                              │
│ Communication │                                                              │
│ Documents     │                                                              │
│ Reports       │                                                              │
│ ───────────── │                                                              │
│ Settings      │                                                              │
│ « Collapse    │                                                              │
└───────────────┴──────────────────────────────────────────────────────────────┘
```

- Sidebar: expanded (240px) / collapsed (64px, icons + tooltips), remembered per user. Has a filter box ("Jump to…").
- Academic-year switcher under the logo. Viewing a past year shows a subtle "Viewing 2025–26 (read-only)" banner.
- School switcher in the avatar menu (only if the user has more than one membership).
- Mobile web (<768px): sidebar becomes a drawer, and the top bar keeps search + notifications.

### Route tree

```
/                                   → redirect to /dashboard
/login  /login/otp  /forgot-password  /activate
/select-school                      (multi-membership users arriving on app.bastaa.in)

/dashboard

/students                           list (filters: class, section, status; saved views)
/students/new
/students/import                    → /imports/new?entity=STUDENTS
/students/:id                       tabs: overview · attendance · homework · exams · fees · documents · activity
/students/:id/edit
/students/promotion                 year-end promotion wizard

/guardians  /guardians/:id

/teachers  /teachers/new  /teachers/:id   tabs: overview · classes & subjects · timetable · attendance · documents

/academics                          overview of current year
/academics/years
/academics/classes                  classes → sections (per year)
/academics/subjects
/academics/assignments              who teaches what (grid)

/attendance                         today: sections × status (taken / pending), school %
/attendance/:sectionId?date=        register (mark/edit)
/attendance/staff
/attendance/reports

/homework  /homework/new  /homework/:id

/timetable                          section picker → weekly grid editor
/timetable/teachers/:id
/timetable/bell-schedules

/exams  /exams/new
/exams/:id                          tabs: setup (class × subject grid) · schedule · marks progress · results · report cards
/exams/:id/marks/:examSubjectId?sectionId=   marks entry sheet
/exams/grading-scales

/fees                               overview: collection today/month, outstanding, overdue
/fees/structures  /fees/structures/:id
/fees/heads
/fees/concessions                   types + pending approvals
/fees/invoices  /fees/invoices/:id
/fees/generate                      bulk invoice wizard
/fees/collect                       counter: search student → dues → collect → receipt
/fees/defaulters

/payments                           all payments (online + counter)
/payments/:id
/payments/refunds
/payments/reconciliation            gateway vs recorded

/communication                      notices list (drafts / scheduled / published)
/communication/new
/communication/:id                  read stats
/communication/templates            notification templates

/documents                          school documents + search by owner

/reports                            catalog grouped: Students · Attendance · Academics · Finance
/reports/:type
/reports/exports                    my export history

/imports  /imports/new  /imports/:id

/notifications                      full inbox

/settings
  /settings/general                 profile, contact, address, timezone
  /settings/branding                logo, accent, receipt & report-card header/footer
  /settings/academic                year defaults, promotion rules
  /settings/attendance              statuses, edit window, absent-notification timing
  /settings/fees                    numbering, late-fee defaults
  /settings/payment-gateway         Razorpay connect
  /settings/examinations            grading defaults, ranking
  /settings/notifications           event × channel matrix
  /settings/users                   members, invite
  /settings/roles                   roles & permissions editor
  /settings/integrations            SMS sender, email sender (V1: read-only status)
  /settings/billing                 plan, usage, limits
  /settings/audit-log
  /settings/support-access          approve/revoke platform support access

/onboarding/:step                   10-step wizard (shown until the school goes live)
```

### What each role sees (default)

| Menu | Admin | Principal | Accountant | Teacher |
|---|:-:|:-:|:-:|:-:|
| Dashboard | ● | ● | ● (finance) | ● (my day) |
| Students | ● | ● | ● (read) | ● (my sections) |
| Teachers | ● | ● | ● (read) | ● (directory) |
| Academics | ● | ● (read) | – | – |
| Attendance | ● | ● | – | ● |
| Homework | ● | ● | – | ● |
| Timetable | ● | ● | – | ● (mine) |
| Examinations | ● | ● | – | ● (marks entry) |
| Fees | ● | ● | ● | – |
| Payments | ● | ● | ● | – |
| Communication | ● | ● | – | ● (my sections) |
| Documents | ● | ● | – | ● (limited) |
| Reports | ● | ● | ● (finance) | ● (academic, mine) |
| Settings | ● | partial | – | – |

## 2. Command palette (⌘K / Ctrl+K)

```
Groups (shown in this order, max 5 each):
  Students       — "Rahul Kumar · 8-A · Adm 1042"   ↵ open · → actions
  Teachers / Guardians / Invoices (INV/…) / Receipts (RCPT/…)
  Actions        — Add student · Take attendance · Create homework · Create notice
                   Collect fee · View pending fees · Generate report · Invite user
  Navigate       — every menu destination
  Recent         — last 5 opened records (empty query)

Entity actions (→ or Tab on a result):
  Student:  View profile · Attendance · Fees · Collect fee · Results · Documents · Call guardian
  Invoice:  View · Collect payment · Download
```

- Server search (`/v1/search`, debounce 150 ms) plus local fuzzy match for actions/navigation.
- Respects permissions: an action you can't perform is not listed.
- Shortcuts: `G then S` students, `G then A` attendance, `G then F` fees, `N` new (contextual), `/` focus table search.

## 3. Super admin (`admin.bastaa.in`)

```
/dashboard            schools, active schools, students, teachers, active users (7d),
                      SaaS revenue, payment volume (sum of school gateway captures), system health
/schools              list → /schools/new (creates school + first admin invite) → /schools/:id
                      tabs: overview · usage · subscription · features · members (read) · audit
/users                global user lookup (by phone/email) → memberships
/subscriptions        plans · subscriptions · invoices (manual in V1)
/payments             platform-level view of gateway health per school (no school money)
/feature-flags        flags · per-school overrides · kill switch
/integrations         SMS/email/push provider status, DLT templates
/support              support access grants (request, active, history)
/system               queues (BullMQ), DLQ, cron jobs, error rates, version
/audit-logs           platform actions
/settings             platform admins, defaults (templates, grading presets)
```

## 4. Parent app (Flutter)

```
Bottom nav:  Home · Academics · Fees · Notifications · Profile
Header:      child switcher chip "Rahul · 8-A ▾" (hidden if only one child)

Home
  ├── Today card: attendance status today, today's timetable (next period highlighted)
  ├── Homework due (next 3) → Homework detail
  ├── Fees due card (amount, due date, Pay now) → Fees
  ├── Upcoming exams (next 2) → Exam schedule
  └── Latest notices (3) → Notice detail
Academics
  ├── Attendance (calendar month view + %)
  ├── Homework (list, filter by subject) → detail (attachments)
  ├── Timetable (week)
  ├── Exams (schedule)
  └── Results → per exam → report card PDF
Fees
  ├── Summary (outstanding, next due)
  ├── Invoices → detail → Pay (Razorpay checkout) → success → receipt
  ├── Payment history → receipt PDF
Notifications
  └── Inbox (notices + system notifications), filter: All · Notices · Fees · Academics
Profile
  ├── Children (list) · Guardian details · Documents (visible ones)
  ├── Schools (if more than one) · Devices & sessions · Change password · Language (later)
  └── Help · Privacy · Log out
```

## 5. Teacher app (Flutter)

```
Bottom nav:  Home · Attendance · Classes · Notifications · Profile

Home
  ├── Today's classes (timetable, current period highlighted)
  ├── Attendance pending (my class sections not yet submitted) → register
  ├── Homework due for review / recently assigned
  └── Marks entry pending (exam subjects open for entry)
Attendance
  └── Section picker (defaults to my class) → register: "Mark all present" → tap exceptions → Submit
      (works offline; shows "Will sync" badge)
Classes
  ├── My sections → students list → student quick view (attendance %, guardian contact if allowed)
  ├── Homework → create (subject, sections, due date, attachment from camera/files)
  └── Marks → exam → subject → section → numeric keypad entry
Notifications
Profile  — my timetable, my attendance, sessions, log out
```

## Open questions

1. Should parents get a **web** experience in V1 (the same Next.js app, simplified layout), or mobile only? Recommendation: a minimal responsive parent web view (home, fees and pay, notices) because the Flutter app ships later (Phase 7).
2. Teacher web: allow teachers to use the web app fully (recommended), or mobile only?
