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
import { spacing, radii, fontSizes, CURRENCY_SYMBOLS } from '../theme';
import { useTheme } from '../context/ThemeContext';
import { api } from '../api';
import type { Event as TraxettleEvent } from '@traxettle/shared';
import { toUserFriendlyError } from '../utils/errorMessages';

const INITIAL_COUNT = 5;

function formatDate(d: any): string {
  if (!d) return '';
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function ClosedEventsScreen({ navigation }: any) {
  const { theme } = useTheme();
  const c = theme.colors;

  const [closedEvents, setClosedEvents] = useState<TraxettleEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [emailing, setEmailing] = useState(false);

  const fetchEvents = useCallback(async () => {
    try {
      const { data } = await api.get<TraxettleEvent[]>('/api/events?filter=history&limit=5');
      setClosedEvents((data || []).slice(0, INITIAL_COUNT));
    } catch {
      setClosedEvents([]);
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

  const handleEmailHistory = async () => {
    setEmailing(true);
    try {
      await api.post('/api/events/history-email', {});
      Alert.alert('Email sent', 'Closed events from the last 3 months have been emailed to you.');
    } catch (err: any) {
      Alert.alert('Email failed', toUserFriendlyError(err));
    } finally {
      setEmailing(false);
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
      <View style={[styles.toolbar, { borderBottomColor: c.border }]}>
        <Text style={[styles.toolbarText, { color: c.textSecondary }]}>Showing latest 5 closed events</Text>
        <TouchableOpacity
          style={[styles.toolbarButton, { borderColor: c.primary, opacity: emailing ? 0.7 : 1 }]}
          onPress={handleEmailHistory}
          disabled={emailing}
        >
          <Text style={[styles.toolbarButtonText, { color: c.primary }]}>
            {emailing ? 'Emailing…' : 'Email last 3 months'}
          </Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={closedEvents}
        keyExtractor={(item) => item.id}
        renderItem={renderEvent}
        contentContainerStyle={closedEvents.length === 0 ? styles.center : styles.list}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyIcon}>📦</Text>
            <Text style={[styles.emptyTitle, { color: c.text }]}>No Closed Events</Text>
            <Text style={[styles.emptyDesc, { color: c.textSecondary }]}>
              Events you close will appear here.
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
  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
  },
  toolbarText: { fontSize: fontSizes.sm, fontWeight: '600' },
  toolbarButton: {
    borderWidth: 1,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  toolbarButtonText: { fontSize: fontSizes.sm, fontWeight: '700' },
  list: { padding: spacing.xl, paddingBottom: spacing.xxxl },
  eventCard: {
    borderRadius: radii.md,
    padding: spacing.lg,
    marginBottom: spacing.md,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 1,
  },
  eventHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.xs },
  eventName: { fontSize: fontSizes.lg, fontWeight: '600', flex: 1, marginRight: spacing.sm },
  statusBadge: { borderRadius: radii.full, paddingHorizontal: spacing.sm, paddingVertical: 2 },
  statusText: { fontSize: fontSizes.xs, fontWeight: '600', textTransform: 'capitalize' },
  eventDesc: { fontSize: fontSizes.sm, marginBottom: spacing.xs },
  eventMeta: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  metaText: { fontSize: fontSizes.xs },
  empty: { alignItems: 'center', padding: spacing.xxxl },
  emptyIcon: { fontSize: 40, marginBottom: spacing.md },
  emptyTitle: { fontSize: fontSizes.lg, fontWeight: '600', marginBottom: spacing.sm },
  emptyDesc: { fontSize: fontSizes.sm, textAlign: 'center' },
});
