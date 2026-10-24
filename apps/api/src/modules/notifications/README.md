# Notifications

The notification engine: per-school rules (event on/off, channels), the in-app inbox, and one queued delivery per extra channel (push, SMS, email) through the ChannelGateway, with quiet hours and a daily SMS limit.

## Routes

| Route | What | Who |
|---|---|---|
| `GET /v1/notification-rules` | Which events notify whom, on which channels | `notification.settings.manage` |
| `PUT /v1/notification-rules` | Turn events and channels on or off | `notification.settings.manage` |
| `GET /v1/notifications` | My notifications (newest first) | any member of the school |
| `POST /v1/notifications/:id/read` | Mark one notification read | any member of the school |
| `POST /v1/notifications/read-all` | Mark all my notifications read | any member of the school |
| `GET /v1/notifications/unread-count` | Unread badge count | any member of the school |

Access is declared on every route and checked at start-up; `:id` routes return 404 for another school's records (`test/isolation.e2e.test.ts`).

## Background jobs

- `notifications/deliver`

Tests: `apps/api/test/` (search for the routes above).
