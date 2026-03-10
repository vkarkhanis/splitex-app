import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Platform,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { File, Paths } from 'expo-file-system';
import * as Print from 'expo-print';
import { openExportedFile } from '../utils/openFile';
import { spacing, radii, fontSizes } from '../theme';
import { useTheme } from '../context/ThemeContext';
import { api } from '../api';

type UnsettledEventRow = {
  eventId: string;
  eventName: string;
  lastSettlementGeneratedAt: string | null;
  eventStatus?: string;
  eventType?: string;
  eventCurrency?: string;
  eventStartDate?: string | null;
  eventEndDate?: string | null;
  pending: Array<{
    settlementId: string;
    payerUserId: string;
    payerName: string;
    payerEmail?: string;
    amount: number;
    currency: string;
  }>;
};

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

function csvEscape(value: string) {
  const v = String(value ?? '');
  if (/[",\n]/.test(v)) return `"${v.replace(/"/g, '""')}"`;
  return v;
}

function buildCsvContent(rows: UnsettledEventRow[]) {
  const lines: string[] = [];
  for (const ev of rows) {
    lines.push(csvEscape(`Event: ${ev.eventName}`));
    lines.push(['Date', 'Payer Name', 'Payer Email', 'Settlement ID', 'Amount', 'Currency'].map(csvEscape).join(','));
    const date = yyyyMmDd(ev.lastSettlementGeneratedAt);
    for (const p of ev.pending) {
      lines.push(
        [
          date,
          p.payerName,
          p.payerEmail || '',
          p.settlementId,
          Number.isFinite(p.amount) ? p.amount.toFixed(2) : '',
          p.currency,
        ].map((c) => csvEscape(String(c))).join(','),
      );
    }
    lines.push('');
  }
  return lines.join('\n');
}

function escHtml(s: string) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function buildPdfHtml(rows: UnsettledEventRow[]) {
  const today = new Date().toISOString().slice(0, 10);
  const sections = rows.map((ev) => {
    const tr = ev.pending.map((p) => `
      <tr>
        <td>${escHtml(yyyyMmDd(ev.lastSettlementGeneratedAt))}</td>
        <td>${escHtml(p.payerName)}</td>
        <td>${escHtml(p.payerEmail || '')}</td>
        <td>${escHtml(p.settlementId)}</td>
        <td style="text-align:right">${Number.isFinite(p.amount) ? p.amount.toFixed(2) : ''}</td>
        <td>${escHtml(p.currency)}</td>
      </tr>
    `).join('');
    return `
      <section class="event">
        <h2>${escHtml(ev.eventName)}</h2>
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Payer Name</th>
              <th>Payer Email</th>
              <th>Settlement ID</th>
              <th style="text-align:right">Amount</th>
              <th>Currency</th>
            </tr>
          </thead>
          <tbody>${tr || '<tr><td colspan="6" class="muted">No pending payments.</td></tr>'}</tbody>
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
        body { font-family: -apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Arial,sans-serif; margin: 18px; color:#111; }
        header { display:flex; justify-content:space-between; align-items:baseline; gap: 12px; margin-bottom: 14px; }
        h1 { margin:0; font-size: 16px; }
        .muted { color:#666; font-size:12px; }
        .event { page-break-inside: avoid; margin: 14px 0 18px; }
        h2 { margin:0 0 8px; font-size: 13px; color:#1f2937; }
        table { width:100%; border-collapse: collapse; font-size: 11px; }
        th, td { border: 1px solid #e5e7eb; padding: 7px 8px; vertical-align: top; }
        th { background:#f8fafc; text-align:left; }
      </style>
    </head>
    <body>
      <header>
        <h1>Unsettled Payments</h1>
        <div class="muted">Export date: ${escHtml(today)}</div>
      </header>
      ${sections || '<div class="muted">No unsettled payments.</div>'}
    </body>
  </html>`;
}

export default function UnsettledPaymentsScreen() {
  const { theme } = useTheme();
  const c = theme.colors;

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [rows, setRows] = useState<UnsettledEventRow[]>([]);
  const [openEventId, setOpenEventId] = useState<string | null>(null);
  const [exporting, setExporting] = useState<string | null>(null);

  const pendingCount = useMemo(() => rows.reduce((sum, r) => sum + (r.pending?.length || 0), 0), [rows]);

  const fetchRows = useCallback(async () => {
    try {
      const { data } = await api.get<UnsettledEventRow[]>('/api/settlements/unsettled-payments');
      setRows(data || []);
      if ((data || []).length === 1) setOpenEventId((data || [])[0]?.eventId || null);
    } catch (err: any) {
      Alert.alert('Error', err?.message || 'Failed to load unsettled payments.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      fetchRows();
    }, [fetchRows]),
  );

  const onRefresh = () => {
    setRefreshing(true);
    fetchRows();
  };

  const exportCsv = async () => {
    if (rows.length === 0) {
      Alert.alert('Nothing to export', 'No unsettled payments found.');
      return;
    }
    setExporting('csv');
    try {
      const csv = buildCsvContent(rows);
      const today = new Date();
      const dateStr = `${today.getDate().toString().padStart(2, '0')}-${(today.getMonth() + 1).toString().padStart(2, '0')}-${today.getFullYear()}`;
      const timeStr = `${today.getHours().toString().padStart(2, '0')}-${today.getMinutes().toString().padStart(2, '0')}`;
      const fileName = `unsettled-payments-${dateStr}-${timeStr}`;
      const csvFile = new File(Paths.cache, `${fileName}.csv`);

      if (Platform.OS === 'android') {
        try { await csvFile.delete(); } catch { /* ignore */ }
      }
      csvFile.create();
      await csvFile.write(csv);
      await openExportedFile(csvFile.uri, 'text/csv', `Open ${fileName}.csv`);
    } catch (err: any) {
      Alert.alert('Export failed', err?.message || 'An error occurred while exporting CSV.');
    } finally {
      setExporting(null);
    }
  };

  const exportPdf = async () => {
    if (rows.length === 0) {
      Alert.alert('Nothing to export', 'No unsettled payments found.');
      return;
    }
    setExporting('pdf');
    try {
      const html = buildPdfHtml(rows);
      const { uri } = await Print.printToFileAsync({ html });
      const today = new Date();
      const dateStr = `${today.getDate().toString().padStart(2, '0')}-${(today.getMonth() + 1).toString().padStart(2, '0')}-${today.getFullYear()}`;
      const timeStr = `${today.getHours().toString().padStart(2, '0')}-${today.getMinutes().toString().padStart(2, '0')}`;
      const fileName = `unsettled-payments-${dateStr}-${timeStr}.pdf`;
      await openExportedFile(uri, 'application/pdf', `Open ${fileName}`);
    } catch (err: any) {
      Alert.alert('Export failed', err?.message || 'An error occurred while exporting PDF.');
    } finally {
      setExporting(null);
    }
  };

  const renderEvent = ({ item }: { item: UnsettledEventRow }) => {
    const open = openEventId === item.eventId;
    const totals = item.pending.reduce<Record<string, number>>((acc, p) => {
      const k = String(p.currency || '').toUpperCase() || '—';
      acc[k] = (acc[k] || 0) + (Number.isFinite(p.amount) ? p.amount : 0);
      return acc;
    }, {});
    const totalText = Object.entries(totals)
      .map(([cur, amt]) => `${amt.toFixed(2)} ${cur}`)
      .join(' + ');
    return (
      <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }]}>
        <TouchableOpacity
          style={styles.cardHeader}
          onPress={() => setOpenEventId((prev) => (prev === item.eventId ? null : item.eventId))}
          activeOpacity={0.7}
        >
          <View style={{ flex: 1 }}>
            <Text style={[styles.cardTitle, { color: c.text }]} numberOfLines={1}>{item.eventName}</Text>
            <Text style={[styles.cardMeta, { color: c.muted }]} numberOfLines={1}>
              Settlement date: {yyyyMmDd(item.lastSettlementGeneratedAt) || '—'}
              {item.eventStatus ? ` · Status: ${item.eventStatus}` : ''}
              {totalText ? ` · Total: ${totalText}` : ` · Pending: ${item.pending.length}`}
            </Text>
          </View>
          <Text style={[styles.toggle, { color: c.primary }]}>{open ? 'Hide' : 'View'}</Text>
        </TouchableOpacity>

        {open && (
          <View style={styles.tableWrap}>
            <View style={[styles.tableRow, styles.tableHead, { backgroundColor: c.surfaceAlt, borderColor: c.border }]}>
              <Text style={[styles.th, { color: c.muted, width: 88 }]}>Date</Text>
              <Text style={[styles.th, { color: c.muted, flex: 1 }]}>Payer</Text>
              <Text style={[styles.th, { color: c.muted, width: 110, textAlign: 'right' }]}>Amount</Text>
              <Text style={[styles.th, { color: c.muted, width: 72, textAlign: 'right' }]}>Currency</Text>
            </View>
            {item.pending.map((p) => (
              <View key={p.settlementId} style={[styles.tableRow, { borderColor: c.border }]}>
                <Text style={[styles.td, { color: c.textSecondary, width: 88 }]}>{yyyyMmDd(item.lastSettlementGeneratedAt) || '—'}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.td, { color: c.text }]} numberOfLines={1}>{p.payerName}</Text>
                  {p.payerEmail ? (
                    <Text style={[styles.tdSmall, { color: c.textSecondary }]} numberOfLines={1}>{p.payerEmail}</Text>
                  ) : null}
                  <Text style={[styles.tdSmall, { color: c.muted }]} numberOfLines={1}>Settlement ID: {shortId(p.settlementId)}</Text>
                </View>
                <Text style={[styles.td, { color: c.text, width: 110, textAlign: 'right' }]}>{Number.isFinite(p.amount) ? p.amount.toFixed(2) : ''}</Text>
                <Text style={[styles.td, { color: c.textSecondary, width: 72, textAlign: 'right' }]}>{p.currency}</Text>
              </View>
            ))}
          </View>
        )}
      </View>
    );
  };

  if (loading) {
    return (
      <View style={[styles.center, { backgroundColor: c.background }]}>
        <ActivityIndicator size="large" color={c.primary} />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: c.background }]}>
      <View style={[styles.exportRow, { borderBottomColor: c.border }]}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.heading, { color: c.text }]}>Unsettled Payments</Text>
          <Text style={[styles.subheading, { color: c.muted }]}>
            Pending legs: {pendingCount} across {rows.length} event(s)
          </Text>
        </View>
        <TouchableOpacity
          style={[styles.exportBtn, { backgroundColor: c.success + '12' }]}
          onPress={exportCsv}
          disabled={!!exporting}
        >
          {exporting === 'csv' ? (
            <ActivityIndicator size="small" color={c.success} />
          ) : (
            <Text style={[styles.exportBtnText, { color: c.success }]}>CSV</Text>
          )}
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.exportBtn, { backgroundColor: c.info + '12' }]}
          onPress={exportPdf}
          disabled={!!exporting}
        >
          {exporting === 'pdf' ? (
            <ActivityIndicator size="small" color={c.info} />
          ) : (
            <Text style={[styles.exportBtnText, { color: c.info }]}>PDF</Text>
          )}
        </TouchableOpacity>
      </View>

      <FlatList
        data={rows}
        keyExtractor={(item) => item.eventId}
        renderItem={renderEvent}
        contentContainerStyle={rows.length === 0 ? styles.center : styles.list}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyIcon}>✅</Text>
            <Text style={[styles.emptyTitle, { color: c.text }]}>No Unsettled Payments</Text>
            <Text style={[styles.emptyDesc, { color: c.textSecondary }]}>
              Payments owed to you will appear here until the payer initiates them.
            </Text>
          </View>
        }
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.primary} />}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  list: { paddingHorizontal: spacing.xl, paddingTop: spacing.lg, paddingBottom: spacing.xxxl },
  exportRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.lg,
    borderBottomWidth: 1,
  },
  heading: { fontSize: fontSizes.xl, fontWeight: '800' },
  subheading: { fontSize: fontSizes.xs, marginTop: 2 },
  exportBtn: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radii.md,
    minWidth: 56,
    alignItems: 'center',
    justifyContent: 'center',
  },
  exportBtnText: { fontSize: fontSizes.sm, fontWeight: '800' },
  card: {
    borderWidth: 1,
    borderRadius: radii.lg,
    padding: spacing.lg,
    marginBottom: spacing.md,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  cardTitle: { fontSize: fontSizes.lg, fontWeight: '800' },
  cardMeta: { fontSize: fontSizes.xs, marginTop: 4 },
  toggle: { fontSize: fontSizes.sm, fontWeight: '800' },
  tableWrap: { marginTop: spacing.md, borderRadius: radii.md, overflow: 'hidden' },
  tableRow: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderTopWidth: 0, paddingVertical: 10, paddingHorizontal: 10, gap: 10 },
  tableHead: { borderTopWidth: 1 },
  th: { fontSize: fontSizes.xs, fontWeight: '800' },
  td: { fontSize: fontSizes.sm },
  tdSmall: { fontSize: fontSizes.xs, marginTop: 2 },
  empty: { alignItems: 'center', paddingHorizontal: spacing.xl, paddingTop: spacing.xxxl },
  emptyIcon: { fontSize: 44, marginBottom: spacing.md },
  emptyTitle: { fontSize: fontSizes.lg, fontWeight: '800', marginBottom: spacing.sm },
  emptyDesc: { fontSize: fontSizes.sm, textAlign: 'center' },
});
