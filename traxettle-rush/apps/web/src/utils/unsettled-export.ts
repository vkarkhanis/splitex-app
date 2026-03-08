export type UnsettledEventRow = {
  eventId: string;
  eventName: string;
  lastSettlementGeneratedAt: string | null;
  pending: Array<{
    settlementId: string;
    payerUserId: string;
    payerName: string;
    amount: number;
    currency: string;
  }>;
};

function csvEscape(value: string) {
  const v = String(value ?? '');
  if (/[",\n]/.test(v)) return `"${v.replace(/"/g, '""')}"`;
  return v;
}

export function buildUnsettledPaymentsCsv(rows: UnsettledEventRow[]) {
  const lines: string[] = [];
  for (const ev of rows) {
    lines.push(csvEscape(`Event: ${ev.eventName}`));
    lines.push(['Date', 'Payer Name', 'Amount', 'Currency'].map(csvEscape).join(','));
    const date = ev.lastSettlementGeneratedAt ? new Date(ev.lastSettlementGeneratedAt).toISOString().slice(0, 10) : '';
    for (const p of ev.pending) {
      lines.push(
        [
          date,
          p.payerName,
          Number.isFinite(p.amount) ? p.amount.toFixed(2) : '',
          p.currency,
        ].map((c) => csvEscape(String(c))).join(','),
      );
    }
    lines.push(''); // blank line between events
  }
  return lines.join('\n');
}

export function buildUnsettledPaymentsPrintHtml(rows: UnsettledEventRow[]) {
  const today = new Date().toISOString().slice(0, 10);
  const esc = (s: string) => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const fmtDate = (iso: string | null) => (iso ? esc(new Date(iso).toISOString().slice(0, 10)) : '');

  const sections = rows.map((ev) => {
    const tr = ev.pending.map((p) => `
      <tr>
        <td>${fmtDate(ev.lastSettlementGeneratedAt)}</td>
        <td>${esc(p.payerName)}</td>
        <td style="text-align:right">${Number.isFinite(p.amount) ? p.amount.toFixed(2) : ''}</td>
        <td>${esc(p.currency)}</td>
      </tr>
    `).join('');

    return `
      <section class="event">
        <h2>${esc(ev.eventName)}</h2>
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Payer Name</th>
              <th style="text-align:right">Amount</th>
              <th>Currency</th>
            </tr>
          </thead>
          <tbody>${tr || '<tr><td colspan="4" class="muted">No pending payments.</td></tr>'}</tbody>
        </table>
      </section>
    `;
  }).join('\n');

  return `<!doctype html>
  <html>
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width,initial-scale=1" />
      <title>Unsettled Payments</title>
      <style>
        :root { color-scheme: light; }
        body { font-family: -apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Arial,sans-serif; margin: 24px; color:#111; }
        header { display:flex; justify-content:space-between; align-items:baseline; gap: 12px; margin-bottom: 18px; }
        h1 { margin:0; font-size: 18px; }
        .muted { color:#666; font-size:12px; }
        .event { page-break-inside: avoid; margin: 18px 0 22px; }
        h2 { margin:0 0 10px; font-size: 14px; color:#1f2937; }
        table { width:100%; border-collapse: collapse; font-size: 12px; }
        th, td { border: 1px solid #e5e7eb; padding: 8px 10px; vertical-align: top; }
        th { background:#f8fafc; text-align:left; }
        @media print { body { margin: 12mm; } }
      </style>
    </head>
    <body>
      <header>
        <h1>Unsettled Payments</h1>
        <div class="muted">Export date: ${esc(today)}</div>
      </header>
      ${sections || '<div class="muted">No unsettled payments.</div>'}
    </body>
  </html>`;
}

