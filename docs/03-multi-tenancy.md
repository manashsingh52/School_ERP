# 03 — Multi-Tenancy Strategy

**Goal:** a user of School A can never read or change School B's data, even by editing an ID in a request,
and even if a developer forgets a filter.

**Strategy:** shared database, shared schema, `school_id` on every tenant row, and **three independent layers**:

```
Layer 1  Request   → tenant comes from the signed token, cross-checked with the subdomain
Layer 2  App       → tenant-scoped Prisma client adds school_id to every query automatically
Layer 3  Database  → PostgreSQL Row-Level Security rejects any row from another school
```

If any one layer has a bug, the other two still block the leak.

## 1. Where the tenant comes from

| Client | How school is known | Notes |
|---|---|---|
| Web on `stmarys.schoolos.in` | `Host` → slug `stmarys` → BFF sends `X-School-Slug: stmarys` with the user's token | Cookies are **host-only** (no `Domain=` attribute), so a session on `stmarys.` is never sent to `dps.` |
| Flutter app | User picks a school after login → token is issued **for that membership** | Switching school = new token |
| Super admin on `admin.schoolos.in` | Platform token (`typ: platform`), no school | Entering a school requires a `SupportAccessGrant` (09 §5) |
| Razorpay webhook | URL contains the gateway account's opaque `publicId` → school | Signature verified with **that school's** webhook secret |
| Background job | `schoolId` in job payload, written by trusted server code | Never from user input |

### Access token (JWT, 15 min, EdDSA signed)

```json
{
  "sub": "usr_…",        // user id
  "sid": "ses_…",        // session id (revocable)
  "typ": "school",       // "school" | "platform"
  "sch": "sch_…",        // school id the token is valid for
  "mid": "mem_…",        // membership id
  "rv":  7               // roles version, for permission cache busting
}
```

The guard:
1. Verifies signature + expiry, checks `sid` is not on the revoked list (Redis).
2. If `X-School-Slug` is present, resolves slug → school id and **requires it to equal `sch`**. Mismatch → `403 TENANT_MISMATCH` and a security log entry.
3. Loads the membership (`mid`), requires `status = ACTIVE` and school `status ∈ {ONBOARDING, ACTIVE}`.
4. Stores `TenantContext { schoolId, userId, membershipId, permissions }` in AsyncLocalStorage for the request.

> The school is **never** taken from the URL path, query string or body. There is no `/schools/:id/students` in the tenant API.

## 2. Layer 2: tenant-scoped Prisma client

All feature code receives `TenantPrisma` (via DI). It is a Prisma client extension that, for every model with
`schoolId`:

- **reads** (`findMany`, `findFirst`, `findUnique`, `count`, `aggregate`, `groupBy`): adds `where.schoolId = ctx.schoolId`
- **creates**: sets `data.schoolId = ctx.schoolId` (and rejects a different value)
- **updates/deletes**: adds `where.schoolId`
- wraps the operation in a transaction that first runs `set_config('app.school_id', ctx.schoolId, true)` so Layer 3 sees it

Sketch:

```ts
// apps/api/src/core/prisma/tenant-prisma.ts (sketch)
export function tenantExtension(getCtx: () => TenantContext) {
  return Prisma.defineExtension((client) =>
    client.$extends({
      query: {
        $allModels: {
          async $allOperations({ model, operation, args, query }) {
            if (!TENANT_MODELS.has(model)) return query(args);       // generated list
            const { schoolId } = getCtx();                          // throws if missing
            args = scopeArgs(operation, args, schoolId);            // inject where / data
            const [, result] = await client.$transaction([
              client.$executeRaw`SELECT set_config('app.school_id', ${schoolId}, true)`,
              query(args),
            ]);
            return result;
          },
        },
      },
    }),
  );
}
```

- For multi-step work, services use `tenantTx(async (tx) => …)`, which sets the config **once** at the start of an interactive transaction.
- `set_config(…, true)` is **transaction-local**. That makes it safe with connection pooling: no tenant value leaks to the next request on the same connection.
- `TENANT_MODELS` is generated from the Prisma DMMF at build time (every model with a `schoolId` field).
- **Foreign IDs in request bodies** (e.g. `sectionId` when creating a student) are always loaded through `TenantPrisma` first. Another school's ID comes back as "not found" → `422 INVALID_REFERENCE`. Postgres FK checks bypass RLS, so this app rule is required. A test covers it (§7).

## 3. Layer 3: PostgreSQL Row-Level Security

### Database roles

| Role | Used by | RLS |
|---|---|---|
| `schoolos_owner` | migrations only (Cloud Run Job) | owns tables; `FORCE ROW LEVEL SECURITY` still applies to it |
| `schoolos_app` | api + worker at runtime | **subject to RLS**, `NOBYPASSRLS`; no `UPDATE/DELETE` on `audit_logs` |
| `schoolos_platform` | `PlatformPrisma`: super admin metrics, login membership lookup, webhook routing, outbox relay, cross-school schedulers | `BYPASSRLS`; usage restricted by lint rule to `core/` and `platform/` modules and every call is logged |

### Policy (generated for every tenant table)

```sql
ALTER TABLE students ENABLE ROW LEVEL SECURITY;
ALTER TABLE students FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON students
  USING      (school_id = NULLIF(current_setting('app.school_id', true), '')::uuid)
  WITH CHECK (school_id = NULLIF(current_setting('app.school_id', true), '')::uuid);
```

- `NULLIF(…, '')` matters: once a session has used the setting, `current_setting` returns `''` instead of NULL. A bare `::uuid` cast would then throw.
- **Fails closed:** with no tenant set, the predicate is `school_id = NULL`, so zero rows are returned and inserts are rejected.
- Special cases:
  - `memberships`: `USING (school_id = app.school_id OR user_id = app.user_id)`, so a user can list *their own* schools at login without the bypass role.
  - `notification_templates`: also readable where `school_id IS NULL` (platform defaults).
  - Global tables (`users`, `sessions`, `otp_challenges`, `device_tokens`, `plans`, `feature_flags`, `platform_admins`) have no `school_id` and are only reachable through the auth/platform modules.
  - `schools` holds the tenant registry. `schoolos_app` gets `SELECT` only, and writes go through platform code.

## 4. Other places tenancy must hold

| Surface | Rule |
|---|---|
| Redis cache keys | Always prefixed `s:{schoolId}:` via a `TenantCache` helper; no raw `redis.get` in feature code |
| BullMQ jobs | Payload must contain `schoolId`; the processor wrapper opens `TenantContext` before running the handler |
| File storage | Object keys are `schools/{schoolId}/…`. Signed URLs are issued only after loading the `File` row through `TenantPrisma` |
| Search | Runs SQL through `TenantPrisma`, so it is RLS-protected like everything else |
| Reports/exports | Run in the worker under the requesting school's context; output file is tenant-owned |
| Logs/Sentry | Tagged with `schoolId` for debugging; never contain another tenant's data |
| AI (Phase 8) | Tools call the same services with the same `TenantContext`; the model never gets SQL access |
| Cross-school jobs (e.g. "send fee reminders for all schools") | `PlatformPrisma` lists active schools, then enqueues **one job per school**; each runs tenant-scoped |

## 5. Subdomains and slugs

- Slug rules: `^[a-z0-9](?:[a-z0-9-]{1,30}[a-z0-9])$`, unique, chosen at onboarding.
- Reserved: `www, app, api, admin, status, docs, help, support, mail, static, cdn, assets, demo, staging, dev, test`.
- `demo.schoolos.in` = the sales demo school (seeded data, resets nightly).
- Changing a slug is a super-admin action. The old slug redirects for 90 days.
- Custom domains (`erp.stmarys.edu.in`) are V2: an extra `school_domains` table plus a certificate per domain.

## 6. Guardrails in CI

1. **Policy coverage check:** a SQL query fails the build if any table with a `school_id` column has `relrowsecurity = false` or no policy.
2. **Lint rules:**
   - Importing `PlatformPrisma` outside `core/` or `platform/` is an error.
   - Raw SQL (`$queryRaw`) in feature modules must go through `tenantTx`.
3. **Route coverage:** every controller route must declare `@RequirePermission(...)` or `@Public()`; a startup check fails if one is missing.

## 7. Tenant-isolation test suite (mandatory, runs on every PR)

Seed: **School A** and **School B**, each with an admin, a teacher, a parent, students, invoices and files.

| Test | Expectation |
|---|---|
| A-admin `GET` every `/v1/<resource>/:id` using **B's IDs** (route list auto-discovered) | `404` for all of them |
| A-admin list endpoints | Response contains zero B IDs |
| A-admin `PATCH/DELETE` with B's IDs | `404`, and B's row unchanged |
| A-admin creates a student with B's `sectionId` | `422 INVALID_REFERENCE` |
| A token sent with `X-School-Slug: b-slug` | `403 TENANT_MISMATCH` |
| A-parent requests a sibling student in A that isn't their child | `404` |
| A-teacher marks attendance for a section they aren't assigned to | `403` |
| Signed file URL for a B file, requested by A | `404` (no URL issued) |
| DB level: as `schoolos_app` with `app.school_id = A`, `SELECT … WHERE school_id = B` | 0 rows |
| DB level: `INSERT` with `school_id = B` while context is A | rejected by `WITH CHECK` |
| DB level: no context set | 0 rows from every tenant table |
| Webhook for School A's gateway signed with B's secret | `401`, not processed |
| Job with `schoolId = A` touching B's record | not found |

`404` rather than `403` for cross-tenant IDs is deliberate: it doesn't reveal that the record exists.

## Open questions

1. Is the reserved slug list OK? Add any brand words to block (e.g. your company name).
2. When a school is **suspended** (unpaid), should parents still be able to pay fees and view notices (read-only mode), or should the whole school be blocked? Recommendation: read-only plus fee payment still allowed.
