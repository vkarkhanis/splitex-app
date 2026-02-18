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
import { spacing, radii, fontSizes } from '../theme';
import { useTheme } from '../context/ThemeContext';
import { api } from '../api';

interface EnrichedInvitation {
  id: string;
  eventId: string;
  invitedBy: string;
  inviteeEmail?: string;
  inviteePhone?: string;
  inviteeUserId?: string;
  role: string;
  status: string;
  message?: string;
  groupId?: string;
  createdAt: string;
  eventName?: string;
  inviterName?: string;
}

const STATUS_COLOR: Record<string, string> = {
  pending: '#f59e0b',
  accepted: '#22c55e',
  declined: '#ef4444',
  expired: '#94a3b8',
};

function formatDate(d: any): string {
  if (!d) return '';
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function InvitationsScreen() {
  const { theme } = useTheme();
  const c = theme.colors;
  const [invitations, setInvitations] = useState<EnrichedInvitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const fetchInvitations = useCallback(async () => {
    try {
      const { data } = await api.get<EnrichedInvitation[]>('/api/invitations/my');
      setInvitations(data || []);
    } catch {
      // silently fail
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      fetchInvitations();
    }, [fetchInvitations])
  );

  const handleAccept = async (inv: EnrichedInvitation) => {
    setActionLoading(inv.id);
    try {
      await api.post(`/api/invitations/${inv.id}/accept`, {});
      Alert.alert('Accepted', `You've joined "${inv.eventName || 'the event'}".`);
      fetchInvitations();
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to accept invitation');
    } finally {
      setActionLoading(null);
    }
  };

  const handleDecline = (inv: EnrichedInvitation) => {
    Alert.alert('Decline Invitation', `Decline invitation to "${inv.eventName || 'this event'}"?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Decline', style: 'destructive', onPress: async () => {
          setActionLoading(inv.id);
          try {
            await api.post(`/api/invitations/${inv.id}/decline`, {});
            fetchInvitations();
          } catch (err: any) {
            Alert.alert('Error', err.message || 'Failed to decline invitation');
          } finally {
            setActionLoading(null);
          }
        },
      },
    ]);
  };

  const renderInvitation = ({ item }: { item: EnrichedInvitation }) => {
    const isPending = item.status === 'pending';
    const isLoading = actionLoading === item.id;
    const statusColor = STATUS_COLOR[item.status] || c.muted;

    return (
      <View style={[styles.card, { backgroundColor: c.surface }]}>
        <View style={styles.cardHeader}>
          <Text style={[styles.eventName, { color: c.text }]} numberOfLines={1}>
            {item.eventName || 'Unknown Event'}
          </Text>
          <View style={[styles.badge, { backgroundColor: statusColor + '20' }]}>
            <Text style={[styles.badgeText, { color: statusColor }]}>{item.status}</Text>
          </View>
        </View>
        <Text style={[styles.inviterText, { color: c.textSecondary }]}>
          Invited by {item.inviterName || 'someone'} · Role: {item.role}
        </Text>
        <Text style={[styles.dateText, { color: c.muted }]}>
          {formatDate(item.createdAt)}
          {item.message ? ` · "${item.message}"` : ''}
        </Text>

        {isPending && (
          <View style={styles.actions}>
            {isLoading ? (
              <ActivityIndicator color={c.primary} />
            ) : (
              <>
                <TouchableOpacity
                  style={[styles.acceptBtn, { backgroundColor: c.primary }]}
                  onPress={() => handleAccept(item)}
                >
                  <Text style={styles.acceptBtnText}>Accept</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.declineBtn, { borderColor: c.error }]}
                  onPress={() => handleDecline(item)}
                >
                  <Text style={[styles.declineBtnText, { color: c.error }]}>Decline</Text>
                </TouchableOpacity>
              </>
            )}
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
      <FlatList
        data={invitations}
        keyExtractor={(item) => item.id}
        renderItem={renderInvitation}
        contentContainerStyle={invitations.length === 0 ? styles.center : styles.list}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={[styles.emptyTitle, { color: c.text }]}>No Invitations</Text>
            <Text style={[styles.emptyDesc, { color: c.textSecondary }]}>
              You don't have any pending invitations.
            </Text>
          </View>
        }
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchInvitations(); }} tintColor={c.primary} />
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  list: { padding: spacing.xl, paddingBottom: spacing.xxxl },
  card: {
    borderRadius: radii.md,
    padding: spacing.lg,
    marginBottom: spacing.md,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 1,
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.xs },
  eventName: { fontSize: fontSizes.lg, fontWeight: '600', flex: 1, marginRight: spacing.sm },
  badge: { borderRadius: radii.full, paddingHorizontal: spacing.sm, paddingVertical: 2 },
  badgeText: { fontSize: fontSizes.xs, fontWeight: '600', textTransform: 'capitalize' },
  inviterText: { fontSize: fontSizes.sm, marginBottom: 2 },
  dateText: { fontSize: fontSizes.xs },
  actions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
  acceptBtn: {
    flex: 1, borderRadius: radii.sm, paddingVertical: spacing.sm, alignItems: 'center',
  },
  acceptBtnText: { color: '#ffffff', fontWeight: '600', fontSize: fontSizes.sm },
  declineBtn: {
    flex: 1, borderRadius: radii.sm, paddingVertical: spacing.sm, alignItems: 'center',
    borderWidth: 1.5,
  },
  declineBtnText: { fontWeight: '600', fontSize: fontSizes.sm },
  empty: { alignItems: 'center', padding: spacing.xxxl },
  emptyTitle: { fontSize: fontSizes.lg, fontWeight: '600', marginBottom: spacing.sm },
  emptyDesc: { fontSize: fontSizes.sm, textAlign: 'center' },
});
