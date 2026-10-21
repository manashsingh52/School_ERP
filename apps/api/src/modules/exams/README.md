# Examinations

Grading scales, exams and date sheets, marks entry (grid, lock/unlock, Excel import), results and ranks, report cards (per exam and per term, in the school's chosen layout), co-scholastic grades and the performance charts.

## Routes

| Route | What | Who |
|---|---|---|
| `GET /v1/exam-terms` | Consolidated terms (exams combined with weights) | `exam.view` |
| `POST /v1/exam-terms` | Create a term from published exams and weights | `exam.manage` |
| `DELETE /v1/exam-terms/:id` | Delete an unpublished term | `exam.manage` |
| `PUT /v1/exam-terms/:id` | Change a term (not once published) | `exam.manage` |
| `POST /v1/exam-terms/:id/publish` | Publish term results to parents and make report cards | `results.publish` |
| `GET /v1/exam-terms/:id/report-cards/:studentId` | Download link for a student's term report card | `results.view` |
| `GET /v1/exam-terms/:id/results` | Term results per student (weighted) | `results.view` |
| `POST /v1/exam-terms/:id/unpublish` | Take term results back | `results.publish` |
| `GET /v1/exams` | Exams this year (parents: per child) | `exam.view` |
| `POST /v1/exams` | Create an exam | `exam.manage` |
| `DELETE /v1/exams/:id` | Delete a draft exam (archived once it has marks) | `exam.manage` |
| `GET /v1/exams/:id` | Exam with its subject grid and date sheet | `exam.view` |
| `PATCH /v1/exams/:id` | Edit an exam or move it to scheduled / marks entry | `exam.manage` |
| `GET /v1/exams/:id/co-scholastic` | Co-scholastic grades for a section (class teacher's grid) | `marks.enter` |
| `PUT /v1/exams/:id/co-scholastic` | Save co-scholastic grades | `marks.enter` |
| `GET /v1/exams/:id/progress` | Marks entry progress per subject and section | `exam.view` |
| `GET /v1/exams/:id/report-cards` | Report card status per student in a section | `report_card.generate` |
| `POST /v1/exams/:id/report-cards` | Generate report cards for a section (background job) | `report_card.generate` |
| `GET /v1/exams/:id/report-cards/:studentId` | Download link for a student's latest report card | `results.view` |
| `GET /v1/exams/:id/report-cards/bundle` | A section's report cards as one PDF | `report_card.generate` |
| `GET /v1/exams/:id/results` | Results with per-subject marks | `results.view` |
| `PATCH /v1/exams/:id/results/:studentId` | Remarks; withhold or release a result | `results.view` |
| `POST /v1/exams/:id/results/compute` | Compute results from marks (preview before publishing) | `results.publish` |
| `POST /v1/exams/:id/results/publish` | Publish results (locks marks, tells parents) | `results.publish` |
| `POST /v1/exams/:id/results/unpublish` | Unpublish results for corrections | `results.publish` |
| `PUT /v1/exams/:id/subjects` | Set the class × subject grid (max/pass marks, dates) | `exam.manage` |
| `POST /v1/exams/:id/subjects/:examSubjectId/lock` | Lock marks for a subject | `marks.enter` |
| `POST /v1/exams/:id/subjects/:examSubjectId/unlock` | Unlock marks for a subject | `marks.edit_locked` |
| `GET /v1/exams/marks` | Marks sheet for one subject in one section | `exam.view` |
| `PUT /v1/exams/marks` | Save marks (409 VERSION_CONFLICT if someone saved meanwhile) | `marks.enter` |
| `POST /v1/exams/marks/import` | Check (apply=false) or save marks from a filled sheet | `marks.enter` |
| `GET /v1/exams/marks/mine` | Marks sheets still open to me (exams in marks entry) | `marks.enter` |
| `GET /v1/exams/marks/template` | Marks sheet as Excel (class list, current marks) to fill offline | `marks.enter` |
| `GET /v1/grading-scales` | Grading scales with their bands | `exam.view` |
| `POST /v1/grading-scales` | Create a grading scale | `exam.manage` |
| `DELETE /v1/grading-scales/:id` | Delete an unused grading scale | `exam.manage` |
| `PUT /v1/grading-scales/:id` | Edit a grading scale (until results are published with it) | `exam.manage` |
| `POST /v1/grading-scales/presets` | Add a ready-made scale (CBSE 9-point, A–E, percentage) | `exam.manage` |
| `GET /v1/students/:id/performance` | A student's marks by subject and exam, for the results charts | `results.view` |
| `GET /v1/students/:id/results` | A student's published results this year | `results.view` |
| `GET /v1/students/:id/term-results` | A child's published term results | `results.view` |

Access is declared on every route and checked at start-up; `:id` routes return 404 for another school's records (`test/isolation.e2e.test.ts`).

## Notifications it sends

Through `NotificationsService.notify` (each school chooses channels in Settings → Notifications):

- `exam.results_published`

## Outbox events

Published (in the same transaction as the change): `exam.results_published`

Handled: `exam.results_published`

## Background jobs

- `documents/report-cards`
- `documents/term-report-cards`

Tests: `apps/api/test/` (search for the routes above).
