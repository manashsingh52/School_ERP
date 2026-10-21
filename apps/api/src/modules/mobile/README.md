# Mobile app support

App start-up config (forced-update versions, store links, checkout type, whether SMS codes are on) and push tokens for each signed-in phone.

## Routes

| Route | What | Who |
|---|---|---|
| `GET /v1/app/config` | Mobile app: minimum version, store links, checkout | anyone |
| `DELETE /v1/me/devices` | Stop push notifications to this phone | signed in |
| `PUT /v1/me/devices` | Register this phone for push notifications | signed in |
| `GET /v1/openapi.json` | This API as OpenAPI 3.1 (not in production) | anyone |

Access is declared on every route and checked at start-up; `:id` routes return 404 for another school's records (`test/isolation.e2e.test.ts`).

Tests: `apps/api/test/` (search for the routes above).
