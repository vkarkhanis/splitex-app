'use client';

import React, { useEffect, useMemo, useState } from 'react';
import styled from 'styled-components';
import { Button, Card, CardBody, CardHeader, CardSubtitle, CardTitle, useToast } from '@traxettle/ui';
import { api } from '../../utils/api';
import { buildUnsettledPaymentsCsv, buildUnsettledPaymentsPrintHtml, type UnsettledEventRow } from '../../utils/unsettled-export';

const Page = styled.div`
  width: 100%;
  max-width: 920px;
`;

const Actions = styled.div`
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
  margin-top: 10px;
`;

const EventList = styled.div`
  display: grid;
  gap: 12px;
`;

const EventHeader = styled.button`
  width: 100%;
  display: flex;
  align-items: baseline;
  gap: 10px;
  justify-content: space-between;
  background: transparent;
  border: 0;
  padding: 0;
  cursor: pointer;
  text-align: left;
  color: inherit;
`;

const EventMeta = styled.div`
  font-size: 12px;
  color: ${(p) => p.theme.colors.muted};
  margin-top: 2px;
`;

const Table = styled.table`
  width: 100%;
  border-collapse: collapse;
  margin-top: 10px;
  font-size: 13px;
  th, td {
    border: 1px solid ${(p) => p.theme.colors.border};
    padding: 10px 12px;
    vertical-align: top;
  }
  th {
    background: ${(p) => p.theme.colors.surfaceHover};
    text-align: left;
    font-size: 12px;
    color: ${(p) => p.theme.colors.muted};
    font-weight: 700;
  }
  td.num { text-align: right; font-variant-numeric: tabular-nums; }
`;

function yyyyMmDd(iso: string | null) {
  if (!iso) return '';
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return '';
  return new Date(t).toISOString().slice(0, 10);
}

function shortId(id: string) {
  const s = String(id || '');
  if (s.length <= 10) return s;
  return `${s.slice(0, 6)}…${s.slice(-4)}`;
}

export default function UnsettledPaymentsPage() {
  const { push: pushToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<UnsettledEventRow[]>([]);
  const [openEventId, setOpenEventId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api.get<UnsettledEventRow[]>('/api/settlements/unsettled-payments')
      .then((res) => {
        if (cancelled) return;
        setRows(res.data || []);
        if ((res.data || []).length === 1) setOpenEventId((res.data || [])[0]?.eventId || null);
      })
      .catch((e: any) => {
        pushToast({ type: 'error', title: 'Load failed', message: e?.message || 'Failed to load unsettled payments.' });
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [pushToast]);

  const pendingCount = useMemo(() => rows.reduce((sum, r) => sum + (r.pending?.length || 0), 0), [rows]);

  const exportCsv = () => {
    const csv = buildUnsettledPaymentsCsv(rows);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `unsettled-payments-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    pushToast({ type: 'success', title: 'CSV exported', message: 'Your download should start automatically.' });
  };

  const exportPdf = () => {
    const html = buildUnsettledPaymentsPrintHtml(rows);
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const w = window.open(url, '_blank');
    if (!w) {
      URL.revokeObjectURL(url);
      pushToast({ type: 'error', title: 'Popup blocked', message: 'Please allow popups to export PDF.' });
      return;
    }
    // Revoke the blob URL after the tab is created.
    window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
  };

  return (
    <Page data-testid="unsettled-payments-page">
      <Card>
        <CardHeader>
          <CardTitle>Unsettled Payments</CardTitle>
          <CardSubtitle>
            Payments owed to you that haven’t been initiated by the payer yet.
          </CardSubtitle>
        </CardHeader>
        <CardBody>
          {loading ? (
            <div style={{ opacity: 0.75 }}>Loading…</div>
          ) : rows.length === 0 ? (
            <div style={{ opacity: 0.75 }}>No unsettled payments.</div>
          ) : (
            <>
              <div style={{ fontSize: 13, opacity: 0.85 }}>
                Pending legs: <strong>{pendingCount}</strong> across <strong>{rows.length}</strong> event(s)
              </div>
              <Actions>
                <Button type="button" $variant="outline" onClick={exportCsv}>Export to CSV</Button>
                <Button type="button" $variant="outline" onClick={exportPdf}>Export to PDF</Button>
              </Actions>

              <div style={{ height: 10 }} />

              <EventList>
                {rows.map((ev) => {
                  const open = openEventId === ev.eventId;
                  const totals = ev.pending.reduce<Record<string, number>>((acc, p) => {
                    const k = String(p.currency || '').toUpperCase() || '—';
                    acc[k] = (acc[k] || 0) + (Number.isFinite(p.amount) ? p.amount : 0);
                    return acc;
                  }, {});
                  const totalText = Object.entries(totals)
                    .map(([cur, amt]) => `${amt.toFixed(2)} ${cur}`)
                    .join(' + ');
                  return (
                    <Card key={ev.eventId}>
                      <CardBody>
                        <EventHeader
                          type="button"
                          onClick={() => setOpenEventId((prev) => (prev === ev.eventId ? null : ev.eventId))}
                          aria-expanded={open}
                        >
                          <div>
                            <div style={{ fontWeight: 800, fontSize: 14 }}>{ev.eventName}</div>
                            <EventMeta>
                              Settlement date: {yyyyMmDd(ev.lastSettlementGeneratedAt) || '—'}
                              {ev.eventStatus ? ` · Status: ${ev.eventStatus}` : ''}
                              {totalText ? ` · Total: ${totalText}` : ` · Pending: ${ev.pending.length}`}
                            </EventMeta>
                          </div>
                          <div style={{ fontSize: 12, opacity: 0.75 }}>{open ? 'Hide' : 'View'}</div>
                        </EventHeader>

                        {open && (
                          <Table>
                            <thead>
                              <tr>
                                <th style={{ width: 120 }}>Date</th>
                                <th>Payer</th>
                                <th style={{ width: 170 }}>Details</th>
                                <th style={{ width: 140 }}>Amount</th>
                                <th style={{ width: 90 }}>Currency</th>
                              </tr>
                            </thead>
                            <tbody>
                              {ev.pending.map((p) => (
                                <tr key={p.settlementId}>
                                  <td>{yyyyMmDd(ev.lastSettlementGeneratedAt) || '—'}</td>
                                  <td>
                                    <div style={{ fontWeight: 700 }}>{p.payerName}</div>
                                    {p.payerEmail ? <div style={{ fontSize: 12, opacity: 0.75 }}>{p.payerEmail}</div> : null}
                                  </td>
                                  <td>
                                    <div style={{ fontSize: 12, opacity: 0.85 }}>Settlement ID: {shortId(p.settlementId)}</div>
                                  </td>
                                  <td className="num">{Number.isFinite(p.amount) ? p.amount.toFixed(2) : ''}</td>
                                  <td>{p.currency}</td>
                                </tr>
                              ))}
                            </tbody>
                          </Table>
                        )}
                      </CardBody>
                    </Card>
                  );
                })}
              </EventList>
            </>
          )}
        </CardBody>
      </Card>
    </Page>
  );
}
