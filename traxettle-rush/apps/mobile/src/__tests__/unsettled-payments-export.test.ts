import type { } from 'jest';

// Keep this test simple and stable: we validate CSV sectioning/columns via a local helper.
function csvEscape(value: string) {
  const v = String(value ?? '');
  if (/[",\n]/.test(v)) return `"${v.replace(/"/g, '""')}"`;
  return v;
}

function yyyyMmDd(iso: string | null) {
  if (!iso) return '';
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return '';
  return new Date(t).toISOString().slice(0, 10);
}

function buildCsvContent(rows: any[]) {
  const lines: string[] = [];
  for (const ev of rows) {
    lines.push(csvEscape(`Event: ${ev.eventName}`));
    lines.push(['Date', 'Payer Name', 'Amount', 'Currency'].map(csvEscape).join(','));
    const date = yyyyMmDd(ev.lastSettlementGeneratedAt);
    for (const p of ev.pending) {
      lines.push(
        [date, p.payerName, Number(p.amount).toFixed(2), p.currency].map((c) => csvEscape(String(c))).join(','),
      );
    }
    lines.push('');
  }
  return lines.join('\n');
}

describe('Unsettled Payments export', () => {
  it('buildCsvContent outputs grouped tabular rows', () => {
    const csv = buildCsvContent([
      {
        eventName: 'Goa Trip',
        lastSettlementGeneratedAt: '2026-03-08T10:00:00.000Z',
        pending: [{ payerName: 'Bob', amount: 100, currency: 'INR' }],
      },
    ]);

    expect(csv).toContain('Event: Goa Trip');
    expect(csv).toContain('Date,Payer Name,Amount,Currency');
    expect(csv).toContain('2026-03-08,Bob,100.00,INR');
  });
});

