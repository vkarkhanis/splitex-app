import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  Alert,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import * as Print from 'expo-print';
import { spacing, radii, fontSizes, CURRENCY_SYMBOLS } from '../theme';
import { useTheme } from '../context/ThemeContext';
import { api } from '../api';
import type { Event as TraxettleEvent, Expense } from '@traxettle/shared';

const INITIAL_COUNT = 5;
const MAX_RANGE_MONTHS = 3;

function formatDate(d: any): string {
  if (!d) return '';
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function monthLabel(date: Date): string {
  return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

export default function ClosedEventsScreen({ navigation }: any) {
  const { theme } = useTheme();
  const c = theme.colors;

  const [allClosed, setAllClosed] = useState<TraxettleEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [exporting, setExporting] = useState<string | null>(null);

  // Search range state
  const [rangeStart, setRangeStart] = useState<Date | null>(null);
  const [rangeEnd, setRangeEnd] = useState<Date | null>(null);

  const fetchEvents = useCallback(async () => {
    try {
      const { data } = await api.get<TraxettleEvent[]>('/api/events');
      const closed = (data || [])
        .filter((e: TraxettleEvent) => e.status === 'closed')
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      setAllClosed(closed);
    } catch {
      // silently fail
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      fetchEvents();
    }, [fetchEvents])
  );

  const onRefresh = () => {
    setRefreshing(true);
    fetchEvents();
  };

  // Filter by date range if set
  const filteredEvents = (rangeStart && rangeEnd)
    ? allClosed.filter(e => {
        const d = new Date(e.createdAt).getTime();
        return d >= rangeStart.getTime() && d <= rangeEnd.getTime();
      })
    : allClosed;

  const displayedEvents = showAll ? filteredEvents : filteredEvents.slice(0, INITIAL_COUNT);
  const hasMore = filteredEvents.length > INITIAL_COUNT && !showAll;

  // Quick range selectors (last 1, 2, 3 months)
  const setQuickRange = (months: number) => {
    const end = new Date();
    const start = new Date();
    start.setMonth(start.getMonth() - months);
    start.setHours(0, 0, 0, 0);
    end.setHours(23, 59, 59, 999);
    setRangeStart(start);
    setRangeEnd(end);
    setShowAll(true);
  };

  const clearRange = () => {
    setRangeStart(null);
    setRangeEnd(null);
    setShowAll(false);
  };

  // ── Export Helpers ──

  const fetchEventDetails = async (event: TraxettleEvent) => {
    try {
      const { data: expenses } = await api.get<Expense[]>(`/api/expenses/event/${event.id}`);
      return { event, expenses: expenses || [] };
    } catch {
      return { event, expenses: [] };
    }
  };

  const buildCsvContent = (details: { event: TraxettleEvent; expenses: Expense[] }[]) => {
    const rows: string[] = ['Event Name,Event Currency,Event Status,Expense Title,Amount,Currency,Paid By,Split Type,Date'];
    for (const { event, expenses } of details) {
      if (expenses.length === 0) {
        rows.push(`"${event.name}","${event.currency}","${event.status}","(no expenses)","","","","","${formatDate(event.createdAt)}"`);
      }
      for (const exp of expenses) {
        rows.push(
          `"${event.name}","${event.currency}","${event.status}","${exp.title}","${exp.amount}","${exp.currency}","${exp.paidBy}","${exp.splitType}","${formatDate(exp.createdAt)}"`
        );
      }
    }
    return rows.join('\n');
  };

  const buildHtmlContent = (details: { event: TraxettleEvent; expenses: Expense[] }[]) => {
    let html = `
      <html><head>
      <style>
        body { font-family: -apple-system, sans-serif; padding: 20px; }
        h1 { color: #6366f1; }
        h2 { margin-top: 24px; color: #333; border-bottom: 1px solid #e0e0e0; padding-bottom: 4px; }
        table { width: 100%; border-collapse: collapse; margin-top: 8px; }
        th, td { border: 1px solid #e0e0e0; padding: 6px 10px; text-align: left; font-size: 12px; }
        th { background: #f5f5f5; font-weight: 600; }
        .meta { color: #888; font-size: 12px; margin-bottom: 4px; }
      </style>
      </head><body>
      <h1>Closed Events Report</h1>
      <p class="meta">Exported on ${new Date().toLocaleDateString()}</p>
    `;

    for (const { event, expenses } of details) {
      const sym = CURRENCY_SYMBOLS[event.currency] || event.currency;
      html += `<h2>${event.name}</h2>`;
      html += `<p class="meta">${sym} · ${event.type} · Created ${formatDate(event.createdAt)}</p>`;
      if (expenses.length === 0) {
        html += `<p>No expenses recorded.</p>`;
      } else {
        html += `<table><tr><th>Title</th><th>Amount</th><th>Currency</th><th>Split</th><th>Date</th></tr>`;
        for (const exp of expenses) {
          html += `<tr><td>${exp.title}</td><td>${exp.amount}</td><td>${exp.currency}</td><td>${exp.splitType}</td><td>${formatDate(exp.createdAt)}</td></tr>`;
        }
        html += `</table>`;
      }
    }
    html += `</body></html>`;
    return html;
  };

  const handleExport = async (format: 'csv' | 'pdf') => {
    const eventsToExport = filteredEvents;
    if (eventsToExport.length === 0) {
      Alert.alert('Nothing to export', 'No closed events match the current filters.');
      return;
    }

    setExporting(format);
    try {
      const details = await Promise.all(eventsToExport.map(fetchEventDetails));

      if (format === 'csv') {
        const csv = buildCsvContent(details);
        const csvFile = new File(Paths.cache, `closed_events_${Date.now()}.csv`);
        csvFile.create();
        await csvFile.write(csv);
        const fileUri = csvFile.uri;
        if (await Sharing.isAvailableAsync()) {
          await Sharing.shareAsync(fileUri, { mimeType: 'text/csv', dialogTitle: 'Export Closed Events' });
        } else {
          Alert.alert('Sharing not available', 'Your device does not support file sharing.');
        }
      } else {
        const html = buildHtmlContent(details);
        const { uri } = await Print.printToFileAsync({ html });
        if (await Sharing.isAvailableAsync()) {
          await Sharing.shareAsync(uri, { mimeType: 'application/pdf', dialogTitle: 'Export Closed Events' });
        } else {
          Alert.alert('Sharing not available', 'Your device does not support file sharing.');
        }
      }
    } catch (err: any) {
      Alert.alert('Export failed', err?.message || 'An error occurred while exporting.');
    } finally {
      setExporting(null);
    }
  };

  const renderEvent = ({ item }: { item: TraxettleEvent }) => {
    const sym = CURRENCY_SYMBOLS[item.currency] || item.currency;
    return (
      <TouchableOpacity
        style={[styles.eventCard, { backgroundColor: c.surface, shadowColor: c.black }]}
        onPress={() => navigation.navigate('EventDetail', { eventId: item.id, eventName: item.name })}
        activeOpacity={0.7}
      >
        <View style={styles.eventHeader}>
          <Text style={[styles.eventName, { color: c.text }]} numberOfLines={1}>{item.name}</Text>
          <View style={[styles.statusBadge, { backgroundColor: c.muted + '20' }]}>
            <Text style={[styles.statusText, { color: c.muted }]}>closed</Text>
          </View>
        </View>
        {item.description ? (
          <Text style={[styles.eventDesc, { color: c.textSecondary }]} numberOfLines={1}>{item.description}</Text>
        ) : null}
        <View style={styles.eventMeta}>
          <Text style={[styles.metaText, { color: c.muted }]}>{sym} · {item.type} · {formatDate(item.createdAt)}</Text>
        </View>
      </TouchableOpacity>
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
      {/* Range filter bar */}
      <View style={[styles.filterBar, { borderBottomColor: c.border }]}>
        <Text style={[styles.filterLabel, { color: c.textSecondary }]}>Filter:</Text>
        {[1, 2, 3].map(m => {
          const isActive = rangeStart && rangeEnd &&
            Math.round((rangeEnd.getTime() - rangeStart.getTime()) / (1000 * 60 * 60 * 24 * 30)) === m;
          return (
            <TouchableOpacity
              key={m}
              style={[styles.filterChip, { borderColor: c.border }, isActive && { borderColor: c.primary, backgroundColor: c.primary + '15' }]}
              onPress={() => setQuickRange(m)}
            >
              <Text style={[styles.filterChipText, { color: c.text }, isActive && { color: c.primary, fontWeight: '600' }]}>
                {m}mo
              </Text>
            </TouchableOpacity>
          );
        })}
        {rangeStart && (
          <TouchableOpacity style={[styles.filterChip, { borderColor: c.error + '50' }]} onPress={clearRange}>
            <Text style={[styles.filterChipText, { color: c.error }]}>Clear</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Export buttons */}
      <View style={styles.exportRow}>
        <TouchableOpacity
          style={[styles.exportBtn, { backgroundColor: c.success + '12' }]}
          onPress={() => handleExport('csv')}
          disabled={!!exporting}
        >
          {exporting === 'csv' ? (
            <ActivityIndicator size="small" color={c.success} />
          ) : (
            <Text style={[styles.exportBtnText, { color: c.success }]}>Export CSV</Text>
          )}
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.exportBtn, { backgroundColor: c.error + '10' }]}
          onPress={() => handleExport('pdf')}
          disabled={!!exporting}
        >
          {exporting === 'pdf' ? (
            <ActivityIndicator size="small" color={c.error} />
          ) : (
            <Text style={[styles.exportBtnText, { color: c.error }]}>Export PDF</Text>
          )}
        </TouchableOpacity>
      </View>

      {rangeStart && rangeEnd && (
        <Text style={[styles.rangeHint, { color: c.muted }]}>
          Showing events from {formatDate(rangeStart)} to {formatDate(rangeEnd)}
        </Text>
      )}

      <FlatList
        data={displayedEvents}
        keyExtractor={(item) => item.id}
        renderItem={renderEvent}
        contentContainerStyle={displayedEvents.length === 0 ? styles.center : styles.list}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyIcon}>📦</Text>
            <Text style={[styles.emptyTitle, { color: c.text }]}>No Closed Events</Text>
            <Text style={[styles.emptyDesc, { color: c.textSecondary }]}>
              {rangeStart ? 'No closed events in this date range.' : 'Events you close will appear here.'}
            </Text>
          </View>
        }
        ListFooterComponent={
          hasMore ? (
            <TouchableOpacity
              style={[styles.showMoreBtn, { borderColor: c.primary }]}
              onPress={() => setShowAll(true)}
              activeOpacity={0.7}
            >
              <Text style={[styles.showMoreText, { color: c.primary }]}>
                Show All ({filteredEvents.length})
              </Text>
            </TouchableOpacity>
          ) : null
        }
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.primary} />
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  filterBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    gap: spacing.sm,
  },
  filterLabel: { fontSize: fontSizes.xs, fontWeight: '600' },
  filterChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radii.full,
    borderWidth: 1.5,
  },
  filterChipText: { fontSize: fontSizes.xs },
  exportRow: {
    flexDirection: 'row',
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
    gap: spacing.sm,
  },
  exportBtn: {
    flex: 1,
    paddingVertical: spacing.sm + 2,
    borderRadius: radii.md,
    alignItems: 'center',
  },
  exportBtnText: { fontSize: fontSizes.sm, fontWeight: '700' },
  rangeHint: {
    fontSize: fontSizes.xs,
    textAlign: 'center',
    paddingVertical: spacing.xs,
  },
  list: { paddingHorizontal: spacing.xl, paddingTop: spacing.md, paddingBottom: spacing.xxxl },
  eventCard: {
    borderRadius: radii.md,
    padding: spacing.lg,
    marginBottom: spacing.md,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  eventHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  eventName: { fontSize: fontSizes.lg, fontWeight: '600', flex: 1 },
  statusBadge: { borderRadius: radii.full, paddingHorizontal: spacing.sm, paddingVertical: 2 },
  statusText: { fontSize: fontSizes.xs, fontWeight: '600', textTransform: 'capitalize' },
  eventDesc: { fontSize: fontSizes.sm, marginTop: spacing.xs },
  eventMeta: { flexDirection: 'row', alignItems: 'center', marginTop: spacing.sm, gap: spacing.sm },
  metaText: { fontSize: fontSizes.xs },
  empty: { alignItems: 'center', padding: spacing.xxxl },
  emptyIcon: { fontSize: 40, marginBottom: spacing.md },
  emptyTitle: { fontSize: fontSizes.lg, fontWeight: '600', marginBottom: spacing.sm },
  emptyDesc: { fontSize: fontSizes.sm, textAlign: 'center' },
  showMoreBtn: {
    borderWidth: 1.5,
    borderRadius: radii.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
    marginBottom: spacing.xl,
  },
  showMoreText: { fontSize: fontSizes.sm, fontWeight: '700' },
});
