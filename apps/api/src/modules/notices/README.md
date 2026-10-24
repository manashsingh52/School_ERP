# Notices

Notices to chosen audiences, scheduled publishing, attachments and read receipts.

## Routes

| Route | What | Who |
|---|---|---|
| `GET /v1/notices` | Notices addressed to me (managers: all) | `notice.view` |
| `POST /v1/notices` | Write a notice (publish now, draft or schedule) | `notice.create` |
| `DELETE /v1/notices/:id` | Delete a notice (published → archived) | `notice.create` |
| `GET /v1/notices/:id` | One notice | `notice.view` |
| `PATCH /v1/notices/:id` | Edit a notice | `notice.create` |
| `GET /v1/notices/:id/attachments/:fileId` | Download link for an attachment | `notice.view` |
| `POST /v1/notices/:id/publish` | Publish a draft now or at a time | `notice.create` |
| `POST /v1/notices/:id/read` | Read receipt | `notice.view` |
| `GET /v1/notices/:id/stats` | How many recipients opened it | `notice.create` |
| `GET /v1/notices/audience-options` | Classes, sections and roles I may address | `notice.create` |

Access is declared on every route and checked at start-up; `:id` routes return 404 for another school's records (`test/isolation.e2e.test.ts`).

## Notifications it sends

Through `NotificationsService.notify` (each school chooses channels in Settings → Notifications):

- `notice.published`

## Outbox events

Published (in the same transaction as the change): `notice.published`

Handled: `notice.published`

## Background jobs

- `maintenance/notice.publish`

Tests: `apps/api/test/` (search for the routes above).
