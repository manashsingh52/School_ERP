# Browser tests (Playwright)

Critical paths, end to end, in a real browser:

| File | What it proves |
| --- | --- |
| `auth.spec.ts` | wrong password refused; sign-in returns you to where you were going; sign-out; unknown school address |
| `attendance.spec.ts` | the class teacher submits today's register; the parent sees the absence |
| `fees.spec.ts` | counter cash collection with a receipt; online payment (sandbox) succeeds and fails correctly; old receipts made on request |
| `marks.spec.ts` | marks entry; impossible marks blocked before saving; saved marks survive a reload |
| `students.spec.ts` | admission with a parent; a duplicate admission number is refused at the field |
| `platform.spec.ts` | the platform console; school staff kept out of it; a parent's list holds only their children |
| `assistant.spec.ts` | the assistant answers (Hindi question, offline provider) and counts the question |

## Run

```bash
pnpm e2e            # from the repo root: builds the API and web app, then runs everything
pnpm --filter @schoolos/e2e e2e --ui   # after a build: Playwright's UI mode
```

`global-setup.ts` starts its own throwaway PostgreSQL (real migrations and RLS), seeds the demo
school with a test-only password, and runs the built API on `:4100` and the web app on `:3100`
(`demo.localhost:3100`, `admin.localhost:3100`). Your dev servers on `:3000`/`:4000` and your
`apps/api/.env` are never used. Payments use the mock sandbox and PDFs the basic renderer.

Locally the installed Google Chrome is used (no download). CI installs Chromium
(`playwright install --with-deps chromium`) and uploads traces when a test fails.

Each role signs in once through the real form (`tests/auth.setup.ts`) and the tests reuse that
session: the API allows only 5 sign-ins a minute per account.

Server output is in `test-results/api.log` and `test-results/web.log`.
