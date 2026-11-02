# Excel / CSV import

Two-step imports (check, then commit in the background) for students, teachers, classes, subjects, optional fees and **fees already paid**, with row-level problems to fix.

**Fees already paid** (`FEE_PAYMENTS`, `payment-imports.ts`): for a school that starts mid-year. Each row (admission no., amount, date, optional mode / old receipt no. / note) becomes a payment against the student's oldest open bills; anything beyond what's due is kept as advance credit. The date must fall in the current school year and not in the future. Rows already recorded (same student, amount, day and reference) come back as duplicates, so re-importing a file adds nothing. Parents aren't messaged about old payments, and each receipt PDF is made when first opened. Needs `payment.collect` as well as `import.run`.

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
