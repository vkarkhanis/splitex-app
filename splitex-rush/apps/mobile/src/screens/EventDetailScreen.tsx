import React, { useState, useCallback, useMemo, useRef } from 'react';
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
  Dimensions,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { colors, spacing, radii, fontSizes, CURRENCY_SYMBOLS } from '../theme';
import { useAuth } from '../context/AuthContext';
import { api } from '../api';
import type {
  Event as SplitexEvent,
  Expense,
  EventParticipant,
  Group,
  Settlement,
  Invitation,
} from '@splitex/shared';
import { useEventSocket } from '../hooks/useSocket';

// ── Helpers ──

type ActiveTab = 'expenses' | 'participants' | 'groups' | 'invitations';

const STATUS_DOT: Record<string, string> = {
  pending: colors.warning,
  initiated: colors.info,
  completed: colors.success,
};

const STATUS_BADGE_COLOR: Record<string, string> = {
  active: colors.success,
  payment: colors.info,
  settled: colors.warning,
  closed: colors.muted,
  accepted: colors.success,
  pending: colors.warning,
  declined: colors.error,
  expired: colors.muted,
};

function formatDate(d: any): string {
  if (!d) return '';
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

// ── Component ──

export default function EventDetailScreen({ route, navigation }: any) {
  const { eventId } = route.params;
  const { user } = useAuth();
  const currentUserId = user?.userId || '';

  // ── Core State ──
  const [event, setEvent] = useState<SplitexEvent | null>(null);
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
  const [editEventForm, setEditEventForm] = useState({ name: '', description: '', type: 'event', status: 'active' });
  const [editEventLoading, setEditEventLoading] = useState(false);

  const [inviteModal, setInviteModal] = useState(false);
  const [inviteForm, setInviteForm] = useState({ email: '', role: 'member', message: '' });
  const [inviteLoading, setInviteLoading] = useState(false);

  const [createGroupModal, setCreateGroupModal] = useState(false);
  const [groupForm, setGroupForm] = useState({ name: '', description: '', memberIds: [] as string[], payerUserId: '' });
  const [groupLoading, setGroupLoading] = useState(false);

  const [editGroupModal, setEditGroupModal] = useState(false);
  const [editGroupId, setEditGroupId] = useState<string | null>(null);
  const [editGroupForm, setEditGroupForm] = useState({ name: '', description: '', memberIds: [] as string[], payerUserId: '' });
  const [editGroupLoading, setEditGroupLoading] = useState(false);

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
    Alert.alert('Generate Settlement', 'This will lock the event for further edits while payments are processed.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Generate', onPress: async () => {
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
  const handlePay = async (settlementId: string) => {
    try {
      await api.post(`/api/settlements/${settlementId}/pay`, {});
      setSettlements(prev => prev.map(s => s.id === settlementId ? { ...s, status: 'initiated' as const } : s));
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to initiate payment');
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
    return <View style={styles.center}><ActivityIndicator size="large" color={colors.primary} /></View>;
  }
  if (!event) {
    return <View style={styles.center}><Text style={{ color: colors.text }}>Event not found</Text></View>;
  }

  const completedCount = settlements.filter(s => s.status === 'completed').length;
  const settlementPct = settlements.length > 0 ? Math.round((completedCount / settlements.length) * 100) : 0;

  return (
    <>
    <FlatList
      style={styles.container}
      data={[]}
      renderItem={() => null}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchAll(); }} tintColor={colors.primary} />}
      ListHeaderComponent={
        <View style={styles.content}>
          {/* ── Event Header ── */}
          <View style={styles.eventInfo}>
            <View style={styles.eventHeaderRow}>
              <Text style={styles.eventName} numberOfLines={2}>{event.name}</Text>
              {event.status === 'active' && isAdmin && (
                <View style={styles.headerActions}>
                  <TouchableOpacity style={styles.iconBtn} onPress={() => setEditEventModal(true)}>
                    <Text style={styles.iconBtnText}>Edit</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.iconBtn, styles.dangerBtn]} onPress={handleDeleteEvent}>
                    <Text style={[styles.iconBtnText, styles.dangerText]}>Delete</Text>
                  </TouchableOpacity>
                </View>
              )}
              {event.status === 'settled' && isAdmin && (
                <TouchableOpacity style={styles.closeBtn} onPress={handleCloseEvent}>
                  <Text style={styles.closeBtnText}>Close Event</Text>
                </TouchableOpacity>
              )}
            </View>
            {event.description ? <Text style={styles.eventDesc}>{event.description}</Text> : null}
            <View style={styles.metaRow}>
              {renderBadge(event.status)}
              <Text style={styles.metaText}>{event.type} · {event.currency}</Text>
              {event.settlementCurrency && event.settlementCurrency !== event.currency && (
                <Text style={styles.fxBadge}>FX → {event.settlementCurrency}</Text>
              )}
            </View>
          </View>

          {/* ── Summary Cards ── */}
          <View style={styles.summaryRow}>
            <View style={styles.summaryCard}>
              <Text style={styles.summaryLabel}>Total Expense</Text>
              <Text style={styles.summaryValue}>{currSym}{myTotalExpense.toFixed(2)}</Text>
            </View>
            <View style={styles.summaryCard}>
              <Text style={styles.summaryLabel}>Total Shared</Text>
              <Text style={styles.summaryValue}>{currSym}{myTotalShared.toFixed(2)}</Text>
            </View>
          </View>
          <View style={styles.summaryRow}>
            <View style={styles.summaryCard}>
              <Text style={styles.summaryLabel}>Your Shared</Text>
              <Text style={styles.summaryValue}>{currSym}{myYourShared.toFixed(2)}</Text>
            </View>
            <View style={styles.summaryCard}>
              <Text style={styles.summaryLabel}>Private</Text>
              <Text style={styles.summaryValue}>{currSym}{myPrivateExpense.toFixed(2)}</Text>
            </View>
          </View>

          {/* ── Settlement Section ── */}
          {(event.status === 'payment' || event.status === 'settled' || event.status === 'closed') && settlements.length > 0 && (
            <View style={styles.section}>
              <View style={styles.sectionHeaderRow}>
                <Text style={styles.sectionTitle}>Settlements</Text>
                <Text style={styles.progressText}>{completedCount}/{settlements.length}</Text>
              </View>
              <View style={styles.progressBar}>
                <View style={[styles.progressFill, { width: `${settlementPct}%` }]} />
              </View>
              {settlements.map(s => {
                const isPayer = currentUserId === s.fromUserId;
                const isPayee = currentUserId === s.toUserId;
                return (
                  <View key={s.id} style={styles.settlementCard}>
                    <View style={styles.settlementRow}>
                      <View style={[styles.dot, { backgroundColor: STATUS_DOT[s.status] || colors.muted }]} />
                      <Text style={styles.settlementText} numberOfLines={1}>
                        {getEntityName(s.fromEntityId, s.fromEntityType)} → {getEntityName(s.toEntityId, s.toEntityType)}
                      </Text>
                      <Text style={styles.settlementAmount}>{currSym}{s.amount.toFixed(2)}</Text>
                    </View>
                    {s.settlementAmount && s.settlementCurrency && s.settlementCurrency !== s.currency && (
                      <Text style={styles.fxAmount}>
                        ≈ {CURRENCY_SYMBOLS[s.settlementCurrency] || s.settlementCurrency}{s.settlementAmount.toFixed(2)}
                        {s.fxRate ? ` @${s.fxRate}` : ''}
                      </Text>
                    )}
                    <View style={styles.settlementActions}>
                      {s.status === 'pending' && isPayer && (
                        <TouchableOpacity style={styles.smallBtn} onPress={() => handlePay(s.id)}>
                          <Text style={styles.smallBtnText}>Pay</Text>
                        </TouchableOpacity>
                      )}
                      {s.status === 'initiated' && isPayee && (
                        <TouchableOpacity style={styles.smallBtn} onPress={() => handleApprove(s.id)}>
                          <Text style={styles.smallBtnText}>Confirm</Text>
                        </TouchableOpacity>
                      )}
                      {s.status === 'completed' && <Text style={styles.doneText}>✓ Done</Text>}
                      {s.status === 'pending' && !isPayer && renderBadge('pending')}
                      {s.status === 'initiated' && !isPayee && renderBadge('initiated')}
                    </View>
                  </View>
                );
              })}
            </View>
          )}

          {/* All balanced edge case */}
          {event.status === 'settled' && settlements.length === 0 && (
            <View style={[styles.section, styles.balancedCard]}>
              <Text style={styles.balancedTitle}>All Balanced!</Text>
              <Text style={styles.balancedDesc}>No payments needed — everyone is even.</Text>
              {isAdmin && (
                <TouchableOpacity style={styles.closeBtn} onPress={handleCloseEvent}>
                  <Text style={styles.closeBtnText}>Close Event</Text>
                </TouchableOpacity>
              )}
            </View>
          )}

          {/* ── Tabs ── */}
          <View style={styles.tabBar}>
            {(['expenses', 'participants', 'groups', 'invitations'] as ActiveTab[]).map(tab => (
              <TouchableOpacity
                key={tab}
                style={[styles.tab, activeTab === tab && styles.tabActive]}
                onPress={() => setActiveTab(tab)}
              >
                <Text style={[styles.tabText, activeTab === tab && styles.tabTextActive]}>
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
              {event.status === 'active' && (
                <View style={styles.tabActions}>
                  {isAdmin && (
                    <TouchableOpacity style={styles.outlineBtn} onPress={handleSettle}>
                      <Text style={styles.outlineBtnText}>Settle</Text>
                    </TouchableOpacity>
                  )}
                  <TouchableOpacity
                    style={styles.primaryBtn}
                    onPress={() => navigation.navigate('CreateExpense', { eventId, currency: event.currency })}
                  >
                    <Text style={styles.primaryBtnText}>+ Add Expense</Text>
                  </TouchableOpacity>
                </View>
              )}
              {visibleExpenses.length === 0 ? (
                <Text style={styles.emptyText}>No expenses yet.</Text>
              ) : (
                visibleExpenses.map(exp => (
                  <View key={exp.id} style={styles.listCard}>
                    <View style={{ flex: 1 }}>
                      <View style={styles.listCardHeader}>
                        <Text style={styles.listCardTitle} numberOfLines={1}>{exp.title}</Text>
                        {exp.isPrivate && renderBadge('private')}
                      </View>
                      <Text style={styles.listCardSub}>
                        Paid by {getUserName(exp.paidBy)} · {exp.splitType}
                        {exp.paidOnBehalfOf && Array.isArray(exp.paidOnBehalfOf) && exp.paidOnBehalfOf.length > 0 ? ' · On behalf of' : ''}
                      </Text>
                    </View>
                    <Text style={styles.amountText}>{CURRENCY_SYMBOLS[exp.currency] || exp.currency}{exp.amount.toFixed(2)}</Text>
                    {event.status === 'active' && (currentUserId === exp.paidBy || isAdmin) && (
                      <View style={styles.inlineActions}>
                        <TouchableOpacity
                          style={styles.tinyBtn}
                          onPress={() => navigation.navigate('EditExpense', { eventId, expenseId: exp.id, currency: event.currency })}
                        >
                          <Text style={styles.tinyBtnText}>Edit</Text>
                        </TouchableOpacity>
                        <TouchableOpacity onPress={() => handleDeleteExpense(exp.id, exp.title)}>
                          <Text style={styles.deleteLinkText}>✕</Text>
                        </TouchableOpacity>
                      </View>
                    )}
                  </View>
                ))
              )}
            </View>
          )}

          {/* ── Participants Tab ── */}
          {activeTab === 'participants' && (
            <View style={styles.tabContent}>
              {event.status === 'active' && (
                <View style={styles.tabActions}>
                  <TouchableOpacity style={styles.primaryBtn} onPress={() => setInviteModal(true)}>
                    <Text style={styles.primaryBtnText}>+ Invite</Text>
                  </TouchableOpacity>
                </View>
              )}
              {participants.length === 0 ? (
                <Text style={styles.emptyText}>No participants yet.</Text>
              ) : (
                participants.map(p => (
                  <View key={p.userId} style={[styles.listCard, p.userId === currentUserId && styles.highlightCard]}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.listCardTitle}>
                        {(p as any).displayName || (p as any).email || p.userId}
                        {p.userId === currentUserId ? ' (You)' : ''}
                      </Text>
                      <Text style={styles.listCardSub}>
                        {p.role} · Joined {formatDate(p.joinedAt)}
                      </Text>
                    </View>
                    {renderBadge(p.status)}
                    {event.status === 'active' && p.role !== 'admin' && p.userId !== currentUserId && isAdmin && (
                      <TouchableOpacity onPress={() => handleRemoveParticipant(p.userId, (p as any).displayName || p.userId)}>
                        <Text style={styles.deleteLinkText}>✕</Text>
                      </TouchableOpacity>
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
                  <TouchableOpacity style={styles.primaryBtn} onPress={() => setCreateGroupModal(true)}>
                    <Text style={styles.primaryBtnText}>+ Create Group</Text>
                  </TouchableOpacity>
                </View>
              )}
              {groups.length === 0 ? (
                <Text style={styles.emptyText}>No groups yet.</Text>
              ) : (
                groups.map(g => (
                  <View key={g.id} style={styles.listCard}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.listCardTitle}>{g.name}</Text>
                      <Text style={styles.listCardSub}>
                        {g.members.map(m => getUserName(m)).join(', ')} · Payer: {getUserName(g.payerUserId)}
                      </Text>
                    </View>
                    {event.status === 'active' && currentUserId && (currentUserId === g.createdBy || currentUserId === g.representative) && (
                      <View style={styles.inlineActions}>
                        <TouchableOpacity style={styles.tinyBtn} onPress={() => openEditGroup(g)}>
                          <Text style={styles.tinyBtnText}>Edit</Text>
                        </TouchableOpacity>
                        <TouchableOpacity onPress={() => handleDeleteGroup(g.id, g.name)}>
                          <Text style={styles.deleteLinkText}>✕</Text>
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
                  <TouchableOpacity style={styles.primaryBtn} onPress={() => setInviteModal(true)}>
                    <Text style={styles.primaryBtnText}>+ Send Invitation</Text>
                  </TouchableOpacity>
                </View>
              )}
              {invitations.length === 0 ? (
                <Text style={styles.emptyText}>No invitations sent.</Text>
              ) : (
                invitations.map(inv => (
                  <View key={inv.id} style={styles.listCard}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.listCardTitle}>{inv.inviteeEmail || inv.inviteePhone || 'Unknown'}</Text>
                      <Text style={styles.listCardSub}>
                        Role: {inv.role} · Sent {formatDate(inv.createdAt)}
                        {inv.message ? ` · "${inv.message}"` : ''}
                      </Text>
                    </View>
                    {renderBadge(inv.status)}
                    {event.status === 'active' && inv.status === 'pending' && (
                      <TouchableOpacity onPress={() => handleRevokeInvitation(inv.id)}>
                        <Text style={styles.deleteLinkText}>Revoke</Text>
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
        <View style={styles.modalContent}>
          <ScrollView>
            <Text style={styles.modalTitle}>Edit Event</Text>
            <Text style={styles.modalLabel}>Name</Text>
            <TextInput style={styles.modalInput} value={editEventForm.name} onChangeText={v => setEditEventForm(f => ({ ...f, name: v }))} />
            <Text style={styles.modalLabel}>Description</Text>
            <TextInput style={styles.modalInput} value={editEventForm.description} onChangeText={v => setEditEventForm(f => ({ ...f, description: v }))} multiline />
            <Text style={styles.modalLabel}>Type</Text>
            <View style={styles.modalChipRow}>
              {(['event', 'trip'] as const).map(t => (
                <TouchableOpacity key={t} style={[styles.modalChip, editEventForm.type === t && styles.modalChipActive]} onPress={() => setEditEventForm(f => ({ ...f, type: t }))}>
                  <Text style={[styles.modalChipText, editEventForm.type === t && styles.modalChipTextActive]}>{t}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <Text style={styles.modalLabel}>Status</Text>
            <View style={styles.modalChipRow}>
              {(['active', 'settled', 'closed'] as const).map(s => (
                <TouchableOpacity key={s} style={[styles.modalChip, editEventForm.status === s && styles.modalChipActive]} onPress={() => setEditEventForm(f => ({ ...f, status: s }))}>
                  <Text style={[styles.modalChipText, editEventForm.status === s && styles.modalChipTextActive]}>{s}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <View style={styles.modalFooter}>
              <TouchableOpacity style={styles.modalCancelBtn} onPress={() => setEditEventModal(false)}>
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.modalSubmitBtn, editEventLoading && styles.modalSubmitDisabled]} onPress={handleEditEvent} disabled={editEventLoading}>
                <Text style={styles.modalSubmitText}>{editEventLoading ? 'Saving...' : 'Save'}</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>

    {/* ── Invite Modal ── */}
    <Modal visible={inviteModal} animationType="slide" transparent onRequestClose={() => setInviteModal(false)}>
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          <ScrollView>
            <Text style={styles.modalTitle}>Invite to Event</Text>
            <Text style={styles.modalLabel}>Email Address</Text>
            <TextInput style={styles.modalInput} value={inviteForm.email} onChangeText={v => setInviteForm(f => ({ ...f, email: v }))} placeholder="friend@example.com" placeholderTextColor={colors.muted} keyboardType="email-address" autoCapitalize="none" />
            <Text style={styles.modalLabel}>Role</Text>
            <View style={styles.modalChipRow}>
              {(['member', 'admin'] as const).map(r => (
                <TouchableOpacity key={r} style={[styles.modalChip, inviteForm.role === r && styles.modalChipActive]} onPress={() => setInviteForm(f => ({ ...f, role: r }))}>
                  <Text style={[styles.modalChipText, inviteForm.role === r && styles.modalChipTextActive]}>{r}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <Text style={styles.modalLabel}>Message (optional)</Text>
            <TextInput style={styles.modalInput} value={inviteForm.message} onChangeText={v => setInviteForm(f => ({ ...f, message: v }))} placeholder="Join our event!" placeholderTextColor={colors.muted} multiline />
            <View style={styles.modalFooter}>
              <TouchableOpacity style={styles.modalCancelBtn} onPress={() => setInviteModal(false)}>
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.modalSubmitBtn, (inviteLoading || !inviteForm.email.trim()) && styles.modalSubmitDisabled]} onPress={handleInvite} disabled={inviteLoading || !inviteForm.email.trim()}>
                <Text style={styles.modalSubmitText}>{inviteLoading ? 'Sending...' : 'Send'}</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>

    {/* ── Create Group Modal ── */}
    <Modal visible={createGroupModal} animationType="slide" transparent onRequestClose={() => setCreateGroupModal(false)}>
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          <ScrollView>
            <Text style={styles.modalTitle}>Create Group</Text>
            <Text style={styles.modalLabel}>Group Name</Text>
            <TextInput style={styles.modalInput} value={groupForm.name} onChangeText={v => setGroupForm(f => ({ ...f, name: v }))} placeholder="e.g. Family" placeholderTextColor={colors.muted} />
            <Text style={styles.modalLabel}>Description (optional)</Text>
            <TextInput style={styles.modalInput} value={groupForm.description} onChangeText={v => setGroupForm(f => ({ ...f, description: v }))} placeholder="Brief description..." placeholderTextColor={colors.muted} />
            <Text style={styles.modalLabel}>Members</Text>
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
                  <View style={[styles.checkbox, checked && styles.checkboxChecked]}>
                    {checked && <Text style={styles.checkmark}>✓</Text>}
                  </View>
                  <Text style={{ color: colors.text, fontSize: fontSizes.sm }}>
                    {(p as any).displayName || (p as any).email || p.userId}
                    {p.userId === currentUserId ? ' (You)' : ''}
                  </Text>
                </TouchableOpacity>
              );
            })}
            <Text style={styles.modalLabel}>Payer</Text>
            <View style={styles.modalChipRow}>
              {participants.filter(p => groupForm.memberIds.includes(p.userId)).map(p => (
                <TouchableOpacity key={p.userId} style={[styles.modalChip, groupForm.payerUserId === p.userId && styles.modalChipActive]} onPress={() => setGroupForm(f => ({ ...f, payerUserId: p.userId }))}>
                  <Text style={[styles.modalChipText, groupForm.payerUserId === p.userId && styles.modalChipTextActive]}>
                    {(p as any).displayName || (p as any).email || p.userId.slice(0, 8)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <View style={styles.modalFooter}>
              <TouchableOpacity style={styles.modalCancelBtn} onPress={() => setCreateGroupModal(false)}>
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.modalSubmitBtn, (groupLoading || !groupForm.name.trim() || groupForm.memberIds.length === 0) && styles.modalSubmitDisabled]} onPress={handleCreateGroup} disabled={groupLoading || !groupForm.name.trim() || groupForm.memberIds.length === 0}>
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
        <View style={styles.modalContent}>
          <ScrollView>
            <Text style={styles.modalTitle}>Edit Group</Text>
            <Text style={styles.modalLabel}>Group Name</Text>
            <TextInput style={styles.modalInput} value={editGroupForm.name} onChangeText={v => setEditGroupForm(f => ({ ...f, name: v }))} />
            <Text style={styles.modalLabel}>Description (optional)</Text>
            <TextInput style={styles.modalInput} value={editGroupForm.description} onChangeText={v => setEditGroupForm(f => ({ ...f, description: v }))} />
            <Text style={styles.modalLabel}>Members</Text>
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
                  <View style={[styles.checkbox, checked && styles.checkboxChecked]}>
                    {checked && <Text style={styles.checkmark}>✓</Text>}
                  </View>
                  <Text style={{ color: colors.text, fontSize: fontSizes.sm }}>
                    {(p as any).displayName || (p as any).email || p.userId}
                    {p.userId === currentUserId ? ' (You)' : ''}
                  </Text>
                </TouchableOpacity>
              );
            })}
            <Text style={styles.modalLabel}>Payer</Text>
            <View style={styles.modalChipRow}>
              {participants.filter(p => editGroupForm.memberIds.includes(p.userId)).map(p => (
                <TouchableOpacity key={p.userId} style={[styles.modalChip, editGroupForm.payerUserId === p.userId && styles.modalChipActive]} onPress={() => setEditGroupForm(f => ({ ...f, payerUserId: p.userId }))}>
                  <Text style={[styles.modalChipText, editGroupForm.payerUserId === p.userId && styles.modalChipTextActive]}>
                    {(p as any).displayName || (p as any).email || p.userId.slice(0, 8)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <View style={styles.modalFooter}>
              <TouchableOpacity style={styles.modalCancelBtn} onPress={() => setEditGroupModal(false)}>
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.modalSubmitBtn, (editGroupLoading || editGroupForm.memberIds.length === 0) && styles.modalSubmitDisabled]} onPress={handleEditGroup} disabled={editGroupLoading || editGroupForm.memberIds.length === 0}>
                <Text style={styles.modalSubmitText}>{editGroupLoading ? 'Saving...' : 'Save'}</Text>
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
  container: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  content: { padding: spacing.lg },

  // Event Header
  eventInfo: { marginBottom: spacing.lg },
  eventHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  eventName: { fontSize: fontSizes.xxl, fontWeight: '700', color: colors.text, flex: 1, marginRight: spacing.sm },
  eventDesc: { fontSize: fontSizes.sm, color: colors.textSecondary, marginTop: spacing.xs },
  metaRow: { flexDirection: 'row', alignItems: 'center', marginTop: spacing.sm, gap: spacing.sm, flexWrap: 'wrap' },
  metaText: { fontSize: fontSizes.xs, color: colors.muted },
  fxBadge: {
    fontSize: fontSizes.xs, color: colors.info, backgroundColor: colors.infoBg,
    paddingHorizontal: spacing.sm, paddingVertical: 1, borderRadius: radii.sm, overflow: 'hidden',
  },
  headerActions: { flexDirection: 'row', gap: spacing.xs },
  iconBtn: {
    paddingHorizontal: spacing.sm, paddingVertical: spacing.xs,
    borderRadius: radii.sm, borderWidth: 1, borderColor: colors.border,
  },
  iconBtnText: { fontSize: fontSizes.xs, fontWeight: '600', color: colors.primary },
  dangerBtn: { borderColor: colors.error + '40' },
  dangerText: { color: colors.error },
  closeBtn: {
    backgroundColor: colors.primary, borderRadius: radii.sm,
    paddingHorizontal: spacing.md, paddingVertical: spacing.xs,
  },
  closeBtnText: { color: colors.white, fontSize: fontSizes.xs, fontWeight: '600' },

  // Badge
  badge: { borderRadius: radii.full, paddingHorizontal: spacing.sm, paddingVertical: 2 },
  badgeText: { fontSize: fontSizes.xs, fontWeight: '600', textTransform: 'capitalize' },

  // Summary
  summaryRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.sm },
  summaryCard: {
    flex: 1, backgroundColor: colors.surface, borderRadius: radii.md,
    padding: spacing.md, alignItems: 'center',
    shadowColor: colors.black, shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 3, elevation: 1,
  },
  summaryLabel: { fontSize: fontSizes.xs, color: colors.muted, marginBottom: 2 },
  summaryValue: { fontSize: fontSizes.lg, fontWeight: '700', color: colors.text },

  // Settlement
  section: { marginBottom: spacing.lg, marginTop: spacing.sm },
  sectionHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.xs },
  sectionTitle: { fontSize: fontSizes.lg, fontWeight: '600', color: colors.text },
  progressText: { fontSize: fontSizes.xs, color: colors.muted },
  progressBar: { height: 4, backgroundColor: colors.border, borderRadius: 2, marginBottom: spacing.md },
  progressFill: { height: 4, backgroundColor: colors.success, borderRadius: 2 },
  settlementCard: {
    backgroundColor: colors.surface, borderRadius: radii.sm, padding: spacing.md,
    marginBottom: spacing.sm, borderLeftWidth: 3, borderLeftColor: colors.primary,
  },
  settlementRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  dot: { width: 8, height: 8, borderRadius: 4 },
  settlementText: { flex: 1, fontSize: fontSizes.sm, color: colors.text },
  settlementAmount: { fontSize: fontSizes.md, fontWeight: '700', color: colors.text },
  fxAmount: { fontSize: fontSizes.xs, color: colors.muted, marginTop: 2, marginLeft: spacing.lg },
  settlementActions: { flexDirection: 'row', marginTop: spacing.sm, gap: spacing.sm, alignItems: 'center' },
  smallBtn: { backgroundColor: colors.primary, borderRadius: radii.sm, paddingHorizontal: spacing.md, paddingVertical: spacing.xs },
  smallBtnText: { color: colors.white, fontSize: fontSizes.xs, fontWeight: '600' },
  doneText: { color: colors.success, fontSize: fontSizes.xs, fontWeight: '600' },
  balancedCard: { backgroundColor: colors.successBg, borderRadius: radii.md, padding: spacing.lg, alignItems: 'center' },
  balancedTitle: { fontSize: fontSizes.lg, fontWeight: '700', color: colors.success, marginBottom: spacing.xs },
  balancedDesc: { fontSize: fontSizes.sm, color: colors.textSecondary, marginBottom: spacing.md },

  // Tabs
  tabBar: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: colors.border, marginBottom: spacing.md, marginTop: spacing.sm },
  tab: { flex: 1, paddingVertical: spacing.sm, alignItems: 'center' },
  tabActive: { borderBottomWidth: 2, borderBottomColor: colors.primary },
  tabText: { fontSize: fontSizes.xs, color: colors.muted, fontWeight: '500' },
  tabTextActive: { color: colors.primary, fontWeight: '600' },
  tabContent: { minHeight: 100 },
  tabActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: spacing.sm, marginBottom: spacing.md },

  // Buttons
  primaryBtn: { backgroundColor: colors.primary, borderRadius: radii.sm, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, alignItems: 'center' },
  primaryBtnText: { color: colors.white, fontWeight: '600', fontSize: fontSizes.sm },
  outlineBtn: { borderWidth: 1, borderColor: colors.border, borderRadius: radii.sm, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, alignItems: 'center' },
  outlineBtnText: { color: colors.text, fontWeight: '600', fontSize: fontSizes.sm },

  // List Cards
  listCard: {
    backgroundColor: colors.surface, borderRadius: radii.sm, padding: spacing.md,
    marginBottom: spacing.sm, flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
  },
  highlightCard: { borderWidth: 1, borderColor: colors.primary + '30' },
  listCardHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  listCardTitle: { fontSize: fontSizes.md, fontWeight: '600', color: colors.text },
  listCardSub: { fontSize: fontSizes.xs, color: colors.muted, marginTop: 2 },
  amountText: { fontSize: fontSizes.md, fontWeight: '700', color: colors.text },
  inlineActions: { flexDirection: 'row', gap: spacing.xs, alignItems: 'center', marginLeft: spacing.xs },
  tinyBtn: { paddingHorizontal: spacing.sm, paddingVertical: 2, borderRadius: radii.sm, borderWidth: 1, borderColor: colors.border },
  tinyBtnText: { fontSize: fontSizes.xs, color: colors.primary, fontWeight: '600' },
  deleteLinkText: { fontSize: fontSizes.sm, color: colors.error, fontWeight: '600', paddingHorizontal: spacing.xs },
  emptyText: { fontSize: fontSizes.sm, color: colors.muted, textAlign: 'center', padding: spacing.xl },

  // Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: colors.surface, borderTopLeftRadius: radii.lg, borderTopRightRadius: radii.lg, padding: spacing.xl, maxHeight: '85%' },
  modalTitle: { fontSize: fontSizes.xl, fontWeight: '700', color: colors.text, marginBottom: spacing.lg },
  modalLabel: { fontSize: fontSizes.sm, fontWeight: '600', color: colors.textSecondary, marginBottom: spacing.xs, marginTop: spacing.md },
  modalInput: {
    backgroundColor: colors.surfaceAlt, borderRadius: radii.sm, borderWidth: 1, borderColor: colors.border,
    padding: spacing.md, fontSize: fontSizes.md, color: colors.text,
  },
  modalChipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  modalChip: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radii.full, borderWidth: 1.5, borderColor: colors.border, backgroundColor: colors.surface },
  modalChipActive: { borderColor: colors.primary, backgroundColor: colors.primary + '15' },
  modalChipText: { fontSize: fontSizes.sm, color: colors.text },
  modalChipTextActive: { color: colors.primary, fontWeight: '600' },
  memberItem: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.sm },
  checkbox: { width: 22, height: 22, borderRadius: 4, borderWidth: 2, borderColor: colors.border, justifyContent: 'center', alignItems: 'center' },
  checkboxChecked: { backgroundColor: colors.primary, borderColor: colors.primary },
  checkmark: { color: colors.white, fontSize: 13, fontWeight: '700' },
  modalFooter: { flexDirection: 'row', justifyContent: 'flex-end', gap: spacing.sm, marginTop: spacing.xl },
  modalCancelBtn: { paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, borderRadius: radii.sm, borderWidth: 1, borderColor: colors.border },
  modalCancelText: { color: colors.text, fontWeight: '600', fontSize: fontSizes.sm },
  modalSubmitBtn: { backgroundColor: colors.primary, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, borderRadius: radii.sm },
  modalSubmitText: { color: colors.white, fontWeight: '600', fontSize: fontSizes.sm },
  modalSubmitDisabled: { opacity: 0.5 },
});
