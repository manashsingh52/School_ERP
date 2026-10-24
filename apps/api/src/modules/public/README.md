# Public

Unauthenticated school branding for the login page (name, logo, colour, whether SMS codes are on).

## Routes

| Route | What | Who |
|---|---|---|
| `GET /v1/public/schools/:slug` | School branding for the login page | anyone |

Access is declared on every route and checked at start-up; `:id` routes return 404 for another school's records (`test/isolation.e2e.test.ts`).

Tests: `apps/api/test/` (search for the routes above).
