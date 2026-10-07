# 09 — Security & Privacy Model

We hold children's personal data and schools' money records. Security and privacy are product features, not a later phase.

## 1. Authentication

### Identifiers
- **Phone (E.164)** is the main identifier for parents and teachers; **email** is optional and common for admin staff.
- One `User` per real person (see 02 D1).

### Methods
| Method | Who | Notes |
|---|---|---|
| Phone + OTP | Parents (default), anyone | 6-digit code, 5 min expiry, stored as HMAC-SHA256 with a server pepper, 5 attempts per challenge |
| Phone/email + password | Staff (default), parents optionally | **argon2id** (m=19 MiB, t=2, p=1 per OWASP baseline; tune on Cloud Run), min length 8, blocklist of common passwords |
| Invitation activation | Everyone created by a school | Invite SMS/email → OTP verify → optional password |
| Password reset | Everyone | OTP to verified phone/email → new password → **all other sessions revoked** |

### Tokens & sessions
| Item | Value |
|---|---|
| Access token | JWT, EdDSA (Ed25519), **15 min**, claims in 03 §1 |
| Refresh token | Opaque 256-bit random, stored **hashed**; **rotated on every use** |
| Reuse detection | A rotated refresh token presented again → the whole session family is revoked (stolen-token signal) |
| Staff web session | Idle timeout 12 h, absolute 14 days |
| Parent/teacher mobile session | Idle 60 days, absolute 180 days (re-OTP after) |
| Logout | Revokes the session; `sid` added to a Redis deny-list until its access tokens expire |
| Device management | Users see their devices and can log out any of them; admins can force-logout a member |
| Deactivation | Deactivating a membership/user revokes all its sessions immediately |
| Web storage | Tokens live **only** in httpOnly, Secure, SameSite=Lax, host-only cookies via the BFF. No tokens in localStorage |
| Mobile storage | Refresh token in Keychain/Keystore (`flutter_secure_storage`) |

### Abuse controls
- Rate limits (05 §5) and progressive lockout (`users.locked_until`).
- **SMS pumping defence:** login OTP is only sent to phone numbers that already belong to an invited/active user. Otherwise we show the same response but send nothing. There is also a per-school daily SMS cap and an alert on spikes.
- Generic error messages ("Invalid phone or password") to avoid account enumeration.
- MFA for **Super Admin**: required (TOTP) in V1. Optional MFA for School Admins in V1.1.

## 2. Authorization

- RBAC with scopes (04) plus tenant isolation in three layers (03).
- **All** authorization is server-side. The UI hides things for convenience only.
- Every route must declare a permission or `@Public()`; a startup check fails otherwise.

## 3. Application security controls

| Area | Control |
|---|---|
| Input validation | Zod on every body/query/param; unknown fields stripped; string length caps; enums enforced |
| Output | DTOs mapped explicitly (no returning raw Prisma rows), so new columns never leak by accident |
| XSS | React escaping; notices are Markdown rendered with a strict sanitiser; strict **CSP with nonces** in Next.js |
| CSRF | SameSite=Lax cookies, plus the BFF requires `Origin` to match the host and a custom header on state-changing requests |
| Headers | HSTS (preload), `X-Content-Type-Options`, `Referrer-Policy: strict-origin-when-cross-origin`, `frame-ancestors 'none'`, Permissions-Policy |
| SQL injection | Prisma parameterised queries; raw SQL only via tagged templates; lint bans `$queryRawUnsafe` |
| File uploads | Allow-list by type (PDF, JPG, PNG, WebP, HEIC, XLSX, CSV, DOCX); size caps (photos 5 MB, documents 15 MB, imports 10 MB); **magic-byte check** server-side; images re-encoded and EXIF/GPS stripped; served as `attachment` with an exact content type; virus scanning (ClamAV in worker) in V1.1 |
| Private files | Private bucket with public-access prevention. Access only via **signed URLs** (GET 5 min, PUT 10 min), issued after a permission check |
| Spreadsheet exports | Formula injection guard: cells starting with `= + - @` are prefixed with `'` |
| Payments | Server-side signature + API verification; webhook HMAC; idempotency (11) |
| Secrets | Google Secret Manager → env at deploy. Never in git. Separate secrets per environment |
| Gateway secrets | School Razorpay secrets encrypted with AES-256-GCM using a master key in Secret Manager (key version stored for rotation); write-only in the UI |
| Dependencies | pnpm lockfile, Renovate weekly, `pnpm audit` in CI, GitHub Actions pinned by SHA, Dependabot alerts |
| Transport | HTTPS only (Cloudflare + Google LB); TLS to Cloud SQL via the connector |
| Error leakage | Generic messages plus `supportRef` (05 §3); stack traces only in Sentry |
| Logging | No PII in logs (ids only). Sentry scrubbing rules for phone, email, names and tokens |

## 4. Threat model (top risks)

| # | Threat | Impact | Primary controls |
|---|---|---|---|
| T1 | Changing an ID to read another school's data (IDOR) | Critical | Token-bound tenant + auto-scoped Prisma + RLS + isolation test suite |
| T2 | Teacher reading students outside their classes | High | `ASSIGNED` scope policies + tests |
| T3 | Parent reading another child's data | High | `OWN_CHILDREN` scope + tests |
| T4 | Credential stuffing / OTP brute force | High | Rate limits, lockout, OTP attempt caps, argon2id |
| T5 | SMS pumping fraud (cost attack) | Medium | OTP only to known numbers, caps, alerts |
| T6 | Fake "payment successful" from client | Critical | Never trust client; verify signature and fetch payment from Razorpay; webhook is the source of truth |
| T7 | Spoofed/replayed webhooks | High | Per-school HMAC secret, raw-body verification, event-id dedupe |
| T8 | Insider misuse (school staff or our support) | High | Audit logs, least privilege, support access only via school-approved, time-boxed grants |
| T9 | Stored XSS via notices/names | High | Sanitisation, CSP |
| T10 | Malicious file upload | Medium | Type allow-list, magic bytes, re-encoding, attachment disposition, isolated bucket |
| T11 | Stolen phone with active parent session | Medium | Device list + remote logout, idle expiry, optional app lock (biometric) in Phase 7 |
| T12 | Leaked secrets | High | Secret Manager, no keys in repo, GitHub secret scanning, Workload Identity Federation (no JSON keys) |
| T13 | Data loss | Critical | PITR backups, tested restores (10 §6) |
| T14 | Supply-chain compromise | Medium | Lockfile, pinned actions, minimal dependencies, Renovate review |

## 5. Platform support access

- Super Admin/Support **cannot** open school data by default.
- Support requests access with a reason → a School Admin approves in-app → a time-boxed grant (default 2 h, `READ_ONLY` unless FULL is approved).
- Every action during a grant is audit-logged with the grant id. A banner shows in the school ("SchoolOS support has read-only access until 4:30 pm").
- Emergencies (e.g. a school locked out) use a **break-glass** process: two platform admins, a mandatory reason, and the school is notified.

## 6. Audit logging

Logged with actor, school, action, entity, before/after (changed fields only), IP, user agent, request id:
- Student/guardian/teacher create/update/archive, especially contact details
- Attendance edits after submission
- Marks changes after lock; results publish/republish
- Fee structure, concession, invoice adjustment/cancel; payment collect/void/refund; gateway key changes
- Role/permission changes; member invite/deactivate; login as support; settings changes; imports; exports of personal data

`audit_logs` is append-only (DB grants). Audit logs are retained for **7 years** (financial records norm). They are shown in Settings → Audit log and on each record's Activity tab.

## 7. Privacy (India)

> **Legal review is required before production launch.** The points below are engineering guidance, not legal advice.

### Roles under the DPDP Act, 2023
- **The school is the Data Fiduciary**; **SchoolOS is a Data Processor** acting on the school's instructions.
- We sign a **Data Processing Agreement** with every school (purpose limitation, security, breach notice, sub-processors list, deletion at contract end).
- The DPDP Rules, 2025 were notified in November 2025 with a phased rollout running into 2027. Confirm the dates and current obligations with counsel.

### Children's data
- Personal data of under-18s requires **verifiable parental consent** under the Act. The Rules include exemptions for educational institutions for certain purposes; **counsel must confirm the scope** for each feature.
- Product rules regardless of exemptions:
  - **No tracking, behavioural monitoring or targeted advertising** directed at children. No ad SDKs in the apps.
  - No third-party analytics on parent/student screens in V1. Product analytics are first-party, aggregate and contain no PII.
  - AI features (Phase 8) do not send child-identifying data to model providers beyond what a feature strictly needs, and nothing is used for model training (Gemini API terms + configuration checked).

### Product features that support compliance
| Need | Feature |
|---|---|
| Notice & consent | Parent sees a privacy notice and consent screen at activation; consent recorded (who, when, version) |
| Access / correction | Parent can view their child's data in-app; correction requests go to the school |
| Erasure | School-initiated anonymisation of a student after the retention period (keeps financial records with a pseudonymised name) |
| Breach handling | Incident runbook: contain → assess → notify school(s) promptly so they can meet Board and data-principal notification timelines; detailed report support |
| Data residency | All databases, files and backups in Indian regions (`asia-south1`, backups `asia-south2`). Upstash Redis in Mumbai holds IDs only |
| Grievance | Contact path in the app (school's grievance officer + ours as processor) |

### Retention defaults (configurable per school, confirm with counsel)
| Data | Retention |
|---|---|
| Financial (invoices, payments, receipts) | 8 years after the financial year |
| Academic records (results, report cards) | Permanent while the school is a customer (schools need transcripts) |
| Attendance | 5 years |
| Notifications & delivery logs | 1 year |
| Sessions, OTP challenges | 90 days after expiry |
| Audit logs | 7 years |
| Application logs | 180 days, kept in India (also meets CERT-In's log-retention direction) |
| Import files & export files | 30 days / 7 days |
| Off-boarded school | Full export handed to the school, then deletion within 90 days (backups age out per backup retention) |

### CERT-In (2022 directions)
- Report specified cyber incidents to CERT-In **within 6 hours** of noticing them. This is in the incident runbook.
- Keep ICT logs for **180 days** within India.
- Sync servers to standard NTP (Cloud Run/GCP default).

## Open questions

1. Who will be the named **security/grievance contact** for SchoolOS?
2. Is **TOTP MFA for Super Admin** in V1 OK (recommended), and MFA for School Admins in V1.1?
3. Do you have legal counsel for the DPA, privacy policy and DPDP review? This is needed before the first school goes live with real data.
