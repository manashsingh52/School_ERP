# 04 — Roles, Permissions & Data Scopes

## 1. Model

```
User ──< Membership (per school) ──< MembershipRole >── Role ──< RolePermission (permission key + scope)
```

- Code checks **permissions**, never role names. `if (role === 'teacher')` is banned by lint.
- Each grant has a **scope** that limits which records it covers:

| Scope | Meaning | Resolved from |
|---|---|---|
| `ALL` | every record in the school | — |
| `ASSIGNED` | sections/subjects the teacher teaches or is class teacher of, in the current academic year | `teaching_assignments`, `sections.class_teacher_id` |
| `OWN_CHILDREN` | students linked to this guardian | `student_guardians` |
| `SELF` | the user's own record | `membership_id` |

- A user with several roles gets the **union**. Where two roles grant the same permission, the broadest scope wins.
- Permission keys and default role templates live in `packages/permissions` (one source of truth for API, web and mobile).
  When a school is created, the templates are **copied** into its `roles` table, so a school can tune them later.

## 2. Enforcement (two steps)

```ts
@Get(':id')
@RequirePermission('student.view')                    // step 1: guard — has the permission at any scope?
async get(@Param('id') id: string, @Tenant() ctx: TenantContext) {
  await this.policy.assertStudent(ctx, 'student.view', id);   // step 2: is THIS record inside the scope?
  return this.students.get(id);
}

// list endpoints turn the scope into a Prisma filter instead:
const where = this.policy.studentFilter(ctx, 'student.view'); // ALL → {}, ASSIGNED → { enrollments: { some: { sectionId: { in: [...] } } } }
```

- Step 2 returns **404** for out-of-scope records (same as cross-tenant).
- The permission set for a membership is cached in Redis (`s:{schoolId}:perm:{membershipId}`) and invalidated on any role or permission change.
- Every role/permission change is audit-logged with before/after values.

## 3. Roles

| Role | Who | Notes |
|---|---|---|
| **Super Admin** (platform) | Your company | Separate `platform_admins` table; no school data without a support grant |
| **Support** (platform) | Your support staff | Read-only platform views; school access only via time-boxed grant approved by the school |
| **School Admin** | Office/IT admin of the school | Full control of the school, including roles. Cannot remove the last School Admin (lockout guard) |
| **Principal** | School leadership | Sees everything, approves (concessions, results, voids), communicates. Light on data entry |
| **Accountant** | Fee office | Fee setup, invoices, counter collection, refunds, finance reports. No academic edits |
| **Teacher** | Teaching staff | Works within `ASSIGNED` sections/subjects |
| **Parent** | Guardians | Works within `OWN_CHILDREN` |
| Student | *V2* | Model reserved; not in V1 |

Schools can create **custom roles** (e.g. Receptionist, Vice Principal, Transport In-charge) by cloning a system role.

## 4. Permission matrix (default templates)

Legend: **A** = ALL · **S** = ASSIGNED · **C** = OWN_CHILDREN · **M** = SELF · ● = granted (no record scope) · – = not granted

### School setup & people

| Permission | Admin | Principal | Accountant | Teacher | Parent |
|---|:-:|:-:|:-:|:-:|:-:|
| `dashboard.view` | ● | ● | ● | ● | ● |
| `school.settings.view` | ● | ● | ● | – | – |
| `school.settings.manage` | ● | – | – | – | – |
| `school.branding.manage` | ● | – | – | – | – |
| `academic.view` (years, classes, sections, subjects) | ● | ● | ● | ● | – |
| `academic.manage` | ● | – | – | – | – |
| `user.view` | ● | ● | – | – | – |
| `user.manage` (invite, deactivate, assign roles) | ● | – | – | – | – |
| `role.manage` | ● | – | – | – | – |
| `student.view` | A | A | A | S | C |
| `student.create` | ● | – | – | – | – |
| `student.edit` | A | – | – | – | – |
| `student.promote` (year-end) | ● | – | – | – | – |
| `student.contact.view` (phone, address, guardians' contact) | A | A | A | S | C |
| `guardian.view` | A | A | A | S | M |
| `guardian.manage` | ● | – | – | – | – |
| `teacher.view` | A | A | A | A | C¹ |
| `teacher.manage` | ● | – | – | – | – |

¹ Parents see name, photo and subject for their child's teachers only. No personal phone numbers.

### Daily operations

| Permission | Admin | Principal | Accountant | Teacher | Parent |
|---|:-:|:-:|:-:|:-:|:-:|
| `attendance.view` | A | A | – | S | C |
| `attendance.mark` | A | – | – | S² | – |
| `attendance.edit_past` (outside the edit window) | A | A | – | – | – |
| `staff_attendance.view` | A | A | – | M | – |
| `staff_attendance.manage` | ● | ● | – | – | – |
| `homework.view` | A | A | – | S | C |
| `homework.manage` | A | – | – | S | – |
| `timetable.view` | A | A | – | A | C |
| `timetable.manage` | ● | – | – | – | – |
| `notice.view` (audience-filtered) | ● | ● | ● | ● | ● |
| `notice.create` | ● | ● | – | S³ | – |
| `notice.publish_school` (whole-school audiences) | ● | ● | – | – | – |
| `notification.settings.manage` | ● | – | – | – | – |

² Default: the class teacher marks daily attendance. A school setting can allow any assigned subject teacher.
³ Teachers can post notices only to their own sections.

### Exams

| Permission | Admin | Principal | Accountant | Teacher | Parent |
|---|:-:|:-:|:-:|:-:|:-:|
| `exam.view` (schedule) | A | A | – | S | C |
| `exam.manage` (create exams, subjects, max/pass marks, grading) | ● | – | – | – | – |
| `marks.enter` | A | – | – | S | – |
| `marks.edit_locked` (after lock) | A | A | – | – | – |
| `results.view` (Parent: published only) | A | A | – | S | C |
| `results.publish` | ● | ● | – | – | – |
| `report_card.generate` | ● | ● | – | – | – |

### Finance

| Permission | Admin | Principal | Accountant | Teacher | Parent |
|---|:-:|:-:|:-:|:-:|:-:|
| `fee.view` (structures, heads) | ● | ● | ● | – | C |
| `fee.manage` (heads, structures, installments, late-fee rules) | ● | – | ● | – | – |
| `fee.assign` (assign structures to students) | ● | – | ● | – | – |
| `concession.request` | ● | – | ● | – | – |
| `concession.approve` | ● | ● | – | – | – |
| `invoice.view` | A | A | A | – | C |
| `invoice.generate` (bulk generate, issue) | ● | – | ● | – | – |
| `invoice.adjust` (append adjustment line with reason) | ● | – | ● | – | – |
| `invoice.cancel` | ● | ● | – | – | – |
| `payment.view` | A | A | A | – | C |
| `payment.collect` (counter: cash/UPI/bank transfer/card) | ● | – | ● | – | – |
| `payment.pay_online` | – | – | – | – | C |
| `payment.void` (cancel a counter receipt) | ● | ● | – | – | – |
| `payment.refund` | ● | – | ●⁴ | – | – |
| `gateway.manage` (connect Razorpay keys) | ● | – | – | – | – |

⁴ Schools can set a refund amount above which Principal approval is required (setting, V1.1).

### Platform services

| Permission | Admin | Principal | Accountant | Teacher | Parent |
|---|:-:|:-:|:-:|:-:|:-:|
| `document.view` (Parent: only `visible_to_guardian`) | A | A | – | S⁵ | C |
| `document.manage` | A | – | – | – | – |
| `report.academic` | ● | ● | – | S | – |
| `report.finance` | ● | ● | ● | – | – |
| `report.export` | ● | ● | ● | – | – |
| `import.run` | ● | – | – | – | – |
| `audit.view` | ● | ● | – | – | – |
| `billing.view` (school's own subscription) | ● | – | – | – | – |
| `ai.use` (Phase 8, behind a feature flag) | ● | ● | ● | ● | ● |

⁵ Teachers see only academic document categories (e.g. certificates), not ID or medical documents.

### Platform (super admin app)

| Permission | Super Admin | Support |
|---|:-:|:-:|
| `platform.dashboard.view` | ● | ● |
| `platform.schools.manage` (create, suspend, change slug) | ● | – |
| `platform.subscriptions.manage` | ● | – |
| `platform.flags.manage` | ● | – |
| `platform.support_access.request` | ● | ● |
| `platform.system.view` (queues, errors, health) | ● | ● |
| `platform.audit.view` | ● | – |

## 5. Guardrails

- A school must always have **at least one active School Admin**.
- `role.manage` cannot be removed from the School Admin system role.
- Parent and Teacher system roles cannot gain `ALL`-scope student permissions without a confirmation step ("This lets every teacher see every student").
- Permission keys are validated against the catalog; unknown keys are rejected.

## Open questions

1. Should the **Principal** be able to create and edit students (some small schools have no separate admin)? Recommendation: no by default; a school can add it to the role.
2. Should **Accountant** see student academic data (attendance/results)? Currently no.
3. Daily attendance: **class teacher only** (default) or any assigned teacher?
