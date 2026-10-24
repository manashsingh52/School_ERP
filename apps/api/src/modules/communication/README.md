# Messages, meetings and reminders

Parent–teacher conversations and complaints (categories, statuses, read receipts), Jitsi video meetings with reminders, and personal reminders with repeats.

## Routes

| Route | What | Who |
|---|---|---|
| `GET /v1/conversations` | My message threads (staff with school-wide access can see all) | `message.use` |
| `POST /v1/conversations` | Start a thread about a child (query, complaint, feedback …) | `message.use` |
| `GET /v1/conversations/:id` | A thread with its messages (marks it read) | `message.use` |
| `PATCH /v1/conversations/:id` | Change the status (open, in progress, resolved) | `message.use` |
| `POST /v1/conversations/:id/messages` | Reply | `message.use` |
| `GET /v1/conversations/contacts` | Who I can write to about this child | `message.use` |
| `GET /v1/conversations/unread` | Threads with something new for me | `message.use` |
| `GET /v1/meetings` | Parent–teacher video meetings | `meeting.view` |
| `POST /v1/meetings` | Schedule a video meeting with a child's parents | `meeting.manage` |
| `GET /v1/meetings/:id` | One meeting with its join link | `meeting.view` |
| `PATCH /v1/meetings/:id` | Edit or reschedule (parents are told) | `meeting.manage` |
| `POST /v1/meetings/:id/cancel` | Cancel (parents are told) | `meeting.manage` |
| `POST /v1/meetings/:id/complete` | Mark as held | `meeting.manage` |
| `GET /v1/reminders` | My reminders | `reminder.use` |
| `POST /v1/reminders` | Set a reminder (alarm at a date and time, optionally repeating) | `reminder.use` |
| `DELETE /v1/reminders/:id` | Delete a reminder | `reminder.use` |
| `PATCH /v1/reminders/:id` | Edit, reschedule, complete or reopen | `reminder.use` |

Access is declared on every route and checked at start-up; `:id` routes return 404 for another school's records (`test/isolation.e2e.test.ts`).

## Notifications it sends

Through `NotificationsService.notify` (each school chooses channels in Settings → Notifications):

- `complaint.status_changed`
- `meeting.scheduled`
- `meeting.starting`
- `message.received`
- `reminder.due`

## Background jobs

- `maintenance/meeting-reminders`
- `maintenance/reminders-due`

Scheduled (school-local time, fanned out per school by `SchedulerService`):

- `meeting-reminders`: every minute
- `reminders-due`: every minute

Tests: `apps/api/test/` (search for the routes above).
