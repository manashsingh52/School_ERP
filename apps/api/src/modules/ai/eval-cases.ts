/**
 * Evaluation set (docs/12 Phase 8): real questions staff ask, and the lookup a correct answer
 * needs. Run offline in CI against the rules provider (test/ai.e2e.test.ts) and against the real
 * model before switching the assistant on for schools: `pnpm ai:eval` (needs GEMINI_API_KEY).
 * "args" lists only what must be there; anything else the model adds is allowed.
 */
export interface EvalCase {
  question: string;
  tool: string;
  args?: Record<string, unknown>;
}

export const EVAL_CASES: EvalCase[] = [
  { question: 'Which classes are below 75% attendance this month?', tool: 'attendance_by_class' },
  { question: 'Show attendance for class 8 in October', tool: 'attendance_by_class', args: { className: '8', month: '2026-10' } },
  { question: 'How was attendance last month?', tool: 'attendance_by_class' },
  { question: 'Which students have attendance below 60%?', tool: 'low_attendance_students', args: { belowPercent: 60 } },
  { question: 'List students in class 9 with low attendance', tool: 'low_attendance_students', args: { className: '9' } },
  { question: 'Which children were below 80% attendance in August?', tool: 'low_attendance_students', args: { belowPercent: 80, from: '2026-08-01', to: '2026-08-31' } },
  { question: 'How did each section do in the half yearly exam?', tool: 'exam_results_summary' },
  { question: 'Who topped Unit Test 1?', tool: 'exam_results_summary' },
  { question: 'Which subjects are weakest in the latest exam?', tool: 'subject_performance' },
  { question: 'How many students do we have? Boys and girls?', tool: 'class_strength' },
  { question: 'How much fee was collected today?', tool: 'fee_collection' },
  { question: 'Total fee collection in September', tool: 'fee_collection', args: { from: '2026-09-01', to: '2026-09-30' } },
  { question: 'How much fee is still outstanding by class?', tool: 'fee_outstanding' },
  { question: 'Who has not paid fees yet? Show defaulters', tool: 'fee_defaulters' },
  { question: 'Which students in class 8 have overdue fees?', tool: 'fee_defaulters', args: { className: '8' } },
];
