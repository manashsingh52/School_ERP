# 07 — Design System

**Feeling:** intelligent, calm, premium, trustworthy, fast.
**Not:** colourful, crowded, gimmicky, "government portal".

Principles:
1. **Neutral canvas, one accent.** Mostly greys; the school's accent marks only what is interactive or selected.
2. **Typography does the hierarchy**, not boxes and borders.
3. **One primary action per screen**, always top-right of the page header.
4. **Every state is designed:** loading, empty, error, success, permission-denied.
5. **Speed is a feature:** skeletons over spinners, optimistic updates where safe, keyboard first on web.

## 1. Tokens

Tokens are defined once in `packages/design-tokens/tokens.json` and generated into a Tailwind v4 theme (web) and
`ThemeData` (Flutter). Components use **semantic** tokens (`--bg-surface`), never raw hex.

### 1.1 Colour: neutrals (light theme)

| Token | Value | Use |
|---|---|---|
| `bg-app` | `#F7F7F8` | page background (off-white) |
| `bg-surface` | `#FFFFFF` | cards, tables, modals |
| `bg-subtle` | `#EFEFF1` | hover rows, secondary fills, code |
| `border` | `#E4E4E7` | default 1px borders, dividers |
| `border-strong` | `#D1D1D6` | inputs, focusable outlines |
| `text-primary` | `#18181B` | headings, body |
| `text-secondary` | `#52525B` | descriptions, secondary labels |
| `text-tertiary` | `#71717A` | placeholders, meta (≥ 4.5:1 on white) |
| `text-inverse` | `#FFFFFF` | on dark/accent fills |
| `charcoal` | `#27272A` | dark UI elements (tooltips, kbd) |

Dark theme tokens are defined from day one (`bg-app #0B0B0D`, `bg-surface #141417`, `border #26262B`, `text-primary #F4F4F5` …); **dark mode ships in Phase 6**.

### 1.2 Colour: school accent

The school picks one colour (e.g. Blue `#2F6FEB`, Green `#16A34A`, Purple `#7C3AED`). At runtime we generate a scale in
**OKLCH** so every school's accent has the same perceived lightness steps:

| Token | Derived | Use |
|---|---|---|
| `accent-50` | L≈97% | selected row tint, active nav background |
| `accent-100` | L≈93% | subtle badges |
| `accent-500` | school colour (lightness-clamped) | primary buttons, focus ring, active indicator |
| `accent-600` | darker | button hover |
| `accent-700` | darker | pressed, accent text on white (guaranteed ≥ 4.5:1) |
| `accent-fg` | white or near-black | text on `accent-500`, picked by contrast |

Guardrails: very light colours (yellow, lime) are darkened automatically, and the branding settings page shows a contrast preview.
**Allowed accent uses:** primary button, active nav marker, links, focus ring, selected states, one highlight per chart.
**Not allowed:** large backgrounds, headers, sidebars filled with accent.

### 1.3 Colour: semantic

| Meaning | Text/icon | Background | Border |
|---|---|---|---|
| Success | `#15803D` | `#F0FDF4` | `#BBF7D0` |
| Warning | `#B45309` | `#FFFBEB` | `#FDE68A` |
| Error | `#B91C1C` | `#FEF2F2` | `#FECACA` |
| Info | `#1D4ED8` | `#EFF6FF` | `#BFDBFE` |

Attendance status colours reuse the semantic set: Present = success, Absent = error, Late = warning, Half day = warning (outline), Leave = info.

### 1.4 Typography

- **Geist Sans** for UI, **Geist Mono** for IDs and codes (admission no., invoice no., receipt no.).
- Numbers in tables and amounts use `font-variant-numeric: tabular-nums`.
- Hindi/Indic later: fall back to Noto Sans Devanagari (Geist has no Devanagari).

| Style | Size / line height | Weight | Use |
|---|---|---|---|
| `display` | 28 / 36 | 600, -0.02em | dashboard greeting only |
| `h1` | 22 / 30 | 600, -0.01em | page title |
| `h2` | 17 / 26 | 600 | section title, card title |
| `h3` | 15 / 22 | 600 | sub-section, table group |
| `body` | 14 / 20 | 400 | **web default** |
| `body-strong` | 14 / 20 | 500 | emphasis, table primary column |
| `small` | 13 / 18 | 400 | secondary text, helper text |
| `caption` | 12 / 16 | 500 | labels, table headers, badges (sentence case, never ALL CAPS) |
| `kpi` | 26 / 32 | 600, tabular | dashboard numbers |

Flutter base body size is 15–16 for touch readability.

### 1.5 Space, radius, elevation, motion

| Scale | Values |
|---|---|
| Spacing (4px grid) | 2, 4, 8, 12, 16, 20, 24, 32, 40, 48, 64 |
| Radius | `sm 6` inputs/badges · `md 8` buttons · `lg 12` cards/modals · `xl 16` mobile sheets · `full` avatars/pills |
| Elevation | `e0` flat with 1px border (default cards) · `e1` 0 1px 2px rgb(0 0 0 / .05) (raised) · `e2` 0 4px 12px rgb(0 0 0 / .08) (popovers, menus) · `e3` 0 12px 32px rgb(0 0 0 / .12) (modals, palette) |
| Motion | `fast 120ms` hover/press · `base 180ms` popovers, tabs · `slow 240ms` modals, drawers · easing `cubic-bezier(.2,.8,.2,1)` · **all motion disabled under `prefers-reduced-motion`** |
| Layout | content max-width 1280px; page padding 24 (desktop) / 16 (mobile); sidebar 240 / 64 collapsed; top bar 56 |
| Density | table rows 44px (comfortable) / 36px (compact toggle); form field height 36px web, 48px mobile |

Rule: a card gets **either** a border **or** a shadow, never a heavy combination of both.

### 1.6 Iconography & imagery

- Lucide icons, 16px in dense UI and 20px in navigation, stroke 1.75.
- No cartoon illustrations. Empty states use a single muted line icon in a soft circle.
- Avatars show the photo, or initials on a neutral tint when there is none (accent is not used here).

## 2. Formatting standards

| Thing | Format |
|---|---|
| Money | `₹16,300` (Indian grouping), `₹8,40,000`; compact on KPIs: `₹8.4L`, `₹1.2Cr`; paise shown only if non-zero |
| Dates | `7 Oct 2026`; with weekday in attendance: `Wed, 7 Oct`; relative in feeds: `2h ago` → absolute on hover |
| Time | `9:30 am` |
| Class/section | `8-A`; long form `Class 8 · Section A` |
| Names | First Last; admission no. in mono after a dot: `Rahul Kumar · 1042` |
| Phone | `+91 98765 43210` |

## 3. Component library (`packages/ui`)

Built on **Radix UI primitives + Tailwind v4**, owned in-repo (shadcn-style: we own the source and the look).
Supporting libraries: `cmdk` (command palette), `sonner` (toasts), TanStack Table (data tables),
`react-day-picker` (dates), Recharts (charts), Lucide (icons).

| Component | Variants / notes | Required states |
|---|---|---|
| **Button** | primary (accent) · secondary (surface + border) · ghost · destructive · link; sizes sm 32 / md 36 / lg 44; icon-only | hover, focus-visible ring, pressed, disabled, **loading** (keeps width) |
| **Input / Textarea** | label above, helper below, prefix/suffix (₹, +91) | focus, error (message + icon), disabled, read-only |
| **Select / Combobox** | combobox is searchable; async options for students/teachers | empty, loading, no results |
| **MultiSelect** | chips, "Select all in class" | |
| **Checkbox / Radio / Switch** | | indeterminate (checkbox) |
| **DatePicker / DateRangePicker / Calendar** | presets ("This month", "Last 30 days", "This academic year"); school holidays shaded | |
| **FileUpload** | dropzone + list; type/size validated client-side and server-side; progress; camera on mobile | uploading, failed (retry), rejected type |
| **Avatar** | photo / initials; sizes 20–64; StudentChip = avatar + name + class | |
| **Badge / StatusPill** | neutral, accent, success, warning, error, info; dot variant | |
| **Tooltip** | 500ms delay; also on collapsed nav items | |
| **Toast** | success / error / info; undo action where reversible | |
| **Modal (Dialog)** | sm 400 / md 560 / lg 720; focus trap; Esc closes unless dirty | dirty-form close confirmation |
| **Drawer (Sheet)** | right side, 480/640; quick view & quick edit without leaving lists | |
| **ConfirmDialog** | destructive variant requires typing a word for irreversible actions (void receipt, cancel invoice) | |
| **Tabs** | underline style; synced to URL `?tab=` | |
| **DataTable** | sort, filter bar, column visibility, saved views, row selection + bulk action bar, sticky header, pagination, density toggle, CSV export hook | **skeleton rows**, empty (filtered vs none), error |
| **Pagination** | page-size selector; "1–25 of 1,248" | |
| **Card / StatCard** | StatCard = label, KPI, delta, optional sparkline; clickable → drills into a filtered list | loading skeleton |
| **PageHeader** | title, description, primary action, secondary menu, breadcrumbs | |
| **EmptyState** | icon, title, one-line explanation, primary action, optional "Import from Excel" | |
| **ErrorState** | friendly message, retry, `supportRef` with copy button | |
| **Skeleton** | matches final layout shape | |
| **Banner / Alert** | inline (page) and global (top: maintenance, read-only year, suspended) | |
| **Command palette** | see 06 §2 | |
| **Stepper** | onboarding and import wizards; resumable | |
| **Timeline** | activity feed, audit trail | |
| **Charts** | bar, line, donut only; neutral palette + accent highlight; always with a table fallback | empty, loading |
| **AttendanceToggle** | segmented P / A / L / ½ / Lv with keyboard keys `p a l h v` | |
| **AmountInput / AmountText** | rupees input → paise; Indian grouping | |
| **PhoneInput** | +91 default, E.164 output | |
| **Kbd** | keyboard hints | |

## 4. Patterns

### Page anatomy
```
PageHeader:  Title                                    [Secondary ▾] [Primary action]
             One-line description (optional)
Tabs / Filter bar
Content (table or form or grid)
```

### Forms
- One column, max width 640. Group related fields with h3 headings, not boxes.
- Validate on blur, then live; errors in plain language. Primary button bottom-right, plus a sticky footer on long forms.
- Same Zod schema as the API, so client and server agree on every rule.

### Empty states (every module)
| Module | Title | Line | Action |
|---|---|---|---|
| Students | No students yet | Add students one by one or import your Excel sheet. | Add student · Import |
| Homework | No homework yet | Homework assigned to this class will appear here. | Create homework |
| Attendance (today) | Attendance not taken | 8-A hasn't been marked for today. | Take attendance |
| Fees (structures) | No fee structure | Create a fee structure to start billing. | Create structure |
| Notices | Nothing posted yet | Notices you publish appear here and in the parent app. | Create notice |
| Search | No matches for "rahl" | Try a name, admission number or phone. | — |
| Filtered table | No results | No students match these filters. | Clear filters |

### Loading
- Skeletons shaped like the final content; never a full-screen spinner after first load.
- Buttons show inline spinners; tables keep old data visible while refetching (subtle top progress bar).

### Errors
- Field errors inline; page errors as `ErrorState` with retry and support reference.
- Toast only for background/async failures.

### Permission denied
- Hidden from navigation by default. A direct URL shows "You don't have access to this page. Ask your school admin." No stack, no blank page.

## 5. Accessibility (WCAG 2.2 AA target)

- Contrast ≥ 4.5:1 for text and ≥ 3:1 for UI boundaries, enforced on the generated accent scale.
- Full keyboard support with a visible focus ring (2px accent + 2px offset).
- Radix primitives provide ARIA roles. Tables use real `<table>` markup.
- Touch targets ≥ 44px on mobile; colour is never the only signal (status pills include text).
- Respect reduced motion; support browser zoom up to 200% without layout break.

## 6. Voice & tone

- Sentence case everywhere. Plain words: "Collect fee", not "Initiate fee collection transaction".
- Toasts are past tense and short: "Attendance submitted for 8-A".
- Errors say what happened and what to do next: "We couldn't save the student. Please try again."
- No AI hype words in the UI. Intelligence should be visible through helpful defaults and suggestions, not labels.

## Open questions

1. Any brand colour or logo direction for Bastaa itself (used on login, super admin, marketing)? Default: neutral charcoal with a blue accent.
2. OK to ship **light mode only** until Phase 6?
