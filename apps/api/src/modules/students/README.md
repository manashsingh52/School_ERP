# Students

Student records, admission, profile and status, within the caller's scope (all, assigned sections, own children), and printable ID cards.

## Routes

| Route | What | Who |
|---|---|---|
| `GET /v1/students` | List students | `student.view` |
| `POST /v1/students` | Add a student | `student.create` |
| `GET /v1/students/id-cards` | ID cards as a PDF: `?sectionId=` (nine to an A4 sheet) or `?studentId=` | `student.edit` |
| `GET /v1/students/:id` | Student profile | `student.view` |
| `PATCH /v1/students/:id` | Edit a student | `student.edit` |

Access is declared on every route and checked at start-up; `:id` routes return 404 for another school's records (`test/isolation.e2e.test.ts`).

## Outbox events

Published (in the same transaction as the change): `student.created`

ID cards (`id-card.template.ts`) are the standard card size, 54 × 85.6 mm, in the school's colour with its logo, the student's photo (or initials), class, admission number, date of birth, blood group, primary parent and phone, address, the year and the principal's signature. Fields the school hasn't filled in are left off.

Tests: `apps/api/test/` (search for the routes above; ID cards in `id-cards.e2e.test.ts`).
