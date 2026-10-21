# Search

The ⌘K search across students, teachers and parents, within the caller's scope.

## Routes

| Route | What | Who |
|---|---|---|
| `GET /v1/search` | Search students, teachers and parents | any member of the school |

Access is declared on every route and checked at start-up; `:id` routes return 404 for another school's records (`test/isolation.e2e.test.ts`).

Tests: `apps/api/test/` (search for the routes above).
