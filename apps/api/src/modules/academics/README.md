# Academics

Academic years, classes, sections, subjects (and which class studies which, including optional subjects) and teaching assignments: the structure everything else hangs on.

## Routes

| Route | What | Who |
|---|---|---|
| `GET /v1/academic-years` | List academic years | `academic.view` |
| `POST /v1/academic-years` | Create an academic year | `academic.manage` |
| `PATCH /v1/academic-years/:id` | Edit an academic year | `academic.manage` |
| `POST /v1/academic-years/:id/activate` | Make the current academic year | `academic.manage` |
| `POST /v1/academic-years/:id/close` | Close an academic year | `academic.manage` |
| `GET /v1/class-subjects` | Subjects each class studies | `academic.view` |
| `PUT /v1/class-subjects` | Set subjects for classes | `academic.manage` |
| `GET /v1/classes` | Classes with their sections for a year | `academic.view` |
| `POST /v1/classes` | Add a class | `academic.manage` |
| `DELETE /v1/classes/:id` | Delete an unused class | `academic.manage` |
| `PATCH /v1/classes/:id` | Edit a class | `academic.manage` |
| `POST /v1/classes/bulk` | Add several classes | `academic.manage` |
| `POST /v1/sections` | Add a section | `academic.manage` |
| `DELETE /v1/sections/:id` | Delete an unused section | `academic.manage` |
| `PATCH /v1/sections/:id` | Edit a section (incl. class teacher) | `academic.manage` |
| `POST /v1/sections/bulk` | Add sections to several classes | `academic.manage` |
| `GET /v1/subjects` | List subjects | `academic.view` |
| `POST /v1/subjects` | Add a subject | `academic.manage` |
| `PATCH /v1/subjects/:id` | Edit a subject | `academic.manage` |
| `POST /v1/subjects/bulk` | Add several subjects | `academic.manage` |
| `GET /v1/teaching-assignments` | Who teaches what | `academic.view` |
| `POST /v1/teaching-assignments` | Assign a teacher | `academic.manage` |
| `DELETE /v1/teaching-assignments/:id` | Remove an assignment | `academic.manage` |

Access is declared on every route and checked at start-up; `:id` routes return 404 for another school's records (`test/isolation.e2e.test.ts`).

Tests: `apps/api/test/` (search for the routes above).
