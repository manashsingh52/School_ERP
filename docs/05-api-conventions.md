# 05 — API Structure & Conventions

One REST API (`https://api.schoolos.in/v1`) serves the web BFF and the Flutter app.

## 1. Basics

| Topic | Convention |
|---|---|
| Style | REST, JSON, plural resource nouns: `/v1/students/:id` |
| Versioning | `/v1` prefix. Additive changes only within v1. Breaking change → `/v2` route alongside |
| Tenant | From the token (03). **Never** in the path, query or body |
| Casing | `camelCase` JSON fields; `kebab-case` paths; `SCREAMING_SNAKE` enum values |
| IDs | UUID strings |
| Dates | `date` fields: `"2026-10-07"` (school-local day). `datetime`: ISO 8601 UTC `"2026-10-07T04:30:00Z"` |
| Money | Integer paise, field name ends in `Paise`: `"amountPaise": 1630000` |
| Validation | Zod schemas from `packages/contracts`, applied by a global pipe. Unknown fields are **stripped** |
| Docs | OpenAPI 3.1 generated from Zod → served at `/v1/docs` (non-prod) → Dart client for Flutter |
| Auth | `Authorization: Bearer <access token>`. Web uses the BFF, so the browser never sees tokens |
| Request id | `X-Request-Id` accepted or generated; echoed in every response and error |
| Compression | gzip/br; responses are lean (list views return list DTOs, not full records) |

## 2. Responses

```jsonc
// single
{ "data": { "id": "…", "firstName": "Rahul", … } }

// list (table views: page-based)
{ "data": [ … ], "page": { "page": 2, "pageSize": 25, "total": 1248 } }

// feed (notifications, activity, timeline: cursor-based)
{ "data": [ … ], "page": { "nextCursor": "eyJ…", "hasMore": true } }
```

### Lists: query parameters

| Param | Example | Notes |
|---|---|---|
| `page`, `pageSize` | `?page=2&pageSize=25` | `pageSize` max 100 |
| `cursor`, `limit` | `?cursor=eyJ…&limit=30` | feeds only |
| `q` | `?q=rahul` | free-text search (trigram) |
| filters | `?classId=…&sectionId=…&status=ACTIVE` | explicit per endpoint, validated |
| `sort` | `?sort=-createdAt,lastName` | allow-listed fields only |
| `fields` | — | not supported (keeps it simple); use list vs detail DTOs |

## 3. Errors

```json
{
  "error": {
    "code": "STUDENT_ADMISSION_NO_TAKEN",
    "message": "Admission number 1042 is already used by another student.",
    "details": [{ "field": "admissionNo", "message": "Already in use" }],
    "requestId": "req_01J9X…",
    "supportRef": "ERR-7KQ2-M9"
  }
}
```

| HTTP | When | Example `code` |
|---|---|---|
| 400 | Malformed request | `BAD_REQUEST` |
| 401 | Missing/expired token | `UNAUTHENTICATED`, `TOKEN_EXPIRED` |
| 403 | Authenticated but not allowed | `FORBIDDEN`, `TENANT_MISMATCH`, `FEATURE_NOT_ENABLED`, `PLAN_LIMIT_REACHED` |
| 404 | Not found **or** outside tenant/scope | `NOT_FOUND` |
| 409 | Conflict / stale version | `CONFLICT`, `VERSION_CONFLICT`, `ATTENDANCE_ALREADY_SUBMITTED` |
| 422 | Validation / business rule | `VALIDATION_FAILED`, `INVALID_REFERENCE`, `INVOICE_ALREADY_PAID` |
| 429 | Rate limited | `RATE_LIMITED` (+ `Retry-After`) |
| 500 | Unexpected | `INTERNAL_ERROR`: generic message + `supportRef`, full detail goes to Sentry only |
| 503 | Dependency down | `SERVICE_UNAVAILABLE` (e.g. gateway outage) |

Rules:
- `message` is always safe to show to the end user. Prisma/stack traces **never** leave the server.
- `supportRef` is a short code a school can read out to support; it maps to the Sentry event and request logs.
- Prisma errors are translated centrally (unique violation → 409/422 with a field, FK violation → `INVALID_REFERENCE`).

## 4. Idempotency & concurrency

| Mechanism | Where |
|---|---|
| `Idempotency-Key` header (UUID), stored 24 h per membership | Required on: counter payment collect, gateway order create, refund, attendance submit, bulk invoice generate, notice publish. Same key + same body → same response. Same key + different body → `409` |
| `clientMutationId` in body | Offline attendance submissions from mobile (03, 12) |
| Optimistic locking via `version` | Invoices, exam marks sheets, settings: `If-Match: <version>` → `409 VERSION_CONFLICT` |

## 5. Rate limits (Redis, per IP + per identity)

| Endpoint group | Limit |
|---|---|
| `POST /auth/login` | 5 / min per identifier, 20 / min per IP; progressive lockout after 10 failures |
| `POST /auth/otp/send` | 1 / 30 s, 5 / hour, 10 / day per phone; 30 / hour per IP |
| `POST /auth/otp/verify` | 5 attempts per challenge |
| Authenticated API | 300 / min per membership (burst 60/s) |
| Exports / report runs | 10 / hour per membership |
| Webhooks | not limited (signature verified first) |

## 6. Endpoint map (V1)

> `P` = public (no auth). Everything else requires a token + permission (04).

### Auth & session
```
P POST /v1/auth/login                    { identifier, password } → { user, memberships[] , tokens? }
P POST /v1/auth/otp/send                 { phone, purpose }
P POST /v1/auth/otp/verify               { challengeId, code } → session
P POST /v1/auth/refresh                  { refreshToken } → rotated pair
P POST /v1/auth/password/reset           { challengeId, code, newPassword }
P POST /v1/auth/activate                 { inviteToken | otp, password? }
  POST /v1/auth/select-school            { membershipId } → school-scoped access token
  POST /v1/auth/logout                   (current session)
  GET  /v1/me                            user + current membership + permissions + feature flags
  GET  /v1/me/sessions                   devices
  DELETE /v1/me/sessions/:id             log out a device
  POST /v1/me/device-tokens              register FCM token
  PATCH /v1/me/password
P GET  /v1/public/schools/:slug          branding for login page (name, logo, accent)
P GET  /v1/public/schools?q=             "find your school" (name, city, slug only)
P GET  /v1/app/config                    min app version, maintenance flag
```

### School setup
```
GET/PATCH  /v1/school                         profile & branding
GET/PATCH  /v1/school/settings/:section       general|academic|attendance|fees|examinations|notifications|branding
GET/POST   /v1/onboarding                     wizard state; POST /v1/onboarding/steps/:n
CRUD       /v1/academic-years                 + POST /:id/activate, POST /:id/close
CRUD       /v1/classes                        + /v1/classes/:id/sections
CRUD       /v1/sections                       ?academicYearId=
CRUD       /v1/subjects                       + PUT /v1/classes/:id/subjects (per year)
CRUD       /v1/teaching-assignments
CRUD       /v1/bell-schedules                 (with periods)
CRUD       /v1/roles                          + PUT /v1/roles/:id/permissions
GET        /v1/permissions                    catalog
CRUD       /v1/members                        invite, change roles, deactivate
```

### People
```
CRUD   /v1/students                     ?q&classId&sectionId&status
GET    /v1/students/:id/attendance      ?from&to
GET    /v1/students/:id/homework
GET    /v1/students/:id/results
GET    /v1/students/:id/fees            invoices + payments + balance
GET    /v1/students/:id/documents
GET    /v1/students/:id/activity        audit-derived timeline
POST   /v1/students/:id/guardians       link/unlink
POST   /v1/promotions/preview           year-end promotion plan
POST   /v1/promotions/commit
CRUD   /v1/guardians
CRUD   /v1/teachers                     + GET /:id/timetable
```

### Daily operations
```
GET    /v1/attendance/sections/:sectionId?date=      register (creates DRAFT if absent)
PUT    /v1/attendance/sections/:sectionId?date=      { records[], submit: true, clientMutationId }
GET    /v1/attendance/summary?date=&classId=         school/class overview
GET    /v1/attendance/staff?date=  ·  PUT /v1/attendance/staff
CRUD   /v1/homework                                  ?sectionId&subjectId&from&to
POST   /v1/homework/:id/publish
CRUD   /v1/timetables                                + PUT /:id/entries, POST /:id/publish
GET    /v1/timetables/today                          (teacher: my classes; parent: child's day)
CRUD   /v1/notices                                   + POST /:id/publish, POST /:id/read
GET    /v1/notifications                             inbox (cursor) · POST /:id/read · POST /read-all
GET/PUT /v1/notification-rules
GET/PUT /v1/notification-templates
```

### Exams
```
CRUD   /v1/grading-scales
CRUD   /v1/exams                                     + PUT /:id/subjects (class×subject grid)
GET    /v1/exams/:id/marks?classId&sectionId&subjectId   marks sheet
PUT    /v1/exams/:id/marks                           bulk upsert { examSubjectId, entries[] }  (If-Match)
POST   /v1/exams/:id/subjects/:examSubjectId/lock
POST   /v1/exams/:id/results/compute                 preview
POST   /v1/exams/:id/results/publish
POST   /v1/exams/:id/report-cards                    generate (async) → reportRunId
GET    /v1/report-cards/:id/download                 signed URL
```

### Finance
```
CRUD   /v1/fee-heads
CRUD   /v1/fee-structures                            + items, installments, splits, classes
CRUD   /v1/late-fee-rules
CRUD   /v1/concession-types
CRUD   /v1/student-concessions                       + POST /:id/approve, /:id/reject
POST   /v1/fee-assignments/bulk                      assign structure to class/section/students
POST   /v1/invoices/generate/preview                 { installmentId, classIds } → counts, totals
POST   /v1/invoices/generate                         (async, Idempotency-Key)
GET    /v1/invoices                                  ?status&overdue&classId&q
GET    /v1/invoices/:id
POST   /v1/invoices/:id/adjustments                  { amountPaise, reason }
POST   /v1/invoices/:id/cancel                       { reason }
POST   /v1/payments/collect                          counter payment { studentId, allocations[], method, … }
POST   /v1/payments/online/orders                    parent: { invoiceIds[] , amountPaise } → Razorpay order + key id
POST   /v1/payments/online/verify                    parent: checkout callback (signature) → status
GET    /v1/payments                                  ?from&to&method&status
GET    /v1/payments/:id
POST   /v1/payments/:id/void                         { reason }
POST   /v1/payments/:id/refunds                      { amountPaise, reason }
GET    /v1/receipts/:id/download                     signed URL
GET/PUT /v1/payment-gateway                          connect/verify Razorpay keys (secrets write-only)
P POST /v1/webhooks/razorpay/:publicId               raw body, signature verified
```

### Platform services
```
POST   /v1/files/upload-url             { purpose, fileName, mimeType, sizeBytes } → signed PUT URL + fileId
POST   /v1/files/:id/complete           verify & mark READY
GET    /v1/files/:id/download-url       signed GET URL (5 min)
CRUD   /v1/documents                    ?ownerType&ownerId
POST   /v1/imports                      { entity, fileId } → job
PUT    /v1/imports/:id/mapping
GET    /v1/imports/:id                  stats + rows ?status=INVALID
POST   /v1/imports/:id/commit
GET    /v1/imports/templates/:entity    sample XLSX
POST   /v1/reports/:type/run            { params, format } → reportRunId
GET    /v1/reports/runs/:id             status + download URL
GET    /v1/reports/:type                small on-screen reports (JSON)
GET    /v1/dashboard                    role-aware summary (attention items, KPIs, quick actions)
GET    /v1/search?q=&types=             command palette search
GET    /v1/audit-logs                   ?entityType&entityId&actor&from&to
GET    /v1/features                     enabled flags + plan limits for this school
```

### Super admin (`typ: platform` tokens, served at the same API under `/v1/platform`)
```
GET   /v1/platform/metrics
CRUD  /v1/platform/schools               + POST /:id/suspend, /:id/activate, /:id/change-slug
CRUD  /v1/platform/plans  ·  /v1/platform/subscriptions
CRUD  /v1/platform/feature-flags         + PUT /v1/platform/schools/:id/features
POST  /v1/platform/support-access        request grant (school admin approves in their app)
GET   /v1/platform/system/queues         BullMQ stats, DLQ
GET   /v1/platform/audit-logs
```

## 7. Webhook & callback endpoints

- Receive the **raw body** (needed for HMAC). JSON parsing happens after verification.
- Respond `200` quickly after storing the event. Processing happens in the `payments` queue.
- Details in [11-payments.md](11-payments.md).

## Open questions

1. Is OpenAPI docs exposure on **staging only** OK (hidden in prod)?
2. Should we offer a **public API / API keys** for schools in V1? Recommendation: no, V2.
