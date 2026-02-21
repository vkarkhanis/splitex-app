import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  ScrollView,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { spacing, radii, fontSizes, CURRENCY_SYMBOLS } from '../theme';
import { useAuth } from '../context/AuthContext';
import { useTheme, THEME_NAMES } from '../context/ThemeContext';
import { api } from '../api';
import type { Event as SplitexEvent } from '@splitex/shared';

export default function DashboardScreen({ navigation }: any) {
  const { user, logout, tier } = useAuth();
  const { theme, themeName, setThemeName } = useTheme();
  const c = theme.colors;
  const [events, setEvents] = useState<SplitexEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const STATUS_COLORS: Record<string, string> = {
    active: c.success,
    payment: c.warning,
    settled: c.info,
    closed: c.muted,
  };

  const fetchEvents = useCallback(async () => {
    try {
      const { data } = await api.get<SplitexEvent[]>('/api/events');
      setEvents((data || []).filter((e: SplitexEvent) => e.status !== 'closed'));
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

  const renderEvent = ({ item }: { item: SplitexEvent }) => {
    const sym = CURRENCY_SYMBOLS[item.currency] || item.currency;
    return (
      <TouchableOpacity
        testID={`dashboard-event-card-${item.id}`}
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
      <View style={styles.topBar}>
        <View>
          <Text style={[styles.greeting, { color: c.text }]}>Hello, {user?.displayName || 'User'}</Text>
          <Text style={[styles.tierBadge, { color: c.primary }]}>{tier === 'pro' ? '⭐ Pro' : 'Free'}</Text>
        </View>
        <View style={styles.topRight}>
          <TouchableOpacity testID="dashboard-open-invitations" onPress={() => navigation.navigate('Invitations')}>
            <Text style={[styles.profileLink, { color: c.primary }]}>Invites</Text>
          </TouchableOpacity>
          <TouchableOpacity testID="dashboard-open-profile" onPress={() => navigation.navigate('Profile')}>
            <Text style={[styles.profileLink, { color: c.primary }]}>Profile</Text>
          </TouchableOpacity>
          <TouchableOpacity testID="dashboard-signout" onPress={logout}>
            <Text style={[styles.logoutText, { color: c.error }]}>Sign Out</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Theme Picker */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.themeRow} contentContainerStyle={styles.themeRowContent}>
        {THEME_NAMES.map(t => (
          <TouchableOpacity
            key={t.key}
            style={[
              styles.themeChip,
              { borderColor: c.border, backgroundColor: c.surface },
              themeName === t.key && { borderColor: c.primary, backgroundColor: c.primary + '15' },
            ]}
            onPress={() => setThemeName(t.key)}
          >
            <Text style={[
              styles.themeChipText,
              { color: c.text },
              themeName === t.key && { color: c.primary, fontWeight: '600' },
            ]}>{t.label}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <TouchableOpacity
        testID="dashboard-create-event-button"
        style={[styles.createButton, { backgroundColor: c.primary }]}
        onPress={() => navigation.navigate('CreateEvent')}
      >
        <Text style={styles.createButtonText}>+ Create Event</Text>
      </TouchableOpacity>

      <FlatList
        data={events}
        keyExtractor={(item) => item.id}
        renderItem={renderEvent}
        contentContainerStyle={events.length === 0 ? styles.center : styles.list}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={[styles.emptyTitle, { color: c.text }]}>No Events Yet</Text>
            <Text style={[styles.emptyDesc, { color: c.textSecondary }]}>Create your first event to start splitting expenses.</Text>
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
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: spacing.xl,
    paddingBottom: spacing.md,
  },
  greeting: { fontSize: fontSizes.xl, fontWeight: '700' },
  tierBadge: { fontSize: fontSizes.xs, fontWeight: '600', marginTop: 2 },
  topRight: { flexDirection: 'row', gap: spacing.lg, alignItems: 'center' },
  profileLink: { fontSize: fontSizes.sm, fontWeight: '600' },
  logoutText: { fontSize: fontSizes.sm, fontWeight: '600' },
  themeRow: { maxHeight: 44, marginBottom: spacing.md },
  themeRowContent: { paddingHorizontal: spacing.xl, gap: spacing.sm },
  themeChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radii.full,
    borderWidth: 1.5,
  },
  themeChipText: { fontSize: fontSizes.xs },
  createButton: {
    marginHorizontal: spacing.xl,
    marginBottom: spacing.lg,
    borderRadius: radii.md,
    padding: spacing.lg,
    alignItems: 'center',
  },
  createButtonText: { color: '#ffffff', fontSize: fontSizes.md, fontWeight: '600' },
  list: { paddingHorizontal: spacing.xl, paddingBottom: spacing.xxxl },
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
