# School calendar

Holidays, vacations, events and parent–teacher meetings managed by the office (optionally announced), merged with exam dates from the exams themselves.

## Routes

| Route | What | Who |
|---|---|---|
| `GET /v1/calendar` | School calendar: holidays, vacations, events and exam dates in a date range | `calendar.view` |
| `POST /v1/calendar` | Add a holiday or event (optionally notify parents and staff) | `calendar.manage` |
| `DELETE /v1/calendar/:id` | Remove a calendar entry | `calendar.manage` |
| `PATCH /v1/calendar/:id` | Edit a calendar entry | `calendar.manage` |

Access is declared on every route and checked at start-up; `:id` routes return 404 for another school's records (`test/isolation.e2e.test.ts`).

## Notifications it sends

Through `NotificationsService.notify` (each school chooses channels in Settings → Notifications):

- `calendar.added`

Tests: `apps/api/test/` (search for the routes above).
