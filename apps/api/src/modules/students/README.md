# Students

Student records, admission, profile and status, within the caller's scope (all, assigned sections, own children).

## Routes

| Route | What | Who |
|---|---|---|
| `GET /v1/students` | List students | `student.view` |
| `POST /v1/students` | Add a student | `student.create` |
| `GET /v1/students/:id` | Student profile | `student.view` |
| `PATCH /v1/students/:id` | Edit a student | `student.edit` |

Access is declared on every route and checked at start-up; `:id` routes return 404 for another school's records (`test/isolation.e2e.test.ts`).

## Outbox events

Published (in the same transaction as the change): `student.created`

Tests: `apps/api/test/` (search for the routes above).
