# Users and roles

Everyone with access to the school, their roles, the roles editor, and one-time sign-in codes the office hands over.

## Routes

| Route | What | Who |
|---|---|---|
| `GET /v1/members` | People with access to this school | `user.view` |
| `POST /v1/members` | Invite someone | `user.manage` |
| `PATCH /v1/members/:id` | Change roles or suspend | `user.manage` |
| `POST /v1/members/:id/sign-in-code` | One-time sign-in code to hand over (no SMS needed) | `user.manage` |
| `GET /v1/permissions` | Permission catalog | `user.view` |
| `GET /v1/roles` | Roles and their permissions | `user.view` |
| `POST /v1/roles` | Create a custom role | `role.manage` |
| `DELETE /v1/roles/:id` | Delete an unused custom role | `role.manage` |
| `PATCH /v1/roles/:id` | Rename a role | `role.manage` |
| `PUT /v1/roles/:id/permissions` | Set role permissions | `role.manage` |

Access is declared on every route and checked at start-up; `:id` routes return 404 for another school's records (`test/isolation.e2e.test.ts`).

Tests: `apps/api/test/` (search for the routes above).
