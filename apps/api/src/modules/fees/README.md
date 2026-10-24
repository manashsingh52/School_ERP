# Fee setup

Fee heads, structures with installments, concessions and late-fee rules: what a student owes and when.

## Routes

| Route | What | Who |
|---|---|---|
| `GET /v1/concession-types` | Concession types | `fee.view` |
| `POST /v1/concession-types` | Add a concession type | `fee.manage` |
| `PATCH /v1/concession-types/:id` | Edit a concession type | `fee.manage` |
| `GET /v1/concessions` | Student concessions (requests and approved) | `concession.request` |
| `POST /v1/concessions` | Request a concession for a student | `concession.request` |
| `POST /v1/concessions/:id/decision` | Approve, reject or revoke a concession | `concession.approve` |
| `GET /v1/fee-heads` | Fee heads | `fee.view` |
| `POST /v1/fee-heads` | Add a fee head | `fee.manage` |
| `PATCH /v1/fee-heads/:id` | Edit a fee head | `fee.manage` |
| `GET /v1/fee-structures` | This year's fee structures | `fee.view` |
| `POST /v1/fee-structures` | Create a fee structure (classes, fees, installments, late fee) | `fee.manage` |
| `DELETE /v1/fee-structures/:id` | Delete a structure (archived once it has invoices) | `fee.manage` |
| `GET /v1/fee-structures/:id` | One fee structure | `fee.view` |
| `PUT /v1/fee-structures/:id` | Replace a structure (until invoices exist) | `fee.manage` |
| `POST /v1/fee-structures/:id/publish` | Publish a structure so invoices can be made | `fee.manage` |
| `GET /v1/students/:id/fee-options` | A student's optional fees | `fee.assign` |
| `PUT /v1/students/:id/fee-options` | Opt a student into optional fees | `fee.assign` |

Access is declared on every route and checked at start-up; `:id` routes return 404 for another school's records (`test/isolation.e2e.test.ts`).

Tests: `apps/api/test/` (search for the routes above).
