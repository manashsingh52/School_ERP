# Payments and invoices

Invoices with gap-free numbers, counter payments and receipts, day close, Razorpay per school (orders, webhooks, verification, refunds, reconciliation) with a mock sandbox, late fees, fee reminders and the finance reports.

## Routes

| Route | What | Who |
|---|---|---|
| `POST /v1/finance/jobs/run` | Run late fees or fee reminders now | `fee.manage` |
| `GET /v1/finance/reports` | Finance reports (collection, outstanding, defaulters, heads, concessions, reconciliation); format=csv to export | `report.finance` |
| `GET /v1/invoices` | Invoices (parents: their children) | `invoice.view` |
| `GET /v1/invoices/:id` | Invoice with lines and payments | `invoice.view` |
| `POST /v1/invoices/:id/adjustments` | Add or reduce an amount, with a reason | `invoice.adjust` |
| `POST /v1/invoices/:id/cancel` | Cancel an unpaid invoice | `invoice.cancel` |
| `POST /v1/invoices/generate` | Issue invoices for an installment (background job) | `invoice.generate` |
| `POST /v1/invoices/preview` | Preview invoices for an installment | `invoice.generate` |
| `GET /v1/payments` | Payments | `payment.view` |
| `GET /v1/payments/:id` | One payment | `payment.view` |
| `GET /v1/payments/:id/receipt` | Download link for the receipt PDF | `payment.view` |
| `POST /v1/payments/:id/refunds` | Refund a payment (credit first, then reopens invoices) | `payment.refund` |
| `POST /v1/payments/:id/void` | Cancel a counter receipt (reopens invoice balances) | `payment.void` |
| `POST /v1/payments/collect` | Counter payment for whole invoices (Idempotency-Key required) | `payment.collect` |
| `GET /v1/payments/day-close` | Day close: collection by method and collector | `payment.collect` |
| `GET /v1/payments/gateway` | School's Razorpay accounts and status | `gateway.manage` |
| `PUT /v1/payments/gateway` | Connect Razorpay keys (secret encrypted; webhook secret shown once) | `gateway.manage` |
| `POST /v1/payments/gateway/activate` | Turn online payments on/off for a mode | `gateway.manage` |
| `POST /v1/payments/gateway/test-webhook` | Sandbox: send a signed test webhook | `gateway.manage` |
| `POST /v1/payments/online/mock-checkout` | Sandbox only: simulate the checkout result | `payment.pay_online` |
| `POST /v1/payments/online/orders` | Start an online payment for whole invoices | `payment.pay_online` |
| `POST /v1/payments/online/reconcile` | Check open orders with the gateway now | `gateway.manage` |
| `POST /v1/payments/online/verify` | Confirm checkout (signature + gateway check) | `payment.pay_online` |
| `POST /v1/students/:id/credits/apply` | Use a student's credit to pay an invoice | `payment.collect` |
| `GET /v1/students/:id/fees` | A student's fee statement | `invoice.view` |

Access is declared on every route and checked at start-up; `:id` routes return 404 for another school's records (`test/isolation.e2e.test.ts`).

## Notifications it sends

Through `NotificationsService.notify` (each school chooses channels in Settings → Notifications):

- `payment.received`
- `refund.processed`

## Outbox events

Published (in the same transaction as the change): `payment.captured`, `payment.voided`

Handled: `payment.captured`, `payment.voided`

## Background jobs

- `documents/receipt`
- `finance/fee-reminders`
- `finance/invoices.generate`
- `finance/late-fees`
- `finance/reconcile`
- `finance/webhook.process`

Scheduled (school-local time, fanned out per school by `SchedulerService`):

- `late-fees`: daily at 00:30
- `fee-reminders`: daily at 08:00
- `reconcile`: every 10 minutes

Tests: `apps/api/test/` (search for the routes above).
