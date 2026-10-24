# Attendance

Daily registers per section (fast marking, edit window, offline replay with clientMutationId), staff attendance, the monthly grid, and the "absent" / "arrived at school" alerts to parents.

## Routes

| Route | What | Who |
|---|---|---|
| `GET /v1/attendance/overview` | Today's attendance across sections | `attendance.view` |
| `GET /v1/attendance/settings` | Attendance rules (edit window, who marks, weekly off) | `attendance.view` |
| `PUT /v1/attendance/settings` | Change attendance rules | `school.settings.manage` |
| `GET /v1/sections/:id/attendance` | A section's register for a day | `attendance.view` |
| `PUT /v1/sections/:id/attendance` | Save or submit a register | `attendance.mark` |
| `GET /v1/sections/:id/attendance/month` | Monthly attendance grid | `attendance.view` |
| `GET /v1/staff-attendance` | Staff attendance for a day | `staff_attendance.manage` |
| `PUT /v1/staff-attendance` | Mark staff attendance | `staff_attendance.manage` |
| `GET /v1/students/:id/attendance` | A student's attendance history | `attendance.view` |

Access is declared on every route and checked at start-up; `:id` routes return 404 for another school's records (`test/isolation.e2e.test.ts`).

## Notifications it sends

Through `NotificationsService.notify` (each school chooses channels in Settings → Notifications):

- `attendance.arrived`

## Outbox events

Published (in the same transaction as the change): `attendance.submitted`

Handled: `attendance.submitted`

Tests: `apps/api/test/` (search for the routes above).
