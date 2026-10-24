# Dashboard

The role-aware home page numbers and "needs your attention" items.

## Routes

| Route | What | Who |
|---|---|---|
| `GET /v1/dashboard` | Home page numbers and attention items (role-aware) | `dashboard.view` |

Access is declared on every route and checked at start-up; `:id` routes return 404 for another school's records (`test/isolation.e2e.test.ts`).

Tests: `apps/api/test/` (search for the routes above).
