# Certificates

E-certificates for participation and achievement. A teacher (for students in their sections) or the office issues one to a student or a whole team at once: type first (participation or achievement), then the event, its date and, for an achievement, the position. Parents are told and see every certificate under the child's **Achievements** (app and parent web view). The PDF is drawn in the school's colours with its logo and the principal's signature the first time anyone opens it, then kept. Each certificate gets a number per academic year (`CERT/2026-27/0001`).

## Routes

| Route | What | Who |
|---|---|---|
| `GET /v1/certificates` | Certificates issued to students (a parent sees their child's achievements) | `certificate.view` |
| `POST /v1/certificates` | Issue a participation or achievement certificate to one or more students | `certificate.issue` |
| `GET /v1/certificates/:id/download` | Short-lived download link for the certificate PDF | `certificate.view` |
| `DELETE /v1/certificates/:id` | Withdraw a certificate issued by mistake | `certificate.issue` |

Scopes: `ALL` (office), `ASSIGNED` (teachers: students of their sections, plus any certificate they issued; they can withdraw only their own), `OWN_CHILDREN` (parents).

Access is declared on every route and checked at start-up; `:id` routes return 404 for another school's records (`test/isolation.e2e.test.ts`).

## Notifications it sends

Through `NotificationsService.notify` (each school chooses channels in Settings → Notifications):

- `certificate.issued`

Tests: `apps/api/test/certificates.e2e.test.ts`.
