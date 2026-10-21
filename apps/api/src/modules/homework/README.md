# Homework

Homework with attachments, scheduled publishing, submissions and teacher notes; parents see it per child and mark it seen.

## Routes

| Route | What | Who |
|---|---|---|
| `GET /v1/homework` | Homework list (scoped: class, own sections, own children) | `homework.view` |
| `POST /v1/homework` | Set homework (publish now, draft or schedule) | `homework.manage` |
| `DELETE /v1/homework/:id` | Delete homework (published → archived) | `homework.manage` |
| `GET /v1/homework/:id` | One homework | `homework.view` |
| `PATCH /v1/homework/:id` | Edit homework | `homework.manage` |
| `GET /v1/homework/:id/attachments/:fileId` | Download link for an attachment | `homework.view` |
| `POST /v1/homework/:id/publish` | Publish a draft now or at a time | `homework.manage` |
| `POST /v1/homework/:id/seen` | A parent opened it (shows the teacher it was seen) | `homework.view` |
| `GET /v1/homework/:id/submissions` | Who handed it in (class roster with status and feedback) | `homework.manage` |
| `PUT /v1/homework/:id/submissions` | Mark students submitted / reviewed, with feedback | `homework.manage` |
| `GET /v1/homework/targets` | Sections and subjects I may set homework for | `homework.manage` |

Access is declared on every route and checked at start-up; `:id` routes return 404 for another school's records (`test/isolation.e2e.test.ts`).

## Notifications it sends

Through `NotificationsService.notify` (each school chooses channels in Settings → Notifications):

- `homework.published`

## Outbox events

Published (in the same transaction as the change): `homework.published`

Handled: `homework.published`

## Background jobs

- `maintenance/homework.publish`

Tests: `apps/api/test/` (search for the routes above).
