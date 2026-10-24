# Teachers

Teacher records, profile, and their app login.

## Routes

| Route | What | Who |
|---|---|---|
| `GET /v1/teachers` | List teachers | `teacher.view` |
| `POST /v1/teachers` | Add a teacher (optionally invite to log in) | `teacher.manage` |
| `GET /v1/teachers/:id` | Teacher profile | `teacher.view` |
| `PATCH /v1/teachers/:id` | Edit a teacher | `teacher.manage` |
| `POST /v1/teachers/:id/invite` | Create a login for a teacher | `teacher.manage` |

Access is declared on every route and checked at start-up; `:id` routes return 404 for another school's records (`test/isolation.e2e.test.ts`).

Tests: `apps/api/test/` (search for the routes above).
