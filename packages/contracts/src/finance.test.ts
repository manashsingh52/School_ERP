import { describe, expect, it } from 'vitest';
import { feeStructureSchema, formatRupees, rupeesInWords } from './finance.js';

describe('money formatting (Indian system)', () => {
  it('groups lakhs and crores', () => {
    expect(formatRupees(123_456_789)).toBe('₹12,34,567.89');
    expect(formatRupees(600_000)).toBe('₹6,000');
    expect(formatRupees(600_000, { decimals: true })).toBe('₹6,000.00');
    expect(formatRupees(5, { symbol: false })).toBe('0.05');
    expect(formatRupees(-150_000)).toBe('−₹1,500');
    expect(formatRupees(10_00_00_000_00)).toBe('₹10,00,00,000');
  });

  it('writes amounts in words', () => {
    expect(rupeesInWords(125_050)).toBe('Rupees One Thousand Two Hundred Fifty and Fifty Paise Only');
    expect(rupeesInWords(1_15_00_000_00)).toBe('Rupees One Crore Fifteen Lakh Only');
    expect(rupeesInWords(600_000)).toBe('Rupees Six Thousand Only');
    expect(rupeesInWords(0)).toBe('Rupees Zero Only');
  });
});

describe('fee structure validation', () => {
  const head = '01a11737-1e4c-77a8-97e3-7a8d68c12078';
  const base = { name: 'X', classIds: [head], items: [{ feeHeadId: head, amountPaise: 1000 }] };

  it('installments must add up to each fee', () => {
    expect(feeStructureSchema.safeParse({ ...base, installments: [{ name: 'Q1', dueDate: '2026-05-01', splits: { [head]: 1000 } }] }).success).toBe(true);
    const bad = feeStructureSchema.safeParse({ ...base, installments: [{ name: 'Q1', dueDate: '2026-05-01', splits: { [head]: 999 } }] });
    expect(bad.success).toBe(false);
  });

  it('installments are in date order', () => {
    const r = feeStructureSchema.safeParse({
      ...base,
      installments: [
        { name: 'Q2', dueDate: '2026-07-01', splits: { [head]: 500 } },
        { name: 'Q1', dueDate: '2026-04-01', splits: { [head]: 500 } },
      ],
    });
    expect(r.success).toBe(false);
  });
});
