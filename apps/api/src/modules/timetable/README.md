# Timetable

Bell schedules, weekly timetables per section with clash detection, publishing, and "today" for a teacher or a child.

## Routes

| Route | What | Who |
|---|---|---|
| `GET /v1/bell-schedules` | Bell schedules and their periods | `timetable.view` |
| `POST /v1/bell-schedules` | Create a bell schedule | `timetable.manage` |
| `DELETE /v1/bell-schedules/:id` | Delete an unused bell schedule | `timetable.manage` |
| `PUT /v1/bell-schedules/:id` | Edit a bell schedule (periods matched by position) | `timetable.manage` |
| `GET /v1/teachers/:id/timetable` | A teacher's week | `timetable.view` |
| `GET /v1/timetables` | A section's timetable (or null) | `timetable.view` |
| `POST /v1/timetables` | Start a timetable for a section | `timetable.manage` |
| `DELETE /v1/timetables/:id` | Delete a timetable | `timetable.manage` |
| `PUT /v1/timetables/:id/entries` | Save the weekly grid (409 on teacher clash) | `timetable.manage` |
| `POST /v1/timetables/:id/publish` | Publish to teachers and parents | `timetable.manage` |
| `GET /v1/timetables/overview` | Sections with their timetable status | `timetable.view` |
| `GET /v1/timetables/today` | Today's classes (teacher) or a child's day (parent) | `timetable.view` |

Access is declared on every route and checked at start-up; `:id` routes return 404 for another school's records (`test/isolation.e2e.test.ts`).

Tests: `apps/api/test/` (search for the routes above).
