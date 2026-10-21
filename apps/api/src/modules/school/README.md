# School profile and settings

The school profile, the onboarding checklist and wizard, year-end promotion, and the settings sections (general, fees, examinations, branding, notifications).

## Routes

| Route | What | Who |
|---|---|---|
| `GET /v1/onboarding` | Setup checklist | `school.settings.view` |
| `POST /v1/onboarding/go-live` | Mark the school live | `school.settings.manage` |
| `PUT /v1/onboarding/step` | Remember the wizard step | `school.settings.manage` |
| `POST /v1/promotions/commit` | Promote students to the next year | `student.promote` |
| `POST /v1/promotions/preview` | Plan year-end promotion | `student.promote` |
| `GET /v1/school` | This school: profile, branding, current year | any member of the school |
| `PATCH /v1/school` | Edit school profile | `school.settings.manage` |
| `PATCH /v1/school/branding` | Logo and accent colour | `school.branding.manage` |
| `GET /v1/school/settings` | Settings: general, fees, examinations, branding, notifications | `school.settings.view` |
| `PUT /v1/school/settings/:section` | Save one settings section (branding needs school.branding.manage, notifications notification.settings.manage) | any member of the school |

Access is declared on every route and checked at start-up; `:id` routes return 404 for another school's records (`test/isolation.e2e.test.ts`).

Tests: `apps/api/test/` (search for the routes above).
