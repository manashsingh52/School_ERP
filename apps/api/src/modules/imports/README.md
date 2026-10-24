# Excel / CSV import

Two-step imports (check, then commit in the background) for students, teachers, classes, subjects and fees, with row-level problems to fix.

## Routes

| Route | What | Who |
|---|---|---|
| `GET /v1/imports` | Recent imports | `import.run` |
| `POST /v1/imports` | Start an import from an uploaded file | `import.run` |
| `GET /v1/imports/:id` | Import status, mapping and stats | `import.run` |
| `POST /v1/imports/:id/commit` | Import the valid rows (background job) | `import.run` |
| `PUT /v1/imports/:id/mapping` | Map columns and validate every row | `import.run` |
| `GET /v1/imports/:id/problems` | Rows that need fixing (format=csv or xlsx) | `import.run` |
| `GET /v1/imports/:id/rows` | Rows with status and problems | `import.run` |
| `GET /v1/imports/templates/:entity` | Download an Excel template | `import.run` |

Access is declared on every route and checked at start-up; `:id` routes return 404 for another school's records (`test/isolation.e2e.test.ts`).

## Outbox events

Published (in the same transaction as the change): `student.created`

## Background jobs

- `imports/commit`

Tests: `apps/api/test/` (search for the routes above).
