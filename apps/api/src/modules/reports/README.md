# Reports

The report catalogue, on-screen preview, background exports (PDF, Excel, CSV) run as the requester, saved and scheduled reports, and the school audit log.

## Routes

| Route | What | Who |
|---|---|---|
| `GET /v1/audit` | The school's audit log | `audit.view` |
| `GET /v1/reports/catalog` | Reports I can run | any member of the school |
| `GET /v1/reports/preview` | Run a report on screen (first 500 rows) | any member of the school |
| `GET /v1/reports/runs` | My exports | `report.export` |
| `POST /v1/reports/runs` | Export a report (PDF, Excel or CSV) in the background | `report.export` |
| `GET /v1/reports/runs/:id` | One export (poll until DONE) | `report.export` |
| `GET /v1/reports/runs/:id/download` | Download link for a finished export | `report.export` |
| `GET /v1/reports/saved` | My saved reports | `report.export` |
| `POST /v1/reports/saved` | Save a report with its filters, optionally weekly or monthly | `report.export` |
| `DELETE /v1/reports/saved/:id` | Delete a saved report | `report.export` |
| `PATCH /v1/reports/saved/:id` | Rename, change the format or the schedule | `report.export` |
| `POST /v1/reports/saved/:id/run` | Export a saved report now | `report.export` |

Access is declared on every route and checked at start-up; `:id` routes return 404 for another school's records (`test/isolation.e2e.test.ts`).

## Notifications it sends

Through `NotificationsService.notify` (each school chooses channels in Settings → Notifications):

- `report.ready`

## Background jobs

- `documents/report-export`
- `documents/saved-reports-due`

Scheduled (school-local time, fanned out per school by `SchedulerService`):

- `saved-reports`: every 15 minutes

Tests: `apps/api/test/` (search for the routes above).
