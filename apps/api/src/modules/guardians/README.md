# Parents and guardians

Guardians, their links to students, and inviting them to the app.

## Routes

| Route | What | Who |
|---|---|---|
| `GET /v1/guardians` | List parents/guardians | `guardian.view` |
| `POST /v1/guardians` | Add a parent | `guardian.manage` |
| `GET /v1/guardians/:id` | Parent profile with children | `guardian.view` |
| `PATCH /v1/guardians/:id` | Edit a parent | `guardian.manage` |
| `POST /v1/guardians/:id/children` | Link a child | `guardian.manage` |
| `DELETE /v1/guardians/:id/children/:studentId` | Unlink a child | `guardian.manage` |
| `POST /v1/guardians/:id/invite` | Create a login for a parent | `guardian.manage` |

Access is declared on every route and checked at start-up; `:id` routes return 404 for another school's records (`test/isolation.e2e.test.ts`).

Tests: `apps/api/test/` (search for the routes above).
