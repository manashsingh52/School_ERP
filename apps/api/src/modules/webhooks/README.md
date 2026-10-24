# Webhooks

Razorpay webhooks per school, authorised by the HMAC signature against that school's account.

## Routes

| Route | What | Who |
|---|---|---|
| `POST /v1/webhooks/razorpay/:publicId` | Razorpay webhook (HMAC-signed) | anyone |

Access is declared on every route and checked at start-up; `:id` routes return 404 for another school's records (`test/isolation.e2e.test.ts`).

Tests: `apps/api/test/` (search for the routes above).
