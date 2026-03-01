import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { spacing, radii, fontSizes, CURRENCY_SYMBOLS } from '../theme';
import { useTheme } from '../context/ThemeContext';
import { api } from '../api';
import type { Event as TraxettleEvent } from '@traxettle/shared';

type Tab = 'active' | 'settled';

export default function AllEventsScreen({ navigation }: any) {
  const { theme } = useTheme();
  const c = theme.colors;

  const [events, setEvents] = useState<TraxettleEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [tab, setTab] = useState<Tab>('active');

  const STATUS_COLORS: Record<string, string> = {
    active: c.success,
    payment: c.warning,
    settled: c.info,
    closed: c.muted,
  };

  const fetchEvents = useCallback(async () => {
    try {
      const { data } = await api.get<TraxettleEvent[]>('/api/events');
      setEvents((data || []).filter((e: TraxettleEvent) => e.status !== 'closed'));
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

  const activeEvents = events
    .filter(e => e.status === 'active' || e.status === 'payment')
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  const settledEvents = events
    .filter(e => e.status === 'settled')
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  const displayedEvents = tab === 'active' ? activeEvents : settledEvents;

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
          <View style={[styles.statusBadge, { backgroundColor: (STATUS_COLORS[item.status] || c.muted) + '20' }]}>
            <Text style={[styles.statusText, { color: STATUS_COLORS[item.status] || c.muted }]}>
              {item.status}
            </Text>
          </View>
        </View>
        {item.description ? (
          <Text style={[styles.eventDesc, { color: c.textSecondary }]} numberOfLines={1}>{item.description}</Text>
        ) : null}
        <View style={styles.eventMeta}>
          <Text style={[styles.metaText, { color: c.muted }]}>{sym} · {item.type}</Text>
          {item.settlementCurrency && item.settlementCurrency !== item.currency && (
            <Text style={[styles.fxBadge, { color: c.info, backgroundColor: c.infoBg }]}>FX → {item.settlementCurrency}</Text>
          )}
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
      {/* Tab Bar */}
      <View style={[styles.tabBar, { borderBottomColor: c.border }]}>
        <TouchableOpacity
          style={[styles.tab, tab === 'active' && styles.tabActive, tab === 'active' && { borderBottomColor: c.primary }]}
          onPress={() => setTab('active')}
        >
          <Text style={[styles.tabText, { color: tab === 'active' ? c.primary : c.muted }]}>
            Active ({activeEvents.length})
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, tab === 'settled' && styles.tabActive, tab === 'settled' && { borderBottomColor: c.primary }]}
          onPress={() => setTab('settled')}
        >
          <Text style={[styles.tabText, { color: tab === 'settled' ? c.primary : c.muted }]}>
            Settled ({settledEvents.length})
          </Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={displayedEvents}
        keyExtractor={(item) => item.id}
        renderItem={renderEvent}
        contentContainerStyle={displayedEvents.length === 0 ? styles.center : styles.list}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={[styles.emptyTitle, { color: c.text }]}>
              {tab === 'active' ? 'No Active Events' : 'No Settled Events'}
            </Text>
            <Text style={[styles.emptyDesc, { color: c.textSecondary }]}>
              {tab === 'active'
                ? 'All your events have been settled or closed.'
                : 'No events have been settled yet.'}
            </Text>
          </View>
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
  tabBar: {
    flexDirection: 'row',
    borderBottomWidth: 1,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: spacing.md,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabActive: {},
  tabText: { fontSize: fontSizes.sm, fontWeight: '600' },
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
  fxBadge: {
    fontSize: fontSizes.xs,
    paddingHorizontal: spacing.sm,
    paddingVertical: 1,
    borderRadius: radii.sm,
    overflow: 'hidden',
  },
  empty: { alignItems: 'center', padding: spacing.xxxl },
  emptyTitle: { fontSize: fontSizes.lg, fontWeight: '600', marginBottom: spacing.sm },
  emptyDesc: { fontSize: fontSizes.sm, textAlign: 'center' },
});
