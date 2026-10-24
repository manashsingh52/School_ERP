# Documents

Files kept on a student, guardian, teacher, staff member or the school, with "share with parents" control and short-lived download links.

## Routes

| Route | What | Who |
|---|---|---|
| `GET /v1/documents` | A student's, guardian's, teacher's or the school's documents | `document.view` |
| `POST /v1/documents` | Attach an uploaded file as a document | `document.manage` |
| `DELETE /v1/documents/:id` | Delete a document | `document.manage` |
| `PATCH /v1/documents/:id` | Rename, recategorise or share with parents | `document.manage` |
| `GET /v1/documents/:id/download` | Short-lived download link | `document.view` |

Access is declared on every route and checked at start-up; `:id` routes return 404 for another school's records (`test/isolation.e2e.test.ts`).

Tests: `apps/api/test/` (search for the routes above).
