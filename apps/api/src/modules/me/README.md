# Me

The signed-in member's own profile, sessions and password.

## Routes

| Route | What | Who |
|---|---|---|
| `GET /v1/me` | Current user, school, permissions | signed in |
| `PATCH /v1/me/password` | Change password | signed in |
| `GET /v1/me/sessions` | Signed-in devices | signed in |
| `DELETE /v1/me/sessions/:id` | Sign out a device | signed in |

Access is declared on every route and checked at start-up; `:id` routes return 404 for another school's records (`test/isolation.e2e.test.ts`).

Tests: `apps/api/test/` (search for the routes above).
