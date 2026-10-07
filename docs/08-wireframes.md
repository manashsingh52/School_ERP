# 08 — Wireframes (low-fidelity)

These are **layout and priority** sketches, not visual design. Visual polish comes from the design system (07).
Each screen lists its **primary action** and its **states**.

---

## W1. Admin dashboard

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ Good morning, Anita.                                   Wed, 7 Oct · 2026–27  │
│ Here's what needs you today.                                                  │
│                                                                               │
│  Students      Teachers      Attendance today    Pending fees   Collected today│
│  1,248         74            94.2%  ▲0.8         ₹8.4L          ₹1.2L          │
│                              (31 of 32 sections)  412 students   46 payments    │
│                                                                               │
│ ┌ Attention required ───────────────────────┐ ┌ Quick actions ──────────────┐ │
│ │ ● 24 students absent today         View → │ │ + Add student               │ │
│ │ ● 1 section hasn't taken attendance  → 6-B│ │ ✓ Take attendance           │ │
│ │ ● ₹2.3L overdue (63 students)      View → │ │ ✎ Create homework           │ │
│ │ ● 3 concessions waiting approval   Review │ │ 📣 Create notice             │ │
│ │ ● Half-yearly exams start in 5 days       │ │ ₹ Collect fee               │ │
│ │ ● 2 failed SMS deliveries          Retry  │ │ ⤓ Generate report           │ │
│ └───────────────────────────────────────────┘ └─────────────────────────────┘ │
│                                                                               │
│ ┌ Recent activity ─────────────────────────────────────────────────────────┐ │
│ │ 10:42  Payment ₹16,300 received · Rahul Kumar (8-A) · Online             │ │
│ │ 10:15  Attendance submitted · 8-A · Ms. Sharma · 27/28 present           │ │
│ │ 09:58  Notice published · "PTM on Saturday" · All parents                │ │
│ │                                                          View all →     │ │
│ └──────────────────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────────────────┘
```
- KPI cards are clickable, each opening a filtered list.
- Attention items are computed server-side and ranked; each one is a single click to resolve.
- At most one chart in V1: a 30-day attendance trend sparkline inside the KPI.
- Variants: Principal (same plus academic snapshot), Accountant (collection, overdue, today's counter), Teacher ("My day": classes, attendance pending, marks pending).
- States: skeleton KPIs; a new school sees an onboarding checklist instead of KPIs.

## W2. Students list

```
Students                                              [Import]  [+ Add student]
1,248 active students in 2026–27
┌──────────────────────────────────────────────────────────────────────────────┐
│ 🔍 Search name, admission no., phone   Class ▾  Section ▾  Status ▾  ⋯ Views ▾│
├───┬──────────────────────────┬───────┬──────┬──────────────┬─────────┬───────┤
│ ☐ │ Student                  │ Class │ Roll │ Guardian     │ Fees    │       │
├───┼──────────────────────────┼───────┼──────┼──────────────┼─────────┼───────┤
│ ☐ │ (RK) Rahul Kumar · 1042  │ 8-A   │ 21   │ Raj Kumar    │ ₹16,300 │  ⋯    │
│ ☐ │ (AS) Ananya Singh · 1043 │ 8-A   │ 22   │ Meera Singh  │ Paid    │  ⋯    │
│   │ …                        │       │      │              │         │       │
├───┴──────────────────────────┴───────┴──────┴──────────────┴─────────┴───────┤
│ 1–25 of 1,248                                              ‹ 1 2 3 … 50 ›    │
└──────────────────────────────────────────────────────────────────────────────┘
 Selected 3 → [Message guardians] [Assign fee] [Export] [Move section]
```
- A row click opens the profile; `Space` opens a quick-view drawer.
- Empty state: "No students yet" with Add + Import.

## W3. Student profile

```
← Students
(Photo)  Rahul Kumar                          [Collect fee] [Edit]  ⋯
         8-A · Roll 21 · Adm 1042 · Active
         Guardian: Raj Kumar (Father) +91 98765 43210

 Overview | Attendance | Homework | Exams | Fees | Documents | Activity
┌──────────────────────────────┐ ┌───────────────────────────────────────┐
│ Attendance (this year) 92.4% │ │ Fees: ₹16,300 due on 10 Oct           │
│ ▁▂▃▅▆▇▇▆▇ last 30 days       │ │ Q1 paid · Q2 due · Q3 · Q4  [Collect] │
└──────────────────────────────┘ └───────────────────────────────────────┘
┌ Personal ────────────────────┐ ┌ Last exam: Unit Test 2 ───────────────┐
│ DOB 14 Mar 2013 · Male · B+  │ │ 82.5% · A1 · Rank 4 in section        │
│ Address …                    │ └───────────────────────────────────────┘
│ Emergency: …                 │ ┌ Academic history ─────────────────────┐
└──────────────────────────────┘ │ 2026–27  8-A  · 2025–26  7-B  · …     │
                                 └───────────────────────────────────────┘
```

## W4. Attendance register (web)

```
Attendance · 8-A                         ‹ Wed, 7 Oct ›            Draft · not submitted
28 students · Class teacher: Ms. Sharma

[✓ Mark all present]    Present 26 · Absent 1 · Late 1 · Half 0 · Leave 0

 Roll  Student                    Status                         Remark
 1     Aarav Mehta                (P) A  L  ½  Lv
 2     Aditi Rao                  (P) A  L  ½  Lv
 3     Arjun Nair                  P (A) L  ½  Lv                 ________
 4     …                           P  A (L) ½  Lv                 Bus late
 …
                                         Parents of 1 absent student will be notified.
                                                              [Save draft] [Submit]
```
- Keyboard: ↑/↓ moves between students; `p a l h v` sets status.
- After submit the page is locked. Editing within the edit window needs `attendance.mark`, after it `attendance.edit_past`, and changes are audited.
- States: holiday ("School holiday: Dussehra. Attendance not required"), already submitted (read-only with an edit button).

## W5. Attendance (teacher mobile)

```
┌────────────────────────┐
│ ← 8-A        Wed 7 Oct │
│ 28 students            │
│ ┌────────────────────┐ │
│ │ ✓ Mark all present │ │
│ └────────────────────┘ │
│ Tap a student to change│
│                        │
│ (AM) Aarav Mehta    P  │
│ (AR) Aditi Rao      P  │
│ (AN) Arjun Nair     A ●│
│ (BK) Bhavya K.      L  │
│ …                      │
│ ────────────────────── │
│ 26 P · 1 A · 1 L       │
│ [      Submit       ]  │
│ ⟳ Offline: will sync   │
└────────────────────────┘
```
- One tap cycles P → A → L → ½ → Lv; a long-press opens a remark.
- Offline: saved locally and auto-submitted with `clientMutationId` when the connection returns.

## W6. Fee counter (accountant)

```
Collect fee
┌──────────────────────────────────────────────────────────────────┐
│ 🔍 Rahul                                                         │
│   Rahul Kumar · 8-A · 1042 · Father Raj Kumar      ₹16,300 due   │
└──────────────────────────────────────────────────────────────────┘
 Dues for Rahul Kumar (8-A)
 ☑ INV/2026-27/000123  Q2 (Jul–Sep)   due 10 Jul   ₹16,300   overdue 89 days
     Tuition 12,000 · Transport 4,500 · Sibling −1,200 · Late fee +1,000
 ☐ INV/2026-27/000201  Q3 (Oct–Dec)   due 10 Oct   ₹15,300

 Amount            ₹ 16,300       (sum of selected invoices, full payment only)
 Method            (Cash)  UPI  Bank transfer  Card
 Reference         [__________]   (UTR, required for UPI/transfer)
 Note              [__________]
                                                  [Collect ₹16,300]
→ success: "Receipt RCPT/2026-27/000456 created"  [Print] [Send to parent] [Next student]
```
- Built for speed: search → `Enter` → amount prefilled → `Ctrl+Enter` collects.
- Requires an `Idempotency-Key`, so a double-click never charges twice.

## W7. Parent app: home

```
┌────────────────────────┐
│ St. Mary's School      │
│ [Rahul · 8-A ▾]     🔔 │
│                        │
│ Today                  │
│ ✓ Present · in at 7:52 │
│ Next: Maths 10:30      │
│                        │
│ ┌ Fees due ──────────┐ │
│ │ ₹16,300 · 10 Oct   │ │
│ │ [ Pay now ]        │ │
│ └────────────────────┘ │
│ Homework (2 due)       │
│ • Science · Tomorrow   │
│ • English · Fri        │
│ Upcoming exam          │
│ • Half-yearly · 12 Oct │
│ Notices                │
│ • PTM on Saturday  New │
│────────────────────────│
│ Home Acad Fees 🔔 Me   │
└────────────────────────┘
```
Answers the five parent questions in order: what happened today, what my child needs to do, is a fee due, are there notices, when are exams.

## W8. Parent app: pay fee

```
Invoice Q2 · ₹16,300           →  Razorpay checkout (UPI / card / netbanking)
Breakdown …                    →  "Payment processing…" (we wait for server confirmation)
[Pay ₹16,300]                  →  ✓ Paid · Receipt RCPT/…/000456 [Download]
                                   or  ✕ Payment failed — no money was taken. [Try again]
                                   or  ⏳ Payment pending with bank — we'll notify you.
```

## W9. Onboarding wizard

```
Set up St. Mary's School                                         Step 3 of 10
●──●──◉──○──○──○──○──○──○──○
School · Year · Classes · Sections · Subjects · Teachers · Students · Fees · Notifications · Go live

Classes
Which classes does your school have?
[Nursery] [LKG] [UKG] [1] [2] … [12]     (toggle chips, presets: "1–10", "Nursery–12")
                                         + Add custom class
                                                   [Back]  [Skip for now]  [Continue]
```
- Progress is saved per step. The wizard can be resumed from the dashboard checklist.
- The Teachers and Students steps offer "Import from Excel" first and manual entry second.
- Go live: a checklist with ticks (year active, classes, at least 1 admin, gateway connected or counter-only, SMS sender ready) → "Invite parents" (bulk SMS invite).

## W10. Import wizard (Excel/CSV)

```
Import students                                   Upload › Map › Review › Import
Map columns
 Your column          →  SchoolOS field          Sample
 "Student Name"       →  [First + last name ▾]   Rahul Kumar
 "Adm No"             →  [Admission number ▾]    1042
 "Class-Sec"          →  [Class & section ▾]     8-A
 "Father Mobile"      →  [Guardian phone ▾]      9876543210
 "Remarks"            →  [Ignore ▾]
                                                            [Back] [Validate]
Review
 1,212 valid · 23 invalid · 13 duplicates · 0 missing required
 [Valid] [Invalid (23)] [Duplicates (13)]
 Row 14  Admission number missing
 Row 57  Class "8-D" doesn't exist in 2026–27   [Create section 8-D]
 Row 88  Phone "98765" is not a valid mobile number
 [Download error rows as Excel]          [Import 1,212 valid rows]  (invalid rows are skipped, never imported)
→ Import report: 1,212 created · 0 failed · View students →
```

## W11. Command palette

```
┌──────────────────────────────────────────────┐
│ 🔍 rahul ku                                  │
├──────────────────────────────────────────────┤
│ Students                                     │
│ ▸ (RK) Rahul Kumar · 8-A · 1042         ↵    │
│   (RK) Rahul Kumari · 5-B · 1311             │
│ Actions for Rahul Kumar                  →   │
│   View profile · Attendance · Fees ·         │
│   Collect fee · Results · Documents          │
│ Navigate                                     │
│   Reports › Student strength                 │
├──────────────────────────────────────────────┤
│ ↑↓ navigate  ↵ open  → actions  esc close    │
└──────────────────────────────────────────────┘
```

## W12. Super admin dashboard

```
Platform                                                       All systems normal ●
Schools 14 (12 active)  Students 9,840  Teachers 612  Active users (7d) 6,120
SaaS MRR ₹1.8L          Gateway volume (30d) ₹2.4Cr   SMS used 41k / 60k

Schools                                        Health
 St. Mary's  Active  Pro   1,248 students      API p95 180ms · Errors 0.02%
 DPS North   Onboard Basic   0 students        Queue: 0 waiting · DLQ 2  [View]
 …                                             Webhook failures (24h): 0
```

## Open questions

1. Would you like these turned into **clickable, styled mockups** (a shareable web page) before Phase 1 starts? I'd recommend it for W1, W4, W6 and W7, since they decide the product's feel.
