import type { Event as TraxettleEvent } from '@traxettle/shared';

function csvEscape(value: string) {
  const v = String(value ?? '');
  if (/[",\n]/.test(v)) return `"${v.replace(/"/g, '""')}"`;
  return v;
}

function yyyyMmDd(d: any): string {
  if (!d) return '';
  const t = Date.parse(String(d));
  if (Number.isNaN(t)) return '';
  return new Date(t).toISOString().slice(0, 10);
}

export function buildClosedEventsCsv(events: TraxettleEvent[]) {
  const lines: string[] = [];
  lines.push(['Event Name', 'Type', 'Currency', 'Start Date', 'End Date', 'Last Updated', 'Status'].map(csvEscape).join(','));
  for (const e of events) {
    lines.push(
      [
        e.name || '',
        (e as any).type || '',
        (e as any).currency || '',
        yyyyMmDd((e as any).startDate),
        yyyyMmDd((e as any).endDate),
        yyyyMmDd((e as any).updatedAt),
        (e as any).status || '',
      ].map((c) => csvEscape(String(c))).join(','),
    );
  }
  return lines.join('\n');
}

export function buildClosedEventsPrintHtml(events: TraxettleEvent[]) {
  const today = new Date().toISOString().slice(0, 10);
  const esc = (s: string) => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  const rows = events.map((e) => `
    <tr>
      <td>${esc(e.name || '')}</td>
      <td>${esc(String((e as any).type || ''))}</td>
      <td>${esc(String((e as any).currency || ''))}</td>
      <td>${esc(yyyyMmDd((e as any).startDate))}</td>
      <td>${esc(yyyyMmDd((e as any).endDate))}</td>
      <td>${esc(yyyyMmDd((e as any).updatedAt))}</td>
    </tr>
  `).join('');

  return `<!doctype html>
  <html>
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width,initial-scale=1" />
      <title>Closed Events</title>
      <style>
        :root { color-scheme: light; }
        body { font-family: -apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Arial,sans-serif; margin: 24px; color:#111; }
        header { display:flex; justify-content:space-between; align-items:baseline; gap: 12px; margin-bottom: 18px; }
        h1 { margin:0; font-size: 18px; }
        .muted { color:#666; font-size:12px; }
        table { width:100%; border-collapse: collapse; font-size: 12px; }
        th, td { border: 1px solid #e5e7eb; padding: 8px 10px; vertical-align: top; }
        th { background:#f8fafc; text-align:left; }
        @media print { body { margin: 12mm; } }
      </style>
    </head>
    <body>
      <header>
        <h1>Closed Events</h1>
        <div class="muted">Export date: ${esc(today)} · Count: ${events.length}</div>
      </header>
      <table>
        <thead>
          <tr>
            <th>Event Name</th>
            <th>Type</th>
            <th>Currency</th>
            <th>Start</th>
            <th>End</th>
            <th>Updated</th>
          </tr>
        </thead>
        <tbody>${rows || '<tr><td colspan="6" class="muted">No closed events.</td></tr>'}</tbody>
      </table>
      <script>
        window.addEventListener('load', function () {
          setTimeout(function () {
            try { window.focus(); } catch (e) {}
            try { window.print(); } catch (e) {}
          }, 250);
        });
      </script>
    </body>
  </html>`;
}

