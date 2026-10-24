# AI assistant

Answers questions about the school from permission-checked report tools, and drafts worksheets. Personal data is masked before it reaches the provider (Gemini, or the offline mock); usage is metered per plan.

## Routes

| Route | What | Who |
|---|---|---|
| `POST /v1/ai/ask` | Ask about the school (answers from permission-checked reports) | `ai.use` |
| `GET /v1/ai/status` | Is the AI assistant on for me, and how much is left this month | `ai.use` |
| `POST /v1/ai/worksheet` | Draft a worksheet (teachers) | `ai.use` |

Access is declared on every route and checked at start-up; `:id` routes return 404 for another school's records (`test/isolation.e2e.test.ts`).

Tests: `apps/api/test/` (search for the routes above).
