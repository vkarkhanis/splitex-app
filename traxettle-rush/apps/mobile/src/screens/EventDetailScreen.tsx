import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  TextInput,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  Alert,
  Modal,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { File } from 'expo-file-system';
import { useSharedContent } from '../hooks/useSharedContent';
import { spacing, radii, fontSizes, CURRENCY_SYMBOLS } from '../theme';
import { useTheme } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';
import { api } from '../api';
import type {
  Event as TraxettleEvent,
  Expense,
  EventParticipant,
  Group,
  Settlement,
  Invitation,
  SettlementApproval,
} from '@traxettle/shared';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useEventSocket } from '../hooks/useSocket';

// ── Helpers ──

type ActiveTab = 'expenses' | 'participants' | 'groups' | 'invitations';
type SettlementPayResponse = Settlement;

// STATUS_DOT and STATUS_BADGE_COLOR are now derived inside the component from theme colors

function formatDate(d: any): string {
  if (!d) return '';
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

// ── Component ──

export default function EventDetailScreen({ route, navigation }: any) {
  const { eventId } = route.params;
  const { theme } = useTheme();
  const colors = theme.colors;
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const currentUserId = user?.userId || '';
  const { sharedContent, clearSharedContent } = useSharedContent();

  const STATUS_DOT: Record<string, string> = {
    pending: colors.warning,
    initiated: colors.info,
    failed: colors.error,
    completed: colors.success,
  };

  const STATUS_BADGE_COLOR: Record<string, string> = {
    active: colors.success,
    review: colors.warning,
    payment: colors.info,
    settled: colors.warning,
    closed: colors.muted,
    accepted: colors.success,
    pending: colors.warning,
    initiated: colors.info,
    failed: colors.error,
    declined: colors.error,
    expired: colors.muted,
  };

  // ── Core State ──
  const [event, setEvent] = useState<TraxettleEvent | null>(null);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [participants, setParticipants] = useState<EventParticipant[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [settlements, setSettlements] = useState<Settlement[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<ActiveTab>('expenses');

  // ── Modal State ──
  const [editEventModal, setEditEventModal] = useState(false);
  const [editEventForm, setEditEventForm] = useState({ name: '', description: '', type: 'event', currency: '', settlementCurrency: '', status: 'active' });
  const [editEventLoading, setEditEventLoading] = useState(false);

  const [inviteModal, setInviteModal] = useState(false);
  const [inviteForm, setInviteForm] = useState({ email: '', role: 'member', message: '' });
  const [inviteLoading, setInviteLoading] = useState(false);

  const [createGroupModal, setCreateGroupModal] = useState(false);
  const [groupForm, setGroupForm] = useState({ name: '', description: '', memberIds: [] as string[], payerUserId: '' });
  const [groupLoading, setGroupLoading] = useState(false);

  const [expenseDetailModal, setExpenseDetailModal] = useState(false);
  const [selectedExpense, setSelectedExpense] = useState<Expense | null>(null);

  const [editGroupModal, setEditGroupModal] = useState(false);
  const [editGroupId, setEditGroupId] = useState<string | null>(null);
  const [editGroupForm, setEditGroupForm] = useState({ name: '', description: '', memberIds: [] as string[], payerUserId: '' });
  const [editGroupLoading, setEditGroupLoading] = useState(false);

  const [settlementDetailsModal, setSettlementDetailsModal] = useState(false);
  const [markPaidModal, setMarkPaidModal] = useState(false);
  const [markPaidTarget, setMarkPaidTarget] = useState<Settlement | null>(null);
  const [markPaidReferenceId, setMarkPaidReferenceId] = useState('');
  const [markPaidProofUrl, setMarkPaidProofUrl] = useState('');
  const [markPaidNote, setMarkPaidNote] = useState('');
  const [markPaidLoading, setMarkPaidLoading] = useState(false);

  // Auto-attach shared screenshot when "I've Paid" modal opens
  useEffect(() => {
    if (markPaidModal && sharedContent && sharedContent.mimeType.startsWith('image/')) {
      setMarkPaidProofUrl(sharedContent.uri);
      Alert.alert(
        'Screenshot Attached',
        'The payment screenshot you shared has been attached as proof.',
        [{ text: 'OK' }]
      );
      clearSharedContent();
    }
  }, [markPaidModal, sharedContent, clearSharedContent]);
  const [proofUploading, setProofUploading] = useState(false);
  const [approveSettlementLoading, setApproveSettlementLoading] = useState(false);
  const [regenerateLoading, setRegenerateLoading] = useState(false);

  // ── Data Fetching ──
  const fetchAll = useCallback(async () => {
    try {
      const [eRes, expRes, pRes, gRes, sRes, iRes] = await Promise.all([
        api.get(`/api/events/${eventId}`),
        api.get(`/api/expenses/event/${eventId}`),
        api.get(`/api/events/${eventId}/participants`),
        api.get(`/api/groups/event/${eventId}`),
        api.get(`/api/settlements/event/${eventId}`).catch(() => ({ data: [] })),
        api.get(`/api/invitations/event/${eventId}`).catch(() => ({ data: [] })),
      ]);
      setEvent(eRes.data);
      setExpenses(expRes.data || []);
      setParticipants(pRes.data || []);
      setGroups(gRes.data || []);
      setSettlements(sRes.data || []);
      setInvitations(iRes.data || []);
      if (eRes.data) {
        setEditEventForm({
          name: eRes.data.name,
          description: eRes.data.description || '',
          type: eRes.data.type,
          currency: eRes.data.currency || '',
          settlementCurrency: eRes.data.settlementCurrency || '',
          status: eRes.data.status,
        });
      }
    } catch {
      Alert.alert('Error', 'Failed to load event details');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [eventId]);

  useFocusEffect(useCallback(() => { fetchAll(); }, [fetchAll]));

  // Real-time WebSocket updates
  useEventSocket(eventId, useCallback((type: string, _payload: any) => {
    if (type === 'event:deleted') {
      navigation.goBack();
      return;
    }
    // For all other events, just refetch everything
    fetchAll();
  }, [fetchAll, navigation]));

  // ── Derived State ──
  const isAdmin = participants.some(p => p.userId === currentUserId && p.role === 'admin');
  const currSym = event ? (CURRENCY_SYMBOLS[event.currency] || event.currency) : '$';

  const getUserName = useCallback((userId: string) => {
    const p = participants.find(pp => pp.userId === userId);
    return (p as any)?.displayName || (p as any)?.email || userId.slice(0, 8);
  }, [participants]);

  const getEntityName = useCallback((entityId: string, entityType: string) => {
    if (entityType === 'group') {
      const g = groups.find(gr => gr.id === entityId);
      return g ? g.name : entityId.slice(0, 8);
    }
    return getUserName(entityId);
  }, [groups, getUserName]);

  // Entity-aware calculations
  const myGroup = useMemo(() =>
    currentUserId ? groups.find(g => g.members.includes(currentUserId)) : null,
    [currentUserId, groups]
  );
  const myEntityId = myGroup ? myGroup.id : currentUserId;
  const myEntityMembers = myGroup ? myGroup.members : (currentUserId ? [currentUserId] : []);

  const visibleExpenses = useMemo(() => {
    if (!currentUserId) return expenses.filter(e => !e.isPrivate);
    return expenses.filter(exp => {
      if (exp.isPrivate) return myEntityMembers.includes(exp.paidBy);
      if (!myEntityId) return false;
      return exp.splits?.some((s: any) => s.entityId === myEntityId);
    });
  }, [expenses, currentUserId, myEntityId, myEntityMembers]);

  const myTotalExpense = useMemo(() => visibleExpenses.reduce((s, e) => s + e.amount, 0), [visibleExpenses]);
  const myTotalShared = useMemo(() => visibleExpenses.filter(e => !e.isPrivate).reduce((s, e) => s + e.amount, 0), [visibleExpenses]);
  const myYourShared = useMemo(() => {
    if (!currentUserId || !myEntityId) return 0;
    return visibleExpenses.reduce((sum, exp) => {
      if (exp.isPrivate) return sum;
      const mySplit = exp.splits?.find((s: any) => s.entityId === myEntityId);
      return sum + (mySplit?.amount || 0);
    }, 0);
  }, [visibleExpenses, currentUserId, myEntityId]);
  const myPrivateExpense = useMemo(() => visibleExpenses.filter(e => e.isPrivate).reduce((s, e) => s + e.amount, 0), [visibleExpenses]);

  // ── Event Actions ──
  const handleEditEvent = async () => {
    setEditEventLoading(true);
    try {
      await api.put(`/api/events/${eventId}`, editEventForm);
      setEditEventModal(false);
      fetchAll();
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to update event');
    } finally {
      setEditEventLoading(false);
    }
  };

  const handleDeleteEvent = () => {
    Alert.alert('Delete Event', `Are you sure you want to delete "${event?.name}"? This cannot be undone.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive', onPress: async () => {
          try {
            await api.delete(`/api/events/${eventId}`);
            navigation.goBack();
          } catch (err: any) {
            Alert.alert('Error', err.message || 'Failed to delete event');
          }
        },
      },
    ]);
  };

  const handleSettle = () => {
    Alert.alert('Settle Now', 'This will calculate how much each participant owes. Everyone will need to approve the settlement before payments begin. You can still edit expenses until all approvals are in.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Settle Now', onPress: async () => {
          try {
            await api.post(`/api/settlements/event/${eventId}/generate`, {});
            fetchAll();
          } catch (err: any) {
            Alert.alert('Error', err.message || 'Failed to generate settlement');
          }
        },
      },
    ]);
  };

  const handleApproveSettlement = async () => {
    setApproveSettlementLoading(true);
    try {
      const res = await api.post<{ approvals: Record<string, SettlementApproval>; allApproved: boolean }>(
        `/api/settlements/event/${eventId}/approve-settlement`, {}
      );
      if (res.data?.allApproved) {
        Alert.alert('All Approved', 'All participants have approved. Payments can now proceed.');
      } else {
        Alert.alert('Approved', 'Your approval has been recorded.');
      }
      fetchAll();
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to approve settlement');
    } finally {
      setApproveSettlementLoading(false);
    }
  };

  const handleRegenerateSettlement = async () => {
    setRegenerateLoading(true);
    try {
      await api.post(`/api/settlements/event/${eventId}/regenerate`, {});
      Alert.alert('Regenerated', 'Settlement plan has been recalculated.');
      fetchAll();
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to regenerate settlement');
    } finally {
      setRegenerateLoading(false);
    }
  };

  const handleCloseEvent = () => {
    Alert.alert('Close Event', 'Close this event? It will no longer appear on dashboards.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Close', onPress: async () => {
          try {
            await api.put(`/api/events/${eventId}`, { status: 'closed' });
            navigation.goBack();
          } catch (err: any) {
            Alert.alert('Error', err.message || 'Failed to close event');
          }
        },
      },
    ]);
  };

  // ── Settlement Actions ──
  const handlePay = async (settlement: Settlement) => {
    setMarkPaidTarget(settlement);
    setMarkPaidReferenceId('');
    setMarkPaidProofUrl('');
    setMarkPaidNote('');
    setMarkPaidModal(true);
  };

  const handleSubmitMarkPaid = async () => {
    if (!markPaidTarget) return;
    const referenceId = markPaidReferenceId.trim();
    const proofUrl = markPaidProofUrl.trim();
    // Reference ID is now optional
    setMarkPaidLoading(true);
    try {
      const settlementCurrency = markPaidTarget.settlementCurrency || markPaidTarget.currency;
      const isINR = settlementCurrency === 'INR';
      const paymentMode = isINR ? 'upi_or_netbanking' : 'international_transfer';
      const payload: Record<string, any> = {
        paymentMode,
        referenceId,
        note: markPaidNote.trim() || undefined,
      };
      if (proofUrl) payload.proofUrl = proofUrl;
      const res = await api.post<SettlementPayResponse>(`/api/settlements/${markPaidTarget.id}/pay`, payload);
      setSettlements(prev => prev.map(s => s.id === markPaidTarget.id ? { ...s, ...res.data } : s));
      setMarkPaidModal(false);
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to mark payment');
    } finally {
      setMarkPaidLoading(false);
    }
  };

  const handlePickAndUploadProof = async () => {
    if (!markPaidTarget) return;
    try {
      setProofUploading(true);
      let ImagePicker: any;
      try {
        ImagePicker = require('expo-image-picker');
      } catch {
        Alert.alert('Missing dependency', 'Install expo-image-picker to enable proof upload from gallery.');
        return;
      }

      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        Alert.alert('Permission needed', 'Please allow photo library access to upload proof.');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.8,
      });
      if (result.canceled || !result.assets?.[0]?.uri) return;

      const asset = result.assets[0];
      const file = new File(asset.uri);
      const base64 = await file.base64();

      const upload = await api.post<{ proofUrl: string }>(`/api/settlements/${markPaidTarget.id}/upload-proof`, {
        filename: asset.fileName || `proof-${Date.now()}.jpg`,
        contentType: asset.mimeType || 'image/jpeg',
        base64,
      });
      const proofUrl = upload.data?.proofUrl;
      if (!proofUrl) {
        Alert.alert('Upload failed', 'Could not get proof URL after upload.');
        return;
      }
      setMarkPaidProofUrl(proofUrl);
      Alert.alert('Proof uploaded', 'Proof attached successfully.');
    } catch (err: any) {
      Alert.alert('Upload failed', err.message || 'Unable to upload proof right now.');
    } finally {
      setProofUploading(false);
    }
  };

  const handleApprove = async (settlementId: string) => {
    try {
      await api.post(`/api/settlements/${settlementId}/approve`, {});
      fetchAll();
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to approve payment');
    }
  };

  const handlePayeeMarkPaid = async (settlementId: string) => {
    Alert.alert(
      'Mark As Paid?',
      'This will directly complete this settlement as if payment is already received.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Mark as Paid',
          onPress: async () => {
            try {
              await api.post(`/api/settlements/${settlementId}/mark-paid-by-payee`, {});
              fetchAll();
            } catch (err: any) {
              Alert.alert('Error', err.message || 'Failed to mark settlement as paid');
            }
          },
        },
      ],
    );
  };

  const handleReject = async (settlementId: string) => {
    Alert.alert('Reject Payment?', 'This will move the transaction back to Pending so the payer can re-submit.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Reject',
        style: 'destructive',
        onPress: async () => {
          try {
            await api.post(`/api/settlements/${settlementId}/reject`, {
              reason: 'Payment not received',
            });
            fetchAll();
          } catch (err: any) {
            Alert.alert('Error', err.message || 'Failed to reject payment');
          }
        },
      },
    ]);
  };

  // ── Expense Actions ──
  const handleDeleteExpense = (expenseId: string, title: string) => {
    Alert.alert('Delete Expense', `Delete "${title}"? This cannot be undone.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive', onPress: async () => {
          try {
            await api.delete(`/api/expenses/${expenseId}`);
            fetchAll();
          } catch (err: any) {
            Alert.alert('Error', err.message || 'Failed to delete expense');
          }
        },
      },
    ]);
  };

  // ── Invitation Actions ──
  const handleInvite = async () => {
    if (!inviteForm.email.trim()) return;
    setInviteLoading(true);
    try {
      await api.post('/api/invitations', {
        eventId,
        inviteeEmail: inviteForm.email.trim(),
        role: inviteForm.role,
        message: inviteForm.message.trim() || undefined,
      });
      setInviteModal(false);
      setInviteForm({ email: '', role: 'member', message: '' });
      fetchAll();
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to send invitation');
    } finally {
      setInviteLoading(false);
    }
  };

  const handleRevokeInvitation = (invitationId: string) => {
    Alert.alert('Revoke Invitation', 'Revoke this invitation?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Revoke', style: 'destructive', onPress: async () => {
          try {
            await api.delete(`/api/invitations/${invitationId}`);
            fetchAll();
          } catch (err: any) {
            Alert.alert('Error', err.message);
          }
        },
      },
    ]);
  };

  // ── Participant Actions ──
  const handleRemoveParticipant = (userId: string, name: string) => {
    Alert.alert('Remove Participant', `Remove ${name} from this event?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove', style: 'destructive', onPress: async () => {
          try {
            await api.delete(`/api/events/${eventId}/participants/${userId}`);
            fetchAll();
          } catch (err: any) {
            Alert.alert('Error', err.message);
          }
        },
      },
    ]);
  };

  // ── Group Actions ──
  const handleCreateGroup = async () => {
    if (!groupForm.name.trim() || groupForm.memberIds.length === 0) {
      Alert.alert('Error', 'Group name and at least one member are required.');
      return;
    }
    setGroupLoading(true);
    try {
      await api.post('/api/groups', {
        eventId,
        name: groupForm.name.trim(),
        description: groupForm.description.trim() || undefined,
        memberIds: groupForm.memberIds,
        payerUserId: groupForm.payerUserId || groupForm.memberIds[0],
      });
      setCreateGroupModal(false);
      setGroupForm({ name: '', description: '', memberIds: [], payerUserId: '' });
      fetchAll();
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to create group');
    } finally {
      setGroupLoading(false);
    }
  };

  const openEditGroup = (group: Group) => {
    setEditGroupId(group.id);
    setEditGroupForm({
      name: group.name,
      description: group.description || '',
      memberIds: [...group.members],
      payerUserId: group.payerUserId,
    });
    setEditGroupModal(true);
  };

  const handleEditGroup = async () => {
    if (!editGroupId || editGroupForm.memberIds.length === 0) return;
    setEditGroupLoading(true);
    try {
      await api.put(`/api/groups/${editGroupId}`, {
        name: editGroupForm.name.trim(),
        description: editGroupForm.description.trim() || undefined,
        memberIds: editGroupForm.memberIds,
        payerUserId: editGroupForm.payerUserId,
      });
      setEditGroupModal(false);
      setEditGroupId(null);
      fetchAll();
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to update group');
    } finally {
      setEditGroupLoading(false);
    }
  };

  const handleChangeParticipantRole = async (userId: string, newRole: 'admin' | 'member') => {
    try {
      await api.put(`/api/events/${eventId}/participants/${userId}/role`, { role: newRole });
      Alert.alert('Role Updated', `Participant ${newRole === 'admin' ? 'promoted to admin' : 'demoted to member'}.`);
      fetchAll();
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to update role');
    }
  };

  const handleDeleteGroup = (groupId: string, name: string) => {
    Alert.alert('Delete Group', `Delete "${name}"? This cannot be undone.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive', onPress: async () => {
          try {
            await api.delete(`/api/groups/${groupId}`);
            fetchAll();
          } catch (err: any) {
            Alert.alert('Error', err.message);
          }
        },
      },
    ]);
  };

  // ── Render Helpers ──
  const renderBadge = (status: string) => (
    <View style={[styles.badge, { backgroundColor: (STATUS_BADGE_COLOR[status] || colors.muted) + '20' }]}>
      <Text style={[styles.badgeText, { color: STATUS_BADGE_COLOR[status] || colors.muted }]}>{status}</Text>
    </View>
  );

  // ── Loading / Error ──
  if (loading) {
    return <View style={[styles.center, { backgroundColor: colors.background }]}><ActivityIndicator size="large" color={colors.primary} /></View>;
  }
  if (!event) {
    return <View style={[styles.center, { backgroundColor: colors.background }]}><Text style={{ color: colors.text }}>Event not found</Text></View>;
  }

  const completedCount = settlements.filter(s => s.status === 'completed').length;
  const settlementPct = settlements.length > 0 ? Math.round((completedCount / settlements.length) * 100) : 0;

  return (
    <>
    <FlatList
      style={[styles.container, { backgroundColor: colors.background }]}
      data={[]}
      renderItem={() => null}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchAll(); }} tintColor={colors.primary} />}
      ListHeaderComponent={
        <View style={styles.content}>
          {/* ── Event Header ── */}
          <View style={styles.eventInfo}>
            <View style={styles.eventHeaderRow}>
              <Text style={[styles.eventName, { color: colors.text }]} numberOfLines={2}>{event.name}</Text>
              {(event.status === 'active' || event.status === 'review') && isAdmin && (
                <View style={styles.headerActions}>
                    <TouchableOpacity testID="event-detail-edit-event" style={[styles.iconBtn, { borderColor: colors.border }]} onPress={() => setEditEventModal(true)}>
                    <Text style={[styles.iconBtnText, { color: colors.primary }]}>Edit</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.iconBtn, { borderColor: colors.error + '40' }]} onPress={handleDeleteEvent}>
                    <Text style={[styles.iconBtnText, { color: colors.error }]}>Delete</Text>
                  </TouchableOpacity>
                </View>
              )}
              {event.status === 'settled' && isAdmin && (
                <TouchableOpacity testID="event-detail-close-event" style={[styles.closeBtn, { backgroundColor: colors.primary }]} onPress={handleCloseEvent}>
                  <Text style={styles.closeBtnText}>Close Event</Text>
                </TouchableOpacity>
              )}
            </View>
            {event.description ? <Text style={[styles.eventDesc, { color: colors.textSecondary }]}>{event.description}</Text> : null}
            <View style={styles.metaRow}>
              {renderBadge(event.status)}
              <Text style={[styles.metaText, { color: colors.muted }]}>{event.type} · {event.currency}</Text>
              {event.settlementCurrency && event.settlementCurrency !== event.currency && (
                <Text style={[styles.fxBadge, { color: colors.info, backgroundColor: colors.infoBg }]}>FX → {event.settlementCurrency}</Text>
              )}
            </View>
          </View>

          {/* ── Summary Cards ── */}
          <View style={styles.summaryRow}>
            <View style={[styles.summaryCard, { backgroundColor: colors.surface, shadowColor: colors.black }]}>
              <Text style={[styles.summaryLabel, { color: colors.muted }]}>Total Expense</Text>
              <Text style={[styles.summaryValue, { color: colors.text }]}>{currSym}{myTotalExpense.toFixed(2)}</Text>
            </View>
            <View style={[styles.summaryCard, { backgroundColor: colors.surface, shadowColor: colors.black }]}>
              <Text style={[styles.summaryLabel, { color: colors.muted }]}>Total Shared</Text>
              <Text style={[styles.summaryValue, { color: colors.text }]}>{currSym}{myTotalShared.toFixed(2)}</Text>
            </View>
          </View>
          <View style={styles.summaryRow}>
            <View style={[styles.summaryCard, { backgroundColor: colors.surface, shadowColor: colors.black }]}>
              <Text style={[styles.summaryLabel, { color: colors.muted }]}>Your Shared</Text>
              <Text style={[styles.summaryValue, { color: colors.text }]}>{currSym}{myYourShared.toFixed(2)}</Text>
            </View>
            <View style={[styles.summaryCard, { backgroundColor: colors.surface, shadowColor: colors.black }]}>
              <Text style={[styles.summaryLabel, { color: colors.muted }]}>Private</Text>
              <Text style={[styles.summaryValue, { color: colors.text }]}>{currSym}{myPrivateExpense.toFixed(2)}</Text>
            </View>
          </View>

          {/* Settlement Details button — visible after first settlement generation */}
          {(event.status === 'review' || event.status === 'payment' || event.status === 'settled' || event.status === 'closed') && settlements.length > 0 && (
            <TouchableOpacity
              style={[styles.outlineBtn, { borderColor: colors.border, marginBottom: spacing.md, alignSelf: 'flex-start' }]}
              onPress={() => setSettlementDetailsModal(true)}
            >
              <Text style={[styles.outlineBtnText, { color: colors.primary }]}>Settlement Details</Text>
            </TouchableOpacity>
          )}

          {/* ── Settlement Review Section ── */}
          {event.status === 'review' && settlements.length > 0 && (() => {
            const approvals = (event as any).settlementApprovals as Record<string, SettlementApproval> | undefined;
            const isStale = (event as any).settlementStale === true;
            const approvalEntries = approvals ? Object.entries(approvals) : [];
            const approvedCount = approvalEntries.filter(([, a]) => a.approved).length;
            const totalEntities = approvalEntries.length;
            const approvalPct = totalEntities > 0 ? Math.round((approvedCount / totalEntities) * 100) : 0;
            return (
              <View style={styles.section}>
                <View style={styles.sectionHeaderRow}>
                  <Text style={[styles.sectionTitle, { color: colors.text }]}>Settlement Review</Text>
                  <Text style={[styles.progressText, { color: colors.muted }]}>{approvedCount}/{totalEntities} approved</Text>
                </View>
                <View style={[styles.progressBar, { backgroundColor: colors.border }]}>
                  <View style={[styles.progressFill, { width: `${approvalPct}%`, backgroundColor: colors.success }]} />
                </View>

                {isStale && (
                  <View style={{ padding: spacing.md, backgroundColor: colors.warning + '15', borderRadius: radii.sm, marginBottom: spacing.md }}>
                    <Text style={{ color: colors.warning, fontWeight: '600', marginBottom: spacing.xs }}>⚠ Expenses have changed</Text>
                    <Text style={{ color: colors.textSecondary, fontSize: fontSizes.sm, marginBottom: spacing.sm }}>Settlement needs to be regenerated before approvals can continue.</Text>
                    {isAdmin && (
                      <TouchableOpacity
                        style={[styles.smallBtn, { backgroundColor: colors.primary }]}
                        onPress={handleRegenerateSettlement}
                        disabled={regenerateLoading}
                      >
                        <Text style={styles.smallBtnText}>{regenerateLoading ? 'Regenerating...' : 'Regenerate Settlement'}</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                )}

                {/* Approval status */}
                {approvalEntries.map(([entityId, approval]) => (
                  <View key={entityId} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.xs, gap: spacing.sm }}>
                    <View style={[styles.dot, { backgroundColor: approval.approved ? colors.success : colors.warning }]} />
                    <Text style={[{ flex: 1, fontSize: fontSizes.sm, color: colors.text }]}>{approval.displayName || entityId}</Text>
                    {renderBadge(approval.approved ? 'completed' : 'pending')}
                  </View>
                ))}

                {/* Settlement transactions preview */}
                {settlements.filter(s => s.amount > 0.01).map(s => (
                  <View key={s.id} style={[styles.settlementCard, { backgroundColor: colors.surface, borderLeftColor: colors.primary }]}>
                    <View style={styles.settlementRow}>
                      <View style={[styles.dot, { backgroundColor: colors.warning }]} />
                      <Text style={[styles.settlementText, { color: colors.text }]} numberOfLines={1}>
                        {getEntityName(s.fromEntityId, s.fromEntityType)} → {getEntityName(s.toEntityId, s.toEntityType)}
                      </Text>
                      <Text style={[styles.settlementAmount, { color: colors.text }]}>{currSym}{s.amount.toFixed(2)}</Text>
                    </View>
                    {s.settlementAmount && s.settlementCurrency && s.settlementCurrency !== s.currency && (
                      <Text style={[styles.fxAmount, { color: colors.muted }]}>
                        ≈ {CURRENCY_SYMBOLS[s.settlementCurrency] || s.settlementCurrency}{s.settlementAmount.toFixed(2)}
                      </Text>
                    )}
                  </View>
                ))}

                {/* Approve button — only shown to users who can approve their own entity */}
                {(() => {
                  const myApproval = myEntityId && approvals ? approvals[myEntityId] : undefined;
                  const myEntityApproved = myApproval?.approved === true;
                  const canApprove = myEntityId && approvals && approvals[myEntityId] !== undefined && (
                    !myGroup || (myGroup.representative === currentUserId || myGroup.payerUserId === currentUserId)
                  );
                  return (
                    <>
                      {!isStale && canApprove && !myEntityApproved && (
                        <TouchableOpacity
                          style={[styles.primaryBtn, { backgroundColor: colors.primary, marginTop: spacing.md }]}
                          onPress={handleApproveSettlement}
                          disabled={approveSettlementLoading}
                        >
                          <Text style={styles.primaryBtnText}>{approveSettlementLoading ? 'Approving...' : 'Approve Settlement'}</Text>
                        </TouchableOpacity>
                      )}
                      {myEntityApproved && (
                        <View style={{ marginTop: spacing.md, paddingVertical: spacing.sm, paddingHorizontal: spacing.md, backgroundColor: colors.success + '15', borderRadius: radii.sm, alignSelf: 'flex-start' }}>
                          <Text style={{ color: colors.success, fontWeight: '600', fontSize: fontSizes.sm }}>✓ You have approved</Text>
                        </View>
                      )}
                    </>
                  );
                })()}
              </View>
            );
          })()}

          {/* ── Settlement Payment Section ── */}
          {(event.status === 'payment' || event.status === 'settled' || event.status === 'closed') && settlements.length > 0 && (
            <View style={styles.section}>
              <View style={styles.sectionHeaderRow}>
                <Text style={[styles.sectionTitle, { color: colors.text }]}>Settlements</Text>
                <Text style={[styles.progressText, { color: colors.muted }]}>{completedCount}/{settlements.length}</Text>
              </View>
              <View style={[styles.progressBar, { backgroundColor: colors.border }]}>
                <View style={[styles.progressFill, { width: `${settlementPct}%`, backgroundColor: colors.success }]} />
              </View>
              {settlements.map(s => {
                const settlementStatus = s.status as string;
                const isPayer = currentUserId === s.fromUserId;
                const isPayee = currentUserId === s.toUserId;
                const hasFx =
                  typeof s.settlementAmount === 'number' &&
                  !!s.settlementCurrency &&
                  s.settlementCurrency !== s.currency;
                const settlementSym = s.settlementCurrency
                  ? (CURRENCY_SYMBOLS[s.settlementCurrency] || s.settlementCurrency)
                  : '';
                const confirmLabel = hasFx
                  ? `Confirm ${settlementSym}${s.settlementAmount!.toFixed(2)}`
                  : 'Confirm';
                return (
                  <View key={s.id} style={[styles.settlementCard, { backgroundColor: colors.surface, borderLeftColor: colors.primary }]} testID={`event-detail-settlement-card-${s.id}`}>
                    <View style={styles.settlementRow}>
                      <View style={[styles.dot, { backgroundColor: STATUS_DOT[settlementStatus] || colors.muted }]} />
                      <Text style={[styles.settlementText, { color: colors.text }]} numberOfLines={1}>
                        {getEntityName(s.fromEntityId, s.fromEntityType)} → {getEntityName(s.toEntityId, s.toEntityType)}
                      </Text>
                      <Text style={[styles.settlementAmount, { color: colors.text }]}>{currSym}{s.amount.toFixed(2)}</Text>
                    </View>
                    {hasFx && (
                      <Text style={[styles.fxAmount, { color: colors.muted }]}>
                        Pay/Receive {settlementSym}{s.settlementAmount!.toFixed(2)}
                        {s.fxRate ? ` (FX ${s.currency}→${s.settlementCurrency} @ ${s.fxRate})` : ''}
                      </Text>
                    )}
                    <View style={styles.settlementActions}>
                      {(settlementStatus === 'pending' || settlementStatus === 'failed') && isPayer && (
                        <TouchableOpacity
                          testID={`event-detail-settlement-pay-${s.id}`}
                          style={[styles.smallBtn, { backgroundColor: colors.primary }]}
                          onPress={() => handlePay(s)}
                        >
                          <Text style={styles.smallBtnText}>{settlementStatus === 'pending' ? 'I\'ve Paid' : 'Mark Paid Again'}</Text>
                        </TouchableOpacity>
                      )}
                      {(settlementStatus === 'pending' || settlementStatus === 'failed') && isPayee && (
                        <TouchableOpacity
                          testID={`event-detail-settlement-payee-mark-paid-${s.id}`}
                          style={[styles.smallBtn, { backgroundColor: colors.success }]}
                          onPress={() => handlePayeeMarkPaid(s.id)}
                        >
                          <Text style={styles.smallBtnText}>Mark as Paid</Text>
                        </TouchableOpacity>
                      )}
                      {settlementStatus === 'initiated' && isPayee && (
                        <View style={styles.inlineBtnRow}>
                          <TouchableOpacity testID={`event-detail-settlement-confirm-${s.id}`} style={[styles.smallBtn, { backgroundColor: colors.primary }]} onPress={() => handleApprove(s.id)}>
                            <Text style={styles.smallBtnText}>{confirmLabel}</Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            testID={`event-detail-settlement-reject-${s.id}`}
                            style={[styles.smallBtnOutline, { borderColor: colors.error }]}
                            onPress={() => handleReject(s.id)}
                          >
                            <Text style={[styles.smallBtnOutlineText, { color: colors.error }]}>Reject</Text>
                          </TouchableOpacity>
                        </View>
                      )}
                      {settlementStatus === 'completed' && <Text style={[styles.doneText, { color: colors.success }]}>✓ Done</Text>}
                      {settlementStatus === 'failed' && !isPayer && renderBadge('failed')}
                      {settlementStatus === 'pending' && !isPayer && renderBadge('pending')}
                      {settlementStatus === 'initiated' && !isPayee && renderBadge('initiated')}
                    </View>
                  </View>
                );
              })}
            </View>
          )}

          {/* All balanced edge case */}
          {event.status === 'settled' && settlements.length === 0 && (
            <View style={[styles.section, styles.balancedCard, { backgroundColor: colors.successBg }]}>
              <Text style={[styles.balancedTitle, { color: colors.success }]}>All Balanced!</Text>
              <Text style={[styles.balancedDesc, { color: colors.textSecondary }]}>No payments needed — everyone is even.</Text>
              {isAdmin && (
                <TouchableOpacity style={[styles.closeBtn, { backgroundColor: colors.primary }]} onPress={handleCloseEvent}>
                  <Text style={styles.closeBtnText}>Close Event</Text>
                </TouchableOpacity>
              )}
            </View>
          )}

          {/* ── Tabs ── */}
          <View style={[styles.tabBar, { borderBottomColor: colors.border }]}>
            {(['expenses', 'participants', 'groups', 'invitations'] as ActiveTab[]).map(tab => (
              <TouchableOpacity
                key={tab}
                testID={`event-detail-tab-${tab}`}
                style={[styles.tab, activeTab === tab && [styles.tabActive, { borderBottomColor: colors.primary }]]}
                onPress={() => setActiveTab(tab)}
              >
                <Text style={[styles.tabText, { color: colors.muted }, activeTab === tab && [styles.tabTextActive, { color: colors.primary }]]}>
                  {tab === 'expenses' ? `Expenses (${visibleExpenses.length})`
                    : tab === 'participants' ? `Members (${participants.length})`
                    : tab === 'groups' ? `Groups (${groups.length})`
                    : `Invites (${invitations.length})`}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* ── Expenses Tab ── */}
          {activeTab === 'expenses' && (
            <View style={styles.tabContent}>
              {(event.status === 'active' || event.status === 'review') && (
                <View style={styles.tabActions}>
                  {isAdmin && event.status === 'active' && (
                    <TouchableOpacity testID="event-detail-settle-button" style={[styles.outlineBtn, { borderColor: colors.border }]} onPress={handleSettle}>
                      <Text style={[styles.outlineBtnText, { color: colors.text }]}>Settle Now</Text>
                    </TouchableOpacity>
                  )}
                  {isAdmin && event.status === 'review' && (event as any).settlementStale && (
                    <TouchableOpacity style={[styles.outlineBtn, { borderColor: colors.warning }]} onPress={handleRegenerateSettlement} disabled={regenerateLoading}>
                      <Text style={[styles.outlineBtnText, { color: colors.warning }]}>{regenerateLoading ? 'Regenerating...' : 'Regenerate'}</Text>
                    </TouchableOpacity>
                  )}
                  <TouchableOpacity
                    testID="event-detail-add-expense-button"
                    style={[styles.primaryBtn, { backgroundColor: colors.primary }]}
                    onPress={() => navigation.navigate('CreateExpense', { eventId, currency: event.currency })}
                  >
                    <Text style={styles.primaryBtnText}>+ Add Expense</Text>
                  </TouchableOpacity>
                </View>
              )}
              {visibleExpenses.length === 0 ? (
                <Text style={[styles.emptyText, { color: colors.muted }]}>No expenses yet.</Text>
              ) : (
                visibleExpenses.map(exp => (
                  <TouchableOpacity
                    key={exp.id}
                    style={[styles.listCard, { backgroundColor: colors.surface }]}
                    activeOpacity={0.7}
                    onPress={() => { setSelectedExpense(exp); setExpenseDetailModal(true); }}
                  >
                    <View style={{ flex: 1 }}>
                      <View style={styles.listCardHeader}>
                        <Text style={[styles.listCardTitle, { color: colors.text }]} numberOfLines={1}>{exp.title}</Text>
                        {exp.isPrivate && renderBadge('private')}
                      </View>
                      <Text style={[styles.listCardSub, { color: colors.muted }]}>
                        Paid by {getUserName(exp.paidBy)} · {exp.paidOnBehalfOf && Array.isArray(exp.paidOnBehalfOf) && exp.paidOnBehalfOf.length > 0 ? 'On Behalf' : exp.splitType.charAt(0).toUpperCase() + exp.splitType.slice(1)}
                      </Text>
                    </View>
                    <Text style={[styles.amountText, { color: colors.text }]}>{CURRENCY_SYMBOLS[exp.currency] || exp.currency}{exp.amount.toFixed(2)}</Text>
                    {(event.status === 'active' || event.status === 'review') && (currentUserId === exp.paidBy || isAdmin) && (
                      <View style={styles.inlineActions}>
                        <TouchableOpacity
                          style={[styles.tinyBtn, { borderColor: colors.border }]}
                          onPress={(e) => { e.stopPropagation(); navigation.navigate('EditExpense', { eventId, expenseId: exp.id, currency: event.currency }); }}
                        >
                          <Text style={[styles.tinyBtnText, { color: colors.primary }]}>Edit</Text>
                        </TouchableOpacity>
                        <TouchableOpacity onPress={(e) => { e.stopPropagation(); handleDeleteExpense(exp.id, exp.title); }}>
                          <Text style={[styles.deleteLinkText, { color: colors.error }]}>✕</Text>
                        </TouchableOpacity>
                      </View>
                    )}
                  </TouchableOpacity>
                ))
              )}
            </View>
          )}

          {/* ── Participants Tab ── */}
          {activeTab === 'participants' && (
            <View style={styles.tabContent}>
              {event.status === 'active' && (
                <View style={styles.tabActions}>
                  <TouchableOpacity testID="event-detail-open-invite-modal-participants" style={[styles.primaryBtn, { backgroundColor: colors.primary }]} onPress={() => setInviteModal(true)}>
                    <Text style={styles.primaryBtnText}>+ Invite</Text>
                  </TouchableOpacity>
                </View>
              )}
              {participants.length === 0 ? (
                <Text style={[styles.emptyText, { color: colors.muted }]}>No participants yet.</Text>
              ) : (
                participants.map(p => (
                  <View key={p.userId} style={[styles.listCard, { backgroundColor: colors.surface }, p.userId === currentUserId && [styles.highlightCard, { borderColor: colors.primary + '30' }]]}>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.listCardTitle, { color: colors.text }]}>
                        {(p as any).displayName || (p as any).email || p.userId}
                        {p.userId === currentUserId ? ' (You)' : ''}
                      </Text>
                      <Text style={[styles.listCardSub, { color: colors.muted }]}>
                        {p.role} · Joined {formatDate(p.joinedAt)}
                      </Text>
                    </View>
                    {renderBadge(p.status)}
                    {(event.status === 'active' || event.status === 'review') && isAdmin && p.userId !== currentUserId && p.userId !== event.createdBy && (
                      <View style={styles.inlineActions}>
                        {p.role === 'member' ? (
                          <TouchableOpacity style={[styles.tinyBtn, { borderColor: colors.border }]} onPress={() => handleChangeParticipantRole(p.userId, 'admin')}>
                            <Text style={[styles.tinyBtnText, { color: colors.primary }]}>Promote</Text>
                          </TouchableOpacity>
                        ) : (
                          <TouchableOpacity style={[styles.tinyBtn, { borderColor: colors.border }]} onPress={() => handleChangeParticipantRole(p.userId, 'member')}>
                            <Text style={[styles.tinyBtnText, { color: colors.warning }]}>Demote</Text>
                          </TouchableOpacity>
                        )}
                        <TouchableOpacity onPress={() => handleRemoveParticipant(p.userId, (p as any).displayName || p.userId)}>
                          <Text style={[styles.deleteLinkText, { color: colors.error }]}>✕</Text>
                        </TouchableOpacity>
                      </View>
                    )}
                  </View>
                ))
              )}
            </View>
          )}

          {/* ── Groups Tab ── */}
          {activeTab === 'groups' && (
            <View style={styles.tabContent}>
              {event.status === 'active' && (
                <View style={styles.tabActions}>
                  <TouchableOpacity testID="event-detail-open-create-group-modal" style={[styles.primaryBtn, { backgroundColor: colors.primary }]} onPress={() => setCreateGroupModal(true)}>
                    <Text style={styles.primaryBtnText}>+ Create Group</Text>
                  </TouchableOpacity>
                </View>
              )}
              {groups.length === 0 ? (
                <Text style={[styles.emptyText, { color: colors.muted }]}>No groups yet.</Text>
              ) : (
                groups.map(g => (
                  <View key={g.id} style={[styles.listCard, { backgroundColor: colors.surface }]}>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.listCardTitle, { color: colors.text }]}>{g.name}</Text>
                      <Text style={[styles.listCardSub, { color: colors.muted }]}>
                        {g.members.map(m => getUserName(m)).join(', ')} · Payer: {getUserName(g.payerUserId)}
                      </Text>
                    </View>
                    {(event.status === 'active' || event.status === 'review') && currentUserId && (currentUserId === g.createdBy || currentUserId === g.representative || isAdmin) && (
                      <View style={styles.inlineActions}>
                        <TouchableOpacity style={[styles.tinyBtn, { borderColor: colors.border }]} onPress={() => openEditGroup(g)}>
                          <Text style={[styles.tinyBtnText, { color: colors.primary }]}>Edit</Text>
                        </TouchableOpacity>
                        <TouchableOpacity onPress={() => handleDeleteGroup(g.id, g.name)}>
                          <Text style={[styles.deleteLinkText, { color: colors.error }]}>✕</Text>
                        </TouchableOpacity>
                      </View>
                    )}
                  </View>
                ))
              )}
            </View>
          )}

          {/* ── Invitations Tab ── */}
          {activeTab === 'invitations' && (
            <View style={styles.tabContent}>
              {event.status === 'active' && (
                <View style={styles.tabActions}>
                  <TouchableOpacity testID="event-detail-open-invite-modal-invitations" style={[styles.primaryBtn, { backgroundColor: colors.primary }]} onPress={() => setInviteModal(true)}>
                    <Text style={styles.primaryBtnText}>+ Send Invitation</Text>
                  </TouchableOpacity>
                </View>
              )}
              {invitations.length === 0 ? (
                <Text style={[styles.emptyText, { color: colors.muted }]}>No invitations sent.</Text>
              ) : (
                invitations.map(inv => (
                  <View key={inv.id} style={[styles.listCard, { backgroundColor: colors.surface }]}>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.listCardTitle, { color: colors.text }]}>{inv.inviteeEmail || inv.inviteePhone || 'Unknown'}</Text>
                      <Text style={[styles.listCardSub, { color: colors.muted }]}>
                        Role: {inv.role} · Sent {formatDate(inv.createdAt)}
                        {inv.message ? ` · "${inv.message}"` : ''}
                      </Text>
                    </View>
                    {renderBadge(inv.status)}
                    {event.status === 'active' && inv.status === 'pending' && (
                      <TouchableOpacity onPress={() => handleRevokeInvitation(inv.id)}>
                        <Text style={[styles.deleteLinkText, { color: colors.error }]}>Revoke</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                ))
              )}
            </View>
          )}
        </View>
      }
      ListFooterComponent={<View style={{ height: 60 }} />}
    />

    {/* ── Edit Event Modal ── */}
    <Modal visible={editEventModal} animationType="slide" transparent onRequestClose={() => setEditEventModal(false)}>
      <View style={styles.modalOverlay}>
        <View style={[styles.modalContent, { backgroundColor: colors.surface, paddingBottom: insets.bottom + spacing.xl }]}>
          <ScrollView>
            <Text style={[styles.modalTitle, { color: colors.text }]}>Edit Event</Text>
            <Text style={[styles.modalLabel, { color: colors.textSecondary }]}>Name</Text>
            <TextInput style={[styles.modalInput, { backgroundColor: colors.surfaceAlt, borderColor: colors.border, color: colors.text }]} value={editEventForm.name} onChangeText={v => setEditEventForm(f => ({ ...f, name: v }))} />
            <Text style={[styles.modalLabel, { color: colors.textSecondary }]}>Description</Text>
            <TextInput style={[styles.modalInput, { backgroundColor: colors.surfaceAlt, borderColor: colors.border, color: colors.text }]} value={editEventForm.description} onChangeText={v => setEditEventForm(f => ({ ...f, description: v }))} multiline />
            <Text style={[styles.modalLabel, { color: colors.textSecondary }]}>Type</Text>
            <View style={styles.modalChipRow}>
              {(['event', 'trip'] as const).map(t => (
                <TouchableOpacity key={t} style={[styles.modalChip, { borderColor: colors.border, backgroundColor: colors.surface }, editEventForm.type === t && { borderColor: colors.primary, backgroundColor: colors.primary + '15' }]} onPress={() => setEditEventForm(f => ({ ...f, type: t }))}>
                  <Text style={[styles.modalChipText, { color: colors.text }, editEventForm.type === t && { color: colors.primary, fontWeight: '600' }]}>{t}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <Text style={[styles.modalLabel, { color: colors.textSecondary }]}>Status</Text>
            <View style={styles.modalChipRow}>
              {(['active', 'settled', 'closed'] as const).map(s => (
                <TouchableOpacity key={s} style={[styles.modalChip, { borderColor: colors.border, backgroundColor: colors.surface }, editEventForm.status === s && { borderColor: colors.primary, backgroundColor: colors.primary + '15' }]} onPress={() => setEditEventForm(f => ({ ...f, status: s }))}>
                  <Text style={[styles.modalChipText, { color: colors.text }, editEventForm.status === s && { color: colors.primary, fontWeight: '600' }]}>{s}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <Text style={[styles.modalLabel, { color: colors.textSecondary }]}>Expense Currency</Text>
            <View style={styles.modalChipRow}>
              {Object.keys(CURRENCY_SYMBOLS).map(c => (
                <TouchableOpacity key={c} style={[styles.modalChip, { borderColor: colors.border, backgroundColor: colors.surface }, editEventForm.currency === c && { borderColor: colors.primary, backgroundColor: colors.primary + '15' }]} onPress={() => setEditEventForm(f => ({ ...f, currency: c }))}>
                  <Text style={[styles.modalChipText, { color: colors.text }, editEventForm.currency === c && { color: colors.primary, fontWeight: '600' }]}>{CURRENCY_SYMBOLS[c]} {c}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <Text style={[styles.modalLabel, { color: colors.textSecondary }]}>Settlement Currency <Text style={{ fontSize: fontSizes.xs, color: colors.muted }}>(Pro)</Text></Text>
            <View style={styles.modalChipRow}>
              <TouchableOpacity style={[styles.modalChip, { borderColor: colors.border, backgroundColor: colors.surface }, !editEventForm.settlementCurrency && { borderColor: colors.primary, backgroundColor: colors.primary + '15' }]} onPress={() => setEditEventForm(f => ({ ...f, settlementCurrency: '' }))}>
                <Text style={[styles.modalChipText, { color: colors.text }, !editEventForm.settlementCurrency && { color: colors.primary, fontWeight: '600' }]}>Same</Text>
              </TouchableOpacity>
              {Object.keys(CURRENCY_SYMBOLS).map(c => (
                <TouchableOpacity key={c} style={[styles.modalChip, { borderColor: colors.border, backgroundColor: colors.surface }, editEventForm.settlementCurrency === c && { borderColor: colors.primary, backgroundColor: colors.primary + '15' }]} onPress={() => setEditEventForm(f => ({ ...f, settlementCurrency: c }))}>
                  <Text style={[styles.modalChipText, { color: colors.text }, editEventForm.settlementCurrency === c && { color: colors.primary, fontWeight: '600' }]}>{CURRENCY_SYMBOLS[c]} {c}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <View style={styles.modalFooter}>
              <TouchableOpacity style={[styles.modalCancelBtn, { borderColor: colors.border }]} onPress={() => setEditEventModal(false)}>
                <Text style={[styles.modalCancelText, { color: colors.text }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.modalSubmitBtn, { backgroundColor: colors.primary }, editEventLoading && styles.modalSubmitDisabled]} onPress={handleEditEvent} disabled={editEventLoading}>
                <Text style={styles.modalSubmitText}>{editEventLoading ? 'Saving...' : 'Save'}</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>

    {/* ── Invite Modal ── */}
    <Modal visible={inviteModal} animationType="slide" transparent onRequestClose={() => setInviteModal(false)}>
      <KeyboardAvoidingView style={styles.modalOverlay} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <View style={[styles.modalContent, { backgroundColor: colors.surface, paddingBottom: insets.bottom + spacing.xl }]}>
          <ScrollView keyboardShouldPersistTaps="handled">
            <Text style={[styles.modalTitle, { color: colors.text }]}>Invite to Event</Text>
            <Text style={[styles.modalLabel, { color: colors.textSecondary }]}>Email Address</Text>
            <TextInput testID="event-detail-invite-email-input" style={[styles.modalInput, { backgroundColor: colors.surfaceAlt, borderColor: colors.border, color: colors.text }]} value={inviteForm.email} onChangeText={v => setInviteForm(f => ({ ...f, email: v }))} placeholder="friend@example.com" placeholderTextColor={colors.muted} keyboardType="email-address" autoCapitalize="none" autoCorrect={false} />
            <Text style={[styles.modalLabel, { color: colors.textSecondary }]}>Role</Text>
            <View style={styles.modalChipRow}>
              {(['member', 'admin'] as const).map(r => (
                <TouchableOpacity key={r} style={[styles.modalChip, { borderColor: colors.border, backgroundColor: colors.surface }, inviteForm.role === r && { borderColor: colors.primary, backgroundColor: colors.primary + '15' }]} onPress={() => setInviteForm(f => ({ ...f, role: r }))}>
                  <Text style={[styles.modalChipText, { color: colors.text }, inviteForm.role === r && { color: colors.primary, fontWeight: '600' }]}>{r}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <Text style={[styles.modalLabel, { color: colors.textSecondary }]}>Message (optional)</Text>
            <TextInput style={[styles.modalInput, { backgroundColor: colors.surfaceAlt, borderColor: colors.border, color: colors.text }]} value={inviteForm.message} onChangeText={v => setInviteForm(f => ({ ...f, message: v }))} placeholder="Join our event!" placeholderTextColor={colors.muted} multiline />
            <View style={styles.modalFooter}>
              <TouchableOpacity style={[styles.modalCancelBtn, { borderColor: colors.border }]} onPress={() => setInviteModal(false)}>
                <Text style={[styles.modalCancelText, { color: colors.text }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity testID="event-detail-invite-send-button" style={[styles.modalSubmitBtn, { backgroundColor: colors.primary }, (inviteLoading || !inviteForm.email.trim()) && styles.modalSubmitDisabled]} onPress={handleInvite} disabled={inviteLoading || !inviteForm.email.trim()}>
                <Text style={styles.modalSubmitText}>{inviteLoading ? 'Sending...' : 'Send'}</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>

    {/* ── Create Group Modal ── */}
    <Modal visible={createGroupModal} animationType="slide" transparent onRequestClose={() => setCreateGroupModal(false)}>
      <View style={styles.modalOverlay}>
        <View style={[styles.modalContent, { backgroundColor: colors.surface, paddingBottom: insets.bottom + spacing.xl }]}>
          <ScrollView>
            <Text style={[styles.modalTitle, { color: colors.text }]}>Create Group</Text>
            <Text style={[styles.modalLabel, { color: colors.textSecondary }]}>Group Name</Text>
            <TextInput style={[styles.modalInput, { backgroundColor: colors.surfaceAlt, borderColor: colors.border, color: colors.text }]} value={groupForm.name} onChangeText={v => setGroupForm(f => ({ ...f, name: v }))} placeholder="e.g. Family" placeholderTextColor={colors.muted} />
            <Text style={[styles.modalLabel, { color: colors.textSecondary }]}>Description (optional)</Text>
            <TextInput style={[styles.modalInput, { backgroundColor: colors.surfaceAlt, borderColor: colors.border, color: colors.text }]} value={groupForm.description} onChangeText={v => setGroupForm(f => ({ ...f, description: v }))} placeholder="Brief description..." placeholderTextColor={colors.muted} />
            <Text style={[styles.modalLabel, { color: colors.textSecondary }]}>Members</Text>
            {participants.map(p => {
              const checked = groupForm.memberIds.includes(p.userId);
              return (
                <TouchableOpacity key={p.userId} style={styles.memberItem} onPress={() => {
                  setGroupForm(f => {
                    const ids = checked ? f.memberIds.filter(id => id !== p.userId) : [...f.memberIds, p.userId];
                    const payer = ids.includes(f.payerUserId) ? f.payerUserId : '';
                    return { ...f, memberIds: ids, payerUserId: payer };
                  });
                }}>
                  <View style={[styles.checkbox, { borderColor: colors.border }, checked && { backgroundColor: colors.primary, borderColor: colors.primary }]}>
                    {checked && <Text style={[styles.checkmark, { color: colors.white }]}>✓</Text>}
                  </View>
                  <Text style={{ color: colors.text, fontSize: fontSizes.sm }}>
                    {(p as any).displayName || (p as any).email || p.userId}
                    {p.userId === currentUserId ? ' (You)' : ''}
                  </Text>
                </TouchableOpacity>
              );
            })}
            <Text style={[styles.modalLabel, { color: colors.textSecondary }]}>Payer</Text>
            <View style={styles.modalChipRow}>
              {participants.filter(p => groupForm.memberIds.includes(p.userId)).map(p => (
                <TouchableOpacity key={p.userId} style={[styles.modalChip, { borderColor: colors.border, backgroundColor: colors.surface }, groupForm.payerUserId === p.userId && { borderColor: colors.primary, backgroundColor: colors.primary + '15' }]} onPress={() => setGroupForm(f => ({ ...f, payerUserId: p.userId }))}>
                  <Text style={[styles.modalChipText, { color: colors.text }, groupForm.payerUserId === p.userId && { color: colors.primary, fontWeight: '600' }]}>
                    {(p as any).displayName || (p as any).email || p.userId.slice(0, 8)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <View style={styles.modalFooter}>
              <TouchableOpacity style={[styles.modalCancelBtn, { borderColor: colors.border }]} onPress={() => setCreateGroupModal(false)}>
                <Text style={[styles.modalCancelText, { color: colors.text }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.modalSubmitBtn, { backgroundColor: colors.primary }, (groupLoading || !groupForm.name.trim() || groupForm.memberIds.length === 0) && styles.modalSubmitDisabled]} onPress={handleCreateGroup} disabled={groupLoading || !groupForm.name.trim() || groupForm.memberIds.length === 0}>
                <Text style={styles.modalSubmitText}>{groupLoading ? 'Creating...' : 'Create'}</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>

    {/* ── Edit Group Modal ── */}
    <Modal visible={editGroupModal} animationType="slide" transparent onRequestClose={() => setEditGroupModal(false)}>
      <View style={styles.modalOverlay}>
        <View style={[styles.modalContent, { backgroundColor: colors.surface, paddingBottom: insets.bottom + spacing.xl }]}>
          <ScrollView>
            <Text style={[styles.modalTitle, { color: colors.text }]}>Edit Group</Text>
            <Text style={[styles.modalLabel, { color: colors.textSecondary }]}>Group Name</Text>
            <TextInput style={[styles.modalInput, { backgroundColor: colors.surfaceAlt, borderColor: colors.border, color: colors.text }]} value={editGroupForm.name} onChangeText={v => setEditGroupForm(f => ({ ...f, name: v }))} />
            <Text style={[styles.modalLabel, { color: colors.textSecondary }]}>Description (optional)</Text>
            <TextInput style={[styles.modalInput, { backgroundColor: colors.surfaceAlt, borderColor: colors.border, color: colors.text }]} value={editGroupForm.description} onChangeText={v => setEditGroupForm(f => ({ ...f, description: v }))} />
            <Text style={[styles.modalLabel, { color: colors.textSecondary }]}>Members</Text>
            {participants.map(p => {
              const checked = editGroupForm.memberIds.includes(p.userId);
              return (
                <TouchableOpacity key={p.userId} style={styles.memberItem} onPress={() => {
                  setEditGroupForm(f => {
                    const ids = checked ? f.memberIds.filter(id => id !== p.userId) : [...f.memberIds, p.userId];
                    const payer = ids.includes(f.payerUserId) ? f.payerUserId : '';
                    return { ...f, memberIds: ids, payerUserId: payer };
                  });
                }}>
                  <View style={[styles.checkbox, { borderColor: colors.border }, checked && { backgroundColor: colors.primary, borderColor: colors.primary }]}>
                    {checked && <Text style={[styles.checkmark, { color: colors.white }]}>✓</Text>}
                  </View>
                  <Text style={{ color: colors.text, fontSize: fontSizes.sm }}>
                    {(p as any).displayName || (p as any).email || p.userId}
                    {p.userId === currentUserId ? ' (You)' : ''}
                  </Text>
                </TouchableOpacity>
              );
            })}
            <Text style={[styles.modalLabel, { color: colors.textSecondary }]}>Payer</Text>
            <View style={styles.modalChipRow}>
              {participants.filter(p => editGroupForm.memberIds.includes(p.userId)).map(p => (
                <TouchableOpacity key={p.userId} style={[styles.modalChip, { borderColor: colors.border, backgroundColor: colors.surface }, editGroupForm.payerUserId === p.userId && { borderColor: colors.primary, backgroundColor: colors.primary + '15' }]} onPress={() => setEditGroupForm(f => ({ ...f, payerUserId: p.userId }))}>
                  <Text style={[styles.modalChipText, { color: colors.text }, editGroupForm.payerUserId === p.userId && { color: colors.primary, fontWeight: '600' }]}>
                    {(p as any).displayName || (p as any).email || p.userId.slice(0, 8)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <View style={styles.modalFooter}>
              <TouchableOpacity style={[styles.modalCancelBtn, { borderColor: colors.border }]} onPress={() => setEditGroupModal(false)}>
                <Text style={[styles.modalCancelText, { color: colors.text }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.modalSubmitBtn, { backgroundColor: colors.primary }, (editGroupLoading || editGroupForm.memberIds.length === 0) && styles.modalSubmitDisabled]} onPress={handleEditGroup} disabled={editGroupLoading || editGroupForm.memberIds.length === 0}>
                <Text style={styles.modalSubmitText}>{editGroupLoading ? 'Saving...' : 'Save'}</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>

    {/* ── Mark Paid Modal ── */}
    <Modal visible={markPaidModal} animationType="slide" transparent onRequestClose={() => setMarkPaidModal(false)}>
      <View style={styles.modalOverlay}>
        <View style={[styles.modalContent, { backgroundColor: colors.surface, paddingBottom: insets.bottom + spacing.xl }]}>
          <ScrollView>
            <Text style={[styles.modalTitle, { color: colors.text }]}>Mark Payment as Done</Text>
            {!!markPaidTarget && (
              <>
                <Text style={[styles.modalLabel, { color: colors.textSecondary }]}>Payee Methods</Text>
                {((markPaidTarget as any).payeePaymentMethods || []).length > 0 ? (
                  ((markPaidTarget as any).payeePaymentMethods || []).map((m: any, idx: number) => (
                    <View key={`${m.id || idx}`} style={[styles.pmCard, { borderColor: colors.border }]}>
                      <Text style={[styles.pmCardTitle, { color: colors.text }]}>{m.label} · {m.currency}</Text>
                      <Text style={[styles.pmCardMeta, { color: colors.muted }]}>{String(m.type || '').toUpperCase()}</Text>
                      <Text style={[styles.pmCardDetails, { color: colors.textSecondary }]}>{m.details}</Text>
                    </View>
                  ))
                ) : (
                  <Text style={[styles.emptyText, { color: colors.warning }]}>
                    Payee has not configured a method for this currency yet.
                  </Text>
                )}

                <Text style={[styles.modalLabel, { color: colors.textSecondary }]}>Reference ID (optional)</Text>
                <TextInput
                  style={[styles.modalInput, { borderColor: colors.border, color: colors.text, backgroundColor: colors.surfaceAlt }]}
                  value={markPaidReferenceId}
                  onChangeText={setMarkPaidReferenceId}
                  placeholder="UTR / txn ID / bank ref"
                  placeholderTextColor={colors.muted}
                />
                <Text style={[styles.modalLabel, { color: colors.textSecondary }]}>Proof (optional)</Text>
                {markPaidProofUrl ? (
                  <View style={[styles.proofAttachedBanner, { backgroundColor: colors.success + '18', borderColor: colors.success + '40' }]}>
                    <Text style={[styles.proofAttachedText, { color: colors.success }]}>
                      ✓ Screenshot attached as proof
                    </Text>
                    <TouchableOpacity onPress={() => setMarkPaidProofUrl('')}>
                      <Text style={{ color: colors.error, fontSize: 13 }}>Remove</Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  <TouchableOpacity
                    style={[styles.uploadProofBtn, { borderColor: colors.border }]}
                    onPress={handlePickAndUploadProof}
                    disabled={proofUploading}
                  >
                    <Text style={[styles.uploadProofBtnText, { color: colors.primary }]}>
                      {proofUploading ? 'Uploading Proof...' : 'Upload Proof Screenshot'}
                    </Text>
                  </TouchableOpacity>
                )}
                <Text style={[styles.modalLabel, { color: colors.textSecondary }]}>Note (optional)</Text>
                <TextInput
                  style={[styles.modalInput, styles.modalTextArea, { borderColor: colors.border, color: colors.text, backgroundColor: colors.surfaceAlt }]}
                  value={markPaidNote}
                  onChangeText={setMarkPaidNote}
                  placeholder="Any extra details for payee"
                  placeholderTextColor={colors.muted}
                  multiline
                />
              </>
            )}
            <View style={styles.modalFooter}>
              <TouchableOpacity style={[styles.modalCancelBtn, { borderColor: colors.border }]} onPress={() => setMarkPaidModal(false)} disabled={markPaidLoading}>
                <Text style={[styles.modalCancelText, { color: colors.text }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalSubmitBtn, { backgroundColor: colors.primary }, markPaidLoading && styles.modalSubmitDisabled]}
                onPress={handleSubmitMarkPaid}
                disabled={markPaidLoading}
              >
                <Text style={styles.modalSubmitText}>{markPaidLoading ? 'Submitting...' : 'I\'ve Paid'}</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>

    {/* ── Settlement Details Modal ── */}
    <Modal visible={settlementDetailsModal} animationType="slide" transparent onRequestClose={() => setSettlementDetailsModal(false)}>
      <View style={styles.modalOverlay}>
        <View style={[styles.modalContent, { backgroundColor: colors.surface, paddingBottom: insets.bottom + spacing.xl }]}>
          <ScrollView>
            <Text style={[styles.modalTitle, { color: colors.text }]}>Settlement Details</Text>

            {/* Status & Total */}
            <View style={[styles.expDetailMeta, { borderColor: colors.border }]}>
              <View style={styles.expDetailMetaRow}>
                <Text style={[styles.expDetailLabel, { color: colors.muted }]}>Status</Text>
                {renderBadge(event?.status || '')}
              </View>
              <View style={styles.expDetailMetaRow}>
                <Text style={[styles.expDetailLabel, { color: colors.muted }]}>Total</Text>
                <Text style={[styles.expDetailValue, { color: colors.text }]}>
                  {currSym}{settlements.filter(s => s.amount > 0.01).reduce((sum, s) => sum + s.amount, 0).toFixed(2)}
                </Text>
              </View>
              <View style={styles.expDetailMetaRow}>
                <Text style={[styles.expDetailLabel, { color: colors.muted }]}>Transactions</Text>
                <Text style={[styles.expDetailValue, { color: colors.text }]}>{settlements.filter(s => s.amount > 0.01).length}</Text>
              </View>
            </View>

            {/* Approvals */}
            {(() => {
              const approvals = (event as any)?.settlementApprovals as Record<string, SettlementApproval> | undefined;
              const approvalEntries = approvals ? Object.entries(approvals) : [];
              if (approvalEntries.length === 0) return null;
              return (
                <View style={{ marginBottom: spacing.md }}>
                  <Text style={[styles.expDetailSectionTitle, { color: colors.text }]}>Approvals</Text>
                  {approvalEntries.map(([entityId, approval]) => (
                    <View key={entityId} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.xs, gap: spacing.sm }}>
                      <View style={[styles.dot, { backgroundColor: approval.approved ? colors.success : colors.warning }]} />
                      <Text style={[{ flex: 1, fontSize: fontSizes.sm, color: colors.text }]}>{approval.displayName || entityId}</Text>
                      {renderBadge(approval.approved ? 'completed' : 'pending')}
                    </View>
                  ))}
                </View>
              );
            })()}

            {/* Transactions */}
            <Text style={[styles.expDetailSectionTitle, { color: colors.text }]}>Transactions</Text>
            {settlements.filter(s => s.amount > 0.01).length === 0 ? (
              <Text style={[styles.emptyText, { color: colors.muted }]}>No settlements — everyone is even.</Text>
            ) : (
              settlements.filter(s => s.amount > 0.01).map(s => {
                const displayAmt = s.settlementAmount && s.settlementCurrency && s.settlementCurrency !== s.currency
                  ? `${CURRENCY_SYMBOLS[s.settlementCurrency] || s.settlementCurrency}${s.settlementAmount.toFixed(2)}`
                  : `${currSym}${s.amount.toFixed(2)}`;
                return (
                  <View key={s.id} style={[styles.txHistoryCard, { borderColor: colors.border }]}>
                    <View style={[styles.expDetailSplitRow, { borderColor: colors.border }]}>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.expDetailSplitName, { color: colors.text }]}>
                          {getEntityName(s.fromEntityId, s.fromEntityType)} → {getEntityName(s.toEntityId, s.toEntityType)}
                        </Text>
                        <Text style={[{ fontSize: fontSizes.xs, color: colors.muted }]}>{s.status}</Text>
                      </View>
                      <Text style={[styles.expDetailSplitAmount, { color: colors.text }]}>{displayAmt}</Text>
                    </View>
                    <View style={styles.timelineWrap}>
                      <Text style={[styles.timelineTitle, { color: colors.textSecondary }]}>Timeline</Text>
                      {((s as any).auditTrail || []).length === 0 ? (
                        <Text style={[styles.timelineEmpty, { color: colors.muted }]}>No activity yet.</Text>
                      ) : (
                        ((s as any).auditTrail || []).map((entry: any, idx: number) => (
                          <View key={`${entry.id || idx}`} style={styles.timelineRow}>
                            <View style={[styles.timelineDot, { backgroundColor: colors.primary }]} />
                            <View style={{ flex: 1 }}>
                              <Text style={[styles.timelineAction, { color: colors.text }]}>
                                {entry.action?.replace(/_/g, ' ') || 'update'}
                              </Text>
                              <Text style={[styles.timelineMeta, { color: colors.muted }]}>
                                by {getUserName(entry.actorUserId || '')} · {formatDate(entry.createdAt)}
                              </Text>
                              {entry.referenceId && (
                                <Text style={[styles.timelineMeta, { color: colors.textSecondary }]}>Ref: {entry.referenceId}</Text>
                              )}
                              {entry.proofUrl && (
                                <Text style={[styles.timelineMeta, { color: colors.primary }]}>Proof: {entry.proofUrl}</Text>
                              )}
                              {entry.note && (
                                <Text style={[styles.timelineMeta, { color: colors.textSecondary }]}>{entry.note}</Text>
                              )}
                            </View>
                          </View>
                        ))
                      )}
                    </View>
                  </View>
                );
              })
            )}

            <View style={[styles.modalFooter, { marginTop: spacing.lg }]}>
              <TouchableOpacity
                style={[styles.modalSubmitBtn, { backgroundColor: colors.primary }]}
                onPress={() => setSettlementDetailsModal(false)}
              >
                <Text style={styles.modalSubmitText}>Close</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>

    {/* ── Expense Detail / Split Breakdown Modal ── */}
    <Modal visible={expenseDetailModal} animationType="slide" transparent onRequestClose={() => setExpenseDetailModal(false)}>
      <View style={styles.modalOverlay}>
        <View style={[styles.modalContent, { backgroundColor: colors.surface, paddingBottom: insets.bottom + spacing.xl }]}>
          <ScrollView>
            {selectedExpense && (
              <>
                <Text style={[styles.modalTitle, { color: colors.text }]}>{selectedExpense.title}</Text>
                {!!selectedExpense.description && (
                  <Text style={[{ color: colors.muted, fontSize: fontSizes.sm, marginBottom: spacing.md }]}>{selectedExpense.description}</Text>
                )}

                {/* Amount & Meta */}
                <View style={[styles.expDetailMeta, { borderColor: colors.border }]}>
                  <View style={styles.expDetailMetaRow}>
                    <Text style={[styles.expDetailLabel, { color: colors.muted }]}>Amount</Text>
                    <Text style={[styles.expDetailValue, { color: colors.text }]}>
                      {CURRENCY_SYMBOLS[selectedExpense.currency] || selectedExpense.currency}{selectedExpense.amount.toFixed(2)}
                    </Text>
                  </View>
                  <View style={styles.expDetailMetaRow}>
                    <Text style={[styles.expDetailLabel, { color: colors.muted }]}>Paid by</Text>
                    <Text style={[styles.expDetailValue, { color: colors.text }]}>{getUserName(selectedExpense.paidBy)}</Text>
                  </View>
                  <View style={styles.expDetailMetaRow}>
                    <Text style={[styles.expDetailLabel, { color: colors.muted }]}>Split type</Text>
                    <Text style={[styles.expDetailValue, { color: colors.primary }]}>
                      {selectedExpense.paidOnBehalfOf && Array.isArray(selectedExpense.paidOnBehalfOf) && selectedExpense.paidOnBehalfOf.length > 0 ? 'On Behalf' : selectedExpense.splitType.charAt(0).toUpperCase() + selectedExpense.splitType.slice(1)}
                    </Text>
                  </View>
                  {selectedExpense.isPrivate && (
                    <View style={styles.expDetailMetaRow}>
                      <Text style={[styles.expDetailLabel, { color: colors.muted }]}>Visibility</Text>
                      <Text style={[styles.expDetailValue, { color: colors.warning }]}>Private</Text>
                    </View>
                  )}
                </View>

                {/* Split Breakdown */}
                {selectedExpense.splits && selectedExpense.splits.length > 0 && (
                  <View style={{ marginTop: spacing.md }}>
                    <Text style={[styles.expDetailSectionTitle, { color: colors.text }]}>Split Breakdown</Text>
                    {selectedExpense.splits.map((split: any, idx: number) => {
                      const sym = CURRENCY_SYMBOLS[selectedExpense.currency] || selectedExpense.currency;
                      const pct = selectedExpense.amount > 0
                        ? ((split.amount / selectedExpense.amount) * 100).toFixed(1)
                        : '0.0';
                      return (
                        <View key={`${split.entityId}-${idx}`} style={[styles.expDetailSplitRow, { borderColor: colors.border }]}>
                          <View style={{ flex: 1 }}>
                            <Text style={[styles.expDetailSplitName, { color: colors.text }]}>
                              {getEntityName(split.entityId, split.entityType)}
                            </Text>
                            <Text style={[{ fontSize: fontSizes.xs, color: colors.muted }]}>
                              {split.entityType === 'group' ? '👥 Group' : '👤 User'}
                              {selectedExpense.splitType === 'ratio' && split.ratio != null ? ` · Ratio ${split.ratio}` : ''}
                              {` · ${pct}%`}
                            </Text>
                          </View>
                          <Text style={[styles.expDetailSplitAmount, { color: colors.text }]}>
                            {sym}{split.amount.toFixed(2)}
                          </Text>
                        </View>
                      );
                    })}
                  </View>
                )}

                {/* On Behalf Of */}
                {selectedExpense.paidOnBehalfOf && Array.isArray(selectedExpense.paidOnBehalfOf) && selectedExpense.paidOnBehalfOf.length > 0 && (
                  <View style={{ marginTop: spacing.md }}>
                    <Text style={[styles.expDetailSectionTitle, { color: colors.text }]}>Paid on Behalf of</Text>
                    {selectedExpense.paidOnBehalfOf.map((entry: any, idx: number) => (
                      <Text key={idx} style={[{ fontSize: fontSizes.sm, color: colors.muted, paddingVertical: spacing.xs }]}>
                        • {getEntityName(entry.entityId, entry.entityType)}
                      </Text>
                    ))}
                  </View>
                )}
              </>
            )}
            <View style={[styles.modalFooter, { marginTop: spacing.lg }]}>
              <TouchableOpacity
                style={[styles.modalSubmitBtn, { backgroundColor: colors.primary }]}
                onPress={() => setExpenseDetailModal(false)}
              >
                <Text style={styles.modalSubmitText}>Close</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  </>
  );
}

// ── Styles ──

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  content: { padding: spacing.lg },

  // Event Header
  eventInfo: { marginBottom: spacing.lg },
  eventHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  eventName: { fontSize: fontSizes.xxl, fontWeight: '700', flex: 1, marginRight: spacing.sm },
  eventDesc: { fontSize: fontSizes.sm, marginTop: spacing.xs },
  metaRow: { flexDirection: 'row', alignItems: 'center', marginTop: spacing.sm, gap: spacing.sm, flexWrap: 'wrap' },
  metaText: { fontSize: fontSizes.xs },
  fxBadge: {
    fontSize: fontSizes.xs,
    paddingHorizontal: spacing.sm, paddingVertical: 1, borderRadius: radii.sm, overflow: 'hidden',
  },
  headerActions: { flexDirection: 'row', gap: spacing.xs },
  iconBtn: {
    paddingHorizontal: spacing.sm, paddingVertical: spacing.xs,
    borderRadius: radii.sm, borderWidth: 1,
  },
  iconBtnText: { fontSize: fontSizes.xs, fontWeight: '600' },
  closeBtn: {
    borderRadius: radii.sm,
    paddingHorizontal: spacing.md, paddingVertical: spacing.xs,
  },
  closeBtnText: { color: '#ffffff', fontSize: fontSizes.xs, fontWeight: '600' },

  // Badge
  badge: { borderRadius: radii.full, paddingHorizontal: spacing.sm, paddingVertical: 2 },
  badgeText: { fontSize: fontSizes.xs, fontWeight: '600', textTransform: 'capitalize' },

  // Summary
  summaryRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.sm },
  summaryCard: {
    flex: 1, borderRadius: radii.md,
    padding: spacing.md, alignItems: 'center',
    shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 3, elevation: 1,
  },
  summaryLabel: { fontSize: fontSizes.xs, marginBottom: 2 },
  summaryValue: { fontSize: fontSizes.lg, fontWeight: '700' },

  // Settlement
  section: { marginBottom: spacing.lg, marginTop: spacing.sm },
  sectionHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.xs },
  sectionTitle: { fontSize: fontSizes.lg, fontWeight: '600' },
  progressText: { fontSize: fontSizes.xs },
  progressBar: { height: 4, borderRadius: 2, marginBottom: spacing.md },
  progressFill: { height: 4, borderRadius: 2 },
  settlementCard: {
    borderRadius: radii.sm, padding: spacing.md,
    marginBottom: spacing.sm, borderLeftWidth: 3,
  },
  settlementRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  dot: { width: 8, height: 8, borderRadius: 4 },
  settlementText: { flex: 1, fontSize: fontSizes.sm },
  settlementAmount: { fontSize: fontSizes.md, fontWeight: '700' },
  fxAmount: { fontSize: fontSizes.xs, marginTop: 2, marginLeft: spacing.lg },
  settlementActions: { flexDirection: 'row', marginTop: spacing.sm, gap: spacing.sm, alignItems: 'center' },
  inlineBtnRow: { flexDirection: 'row', gap: spacing.xs, alignItems: 'center' },
  smallBtn: { borderRadius: radii.sm, paddingHorizontal: spacing.md, paddingVertical: spacing.xs },
  smallBtnText: { color: '#ffffff', fontSize: fontSizes.xs, fontWeight: '600' },
  smallBtnOutline: { borderRadius: radii.sm, borderWidth: 1, paddingHorizontal: spacing.md, paddingVertical: spacing.xs },
  smallBtnOutlineText: { fontSize: fontSizes.xs, fontWeight: '600' },
  doneText: { fontSize: fontSizes.xs, fontWeight: '600' },
  balancedCard: { borderRadius: radii.md, padding: spacing.lg, alignItems: 'center' },
  balancedTitle: { fontSize: fontSizes.lg, fontWeight: '700', marginBottom: spacing.xs },
  balancedDesc: { fontSize: fontSizes.sm, marginBottom: spacing.md },

  // Tabs
  tabBar: { flexDirection: 'row', borderBottomWidth: 1, marginBottom: spacing.md, marginTop: spacing.sm },
  tab: { flex: 1, paddingVertical: spacing.sm, alignItems: 'center' },
  tabActive: { borderBottomWidth: 2 },
  tabText: { fontSize: fontSizes.xs, fontWeight: '500' },
  tabTextActive: { fontWeight: '600' },
  tabContent: { minHeight: 100 },
  tabActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: spacing.sm, marginBottom: spacing.md },

  // Buttons
  primaryBtn: { borderRadius: radii.sm, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, alignItems: 'center' },
  primaryBtnText: { color: '#ffffff', fontWeight: '600', fontSize: fontSizes.sm },
  outlineBtn: { borderWidth: 1, borderRadius: radii.sm, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, alignItems: 'center' },
  outlineBtnText: { fontWeight: '600', fontSize: fontSizes.sm },

  // List Cards
  listCard: {
    borderRadius: radii.sm, padding: spacing.md,
    marginBottom: spacing.sm, flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
  },
  highlightCard: { borderWidth: 1 },
  listCardHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  listCardTitle: { fontSize: fontSizes.md, fontWeight: '600' },
  listCardSub: { fontSize: fontSizes.xs, marginTop: 2 },
  amountText: { fontSize: fontSizes.md, fontWeight: '700' },
  inlineActions: { flexDirection: 'row', gap: spacing.xs, alignItems: 'center', marginLeft: spacing.xs },
  tinyBtn: { paddingHorizontal: spacing.sm, paddingVertical: 2, borderRadius: radii.sm, borderWidth: 1 },
  tinyBtnText: { fontSize: fontSizes.xs, fontWeight: '600' },
  deleteLinkText: { fontSize: fontSizes.sm, fontWeight: '600', paddingHorizontal: spacing.xs },
  emptyText: { fontSize: fontSizes.sm, textAlign: 'center', padding: spacing.xl },

  // Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalContent: { borderTopLeftRadius: radii.lg, borderTopRightRadius: radii.lg, padding: spacing.xl, maxHeight: '85%' },
  modalTitle: { fontSize: fontSizes.xl, fontWeight: '700', marginBottom: spacing.lg },
  modalLabel: { fontSize: fontSizes.sm, fontWeight: '600', marginBottom: spacing.xs, marginTop: spacing.md },
  modalInput: {
    borderRadius: radii.sm, borderWidth: 1,
    padding: spacing.md, fontSize: fontSizes.md,
  },
  modalTextArea: { minHeight: 72, textAlignVertical: 'top' as const },
  pmCard: { borderWidth: 1, borderRadius: radii.sm, padding: spacing.sm, marginBottom: spacing.sm },
  pmCardTitle: { fontSize: fontSizes.sm, fontWeight: '700' },
  pmCardMeta: { fontSize: fontSizes.xs, marginTop: 2 },
  pmCardDetails: { fontSize: fontSizes.xs, marginTop: 2 },
  uploadProofBtn: {
    borderWidth: 1,
    borderRadius: radii.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    alignItems: 'center',
    marginTop: spacing.sm,
  },
  uploadProofBtnText: { fontSize: fontSizes.sm, fontWeight: '600' },
  modalChipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  modalChip: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radii.full, borderWidth: 1.5 },
  modalChipText: { fontSize: fontSizes.sm },
  memberItem: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.sm },
  checkbox: { width: 22, height: 22, borderRadius: 4, borderWidth: 2, justifyContent: 'center', alignItems: 'center' },
  checkmark: { fontSize: 13, fontWeight: '700' },
  modalFooter: { flexDirection: 'row', justifyContent: 'flex-end', gap: spacing.sm, marginTop: spacing.xl },
  modalCancelBtn: { paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, borderRadius: radii.sm, borderWidth: 1 },
  modalCancelText: { fontWeight: '600', fontSize: fontSizes.sm },
  modalSubmitBtn: { paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, borderRadius: radii.sm },
  modalSubmitText: { color: '#ffffff', fontWeight: '600', fontSize: fontSizes.sm },
  modalSubmitDisabled: { opacity: 0.5 },

  // Expense Detail Modal
  expDetailMeta: {
    borderWidth: 1, borderRadius: radii.sm, padding: spacing.md, marginBottom: spacing.sm,
  },
  expDetailMetaRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: spacing.xs,
  },
  expDetailLabel: { fontSize: fontSizes.sm },
  expDetailValue: { fontSize: fontSizes.sm, fontWeight: '600' },
  expDetailSectionTitle: { fontSize: fontSizes.md, fontWeight: '700', marginBottom: spacing.sm },
  expDetailSplitRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: spacing.sm, borderBottomWidth: 1,
  },
  expDetailSplitName: { fontSize: fontSizes.sm, fontWeight: '600' },
  expDetailSplitAmount: { fontSize: fontSizes.md, fontWeight: '700' },
  txHistoryCard: { borderWidth: 1, borderRadius: radii.sm, marginBottom: spacing.sm, paddingHorizontal: spacing.sm },
  timelineWrap: { paddingVertical: spacing.xs, paddingBottom: spacing.sm },
  timelineTitle: { fontSize: fontSizes.xs, fontWeight: '700', marginBottom: spacing.xs },
  timelineRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.xs, marginBottom: spacing.xs },
  timelineDot: { width: 7, height: 7, borderRadius: 3.5, marginTop: 5 },
  timelineAction: { fontSize: fontSizes.xs, fontWeight: '600', textTransform: 'capitalize' },
  timelineMeta: { fontSize: fontSizes.xs, marginTop: 1 },
  timelineEmpty: { fontSize: fontSizes.xs },

  // Proof attached banner
  proofAttachedBanner: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    borderWidth: 1, borderRadius: radii.sm, padding: spacing.md, marginBottom: spacing.sm,
  },
  proofAttachedText: { fontSize: fontSizes.sm, fontWeight: '600' },
});
