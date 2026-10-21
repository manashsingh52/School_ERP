# Sign-in and sessions

Password and one-time-code sign-in, codes from the school office (no SMS needed), refresh-token rotation with reuse detection, lockout and rate limits, and the signed-in user's profile and sessions (`/me`).

## Routes

| Route | What | Who |
|---|---|---|
| `POST /v1/auth/code/redeem` | Sign in with a code from the school office and set a password | anyone |
| `POST /v1/auth/login` | Sign in with phone/email and password | anyone |
| `POST /v1/auth/logout` | Sign out this device | signed in |
| `POST /v1/auth/otp/send` | Send a one-time code | anyone |
| `POST /v1/auth/otp/verify` | Sign in with a one-time code | anyone |
| `POST /v1/auth/password/reset` | Set a new password with a one-time code | anyone |
| `POST /v1/auth/refresh` | Rotate the refresh token | anyone |
| `POST /v1/auth/select-school` | Scope the session to one school | signed in |

Access is declared on every route and checked at start-up; `:id` routes return 404 for another school's records (`test/isolation.e2e.test.ts`).

Tests: `apps/api/test/` (search for the routes above).
