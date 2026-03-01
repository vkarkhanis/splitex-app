import React, { useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Platform,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import * as Print from 'expo-print';
import { spacing, radii, fontSizes, CURRENCY_SYMBOLS } from '../theme';
import { useTheme } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';
import { usePurchase } from '../context/PurchaseContext';
import { api } from '../api';
import type { Event as TraxettleEvent, Expense } from '@traxettle/shared';

// ── Simple keyword-based categorization ──
const CATEGORY_RULES: [string, RegExp][] = [
  ['Food & Dining', /food|lunch|dinner|breakfast|coffee|tea|restaurant|cafe|snack|pizza|burger|meal|eat/i],
  ['Transport', /uber|lyft|cab|taxi|bus|train|metro|fuel|gas|petrol|toll|parking|flight|airline|ticket/i],
  ['Accommodation', /hotel|hostel|airbnb|stay|room|lodge|resort|rent/i],
  ['Shopping', /shop|buy|purchase|market|mall|store|cloth|shoe|gift/i],
  ['Entertainment', /movie|cinema|show|concert|game|museum|park|fun|ticket|entry/i],
  ['Utilities', /electric|water|internet|wifi|phone|bill|subscription|recharge/i],
  ['Groceries', /grocery|supermarket|vegetable|fruit|milk|bread/i],
  ['Health', /doctor|hospital|medicine|pharmacy|medical|health|gym/i],
];

function categorize(title: string): string {
  for (const [cat, regex] of CATEGORY_RULES) {
    if (regex.test(title)) return cat;
  }
  return 'Other';
}

function formatCurrency(amount: number, currency: string): string {
  const sym = CURRENCY_SYMBOLS[currency] || currency;
  return `${sym}${amount.toFixed(2)}`;
}

interface AggRow { label: string; amount: number; count: number; }

export default function AnalyticsScreen({ navigation }: any) {
  const { theme } = useTheme();
  const c = theme.colors;
  const { user } = useAuth();
  const { isPro } = usePurchase();
  const currentUserId = user?.userId || '';

  const [events, setEvents] = useState<TraxettleEvent[]>([]);
  const [allExpenses, setAllExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const { data: evts } = await api.get<TraxettleEvent[]>('/api/events');
      const nonClosed = (evts || []).filter((e: TraxettleEvent) => e.status !== 'closed');
      setEvents(nonClosed);

      const expenseResults = await Promise.all(
        nonClosed.map(async (evt) => {
          try {
            const { data } = await api.get<Expense[]>(`/api/expenses/event/${evt.id}`);
            return (data || []).map(exp => ({ ...exp, _eventName: evt.name, _eventCurrency: evt.currency }));
          } catch { return []; }
        })
      );
      setAllExpenses(expenseResults.flat());
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { fetchData(); }, [fetchData]));

  // ── Aggregations ──
  const myExpenses = useMemo(() =>
    allExpenses.filter(e => e.paidBy === currentUserId),
    [allExpenses, currentUserId]
  );

  const totalSpent = useMemo(() =>
    myExpenses.reduce((s, e) => s + e.amount, 0),
    [myExpenses]
  );

  const byCategory = useMemo(() => {
    const map = new Map<string, AggRow>();
    for (const exp of myExpenses) {
      const cat = categorize(exp.title);
      const prev = map.get(cat) || { label: cat, amount: 0, count: 0 };
      prev.amount += exp.amount;
      prev.count += 1;
      map.set(cat, prev);
    }
    return [...map.values()].sort((a, b) => b.amount - a.amount);
  }, [myExpenses]);

  const byEvent = useMemo(() => {
    const map = new Map<string, AggRow>();
    for (const exp of myExpenses) {
      const evtName = (exp as any)._eventName || 'Unknown';
      const prev = map.get(evtName) || { label: evtName, amount: 0, count: 0 };
      prev.amount += exp.amount;
      prev.count += 1;
      map.set(evtName, prev);
    }
    return [...map.values()].sort((a, b) => b.amount - a.amount);
  }, [myExpenses]);

  const bySplitType = useMemo(() => {
    const map = new Map<string, AggRow>();
    for (const exp of myExpenses) {
      const st = exp.splitType;
      const prev = map.get(st) || { label: st, amount: 0, count: 0 };
      prev.amount += exp.amount;
      prev.count += 1;
      map.set(st, prev);
    }
    return [...map.values()].sort((a, b) => b.amount - a.amount);
  }, [myExpenses]);

  // ── Export ──
  const handleExport = async (format: 'csv' | 'pdf') => {
    if (myExpenses.length === 0) {
      Alert.alert('Nothing to export', 'No expense data available.');
      return;
    }
    setExporting(format);
    try {
      const today = new Date();
      const dateStr = `${today.getDate().toString().padStart(2, '0')}-${(today.getMonth() + 1).toString().padStart(2, '0')}-${today.getFullYear()}`;
      const eventName = (myExpenses[0] as any)._eventName || 'analytics';
      const sanitizedName = eventName.replace(/[^a-zA-Z0-9]/g, '_').substring(0, 20);
      const fileName = `${sanitizedName}-${dateStr}`;
      
      if (format === 'csv') {
        const rows = ['Event,Title,Category,Amount,Currency,Split Type,Date'];
        for (const exp of myExpenses) {
          const cat = categorize(exp.title);
          rows.push(`"${(exp as any)._eventName}","${exp.title}","${cat}","${exp.amount}","${exp.currency}","${exp.splitType}","${new Date(exp.createdAt).toLocaleDateString()}"`);
        }
        const csvFile = new File(Paths.cache, `${fileName}.csv`);
        csvFile.create();
        await csvFile.write(rows.join('\n'));
        
        // Let user open in any app or share
        if (await Sharing.isAvailableAsync()) {
          await Sharing.shareAsync(csvFile.uri, { mimeType: 'text/csv', dialogTitle: `Open ${fileName}.csv` });
        } else {
          Alert.alert('Export Complete', `CSV saved as ${fileName}.csv`);
        }
      } else {
        let html = `<html><head><style>
          body{font-family:-apple-system,sans-serif;padding:20px}
          h1{color:#6366f1} h2{margin-top:20px;border-bottom:1px solid #e0e0e0;padding-bottom:4px}
          table{width:100%;border-collapse:collapse;margin-top:8px}
          th,td{border:1px solid #e0e0e0;padding:6px 10px;text-align:left;font-size:12px}
          th{background:#f5f5f5;font-weight:600} .meta{color:#888;font-size:12px}
        </style></head><body>
        <h1>Spending Analytics</h1>
        <p class="meta">Generated ${new Date().toLocaleDateString()} · ${myExpenses.length} expenses</p>
        <h2>By Category</h2><table><tr><th>Category</th><th>Amount</th><th>Count</th></tr>`;
        for (const r of byCategory) html += `<tr><td>${r.label}</td><td>${r.amount.toFixed(2)}</td><td>${r.count}</td></tr>`;
        html += `</table><h2>By Event</h2><table><tr><th>Event</th><th>Amount</th><th>Count</th></tr>`;
        for (const r of byEvent) html += `<tr><td>${r.label}</td><td>${r.amount.toFixed(2)}</td><td>${r.count}</td></tr>`;
        html += `</table><h2>All Expenses</h2><table><tr><th>Event</th><th>Title</th><th>Category</th><th>Amount</th><th>Currency</th><th>Date</th></tr>`;
        for (const exp of myExpenses) {
          html += `<tr><td>${(exp as any)._eventName}</td><td>${exp.title}</td><td>${categorize(exp.title)}</td><td>${exp.amount}</td><td>${exp.currency}</td><td>${new Date(exp.createdAt).toLocaleDateString()}</td></tr>`;
        }
        html += `</table></body></html>`;
        const { uri } = await Print.printToFileAsync({ html });
        
        // Let user open in any app or share
        if (await Sharing.isAvailableAsync()) {
          await Sharing.shareAsync(uri, { mimeType: 'application/pdf', dialogTitle: `Open ${fileName}.pdf` });
        } else {
          Alert.alert('Export Complete', `PDF saved as ${fileName}.pdf`);
        }
      }
    } catch (err: any) {
      Alert.alert('Export failed', err?.message || 'Something went wrong.');
    } finally {
      setExporting(null);
    }
  };

  // ── Bar renderer ──
  const renderBar = (row: AggRow, max: number, color: string) => {
    const pct = max > 0 ? (row.amount / max) * 100 : 0;
    return (
      <View key={row.label} style={styles.barRow}>
        <View style={styles.barLabelRow}>
          <Text style={[styles.barLabel, { color: c.text }]} numberOfLines={1}>{row.label}</Text>
          <Text style={[styles.barAmount, { color: c.textSecondary }]}>{row.amount.toFixed(2)} ({row.count})</Text>
        </View>
        <View style={[styles.barTrack, { backgroundColor: c.border }]}>
          <View style={[styles.barFill, { width: `${Math.max(pct, 2)}%`, backgroundColor: color }]} />
        </View>
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

  if (!isPro) {
    return (
      <View style={[styles.center, { backgroundColor: c.background }]}>
        <Text style={{ fontSize: 48, marginBottom: spacing.md }}>📊</Text>
        <Text style={[styles.gateTitle, { color: c.text }]}>Pro Feature</Text>
        <Text style={[styles.gateDesc, { color: c.textSecondary }]}>
          Advanced Analytics is available with the Pro plan.
        </Text>
        <TouchableOpacity
          style={[styles.gateBtn, { backgroundColor: c.primary }]}
          onPress={() => navigation.navigate('ProUpgrade')}
        >
          <Text style={styles.gateBtnText}>Upgrade to Pro</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const maxCat = byCategory.length > 0 ? byCategory[0].amount : 1;
  const maxEvt = byEvent.length > 0 ? byEvent[0].amount : 1;

  return (
    <ScrollView style={[styles.container, { backgroundColor: c.background }]} contentContainerStyle={styles.content}>
      {/* Summary */}
      <View style={[styles.summaryCard, { backgroundColor: c.primary + '10' }]}>
        <Text style={[styles.summaryLabel, { color: c.primary }]}>Your Total Spending</Text>
        <Text style={[styles.summaryAmount, { color: c.primary }]}>{totalSpent.toFixed(2)}</Text>
        <Text style={[styles.summaryMeta, { color: c.muted }]}>
          {myExpenses.length} expense{myExpenses.length !== 1 ? 's' : ''} across {events.length} event{events.length !== 1 ? 's' : ''}
        </Text>
      </View>

      {/* Export buttons */}
      <View style={styles.exportRow}>
        <TouchableOpacity
          style={[styles.exportBtn, { backgroundColor: c.success + '12' }]}
          onPress={() => handleExport('csv')}
          disabled={!!exporting}
        >
          {exporting === 'csv' ? <ActivityIndicator size="small" color={c.success} /> : (
            <Text style={[styles.exportBtnText, { color: c.success }]}>Export CSV</Text>
          )}
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.exportBtn, { backgroundColor: c.error + '10' }]}
          onPress={() => handleExport('pdf')}
          disabled={!!exporting}
        >
          {exporting === 'pdf' ? <ActivityIndicator size="small" color={c.error} /> : (
            <Text style={[styles.exportBtnText, { color: c.error }]}>Export PDF</Text>
          )}
        </TouchableOpacity>
      </View>

      {/* By Category */}
      <Text style={[styles.sectionTitle, { color: c.text }]}>By Category</Text>
      {byCategory.length === 0 ? (
        <Text style={[styles.emptyHint, { color: c.muted }]}>No expenses to analyze.</Text>
      ) : (
        byCategory.map(r => renderBar(r, maxCat, c.primary))
      )}

      {/* By Event */}
      <Text style={[styles.sectionTitle, { color: c.text }]}>By Event</Text>
      {byEvent.length === 0 ? (
        <Text style={[styles.emptyHint, { color: c.muted }]}>No expenses to analyze.</Text>
      ) : (
        byEvent.map(r => renderBar(r, maxEvt, c.info))
      )}

      {/* By Split Type */}
      <Text style={[styles.sectionTitle, { color: c.text }]}>By Split Type</Text>
      {bySplitType.map(r => (
        <View key={r.label} style={[styles.splitTypeRow, { borderColor: c.border }]}>
          <Text style={[styles.splitTypeLabel, { color: c.text }]}>{r.label}</Text>
          <Text style={[styles.splitTypeAmount, { color: c.textSecondary }]}>{r.amount.toFixed(2)} · {r.count} expense{r.count !== 1 ? 's' : ''}</Text>
        </View>
      ))}

      <View style={{ height: spacing.xxxl * 2 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: spacing.xl },
  content: { padding: spacing.xl },
  summaryCard: {
    borderRadius: radii.md,
    padding: spacing.xl,
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  summaryLabel: { fontSize: fontSizes.sm, fontWeight: '600', marginBottom: spacing.xs },
  summaryAmount: { fontSize: fontSizes.xxxl, fontWeight: '800' },
  summaryMeta: { fontSize: fontSizes.xs, marginTop: spacing.xs },
  exportRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.xl,
  },
  exportBtn: {
    flex: 1,
    paddingVertical: spacing.sm + 2,
    borderRadius: radii.md,
    alignItems: 'center',
  },
  exportBtnText: { fontSize: fontSizes.sm, fontWeight: '700' },
  sectionTitle: {
    fontSize: fontSizes.lg, fontWeight: '700',
    marginBottom: spacing.md, marginTop: spacing.lg,
  },
  emptyHint: { fontSize: fontSizes.sm, marginBottom: spacing.md },
  barRow: { marginBottom: spacing.md },
  barLabelRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    marginBottom: spacing.xs,
  },
  barLabel: { fontSize: fontSizes.sm, fontWeight: '600', flex: 1 },
  barAmount: { fontSize: fontSizes.xs },
  barTrack: { height: 8, borderRadius: 4, overflow: 'hidden' },
  barFill: { height: 8, borderRadius: 4 },
  splitTypeRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: spacing.sm, borderBottomWidth: 1,
  },
  splitTypeLabel: { fontSize: fontSizes.sm, fontWeight: '600', textTransform: 'capitalize' },
  splitTypeAmount: { fontSize: fontSizes.xs },
  // Pro gate
  gateTitle: { fontSize: fontSizes.xl, fontWeight: '700', marginBottom: spacing.sm },
  gateDesc: { fontSize: fontSizes.sm, textAlign: 'center', marginBottom: spacing.lg },
  gateBtn: { borderRadius: radii.md, paddingHorizontal: spacing.xl, paddingVertical: spacing.md },
  gateBtnText: { color: '#ffffff', fontSize: fontSizes.md, fontWeight: '600' },
});
