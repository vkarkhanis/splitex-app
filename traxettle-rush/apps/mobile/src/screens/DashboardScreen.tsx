import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  Modal,
  Pressable,
  Alert,
  findNodeHandle,
  UIManager,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { spacing, radii, fontSizes, CURRENCY_SYMBOLS } from '../theme';
import { useAuth } from '../context/AuthContext';
import { useTheme, THEME_NAMES } from '../context/ThemeContext';
import { usePurchase } from '../context/PurchaseContext';
import { api } from '../api';
import type { Event as TraxettleEvent } from '@traxettle/shared';
import GuidedWalkthrough from '../components/GuidedWalkthrough';
import { hasCompletedWalkthrough, markWalkthroughCompleted } from '../services/onboarding';

type WalkthroughTargetKey = 'create' | 'menu' | 'events' | null;

export default function DashboardScreen({ navigation, route }: any) {
  const { user, logout, tier } = useAuth();
  const { theme, themeName, setThemeName } = useTheme();
  const c = theme.colors;
  const { isPro, priceString } = usePurchase();
  const [events, setEvents] = useState<TraxettleEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [menuVisible, setMenuVisible] = useState(false);
  const [unsettledSummary, setUnsettledSummary] = useState<{ pendingCount: number; eventCount: number } | null>(null);
  const [walkthroughVisible, setWalkthroughVisible] = useState(false);
  const [walkthroughStep, setWalkthroughStep] = useState(0);
  const [walkthroughRect, setWalkthroughRect] = useState<{ x: number; y: number; width: number; height: number } | null>(null);
  const createButtonRef = useRef<View | null>(null);
  const avatarRef = useRef<View | null>(null);
  const eventsRef = useRef<View | null>(null);

  const MAX_DASHBOARD_EVENTS = 5;
  const walkthroughSteps: Array<{ title: string; body: string; target: WalkthroughTargetKey; label?: string }> = [
    {
      title: 'Welcome to Traxettle',
      body: 'Traxettle helps you split bills, track group expenses, and settle shared trip, roommate, and event spending without messy spreadsheets.',
      target: null,
    },
    {
      title: 'Start with an event',
      body: 'Create an event for a trip, outing, household, or celebration. Once it exists, you can add expenses and split them with the group.',
      target: 'create',
      label: 'Create event',
    },
    {
      title: 'Open your quick menu',
      body: 'Tap your avatar to reach invitations, profile, closed events, help, and upgrades. This is also where you manage your account settings.',
      target: 'menu',
      label: 'Profile menu',
    },
    {
      title: 'Track active expenses here',
      body: 'Your latest active and settled events appear in this list so you can jump back in, review balances, and continue managing shared expenses.',
      target: 'events',
      label: 'Event list',
    },
    {
      title: 'You can revisit this anytime',
      body: 'If you skip now, you can reopen this walkthrough later from the Profile screen whenever you want a guided tour again.',
      target: null,
    },
  ];

  const dashboardEvents = useMemo(() => {
    const active = events
      .filter(e => e.status === 'active' || e.status === 'payment')
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    const settled = events
      .filter(e => e.status === 'settled')
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    const combined = [...active, ...settled];
    return combined.slice(0, MAX_DASHBOARD_EVENTS);
  }, [events]);

  const hasMore = events.length > MAX_DASHBOARD_EVENTS;

  const measureWalkthroughTarget = useCallback((key: WalkthroughTargetKey) => {
    const ref =
      key === 'create' ? createButtonRef.current :
      key === 'menu' ? avatarRef.current :
      key === 'events' ? eventsRef.current :
      null;

    if (!ref) {
      setWalkthroughRect(null);
      return;
    }

    const node = findNodeHandle(ref);
    if (!node) {
      setWalkthroughRect(null);
      return;
    }

    UIManager.measureInWindow(node, (x, y, width, height) => {
      if (!width || !height) {
        setWalkthroughRect(null);
        return;
      }
      setWalkthroughRect({ x, y, width, height });
    });
  }, []);

  const dismissWalkthrough = useCallback(async () => {
    setWalkthroughVisible(false);
    setWalkthroughRect(null);
    await markWalkthroughCompleted();
    if (route?.params?.startWalkthrough) {
      navigation.setParams({ startWalkthrough: undefined });
    }
  }, [navigation, route?.params?.startWalkthrough]);

  const advanceWalkthrough = useCallback(async () => {
    if (walkthroughStep >= walkthroughSteps.length - 1) {
      await dismissWalkthrough();
      return;
    }
    setWalkthroughStep((current) => current + 1);
  }, [dismissWalkthrough, walkthroughStep, walkthroughSteps.length]);

  useEffect(() => {
    if (!walkthroughVisible) return;
    const key = walkthroughSteps[walkthroughStep]?.target ?? null;
    const timer = setTimeout(() => measureWalkthroughTarget(key), 120);
    return () => clearTimeout(timer);
  }, [measureWalkthroughTarget, walkthroughStep, walkthroughSteps, walkthroughVisible, dashboardEvents.length, menuVisible]);

  useEffect(() => {
    let active = true;

    async function maybeStartWalkthrough() {
      if (!user) return;
      if (route?.params?.startWalkthrough) {
        if (!active) return;
        setWalkthroughStep(0);
        setWalkthroughVisible(true);
        return;
      }

      const completed = await hasCompletedWalkthrough();
      if (!active || completed) return;
      setWalkthroughStep(0);
      setWalkthroughVisible(true);
    }

    void maybeStartWalkthrough();
    return () => {
      active = false;
    };
  }, [route?.params?.startWalkthrough, user]);

  const initials = (user?.displayName || 'U')
    .split(/\s+/)
    .map(w => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  const handleSignOut = () => {
    setMenuVisible(false);
    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign Out', style: 'destructive', onPress: logout },
    ]);
  };

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

  const fetchUnsettledSummary = useCallback(async () => {
    try {
      const { data } = await api.get<{ pendingCount: number; eventCount: number }>('/api/settlements/unsettled-payments/summary');
      setUnsettledSummary(data || { pendingCount: 0, eventCount: 0 });
    } catch {
      setUnsettledSummary(null);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      fetchEvents();
      fetchUnsettledSummary();
    }, [fetchEvents, fetchUnsettledSummary])
  );

  const onRefresh = () => {
    setRefreshing(true);
    fetchEvents();
    fetchUnsettledSummary();
  };

  const renderEvent = ({ item }: { item: TraxettleEvent }) => {
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
        <View style={styles.topLeft}>
          <Text style={[styles.greeting, { color: c.text }]} numberOfLines={1}>Hello, {user?.displayName || 'User'}</Text>
          <Text style={[styles.tierBadge, { color: c.primary }]}>{isPro ? '⭐ Pro' : 'Free'}</Text>
        </View>
        <View ref={avatarRef} collapsable={false}>
          <TouchableOpacity
            testID="dashboard-avatar-menu"
            style={[styles.avatar, { backgroundColor: c.primary }]}
            onPress={() => setMenuVisible(true)}
            activeOpacity={0.7}
          >
            <Text style={styles.avatarText}>{initials}</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Profile Menu Dropdown */}
      <Modal
        visible={menuVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setMenuVisible(false)}
      >
        <Pressable style={styles.menuOverlay} onPress={() => setMenuVisible(false)}>
          <View style={[styles.menuCard, { backgroundColor: c.surface, shadowColor: c.black }]}>
            {/* User header */}
            <View style={[styles.menuHeader, { borderBottomColor: c.border }]}>
              <View style={[styles.menuAvatarLg, { backgroundColor: c.primary }]}>
                <Text style={styles.menuAvatarLgText}>{initials}</Text>
              </View>
              <View style={styles.menuHeaderText}>
                <Text style={[styles.menuName, { color: c.text }]} numberOfLines={1}>{user?.displayName || 'User'}</Text>
                <Text style={[styles.menuEmail, { color: c.muted }]} numberOfLines={1}>{user?.email || ''}</Text>
              </View>
            </View>

            {/* Menu Items */}
            <TouchableOpacity
              testID="menu-invitations"
              style={styles.menuItem}
              onPress={() => { setMenuVisible(false); navigation.navigate('Invitations'); }}
            >
              <Text style={styles.menuIcon}>📩</Text>
              <Text style={[styles.menuItemText, { color: c.text }]}>Invitations</Text>
            </TouchableOpacity>

            <TouchableOpacity
              testID="menu-profile"
              style={styles.menuItem}
              onPress={() => { setMenuVisible(false); navigation.navigate('Profile'); }}
            >
              <Text style={styles.menuIcon}>👤</Text>
              <Text style={[styles.menuItemText, { color: c.text }]}>Profile</Text>
            </TouchableOpacity>

            <TouchableOpacity
              testID="menu-closed-events"
              style={styles.menuItem}
              onPress={() => { setMenuVisible(false); navigation.navigate('ClosedEvents'); }}
            >
              <Text style={styles.menuIcon}>📦</Text>
              <Text style={[styles.menuItemText, { color: c.text }]}>Closed Events</Text>
            </TouchableOpacity>

            <TouchableOpacity
              testID="menu-help"
              style={styles.menuItem}
              onPress={() => { setMenuVisible(false); navigation.navigate('Help'); }}
            >
              <Text style={styles.menuIcon}>❓</Text>
              <Text style={[styles.menuItemText, { color: c.text }]}>Help & Features</Text>
            </TouchableOpacity>

            <TouchableOpacity
              testID="menu-analytics"
              style={styles.menuItem}
              onPress={() => {
                setMenuVisible(false);
                Alert.alert('Coming soon', 'Analytics will return in a future major release.');
              }}
            >
              <Text style={styles.menuIcon}>📊</Text>
              <Text style={[styles.menuItemText, { color: c.text }]}>Analytics (Coming soon)</Text>
            </TouchableOpacity>

            {!!unsettledSummary?.pendingCount && unsettledSummary.pendingCount > 0 && (
              <TouchableOpacity
                testID="menu-unsettled-payments"
                style={styles.menuItem}
                onPress={() => { setMenuVisible(false); navigation.navigate('UnsettledPayments'); }}
              >
                <Text style={styles.menuIcon}>💸</Text>
                <View style={styles.menuFlexRow}>
                  <Text style={[styles.menuItemText, { color: c.text }]}>Unsettled Payments</Text>
                  <View style={[styles.countBadge, { backgroundColor: c.warning + '20', borderColor: c.warning + '55' }]}>
                    <Text style={[styles.countBadgeText, { color: c.warning }]}>{unsettledSummary.pendingCount}</Text>
                  </View>
                </View>
              </TouchableOpacity>
            )}

            {!isPro && (
              <TouchableOpacity
                testID="menu-upgrade"
                style={styles.menuItem}
                onPress={() => { setMenuVisible(false); navigation.navigate('ProUpgrade'); }}
              >
                <Text style={styles.menuIcon}>⭐</Text>
                <Text style={[styles.menuItemText, { color: c.primary }]}>Upgrade to Pro</Text>
              </TouchableOpacity>
            )}

            <View style={[styles.menuDivider, { backgroundColor: c.border }]} />

            <TouchableOpacity
              testID="menu-signout"
              style={styles.menuItem}
              onPress={handleSignOut}
            >
              <Text style={styles.menuIcon}>🚪</Text>
              <Text style={[styles.menuItemText, { color: c.error }]}>Sign Out</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Modal>

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

      {!isPro && (
        <TouchableOpacity
          testID="dashboard-upgrade-pro-banner"
          style={[styles.proBanner, { backgroundColor: c.primary + '10', borderColor: c.primary + '25' }]}
          onPress={() => navigation.navigate('ProUpgrade')}
          activeOpacity={0.7}
        >
          <Text style={styles.proBannerEmoji}>⭐</Text>
          <Text style={[styles.proBannerText, { color: c.primary }]}>
            Upgrade to Pro — {priceString}/year
          </Text>
          <Text style={[styles.proBannerArrow, { color: c.primary }]}>›</Text>
        </TouchableOpacity>
      )}

      <View ref={createButtonRef} collapsable={false}>
        <TouchableOpacity
          testID="dashboard-create-event-button"
          style={[styles.createButton, { backgroundColor: c.primary }]}
          onPress={() => navigation.navigate('CreateEvent')}
        >
          <Text style={styles.createButtonText}>+ Create Event</Text>
        </TouchableOpacity>
      </View>

      <View ref={eventsRef} collapsable={false} style={styles.eventsWrap}>
        <FlatList
          data={dashboardEvents}
          keyExtractor={(item) => item.id}
          renderItem={renderEvent}
          contentContainerStyle={dashboardEvents.length === 0 ? styles.center : styles.list}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={[styles.emptyTitle, { color: c.text }]}>No Events Yet</Text>
              <Text style={[styles.emptyDesc, { color: c.textSecondary }]}>Create your first event to start splitting expenses.</Text>
            </View>
          }
          ListFooterComponent={
            hasMore ? (
              <TouchableOpacity
                testID="dashboard-show-more-events"
                style={[styles.showMoreBtn, { borderColor: c.primary }]}
                onPress={() => navigation.navigate('AllEvents')}
                activeOpacity={0.7}
              >
                <Text style={[styles.showMoreText, { color: c.primary }]}>Show More</Text>
              </TouchableOpacity>
            ) : null
          }
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.primary} />
          }
        />
      </View>

      <GuidedWalkthrough
        visible={walkthroughVisible}
        stepIndex={walkthroughStep}
        steps={walkthroughSteps}
        targetRect={walkthroughRect}
        colors={{
          background: c.background,
          surface: c.surface,
          text: c.text,
          textSecondary: c.textSecondary,
          border: c.border,
          primary: c.primary,
          black: c.black,
          white: c.white,
        }}
        onBack={() => setWalkthroughStep((current) => Math.max(0, current - 1))}
        onClose={() => { dismissWalkthrough().catch(() => {}); }}
        onNext={() => { advanceWalkthrough().catch(() => {}); }}
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
  topLeft: { flex: 1, marginRight: spacing.md },
  greeting: { fontSize: fontSizes.xl, fontWeight: '700' },
  tierBadge: { fontSize: fontSizes.xs, fontWeight: '600', marginTop: 2 },

  // Avatar button
  avatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: { color: '#ffffff', fontSize: fontSizes.md, fontWeight: '700' },

  // Menu overlay & card
  menuOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
    justifyContent: 'flex-start',
    alignItems: 'flex-end',
    paddingTop: 90,
    paddingRight: spacing.xl,
  },
  menuCard: {
    width: 260,
    borderRadius: radii.lg,
    paddingVertical: spacing.sm,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
  },
  menuHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    marginBottom: spacing.xs,
    gap: spacing.md,
  },
  menuAvatarLg: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  menuAvatarLgText: { color: '#ffffff', fontSize: fontSizes.md, fontWeight: '700' },
  menuHeaderText: { flex: 1 },
  menuName: { fontSize: fontSizes.md, fontWeight: '600' },
  menuEmail: { fontSize: fontSizes.xs, marginTop: 1 },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    gap: spacing.md,
  },
  menuIcon: { fontSize: 18, width: 24, textAlign: 'center' },
  menuItemText: { fontSize: fontSizes.md, fontWeight: '500' },
  menuFlexRow: { flex: 1, flexDirection: 'row', alignItems: 'center' },
  countBadge: {
    marginLeft: spacing.sm,
    borderWidth: 1,
    borderRadius: radii.full,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  countBadgeText: { fontSize: fontSizes.xs, fontWeight: '800' },
  menuDivider: { height: 1, marginHorizontal: spacing.lg, marginVertical: spacing.xs },
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
  eventsWrap: { flex: 1 },
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

  // Pro banner
  proBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: spacing.xl,
    marginBottom: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radii.md,
    borderWidth: 1,
    gap: spacing.sm,
  },
  proBannerEmoji: { fontSize: 18 },
  proBannerText: { flex: 1, fontSize: fontSizes.sm, fontWeight: '600' },
  proBannerArrow: { fontSize: 22, fontWeight: '300' },

  // Show More button
  showMoreBtn: {
    borderWidth: 1.5,
    borderRadius: radii.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
    marginBottom: spacing.xl,
  },
  showMoreText: { fontSize: fontSizes.sm, fontWeight: '700' },
});
