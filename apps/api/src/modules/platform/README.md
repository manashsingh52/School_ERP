# Platform console

Super-admin and support: schools, plans, feature flags, platform users, time-limited support access, system health and the platform audit log.

## Routes

| Route | What | Who |
|---|---|---|
| `GET /v1/platform/audit` | Audit log across schools | platform staff (`platform.audit.view`) |
| `GET /v1/platform/dashboard` | Platform overview | platform staff (`platform.dashboard.view`) |
| `GET /v1/platform/flags` | Feature flags | platform staff (`platform.dashboard.view`) |
| `PUT /v1/platform/flags` | Create or change a feature flag | platform staff (`platform.flags.manage`) |
| `GET /v1/platform/plans` | Plans | platform staff (`platform.dashboard.view`) |
| `POST /v1/platform/plans` | Create a plan | platform staff (`platform.subscriptions.manage`) |
| `PUT /v1/platform/plans/:id` | Edit a plan | platform staff (`platform.subscriptions.manage`) |
| `GET /v1/platform/schools` | All schools | platform staff (`platform.dashboard.view`) |
| `POST /v1/platform/schools` | Onboard a school (admin invited, trial started) | platform staff (`platform.schools.manage`) |
| `GET /v1/platform/schools/:id` | One school: plan, usage, features, admins | platform staff (`platform.dashboard.view`) |
| `PUT /v1/platform/schools/:id/features/:key` | Per-school feature override (null clears) | platform staff (`platform.flags.manage`) |
| `PUT /v1/platform/schools/:id/status` | Activate, suspend or archive a school | platform staff (`platform.schools.manage`) |
| `PUT /v1/platform/schools/:id/subscription` | Set plan, status, dates and limit overrides (manual billing) | platform staff (`platform.subscriptions.manage`) |
| `GET /v1/platform/support-access` | My support access requests (all=true: everyone’s) | platform staff (`platform.support_access.request`) |
| `POST /v1/platform/support-access` | Ask a school for time-boxed read-only access | platform staff (`platform.support_access.request`) |
| `GET /v1/platform/system` | Queues, failed jobs, outbox, webhooks, database | platform staff (`platform.system.view`) |
| `POST /v1/platform/system/retry` | Retry a failed job | platform staff (`platform.schools.manage`) |
| `GET /v1/platform/users` | Find a user by name, phone or email | platform staff (`platform.schools.manage`) |
| `GET /v1/school/features` | Feature flags switched on for this school | any member of the school |
| `GET /v1/school/subscription` | This school's plan, limits and usage | `billing.view` |
| `GET /v1/school/support-access` | Support access requests and grants | `user.manage` |
| `POST /v1/school/support-access/:id/approve` | Let SchoolOS support look (read-only, time-boxed) | `user.manage` |
| `POST /v1/school/support-access/:id/revoke` | Decline a request or end access now | `user.manage` |

Access is declared on every route and checked at start-up; `:id` routes return 404 for another school's records (`test/isolation.e2e.test.ts`).

## Notifications it sends

Through `NotificationsService.notify` (each school chooses channels in Settings → Notifications):

- `support.access_requested`

## Background jobs

- `maintenance/support-expire`

Scheduled (school-local time, fanned out per school by `SchedulerService`):

- `support-expire`: every 15 minutes

Tests: `apps/api/test/` (search for the routes above).
