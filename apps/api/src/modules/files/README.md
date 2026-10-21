# Files

Upload links, magic-byte checks on completion, and signed downloads, over the local driver (development) or Google Cloud Storage.

## Routes

| Route | What | Who |
|---|---|---|
| `POST /v1/files/:id/complete` | Verify an uploaded file | any member of the school |
| `GET /v1/files/:id/download-url` | Get a short-lived download link | any member of the school |
| `GET /v1/files/local/:token` | Development storage download (signed token) | anyone |
| `PUT /v1/files/local/:token` | Development storage upload (signed token) | anyone |
| `POST /v1/files/upload-url` | Get a signed upload link | any member of the school |

Access is declared on every route and checked at start-up; `:id` routes return 404 for another school's records (`test/isolation.e2e.test.ts`).

Tests: `apps/api/test/` (search for the routes above).
