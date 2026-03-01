'use client';

import React, { useCallback, useEffect, useState, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import styled from 'styled-components';
import {
  Button,
  Card,
  CardBody,
  CardHeader,
  CardTitle,
  CardSubtitle,
  Badge,
  TabList,
  Tab,
  TabPanel,
  EmptyState,
  Modal,
  ModalHeader,
  ModalTitle,
  ModalBody,
  ModalFooter,
  Field,
  Input,
  Label,
  Select,
  TextArea,
  useToast,
} from '@traxettle/ui';
import { api } from '../../../utils/api';
import { useEventSocket } from '../../../hooks/useSocket';
import type {
  Event as TraxettleEvent,
  Expense,
  EventParticipant,
  Group,
  Invitation,
  Settlement,
  SettlementApproval,
} from '@traxettle/shared';

type SettlementPayResponse = Settlement;

const Page = styled.div`
  width: 100%;
  max-width: 960px;
  animation: fadeIn 0.3s ease;
`;

const TopBar = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 24px;
  gap: 16px;
  flex-wrap: wrap;
`;

const TopActions = styled.div`
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
`;

const MetaRow = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  margin-bottom: 24px;
`;

const MetaItem = styled.span`
  font-size: 13px;
  color: ${(p) => p.theme.colors.muted};
`;

const ListItem = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 0;
  border-bottom: 1px solid ${(p) => p.theme.colors.border};
  gap: 12px;

  &:last-child {
    border-bottom: none;
  }
`;

const ListItemInfo = styled.div`
  display: flex;
  flex-direction: column;
  gap: 2px;
  flex: 1;
  min-width: 0;
`;

const ListItemTitle = styled.div`
  font-weight: 600;
  font-size: 14px;
`;

const ListItemSub = styled.div`
  font-size: 12px;
  color: ${(p) => p.theme.colors.muted};
`;

const Amount = styled.div`
  font-weight: 700;
  font-size: 16px;
  white-space: nowrap;
`;

const LoadingWrapper = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 64px 0;
  gap: 16px;
`;

const Spinner = styled.div`
  width: 36px;
  height: 36px;
  border: 3px solid ${(p) => p.theme.colors.border};
  border-top-color: ${(p) => p.theme.colors.primary};
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
  @keyframes spin { to { transform: rotate(360deg); } }
`;

const LoadingLabel = styled.div`
  font-size: 14px;
  color: ${(p) => p.theme.colors.muted};
`;

const ErrorText = styled.div`
  font-size: 12px;
  color: ${(p) => p.theme.colors.error};
  font-weight: 500;
`;

const Form = styled.form`
  display: flex;
  flex-direction: column;
  gap: 14px;
`;

const Row = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 14px;
  @media (max-width: 640px) { grid-template-columns: 1fr; }
`;

const SummaryGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 12px;
  margin-bottom: 20px;
`;

const SummaryCard = styled.div<{ $accent?: string }>`
  padding: 16px 20px;
  border-radius: ${(p) => p.theme.radii.lg};
  border: 1px solid ${(p) => p.theme.colors.border};
  background: ${(p) => p.theme.colors.surface};
  transition: all 0.2s ease;

  &:hover {
    border-color: ${(p) => p.theme.colors.borderHover};
    box-shadow: ${(p) => p.theme.shadows.sm};
  }
`;

const SummaryLabel = styled.div`
  font-size: 12px;
  font-weight: 600;
  color: ${(p) => p.theme.colors.muted};
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin-bottom: 4px;
`;

const SummaryValue = styled.div`
  font-size: 22px;
  font-weight: 800;
  letter-spacing: -0.02em;
  color: ${(p) => p.theme.colors.text};
`;

const CurrentUserBadge = styled.span`
  font-size: 10px;
  font-weight: 600;
  padding: 2px 8px;
  border-radius: ${(p) => p.theme.radii.full};
  background: ${(p) => p.theme.colors.infoBg};
  color: ${(p) => p.theme.colors.info};
  margin-left: 8px;
`;

const HighlightedListItem = styled(ListItem)<{ $isCurrentUser?: boolean }>`
  background: ${(p) => p.$isCurrentUser ? p.theme.colors.infoBg : 'transparent'};
  border-radius: ${(p) => p.$isCurrentUser ? p.theme.radii.md : '0'};
  padding: ${(p) => p.$isCurrentUser ? '12px 14px' : '12px 0'};
  margin: ${(p) => p.$isCurrentUser ? '2px -14px' : '0'};
`;

const DeleteModalContent = styled.div`
  padding: 8px 0 16px;
`;

const WarningBox = styled.div`
  margin: 0 0 16px;
  padding: 12px 16px;
  background: ${(p) => p.theme.colors.errorBg};
  border-radius: ${(p) => p.theme.radii.md};
  border: 1px solid ${(p) => p.theme.colors.error}33;
  color: ${(p) => p.theme.colors.error};
`;

const DangerText = styled.p`
  margin: 0 0 12px;
  color: ${(p) => p.theme.colors.error};
  font-size: 14px;
`;

const MutedText = styled.p`
  margin: 0;
  font-size: 13px;
  color: ${(p) => p.theme.colors.muted};
`;

const MemberCheckList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 6px;
  max-height: 200px;
  overflow-y: auto;
  border: 1px solid ${(p) => p.theme.colors.border};
  border-radius: ${(p) => p.theme.radii.md};
  padding: 8px;
`;

const MemberCheckItem = styled.label`
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 8px;
  border-radius: ${(p) => p.theme.radii.sm};
  cursor: pointer;
  font-size: 13px;
  transition: background 0.15s;

  &:hover {
    background: ${(p) => p.theme.colors.infoBg};
  }

  input[type="checkbox"] {
    accent-color: ${(p) => p.theme.colors.primary};
    width: 16px;
    height: 16px;
  }
`;

/* ── Expense Split Detail (Expandable) ── */

const ExpenseRowWrapper = styled.div`
  border-bottom: 1px solid ${(p) => p.theme.colors.border};
  &:last-child { border-bottom: none; }
`;

const ExpenseRowClickable = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 0;
  gap: 12px;
  cursor: pointer;
  transition: background 0.15s;
  border-radius: ${(p) => p.theme.radii.sm};

  &:hover {
    background: ${(p) => p.theme.colors.infoBg};
    margin: 0 -8px;
    padding: 12px 8px;
  }
`;

const SplitDetailPanel = styled.div`
  padding: 0 0 16px;
  animation: fadeIn 0.25s ease;
`;

const SplitDetailGrid = styled.div`
  display: grid;
  grid-template-columns: 1fr auto auto;
  gap: 6px 16px;
  font-size: 13px;
  padding: 8px 12px;
  background: ${(p) => p.theme.colors.surfaceHover || p.theme.colors.surface};
  border-radius: ${(p) => p.theme.radii.md};
  border: 1px solid ${(p) => p.theme.colors.border};
`;

const SplitDetailHeader = styled.div`
  font-weight: 700;
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: ${(p) => p.theme.colors.muted};
  padding-bottom: 4px;
  border-bottom: 1px solid ${(p) => p.theme.colors.border};
`;

const SplitDetailCell = styled.div<{ $bold?: boolean }>`
  font-weight: ${(p) => p.$bold ? 700 : 400};
  color: ${(p) => p.theme.colors.text};
  padding: 4px 0;
`;

const SplitDetailMuted = styled.span`
  font-size: 11px;
  color: ${(p) => p.theme.colors.muted};
  margin-left: 4px;
`;

const SplitMetaRow = styled.div`
  display: flex;
  gap: 16px;
  font-size: 12px;
  color: ${(p) => p.theme.colors.muted};
  margin-bottom: 8px;
  flex-wrap: wrap;
`;

const SplitMetaItem = styled.span`
  display: flex;
  align-items: center;
  gap: 4px;
`;

/* ── Settlement Summary Styled Components ── */

const SettlementSection = styled.div`
  margin-bottom: 24px;
  animation: fadeIn 0.4s ease;
`;

const SettlementHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;
`;

const SettlementTitle = styled.h2`
  margin: 0;
  font-size: 20px;
  font-weight: 700;
  letter-spacing: -0.02em;
`;

const SettlementProgress = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: ${(p) => p.theme.colors.muted};
`;

const ProgressBar = styled.div`
  width: 120px;
  height: 6px;
  border-radius: ${(p) => p.theme.radii.full};
  background: ${(p) => p.theme.colors.border};
  overflow: hidden;
`;

const ProgressFill = styled.div<{ $pct: number }>`
  height: 100%;
  width: ${(p) => p.$pct}%;
  border-radius: ${(p) => p.theme.radii.full};
  background: ${(p) => p.$pct === 100 ? p.theme.colors.success : p.theme.colors.primary};
  transition: width 0.5s ease;
`;

const TransactionCard = styled.div<{ $status: string }>`
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 16px 20px;
  border-radius: ${(p) => p.theme.radii.lg};
  border: 1px solid ${(p) =>
    p.$status === 'completed' ? p.theme.colors.success + '44'
    : p.$status === 'failed' ? p.theme.colors.error + '44'
    : p.$status === 'initiated' ? p.theme.colors.warning + '44'
    : p.theme.colors.border};
  background: ${(p) =>
    p.$status === 'completed' ? p.theme.colors.successBg
    : p.$status === 'failed' ? (p.theme.colors.errorBg || p.theme.colors.surface)
    : p.$status === 'initiated' ? p.theme.colors.warningBg
    : p.theme.colors.surface};
  margin-bottom: 10px;
  transition: all 0.3s ease;

  &:last-child { margin-bottom: 0; }
`;

const TransactionFlow = styled.div`
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
`;

const TransactionNames = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  font-weight: 600;
`;

const ArrowIcon = styled.span`
  color: ${(p) => p.theme.colors.muted};
  font-size: 16px;
  flex-shrink: 0;
`;

const TransactionMeta = styled.div`
  font-size: 12px;
  color: ${(p) => p.theme.colors.muted};
`;

const TransactionAmount = styled.div`
  font-size: 18px;
  font-weight: 800;
  white-space: nowrap;
  letter-spacing: -0.02em;
`;

const TransactionActions = styled.div`
  display: flex;
  gap: 6px;
  flex-shrink: 0;
`;

const StatusDot = styled.span<{ $status: string }>`
  display: inline-block;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  margin-right: 6px;
  background: ${(p) =>
    p.$status === 'completed' ? p.theme.colors.success
    : p.$status === 'failed' ? p.theme.colors.error
    : p.$status === 'initiated' ? p.theme.colors.warning
    : p.theme.colors.muted};
`;

const NoPaymentsCard = styled.div`
  padding: 32px;
  text-align: center;
  border-radius: ${(p) => p.theme.radii.lg};
  border: 1px solid ${(p) => p.theme.colors.success}44;
  background: ${(p) => p.theme.colors.successBg};
`;

const NoPaymentsTitle = styled.div`
  font-size: 18px;
  font-weight: 700;
  color: ${(p) => p.theme.colors.success};
  margin-bottom: 8px;
`;

const NoPaymentsDesc = styled.div`
  font-size: 14px;
  color: ${(p) => p.theme.colors.muted};
  margin-bottom: 16px;
`;

type ActiveTab = 'expenses' | 'participants' | 'groups' | 'invitations';

const CURRENCY_SYMBOLS: Record<string, string> = {
  USD: '$', EUR: '€', GBP: '£', INR: '₹', JPY: '¥', AUD: 'A$', CAD: 'C$',
};

function formatDate(d: any): string {
  if (!d) return '';
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function statusBadgeVariant(status: string) {
  if (status === 'active' || status === 'accepted') return 'success';
  if (status === 'review') return 'warning';
  if (status === 'payment') return 'info';
  if (status === 'settled' || status === 'pending') return 'warning';
  if (status === 'declined' || status === 'expired' || status === 'closed') return 'error';
  if (status === 'completed' || status === 'initiated') return status === 'completed' ? 'success' : 'warning';
  return 'default';
}

export default function EventDetailPage() {
  const params = useParams();
  const eventId = params.eventId as string;
  const router = useRouter();
  const { push: pushToast } = useToast();

  const [event, setEvent] = useState<TraxettleEvent | null>(null);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [participants, setParticipants] = useState<EventParticipant[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [settlements, setSettlements] = useState<Settlement[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<ActiveTab>('expenses');
  const [error, setError] = useState('');
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  // Get current user ID from Firebase auth
  useEffect(() => {
    (async () => {
      try {
        const { getAuth } = await import('firebase/auth');
        const auth = getAuth();
        if (auth.currentUser) {
          setCurrentUserId(auth.currentUser.uid);
        }
        auth.onAuthStateChanged((user) => {
          setCurrentUserId(user?.uid || null);
        });
      } catch { /* fallback: no user id */ }
    })();
  }, []);

  // Modals
  const [showEditEvent, setShowEditEvent] = useState(false);
  const [showInvite, setShowInvite] = useState(false);
  const [showCreateGroup, setShowCreateGroup] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [expandedExpenseId, setExpandedExpenseId] = useState<string | null>(null);
  const [pendingSettlementTotal, setPendingSettlementTotal] = useState<number | null>(null);
  const [settleLoading, setSettleLoading] = useState(false);
  const [settlementPlan, setSettlementPlan] = useState<any>(null);
  const [showSettlementModal, setShowSettlementModal] = useState(false);
  const [showMarkPaidModal, setShowMarkPaidModal] = useState(false);
  const [markPaidTarget, setMarkPaidTarget] = useState<Settlement | null>(null);
  const [markPaidReferenceId, setMarkPaidReferenceId] = useState('');
  const [markPaidProofUrl, setMarkPaidProofUrl] = useState('');
  const [markPaidNote, setMarkPaidNote] = useState('');
  const [markPaidSubmitting, setMarkPaidSubmitting] = useState(false);
  const [markPaidUploading, setMarkPaidUploading] = useState(false);
  const [approveLoading, setApproveLoading] = useState(false);
  const [regenerateLoading, setRegenerateLoading] = useState(false);

  // Generic confirmation modal
  const [confirmModal, setConfirmModal] = useState<{ open: boolean; title: string; message: string; variant: 'danger' | 'warning' | 'primary'; confirmLabel: string; onConfirm: () => void }>({
    open: false, title: '', message: '', variant: 'danger', confirmLabel: 'Confirm', onConfirm: () => {},
  });
  const closeConfirmModal = () => setConfirmModal(prev => ({ ...prev, open: false }));

  // Real-time updates via WebSocket — granular handlers to avoid full page refresh
  const fetchAllRef = useRef<() => void>(() => {});
  useEventSocket(eventId, useCallback((type: string, payload: any) => {
    if (type === 'event:deleted') {
      router.push('/dashboard');
      return;
    }

    // Invitation status changes: update just the invitation in state
    if (type === 'invitation:accepted' || type === 'invitation:declined' || type === 'invitation:revoked') {
      const inv = payload?.invitation;
      if (inv?.id) {
        setInvitations(prev => prev.map(i => i.id === inv.id ? { ...i, status: inv.status } : i));
      }
      // Also refresh participants since acceptance adds a participant
      if (type === 'invitation:accepted') {
        fetchAllRef.current();
      }
      return;
    }

    if (type === 'invitation:created') {
      // A new invitation was created — append it
      const inv = payload?.invitation;
      if (inv?.id) {
        setInvitations(prev => {
          if (prev.some(i => i.id === inv.id)) return prev;
          return [...prev, inv];
        });
      }
      return;
    }

    // Group changes: update groups in state
    if (type === 'group:deleted') {
      const gid = payload?.groupId;
      if (gid) {
        setGroups(prev => prev.filter(g => g.id !== gid));
      }
      return;
    }

    if (type === 'group:created' || type === 'group:updated') {
      const grp = payload?.group;
      if (grp?.id) {
        setGroups(prev => {
          const idx = prev.findIndex(g => g.id === grp.id);
          if (idx >= 0) return prev.map(g => g.id === grp.id ? grp : g);
          return [...prev, grp];
        });
      }
      return;
    }

    // Settlement status updates: update the specific settlement in state
    if (type === 'settlement:updated') {
      const s = payload?.settlement;
      if (s?.id) {
        setSettlements(prev => prev.map(t => t.id === s.id ? { ...t, ...s } : t));
      }
      // If all complete, refresh event to get new status
      if (payload?.allComplete) {
        fetchAllRef.current();
      }
      return;
    }

    // For everything else (expenses, participants, settlements generated, event updates), do a full refresh
    fetchAllRef.current();
  }, [router]));

  // Edit event form
  const [editForm, setEditForm] = useState({ name: '', description: '', type: 'event' as string, currency: '', settlementCurrency: '', status: 'active' as string });
  const [editLoading, setEditLoading] = useState(false);

  // Invite form
  const [inviteForm, setInviteForm] = useState({ inviteeEmail: '', role: 'member' as string, message: '', groupId: '' });
  const [inviteLoading, setInviteLoading] = useState(false);

  // Create group form
  const [groupForm, setGroupForm] = useState({ name: '', description: '', payerUserId: '', memberIds: [] as string[] });
  const [groupLoading, setGroupLoading] = useState(false);

  // Edit group modal
  const [showEditGroup, setShowEditGroup] = useState(false);
  const [editGroupId, setEditGroupId] = useState<string | null>(null);
  const [editGroupForm, setEditGroupForm] = useState({ name: '', description: '', payerUserId: '', memberIds: [] as string[] });
  const [editGroupLoading, setEditGroupLoading] = useState(false);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [eventRes, expensesRes, participantsRes, groupsRes, invitationsRes, settlementsRes] = await Promise.all([
        api.get<TraxettleEvent>(`/api/events/${eventId}`),
        api.get<Expense[]>(`/api/expenses/event/${eventId}`),
        api.get<EventParticipant[]>(`/api/events/${eventId}/participants`),
        api.get<Group[]>(`/api/groups/event/${eventId}`),
        api.get<Invitation[]>(`/api/invitations/event/${eventId}`),
        api.get<Settlement[]>(`/api/settlements/event/${eventId}`),
      ]);
      setEvent(eventRes.data || null);
      setExpenses(expensesRes.data || []);
      setParticipants(participantsRes.data || []);
      setGroups(groupsRes.data || []);
      setInvitations(invitationsRes.data || []);
      setSettlements(settlementsRes.data || []);

      if (eventRes.data) {
        setEditForm({
          name: eventRes.data.name,
          description: eventRes.data.description || '',
          type: eventRes.data.type,
          currency: eventRes.data.currency,
          settlementCurrency: (eventRes.data as any).settlementCurrency || '',
          status: eventRes.data.status,
        });
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load event');
    } finally {
      setLoading(false);
    }
  }, [eventId]);

  useEffect(() => { fetchAll(); }, [fetchAll]);
  useEffect(() => { fetchAllRef.current = fetchAll; }, [fetchAll]);

  const handleEditEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    setEditLoading(true);
    try {
      await api.put(`/api/events/${eventId}`, editForm);
      pushToast({ type: 'success', title: 'Event Updated', message: 'Event details saved.' });
      setShowEditEvent(false);
      fetchAll();
    } catch (err: any) {
      pushToast({ type: 'error', title: 'Error', message: err.message });
    } finally {
      setEditLoading(false);
    }
  };

  const openDeleteConfirm = async () => {
    setShowDeleteConfirm(true);
    try {
      const res = await api.get<{ pendingTotal: number }>(`/api/settlements/event/${eventId}/pending-total`);
      setPendingSettlementTotal(res.data?.pendingTotal ?? 0);
    } catch {
      setPendingSettlementTotal(0);
    }
  };

  const handleDeleteEvent = async () => {
    setDeleteLoading(true);
    try {
      await api.delete(`/api/events/${eventId}`);
      pushToast({ type: 'success', title: 'Event Deleted', message: 'The event has been deleted.' });
      router.push('/dashboard');
    } catch (err: any) {
      pushToast({ type: 'error', title: 'Error', message: err.message });
    } finally {
      setDeleteLoading(false);
      setShowDeleteConfirm(false);
    }
  };

  const doSettle = async () => {
    closeConfirmModal();
    setSettleLoading(true);
    try {
      const res = await api.post(`/api/settlements/event/${eventId}/generate`, {});
      setSettlementPlan(res.data);
      pushToast({ type: 'success', title: 'Settlement Generated', message: 'Settlement plan has been calculated.' });
      fetchAll();
    } catch (err: any) {
      pushToast({ type: 'error', title: 'Error', message: err.message });
    } finally {
      setSettleLoading(false);
    }
  };

  const handleSettle = () => {
    setConfirmModal({
      open: true,
      title: 'Generate Settlement Plan',
      message: 'This will calculate how much each participant owes. Everyone will need to approve the settlement before payments begin. You can still edit expenses until all approvals are in.',
      variant: 'warning',
      confirmLabel: 'Settle Now',
      onConfirm: doSettle,
    });
  };

  const handleApproveSettlement = async () => {
    setApproveLoading(true);
    try {
      const res = await api.post<{ approvals: Record<string, SettlementApproval>; allApproved: boolean }>(
        `/api/settlements/event/${eventId}/approve-settlement`, {}
      );
      if (res.data?.allApproved) {
        pushToast({ type: 'success', title: 'All Approved', message: 'All participants have approved. Payments can now proceed.' });
      } else {
        pushToast({ type: 'success', title: 'Settlement Approved', message: 'Your approval has been recorded.' });
      }
      fetchAll();
    } catch (err: any) {
      pushToast({ type: 'error', title: 'Error', message: err.message });
    } finally {
      setApproveLoading(false);
    }
  };

  const handleRegenerateSettlement = async () => {
    setRegenerateLoading(true);
    try {
      await api.post(`/api/settlements/event/${eventId}/regenerate`, {});
      pushToast({ type: 'success', title: 'Settlement Regenerated', message: 'Settlement plan has been recalculated.' });
      fetchAll();
    } catch (err: any) {
      pushToast({ type: 'error', title: 'Error', message: err.message });
    } finally {
      setRegenerateLoading(false);
    }
  };

  const doMarkPaid = async (settlementId: string, settlementCurrency?: string) => {
    const isINR = settlementCurrency === 'INR';
    const paymentMode = isINR ? 'upi_or_netbanking' : 'international_transfer';
    try {
      setMarkPaidSubmitting(true);
      const payload: Record<string, any> = {
        paymentMode,
        referenceId: markPaidReferenceId.trim(),
        note: markPaidNote.trim() || undefined,
      };
      if (markPaidProofUrl.trim()) payload.proofUrl = markPaidProofUrl.trim();
      const res = await api.post<SettlementPayResponse>(`/api/settlements/${settlementId}/pay`, payload);
      pushToast({ type: 'success', title: 'Payment Marked', message: 'Marked as paid. Waiting for payee confirmation.' });
      // Optimistic update
      setSettlements(prev => prev.map(s => s.id === settlementId ? { ...s, ...res.data } : s));
      setShowMarkPaidModal(false);
      setMarkPaidTarget(null);
      setMarkPaidReferenceId('');
      setMarkPaidProofUrl('');
      setMarkPaidNote('');
    } catch (err: any) {
      pushToast({ type: 'error', title: 'Payment Update Failed', message: err.message });
    } finally {
      setMarkPaidSubmitting(false);
    }
  };

  const handlePay = (settlement: Settlement) => {
    setMarkPaidTarget(settlement);
    setMarkPaidReferenceId('');
    setMarkPaidProofUrl('');
    setMarkPaidNote('');
    setShowMarkPaidModal(true);
  };

  const handleUploadMarkPaidProof = async (file: File) => {
    if (!markPaidTarget) return;
    try {
      setMarkPaidUploading(true);
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const raw = typeof reader.result === 'string' ? reader.result : '';
          const marker = raw.indexOf('base64,');
          if (marker < 0) return reject(new Error('Unable to read file'));
          resolve(raw.slice(marker + 7));
        };
        reader.onerror = () => reject(new Error('Unable to read file'));
        reader.readAsDataURL(file);
      });
      const res = await api.post<{ proofUrl: string }>(`/api/settlements/${markPaidTarget.id}/upload-proof`, {
        filename: file.name,
        contentType: file.type || 'application/octet-stream',
        base64,
      });
      if (res.data?.proofUrl) {
        setMarkPaidProofUrl(res.data.proofUrl);
        pushToast({ type: 'success', title: 'Proof uploaded', message: 'Proof URL attached to this payment.' });
      }
    } catch (err: any) {
      pushToast({ type: 'error', title: 'Upload failed', message: err.message });
    } finally {
      setMarkPaidUploading(false);
    }
  };

  const handleApprove = async (settlementId: string) => {
    try {
      const res = await api.post<{ settlement: Settlement; allComplete: boolean }>(`/api/settlements/${settlementId}/approve`, {});
      pushToast({ type: 'success', title: 'Payment Confirmed', message: 'You have confirmed receipt of this payment.' });
      // Optimistic update
      setSettlements(prev => prev.map(s => s.id === settlementId ? { ...s, status: 'completed' as const } : s));
      if (res.data?.allComplete) {
        pushToast({ type: 'success', title: 'All Payments Complete', message: 'All transactions are settled. The event can now be closed.' });
        fetchAll();
      }
    } catch (err: any) {
      pushToast({ type: 'error', title: 'Error', message: err.message });
    }
  };

  const handlePayeeMarkPaid = (settlementId: string) => {
    setConfirmModal({
      open: true,
      title: 'Mark As Paid?',
      message: 'This will directly complete this settlement as if payment has already been received.',
      variant: 'warning',
      confirmLabel: 'Mark as Paid',
      onConfirm: async () => {
        closeConfirmModal();
        try {
          const res = await api.post<{ settlement: Settlement; allComplete: boolean }>(`/api/settlements/${settlementId}/mark-paid-by-payee`, {});
          setSettlements(prev => prev.map(s => s.id === settlementId ? { ...s, status: 'completed' as const } : s));
          pushToast({ type: 'success', title: 'Marked as paid', message: 'Settlement completed successfully.' });
          if (res.data?.allComplete) fetchAll();
        } catch (err: any) {
          pushToast({ type: 'error', title: 'Error', message: err.message });
        }
      },
    });
  };

  const handleReject = async (settlementId: string) => {
    try {
      await api.post(`/api/settlements/${settlementId}/reject`, {
        reason: 'Payment not received',
      });
      pushToast({ type: 'success', title: 'Payment Rejected', message: 'Marked as pending so payer can re-submit.' });
      setSettlements(prev => prev.map(s => s.id === settlementId ? { ...s, status: 'pending' as const } : s));
    } catch (err: any) {
      pushToast({ type: 'error', title: 'Error', message: err.message });
    }
  };

  const doCloseEvent = async () => {
    closeConfirmModal();
    try {
      await api.put(`/api/events/${eventId}`, { status: 'closed' });
      pushToast({ type: 'success', title: 'Event Closed', message: 'This event has been closed.' });
      router.push('/dashboard');
    } catch (err: any) {
      pushToast({ type: 'error', title: 'Error', message: err.message });
    }
  };

  const handleCloseEvent = () => {
    setConfirmModal({
      open: true,
      title: 'Close Event',
      message: `Close this event? It will no longer appear on anyone's dashboard.`,
      variant: 'warning',
      confirmLabel: 'Close Event',
      onConfirm: doCloseEvent,
    });
  };

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteForm.inviteeEmail.trim()) return;
    setInviteLoading(true);
    try {
      await api.post('/api/invitations', {
        eventId,
        inviteeEmail: inviteForm.inviteeEmail.trim(),
        role: inviteForm.role,
        message: inviteForm.message.trim() || undefined,
        groupId: inviteForm.groupId || undefined,
      });
      pushToast({ type: 'success', title: 'Invitation Sent', message: `Invitation sent to ${inviteForm.inviteeEmail}` });
      setShowInvite(false);
      setInviteForm({ inviteeEmail: '', role: 'member', message: '', groupId: '' });
      fetchAll();
    } catch (err: any) {
      pushToast({ type: 'error', title: 'Error', message: err.message });
    } finally {
      setInviteLoading(false);
    }
  };

  const handleRevokeInvitation = async (invitationId: string) => {
    try {
      await api.delete(`/api/invitations/${invitationId}`);
      pushToast({ type: 'success', title: 'Invitation Revoked', message: 'The invitation has been revoked.' });
      fetchAll();
    } catch (err: any) {
      pushToast({ type: 'error', title: 'Error', message: err.message });
    }
  };

  const handleCreateGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!groupForm.name.trim()) return;
    if (groupForm.memberIds.length === 0) {
      pushToast({ type: 'error', title: 'Error', message: 'Select at least one member for the group.' });
      return;
    }
    setGroupLoading(true);
    try {
      await api.post('/api/groups', {
        eventId,
        name: groupForm.name.trim(),
        description: groupForm.description.trim() || undefined,
        memberIds: groupForm.memberIds,
        payerUserId: groupForm.payerUserId || groupForm.memberIds[0] || '',
      });
      pushToast({ type: 'success', title: 'Group Created', message: `Group "${groupForm.name}" created.` });
      setShowCreateGroup(false);
      setGroupForm({ name: '', description: '', payerUserId: '', memberIds: [] });
      fetchAll();
    } catch (err: any) {
      pushToast({ type: 'error', title: 'Error', message: err.message });
    } finally {
      setGroupLoading(false);
    }
  };

  const openEditGroup = (group: Group) => {
    setEditGroupId(group.id);
    setEditGroupForm({
      name: group.name,
      description: group.description || '',
      payerUserId: group.payerUserId,
      memberIds: [...group.members],
    });
    setShowEditGroup(true);
  };

  const handleEditGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editGroupId) return;
    if (editGroupForm.memberIds.length === 0) {
      pushToast({ type: 'error', title: 'Error', message: 'Select at least one member for the group.' });
      return;
    }
    setEditGroupLoading(true);
    try {
      await api.put(`/api/groups/${editGroupId}`, {
        name: editGroupForm.name.trim(),
        description: editGroupForm.description.trim() || undefined,
        memberIds: editGroupForm.memberIds,
        payerUserId: editGroupForm.payerUserId,
      });
      pushToast({ type: 'success', title: 'Group Updated', message: `Group "${editGroupForm.name}" updated.` });
      setShowEditGroup(false);
      setEditGroupId(null);
      fetchAll();
    } catch (err: any) {
      pushToast({ type: 'error', title: 'Error', message: err.message });
    } finally {
      setEditGroupLoading(false);
    }
  };

  const handleDeleteGroup = (groupId: string) => {
    setConfirmModal({
      open: true,
      title: 'Delete Group',
      message: 'Are you sure you want to delete this group? This action cannot be undone.',
      variant: 'danger',
      confirmLabel: 'Delete',
      onConfirm: async () => {
        closeConfirmModal();
        try {
          await api.delete(`/api/groups/${groupId}`);
          pushToast({ type: 'success', title: 'Group Deleted', message: 'Group removed.' });
          fetchAll();
        } catch (err: any) {
          pushToast({ type: 'error', title: 'Error', message: err.message });
        }
      },
    });
  };

  const handleRemoveParticipant = (userId: string) => {
    setConfirmModal({
      open: true,
      title: 'Remove Participant',
      message: 'Are you sure you want to remove this participant from the event?',
      variant: 'danger',
      confirmLabel: 'Remove',
      onConfirm: async () => {
        closeConfirmModal();
        try {
          await api.delete(`/api/events/${eventId}/participants/${userId}`);
          pushToast({ type: 'success', title: 'Participant Removed', message: 'Participant removed from event.' });
          fetchAll();
        } catch (err: any) {
          pushToast({ type: 'error', title: 'Error', message: err.message });
        }
      },
    });
  };

  const handleChangeParticipantRole = async (userId: string, newRole: 'admin' | 'member') => {
    try {
      await api.put(`/api/events/${eventId}/participants/${userId}/role`, { role: newRole });
      pushToast({ type: 'success', title: 'Role Updated', message: `Participant ${newRole === 'admin' ? 'promoted to admin' : 'demoted to member'}.` });
      fetchAll();
    } catch (err: any) {
      pushToast({ type: 'error', title: 'Error', message: err.message });
    }
  };

  const handleDeleteExpense = (expenseId: string) => {
    setConfirmModal({
      open: true,
      title: 'Delete Expense',
      message: 'Are you sure you want to delete this expense? This action cannot be undone.',
      variant: 'danger',
      confirmLabel: 'Delete',
      onConfirm: async () => {
        closeConfirmModal();
        try {
          await api.delete(`/api/expenses/${expenseId}`);
          pushToast({ type: 'success', title: 'Expense Deleted', message: 'Expense removed.' });
          fetchAll();
        } catch (err: any) {
          pushToast({ type: 'error', title: 'Error', message: err.message });
        }
      },
    });
  };

  const currSym = event ? (CURRENCY_SYMBOLS[event.currency] || event.currency) : '$';

  // Helper to resolve userId to display name using enriched participant data
  const getUserName = (userId: string) => {
    const p = participants.find(pt => pt.userId === userId);
    return p?.displayName || p?.email || userId;
  };

  // Helper to resolve entity (user or group) to display name
  const getEntityName = (entityId: string, entityType: string) => {
    if (entityType === 'group') {
      const g = groups.find(gr => gr.id === entityId);
      return g ? g.name : entityId;
    }
    return getUserName(entityId);
  };

  // Is the current user an admin of this event?
  const isAdmin = currentUserId
    ? participants.some(p => p.userId === currentUserId && p.role === 'admin')
    : false;

  // --- Entity-aware calculations ---
  // Determine the current user's entity: if they belong to a group, the group is their entity.
  // A group acts as a single entity — all members see the same values.
  const myGroup = currentUserId
    ? groups.find(g => g.members.includes(currentUserId))
    : null;
  const myEntityId: string | null = myGroup ? myGroup.id : currentUserId;
  // All user IDs that belong to my entity (for private expense ownership check)
  const myEntityMembers: string[] = myGroup ? myGroup.members : (currentUserId ? [currentUserId] : []);

  // Helper: does an expense involve my entity? (shared expense where my entity is in the splits)
  const isSharedWithMyEntity = (exp: Expense) => {
    if (exp.isPrivate) return false;
    if (!myEntityId) return false;
    return exp.splits?.some((s: any) => s.entityId === myEntityId);
  };

  // Helper: is a private expense owned by my entity?
  // Private expense belongs to an entity if the creator (paidBy) is a member of that entity.
  const isMyEntityPrivate = (exp: Expense) => {
    if (!exp.isPrivate) return false;
    return myEntityMembers.includes(exp.paidBy);
  };

  // Visible expenses for this user's entity:
  // - All shared expenses where this entity is in the splits
  // - Private expenses created by a member of this entity
  const visibleExpenses = currentUserId
    ? expenses.filter(exp => isSharedWithMyEntity(exp) || isMyEntityPrivate(exp))
    : expenses.filter(exp => !exp.isPrivate); // fallback for unauthenticated: show shared only

  // 1. Total Expense = All shared expenses involving this entity + this entity's private expenses
  const myTotalExpense = visibleExpenses.reduce((sum, e) => sum + e.amount, 0);

  // 2. Total Shared = sum of all shared expenses involving this entity
  const myTotalShared = visibleExpenses.filter(e => !e.isPrivate).reduce((sum, e) => sum + e.amount, 0);

  // 3. Your Shared = entity's aggregated contribution from shared expenses (their split amount)
  const myYourShared = currentUserId
    ? visibleExpenses.reduce((sum, exp) => {
        if (exp.isPrivate || !myEntityId) return sum;
        const mySplit = exp.splits?.find((s: any) => s.entityId === myEntityId);
        return sum + (mySplit?.amount || 0);
      }, 0)
    : 0;

  // 4. Private Expense = sum of private expenses of this entity
  const myPrivateExpense = visibleExpenses.filter(e => e.isPrivate).reduce((sum, e) => sum + e.amount, 0);

  if (loading) return (
    <LoadingWrapper>
      <Spinner />
      <LoadingLabel>Loading event details...</LoadingLabel>
    </LoadingWrapper>
  );
  if (error || !event) return (
    <Page>
      <ErrorText>{error || 'Event not found'}</ErrorText>
      <Button $variant="outline" onClick={() => router.push('/dashboard')}>Back to Dashboard</Button>
    </Page>
  );

  return (
    <Page data-testid="event-detail-page">
      <TopBar>
        <div>
          <h1 style={{ margin: 0, fontSize: 26, letterSpacing: '-0.02em' }}>{event.name}</h1>
          {event.description && <MetaItem>{event.description}</MetaItem>}
        </div>
        <TopActions>
          {(event.status === 'active' || event.status === 'review') && isAdmin && (
            <>
              <Button $variant="outline" onClick={() => setShowEditEvent(true)} data-testid="edit-event-btn">Edit</Button>
              <Button $variant="outline" onClick={openDeleteConfirm} data-testid="delete-event-btn">Delete</Button>
            </>
          )}
          {event.status === 'settled' && isAdmin && (
            <Button $variant="primary" onClick={handleCloseEvent} data-testid="close-event-btn">Close Event</Button>
          )}
          {event.status === 'review' && (
            <Badge $variant="warning">Settlement Review</Badge>
          )}
          {event.status === 'payment' && (
            <Badge $variant="info">Payments in Progress</Badge>
          )}
          {(event.status === 'review' || event.status === 'payment' || event.status === 'settled' || event.status === 'closed') && settlements.length > 0 && (
            <Button $variant="outline" onClick={() => setShowSettlementModal(true)} data-testid="settlement-details-btn">Settlement Details</Button>
          )}
        </TopActions>
      </TopBar>

      <MetaRow>
        <Badge $variant={statusBadgeVariant(event.status)} data-testid="event-status-badge">{event.status}</Badge>
        <Badge $variant="default">{event.type}</Badge>
        <MetaItem>{event.currency}</MetaItem>
        <MetaItem>{formatDate(event.startDate)}{event.endDate ? ` – ${formatDate(event.endDate)}` : ''}</MetaItem>
      </MetaRow>

      <SummaryGrid>
        <SummaryCard>
          <SummaryLabel>Total Expense</SummaryLabel>
          <SummaryValue>{currSym}{myTotalExpense.toFixed(2)}</SummaryValue>
        </SummaryCard>
        <SummaryCard>
          <SummaryLabel>Total Shared</SummaryLabel>
          <SummaryValue>{currSym}{myTotalShared.toFixed(2)}</SummaryValue>
        </SummaryCard>
        <SummaryCard>
          <SummaryLabel>Your Shared</SummaryLabel>
          <SummaryValue>{currSym}{myYourShared.toFixed(2)}</SummaryValue>
        </SummaryCard>
        <SummaryCard>
          <SummaryLabel>Private Expense</SummaryLabel>
          <SummaryValue>{currSym}{myPrivateExpense.toFixed(2)}</SummaryValue>
        </SummaryCard>
      </SummaryGrid>

      {/* Settlement Review — approval status shown during review phase */}
      {event.status === 'review' && settlements.length > 0 && (() => {
        const approvals = (event as any).settlementApprovals as Record<string, SettlementApproval> | undefined;
        const isStale = (event as any).settlementStale === true;
        const approvalEntries = approvals ? Object.entries(approvals) : [];
        const approvedCount = approvalEntries.filter(([, a]) => a.approved).length;
        const totalEntities = approvalEntries.length;
        const approvalPct = totalEntities > 0 ? Math.round((approvedCount / totalEntities) * 100) : 0;
        const totalSettlementAmount = settlements.reduce((sum, s) => sum + s.amount, 0);
        const hasFx = settlements.some(s => s.settlementCurrency && s.settlementCurrency !== s.currency);
        const totalSettlementConverted = hasFx ? settlements.reduce((sum, s) => sum + (s.settlementAmount || s.amount), 0) : 0;
        const fxCurrSym = hasFx ? (CURRENCY_SYMBOLS[(settlements[0] as any).settlementCurrency] || (settlements[0] as any).settlementCurrency || '') : '';

        return (
          <SettlementSection data-testid="settlement-review-section">
            <SettlementHeader>
              <SettlementTitle>Settlement Review</SettlementTitle>
              <SettlementProgress>
                <span>{approvedCount}/{totalEntities} approved</span>
                <ProgressBar>
                  <ProgressFill $pct={approvalPct} />
                </ProgressBar>
              </SettlementProgress>
            </SettlementHeader>

            {isStale && (
              <div style={{ padding: '12px 16px', background: 'var(--color-warning-bg, #fff3cd)', borderRadius: 8, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 12 }}>
                <span style={{ fontWeight: 600 }}>⚠ Expenses have changed.</span>
                <span>Settlement needs to be regenerated before approvals can continue.</span>
                {isAdmin && (
                  <Button $variant="primary" $size="sm" onClick={handleRegenerateSettlement} disabled={regenerateLoading} data-testid="regenerate-btn">
                    {regenerateLoading ? 'Regenerating...' : 'Regenerate Settlement'}
                  </Button>
                )}
              </div>
            )}

            <SummaryGrid>
              <SummaryCard>
                <SummaryLabel>Total Settlement</SummaryLabel>
                <SummaryValue>
                  {currSym}{totalSettlementAmount.toFixed(2)}
                  {hasFx && <span style={{ fontSize: 12, opacity: 0.7, display: 'block' }}>≈ {fxCurrSym}{totalSettlementConverted.toFixed(2)}</span>}
                </SummaryValue>
              </SummaryCard>
              <SummaryCard>
                <SummaryLabel>Transactions</SummaryLabel>
                <SummaryValue>{settlements.length}</SummaryValue>
              </SummaryCard>
              <SummaryCard>
                <SummaryLabel>Approvals</SummaryLabel>
                <SummaryValue>{approvedCount} / {totalEntities}</SummaryValue>
              </SummaryCard>
            </SummaryGrid>

            {/* Approval status list */}
            <div style={{ marginBottom: 16 }}>
              <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>Approval Status</h3>
              {approvalEntries.map(([entityId, approval]) => (
                <div key={entityId} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', borderBottom: '1px solid var(--color-border, #eee)' }}>
                  <StatusDot $status={approval.approved ? 'completed' : 'pending'} />
                  <span style={{ flex: 1 }}>{approval.displayName || entityId}</span>
                  <Badge $variant={approval.approved ? 'success' : 'warning'}>
                    {approval.approved ? 'Approved' : 'Pending'}
                  </Badge>
                </div>
              ))}
            </div>

            {/* Settlement transactions preview */}
            {settlements.filter(s => s.amount > 0.01).map((s) => (
              <TransactionCard key={s.id} $status={s.status} data-testid={`settlement-review-txn-${s.id}`}>
                <TransactionFlow>
                  <TransactionNames>
                    <span>{getEntityName(s.fromEntityId, s.fromEntityType)}</span>
                    <ArrowIcon>→</ArrowIcon>
                    <span>{getEntityName(s.toEntityId, s.toEntityType)}</span>
                  </TransactionNames>
                </TransactionFlow>
                <TransactionAmount>
                  {currSym}{s.amount.toFixed(2)}
                  {s.settlementAmount && s.settlementCurrency && s.settlementCurrency !== s.currency && (
                    <span style={{ fontSize: 11, opacity: 0.7, display: 'block' }}>
                      ≈ {CURRENCY_SYMBOLS[s.settlementCurrency] || s.settlementCurrency}{s.settlementAmount.toFixed(2)}
                    </span>
                  )}
                </TransactionAmount>
                <TransactionActions>
                  <Badge $variant="default">Review</Badge>
                </TransactionActions>
              </TransactionCard>
            ))}

            {/* Action buttons */}
            {(() => {
              // Determine if the current user's entity has already approved
              const myApproval = myEntityId && approvals ? approvals[myEntityId] : undefined;
              const myEntityApproved = myApproval?.approved === true;
              // Can this user approve? Individual users approve for themselves;
              // group rep/payer approves for the group. Regular group members cannot.
              const canApprove = myEntityId && approvals && approvals[myEntityId] !== undefined && (
                !myGroup || (myGroup.representative === currentUserId || myGroup.payerUserId === currentUserId)
              );

              return (
                <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
                  {!isStale && canApprove && !myEntityApproved && (
                    <Button $variant="primary" onClick={handleApproveSettlement} disabled={approveLoading} data-testid="approve-settlement-btn">
                      {approveLoading ? 'Approving...' : 'Approve Settlement'}
                    </Button>
                  )}
                  {myEntityApproved && (
                    <Badge $variant="success">✓ You have approved</Badge>
                  )}
                </div>
              );
            })()}
          </SettlementSection>
        );
      })()}

      {/* Settlement Summary — shown when event is in payment/settled/closed and has settlements */}
      {(event.status === 'payment' || event.status === 'settled' || event.status === 'closed') && settlements.length > 0 && (() => {
        const completedCount = settlements.filter(s => s.status === 'completed').length;
        const pct = Math.round((completedCount / settlements.length) * 100);
        const totalSettlementAmount = settlements.reduce((sum, s) => sum + s.amount, 0);
        const hasFx = settlements.some(s => s.settlementCurrency && s.settlementCurrency !== s.currency);
        const totalSettlementConverted = hasFx ? settlements.reduce((sum, s) => sum + (s.settlementAmount || s.amount), 0) : 0;
        const fxCurrSym = hasFx ? (CURRENCY_SYMBOLS[(settlements[0] as any).settlementCurrency] || (settlements[0] as any).settlementCurrency || '') : '';

        return (
          <SettlementSection data-testid="settlement-section">
            <SettlementHeader>
              <SettlementTitle>Settlement Summary</SettlementTitle>
              <SettlementProgress>
                <span>{completedCount}/{settlements.length} complete</span>
                <ProgressBar>
                  <ProgressFill $pct={pct} />
                </ProgressBar>
              </SettlementProgress>
            </SettlementHeader>

            <SummaryGrid>
              <SummaryCard>
                <SummaryLabel>Total Settlement</SummaryLabel>
                <SummaryValue>
                  {currSym}{totalSettlementAmount.toFixed(2)}
                  {hasFx && <span style={{ fontSize: 12, opacity: 0.7, display: 'block' }}>≈ {fxCurrSym}{totalSettlementConverted.toFixed(2)}</span>}
                </SummaryValue>
              </SummaryCard>
              <SummaryCard>
                <SummaryLabel>Transactions</SummaryLabel>
                <SummaryValue>{settlements.length}</SummaryValue>
              </SummaryCard>
              <SummaryCard>
                <SummaryLabel>Completed</SummaryLabel>
                <SummaryValue>{completedCount} / {settlements.length}</SummaryValue>
              </SummaryCard>
            </SummaryGrid>

            {settlements.map((s) => {
              const settlementStatus = s.status as string;
              const isPayer = currentUserId === s.fromUserId;
              const isPayee = currentUserId === s.toUserId;

              return (
                <TransactionCard key={s.id} $status={s.status} data-testid={`settlement-txn-${s.id}`}>
                  <TransactionFlow>
                    <TransactionNames>
                      <span>{getEntityName(s.fromEntityId, s.fromEntityType)}</span>
                      <ArrowIcon>→</ArrowIcon>
                      <span>{getEntityName(s.toEntityId, s.toEntityType)}</span>
                    </TransactionNames>
                    <TransactionMeta>
                      <StatusDot $status={settlementStatus} />
                      {settlementStatus === 'pending' && 'Awaiting payment'}
                      {settlementStatus === 'initiated' && 'Marked paid — awaiting payee confirmation'}
                      {settlementStatus === 'failed' && 'Payment failed/rejected — payer should resubmit'}
                      {settlementStatus === 'completed' && 'Payment confirmed ✓'}
                      {s.fromEntityType === 'group' && ` · Payer: ${getUserName(s.fromUserId)}`}
                      {s.toEntityType === 'group' && ` · Recipient: ${getUserName(s.toUserId)}`}
                    </TransactionMeta>
                  </TransactionFlow>
                  <TransactionAmount>
                    {currSym}{s.amount.toFixed(2)}
                    {s.settlementAmount && s.settlementCurrency && s.settlementCurrency !== s.currency && (
                      <span style={{ fontSize: 11, opacity: 0.7, display: 'block' }}>
                        ≈ {CURRENCY_SYMBOLS[s.settlementCurrency] || s.settlementCurrency}{s.settlementAmount.toFixed(2)}
                        {s.fxRate && <span style={{ fontSize: 10 }}> @{s.fxRate}</span>}
                      </span>
                    )}
                  </TransactionAmount>
                  <TransactionActions>
                    {(settlementStatus === 'pending' || settlementStatus === 'failed') && isPayer && (
                      <Button $variant="primary" $size="sm" onClick={() => handlePay(s)} data-testid={`pay-btn-${s.id}`}>
                        {settlementStatus === 'pending' ? 'I\'ve Paid' : 'Mark Paid Again'}
                      </Button>
                    )}
                    {(settlementStatus === 'pending' || settlementStatus === 'failed') && isPayee && (
                      <Button $variant="primary" $size="sm" onClick={() => handlePayeeMarkPaid(s.id)} data-testid={`payee-mark-paid-btn-${s.id}`}>
                        Mark as Paid
                      </Button>
                    )}
                    {settlementStatus === 'initiated' && isPayee && (
                      <>
                        <Button $variant="primary" $size="sm" onClick={() => handleApprove(s.id)} data-testid={`approve-btn-${s.id}`}>
                          Confirm Receipt
                        </Button>
                        <Button $variant="outline" $size="sm" onClick={() => handleReject(s.id)} data-testid={`reject-btn-${s.id}`}>
                          Reject
                        </Button>
                      </>
                    )}
                    {settlementStatus === 'failed' && !isPayer && (
                      <Badge $variant="error">Failed</Badge>
                    )}
                    {settlementStatus === 'completed' && (
                      <Badge $variant="success">Done</Badge>
                    )}
                    {settlementStatus === 'pending' && !isPayer && (
                      <Badge $variant="default">Pending</Badge>
                    )}
                    {settlementStatus === 'initiated' && !isPayee && (
                      <Badge $variant="warning">Awaiting</Badge>
                    )}
                  </TransactionActions>
                </TransactionCard>
              );
            })}
          </SettlementSection>
        );
      })()}

      {/* Edge case: event settled with no payments needed */}
      {event.status === 'settled' && settlements.length === 0 && (
        <NoPaymentsCard>
          <NoPaymentsTitle>All Balanced!</NoPaymentsTitle>
          <NoPaymentsDesc>No payments are needed — everyone is even.</NoPaymentsDesc>
          {isAdmin && (
            <Button $variant="primary" onClick={handleCloseEvent} data-testid="close-event-no-payments">
              Close Event
            </Button>
          )}
        </NoPaymentsCard>
      )}

      <TabList>
        <Tab $active={activeTab === 'expenses'} onClick={() => setActiveTab('expenses')} data-testid="tab-expenses">
          Expenses ({visibleExpenses.length})
        </Tab>
        <Tab $active={activeTab === 'participants'} onClick={() => setActiveTab('participants')} data-testid="tab-participants">
          Participants ({participants.length})
        </Tab>
        <Tab $active={activeTab === 'groups'} onClick={() => setActiveTab('groups')} data-testid="tab-groups">
          Groups ({groups.length})
        </Tab>
        <Tab $active={activeTab === 'invitations'} onClick={() => setActiveTab('invitations')} data-testid="tab-invitations">
          Invitations ({invitations.length})
        </Tab>
      </TabList>

      {/* Expenses Tab */}
      {activeTab === 'expenses' && (
        <TabPanel data-testid="expenses-panel">
          {(event.status === 'active' || event.status === 'review') && (
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12, gap: 8 }}>
              {isAdmin && event.status === 'active' && (
                <Button $variant="outline" onClick={handleSettle} disabled={settleLoading} data-testid="settle-btn">
                  {settleLoading ? 'Calculating...' : 'Settle Now'}
                </Button>
              )}
              {isAdmin && event.status === 'review' && (event as any).settlementStale && (
                <Button $variant="outline" onClick={handleRegenerateSettlement} disabled={regenerateLoading} data-testid="regenerate-btn-expenses">
                  {regenerateLoading ? 'Regenerating...' : 'Regenerate Settlement'}
                </Button>
              )}
              <Link href={`/events/${eventId}/expenses/create`}>
                <Button $variant="primary" data-testid="add-expense-btn">+ Add Expense</Button>
              </Link>
            </div>
          )}
          {visibleExpenses.length === 0 ? (
            <EmptyState
              title="No expenses yet"
              description="Add your first expense to start tracking."
              dataTestId="empty-expenses"
              action={(event.status === 'active' || event.status === 'review') ? (
                <Link href={`/events/${eventId}/expenses/create`}>
                  <Button $variant="primary">Add Expense</Button>
                </Link>
              ) : undefined}
            />
          ) : (
            <Card>
              <CardBody>
                {visibleExpenses.map((expense) => {
                  const isExpanded = expandedExpenseId === expense.id;
                  const sym = CURRENCY_SYMBOLS[expense.currency] || expense.currency;
                  return (
                    <ExpenseRowWrapper key={expense.id} data-testid={`expense-item-${expense.id}`}>
                      <ExpenseRowClickable onClick={() => setExpandedExpenseId(isExpanded ? null : expense.id)}>
                        <ListItemInfo>
                          <ListItemTitle>
                            {expense.title}
                            {expense.isPrivate && <Badge $variant="warning" style={{ marginLeft: 8, fontSize: 10 }}>Private</Badge>}
                            <span style={{ fontSize: 11, marginLeft: 6, opacity: 0.5 }}>{isExpanded ? '▲' : '▼'}</span>
                          </ListItemTitle>
                          <ListItemSub>
                            Paid by: {getUserName(expense.paidBy)} · {expense.paidOnBehalfOf && expense.paidOnBehalfOf.length > 0 ? 'On Behalf' : expense.splitType.charAt(0).toUpperCase() + expense.splitType.slice(1)} split{!expense.isPrivate && ` · ${expense.splits.length} split(s)`}
                          </ListItemSub>
                        </ListItemInfo>
                        <Amount>{sym}{expense.amount.toFixed(2)}</Amount>
                        {(event.status === 'active' || event.status === 'review') && (currentUserId === expense.paidBy || isAdmin) && (
                          <>
                            <Link href={`/events/${eventId}/expenses/${expense.id}/edit`} onClick={(e) => e.stopPropagation()}>
                              <Button $variant="outline" $size="sm" data-testid={`edit-expense-${expense.id}`}>
                                Edit
                              </Button>
                            </Link>
                            <Button $variant="ghost" onClick={(e: React.MouseEvent) => { e.stopPropagation(); handleDeleteExpense(expense.id); }} data-testid={`delete-expense-${expense.id}`}>
                              ✕
                            </Button>
                          </>
                        )}
                      </ExpenseRowClickable>
                      {isExpanded && expense.splits && expense.splits.length > 0 && (
                        <SplitDetailPanel>
                          <SplitMetaRow>
                            <SplitMetaItem><strong>Split type:</strong> {expense.paidOnBehalfOf && expense.paidOnBehalfOf.length > 0 ? 'On Behalf' : expense.splitType.charAt(0).toUpperCase() + expense.splitType.slice(1)}</SplitMetaItem>
                            {expense.description && <SplitMetaItem><strong>Note:</strong> {expense.description}</SplitMetaItem>}
                            {expense.paidOnBehalfOf && expense.paidOnBehalfOf.length > 0 && (
                              <SplitMetaItem><strong>On behalf of:</strong> {expense.paidOnBehalfOf.map((e: any) => getEntityName(e.entityId, e.entityType)).join(', ')}</SplitMetaItem>
                            )}
                          </SplitMetaRow>
                          <SplitDetailGrid>
                            <SplitDetailHeader>Entity</SplitDetailHeader>
                            <SplitDetailHeader>{expense.splitType === 'ratio' ? 'Ratio' : '%'}</SplitDetailHeader>
                            <SplitDetailHeader>Amount</SplitDetailHeader>
                            {expense.splits.map((split: any, idx: number) => {
                              const pct = expense.amount > 0 ? ((split.amount / expense.amount) * 100).toFixed(1) : '0.0';
                              return (
                                <React.Fragment key={`${split.entityId}-${idx}`}>
                                  <SplitDetailCell>
                                    {getEntityName(split.entityId, split.entityType)}
                                    <SplitDetailMuted>{split.entityType === 'group' ? '(group)' : ''}</SplitDetailMuted>
                                  </SplitDetailCell>
                                  <SplitDetailCell>
                                    {expense.splitType === 'ratio' && split.ratio != null ? split.ratio : `${pct}%`}
                                  </SplitDetailCell>
                                  <SplitDetailCell $bold>{sym}{split.amount.toFixed(2)}</SplitDetailCell>
                                </React.Fragment>
                              );
                            })}
                          </SplitDetailGrid>
                        </SplitDetailPanel>
                      )}
                    </ExpenseRowWrapper>
                  );
                })}
              </CardBody>
            </Card>
          )}
        </TabPanel>
      )}

      {/* Participants Tab */}
      {activeTab === 'participants' && (
        <TabPanel data-testid="participants-panel">
          {event.status === 'active' && (
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
              <Button $variant="primary" onClick={() => setShowInvite(true)} data-testid="invite-btn">
                + Invite
              </Button>
            </div>
          )}
          {participants.length === 0 ? (
            <EmptyState title="No participants" description="Invite people to join this event." dataTestId="empty-participants" />
          ) : (
            <Card>
              <CardBody>
                {participants.map((p) => (
                  <HighlightedListItem key={p.userId} $isCurrentUser={p.userId === currentUserId} data-testid={`participant-${p.userId}`}>
                    <ListItemInfo>
                      <ListItemTitle>
                        {p.displayName || p.email || p.userId}
                        {p.userId === currentUserId && <CurrentUserBadge>You</CurrentUserBadge>}
                      </ListItemTitle>
                      <ListItemSub>
                        Role: {p.role} · Joined: {formatDate(p.joinedAt)}
                        {p.email ? ` · ${p.email}` : ''}
                      </ListItemSub>
                    </ListItemInfo>
                    <Badge $variant={statusBadgeVariant(p.status)}>{p.status}</Badge>
                    {(event.status === 'active' || event.status === 'review') && isAdmin && p.userId !== currentUserId && p.userId !== event.createdBy && (
                      <>
                        {p.role === 'member' ? (
                          <Button $variant="outline" $size="sm" onClick={() => handleChangeParticipantRole(p.userId, 'admin')} data-testid={`promote-${p.userId}`}>
                            Promote
                          </Button>
                        ) : (
                          <Button $variant="outline" $size="sm" onClick={() => handleChangeParticipantRole(p.userId, 'member')} data-testid={`demote-${p.userId}`}>
                            Demote
                          </Button>
                        )}
                        <Button $variant="ghost" onClick={() => handleRemoveParticipant(p.userId)} data-testid={`remove-participant-${p.userId}`}>
                          ✕
                        </Button>
                      </>
                    )}
                  </HighlightedListItem>
                ))}
              </CardBody>
            </Card>
          )}
        </TabPanel>
      )}

      {/* Groups Tab */}
      {activeTab === 'groups' && (
        <TabPanel data-testid="groups-panel">
          {event.status === 'active' && (
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
              <Button $variant="primary" onClick={() => setShowCreateGroup(true)} data-testid="create-group-btn">
                + Create Group
              </Button>
            </div>
          )}
          {groups.length === 0 ? (
            <EmptyState
              title="No groups yet"
              description="Create groups to organize participants (e.g. families, couples)."
              dataTestId="empty-groups"
            />
          ) : (
            <Card>
              <CardBody>
                {groups.map((group) => (
                  <ListItem key={group.id} data-testid={`group-item-${group.id}`}>
                    <ListItemInfo>
                      <ListItemTitle>{group.name}</ListItemTitle>
                      <ListItemSub>
                        Members: {group.members.map(m => getUserName(m)).join(', ')} · Payer: {getUserName(group.payerUserId)}
                        {group.description ? ` · ${group.description}` : ''}
                      </ListItemSub>
                    </ListItemInfo>
                    {(event.status === 'active' || event.status === 'review') && currentUserId && (currentUserId === group.createdBy || currentUserId === group.representative || isAdmin) && (
                      <>
                        <Button $variant="outline" onClick={() => openEditGroup(group)} data-testid={`edit-group-${group.id}`}>
                          Edit
                        </Button>
                        <Button $variant="ghost" onClick={() => handleDeleteGroup(group.id)} data-testid={`delete-group-${group.id}`}>
                          ✕
                        </Button>
                      </>
                    )}
                  </ListItem>
                ))}
              </CardBody>
            </Card>
          )}
        </TabPanel>
      )}

      {/* Invitations Tab */}
      {activeTab === 'invitations' && (
        <TabPanel data-testid="invitations-panel">
          {event.status === 'active' && (
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
              <Button $variant="primary" onClick={() => setShowInvite(true)} data-testid="send-invite-btn">
                + Send Invitation
              </Button>
            </div>
          )}
          {invitations.length === 0 ? (
            <EmptyState
              title="No invitations"
              description="Send invitations to add people to this event."
              dataTestId="empty-invitations"
            />
          ) : (
            <Card>
              <CardBody>
                {invitations.map((inv) => (
                  <ListItem key={inv.id} data-testid={`invitation-item-${inv.id}`}>
                    <ListItemInfo>
                      <ListItemTitle>{inv.inviteeEmail || inv.inviteePhone || (inv.inviteeUserId ? getUserName(inv.inviteeUserId) : 'Unknown')}</ListItemTitle>
                      <ListItemSub>
                        Invited by: {(inv as any).inviterName || getUserName(inv.invitedBy)} · Role: {inv.role} · Sent: {formatDate(inv.createdAt)}
                        {inv.message ? ` · "${inv.message}"` : ''}
                      </ListItemSub>
                    </ListItemInfo>
                    <Badge $variant={statusBadgeVariant(inv.status)}>{inv.status}</Badge>
                    {event.status === 'active' && inv.status === 'pending' && (
                      <Button $variant="ghost" onClick={() => handleRevokeInvitation(inv.id)} data-testid={`revoke-invitation-${inv.id}`}>
                        Revoke
                      </Button>
                    )}
                  </ListItem>
                ))}
              </CardBody>
            </Card>
          )}
        </TabPanel>
      )}

      {/* Edit Event Modal */}
      <Modal open={showEditEvent} onClose={() => setShowEditEvent(false)} dataTestId="edit-event-modal">
        <ModalHeader>
          <ModalTitle>Edit Event</ModalTitle>
        </ModalHeader>
        <ModalBody>
          <Form onSubmit={handleEditEvent}>
            <Field>
              <Label htmlFor="edit-name">Name</Label>
              <Input id="edit-name" data-testid="edit-event-name" value={editForm.name} onChange={(e) => setEditForm(f => ({ ...f, name: e.target.value }))} disabled={editLoading} />
            </Field>
            <Field>
              <Label htmlFor="edit-desc">Description</Label>
              <TextArea id="edit-desc" data-testid="edit-event-description" value={editForm.description} onChange={(e) => setEditForm(f => ({ ...f, description: e.target.value }))} disabled={editLoading} />
            </Field>
            <Row>
              <Field>
                <Label htmlFor="edit-type">Type</Label>
                <Select id="edit-type" data-testid="edit-event-type" value={editForm.type} onChange={(e) => setEditForm(f => ({ ...f, type: e.target.value }))} disabled={editLoading}>
                  <option value="event">Event</option>
                  <option value="trip">Trip</option>
                </Select>
              </Field>
              <Field>
                <Label htmlFor="edit-status">Status</Label>
                <Select id="edit-status" data-testid="edit-event-status" value={editForm.status} onChange={(e) => setEditForm(f => ({ ...f, status: e.target.value }))} disabled={editLoading}>
                  <option value="active">Active</option>
                  <option value="settled">Settled</option>
                  <option value="closed">Closed</option>
                </Select>
              </Field>
            </Row>
            <Row>
              <Field>
                <Label htmlFor="edit-currency">Expense Currency</Label>
                <Select id="edit-currency" data-testid="edit-event-currency" value={editForm.currency} onChange={(e) => setEditForm(f => ({ ...f, currency: e.target.value }))} disabled={editLoading}>
                  {Object.keys(CURRENCY_SYMBOLS).map(c => (
                    <option key={c} value={c}>{CURRENCY_SYMBOLS[c]} {c}</option>
                  ))}
                </Select>
              </Field>
              <Field>
                <Label htmlFor="edit-settlement-currency">Settlement Currency <span style={{ fontSize: 10, opacity: 0.6 }}>(Pro)</span></Label>
                <Select id="edit-settlement-currency" data-testid="edit-event-settlement-currency" value={editForm.settlementCurrency} onChange={(e) => setEditForm(f => ({ ...f, settlementCurrency: e.target.value }))} disabled={editLoading}>
                  <option value="">Same as expense currency</option>
                  {Object.keys(CURRENCY_SYMBOLS).map(c => (
                    <option key={c} value={c}>{CURRENCY_SYMBOLS[c]} {c}</option>
                  ))}
                </Select>
              </Field>
            </Row>
            <ModalFooter>
              <Button type="button" $variant="outline" onClick={() => setShowEditEvent(false)} disabled={editLoading}>Cancel</Button>
              <Button type="submit" $variant="primary" disabled={editLoading} data-testid="edit-event-save">
                {editLoading ? 'Saving...' : 'Save Changes'}
              </Button>
            </ModalFooter>
          </Form>
        </ModalBody>
      </Modal>

      {/* Invite Modal */}
      <Modal open={showInvite} onClose={() => setShowInvite(false)} dataTestId="invite-modal">
        <ModalHeader>
          <ModalTitle>Invite to Event</ModalTitle>
        </ModalHeader>
        <ModalBody>
          <Form onSubmit={handleInvite}>
            <Field>
              <Label htmlFor="invite-email">Email Address</Label>
              <Input id="invite-email" data-testid="invite-email-input" type="email" placeholder="friend@example.com" value={inviteForm.inviteeEmail} onChange={(e) => setInviteForm(f => ({ ...f, inviteeEmail: e.target.value }))} disabled={inviteLoading} />
            </Field>
            <Field>
              <Label htmlFor="invite-role">Role</Label>
              <Select id="invite-role" data-testid="invite-role-select" value={inviteForm.role} onChange={(e) => setInviteForm(f => ({ ...f, role: e.target.value }))} disabled={inviteLoading}>
                <option value="member">Member</option>
                <option value="admin">Admin</option>
              </Select>
            </Field>
            <Field>
              <Label htmlFor="invite-group">Assign to Group (optional)</Label>
              <Select id="invite-group" data-testid="invite-group-select" value={inviteForm.groupId} onChange={(e) => setInviteForm(f => ({ ...f, groupId: e.target.value }))} disabled={inviteLoading}>
                <option value="">No group (individual user)</option>
                {groups.map(g => (
                  <option key={g.id} value={g.id}>{g.name}</option>
                ))}
              </Select>
            </Field>
            <Field>
              <Label htmlFor="invite-message">Message (optional)</Label>
              <TextArea id="invite-message" data-testid="invite-message-input" placeholder="Join our event!" value={inviteForm.message} onChange={(e) => setInviteForm(f => ({ ...f, message: e.target.value }))} disabled={inviteLoading} />
            </Field>
            <ModalFooter>
              <Button type="button" $variant="outline" onClick={() => setShowInvite(false)} disabled={inviteLoading}>Cancel</Button>
              <Button type="submit" $variant="primary" disabled={inviteLoading || !inviteForm.inviteeEmail.trim()} data-testid="invite-submit">
                {inviteLoading ? 'Sending...' : 'Send Invitation'}
              </Button>
            </ModalFooter>
          </Form>
        </ModalBody>
      </Modal>

      {/* Create Group Modal */}
      <Modal open={showCreateGroup} onClose={() => setShowCreateGroup(false)} dataTestId="create-group-modal">
        <ModalHeader>
          <ModalTitle>Create Group</ModalTitle>
        </ModalHeader>
        <ModalBody>
          <Form onSubmit={handleCreateGroup}>
            <Field>
              <Label htmlFor="group-name">Group Name</Label>
              <Input id="group-name" data-testid="group-name-input" placeholder="e.g. Family" value={groupForm.name} onChange={(e) => setGroupForm(f => ({ ...f, name: e.target.value }))} disabled={groupLoading} />
            </Field>
            <Field>
              <Label htmlFor="group-desc">Description (optional)</Label>
              <TextArea id="group-desc" data-testid="group-description-input" placeholder="Brief description..." value={groupForm.description} onChange={(e) => setGroupForm(f => ({ ...f, description: e.target.value }))} disabled={groupLoading} />
            </Field>
            <Field>
              <Label>Members</Label>
              <MemberCheckList>
                {participants.map(p => (
                  <MemberCheckItem key={p.userId}>
                    <input
                      type="checkbox"
                      data-testid={`group-member-checkbox-${p.userId}`}
                      checked={groupForm.memberIds.includes(p.userId)}
                      disabled={groupLoading}
                      onChange={(e) => {
                        const checked = e.target.checked;
                        setGroupForm(f => {
                          const ids = checked
                            ? [...f.memberIds, p.userId]
                            : f.memberIds.filter(id => id !== p.userId);
                          // If payer was removed from members, clear payer
                          const payer = ids.includes(f.payerUserId) ? f.payerUserId : '';
                          return { ...f, memberIds: ids, payerUserId: payer };
                        });
                      }}
                    />
                    {p.displayName || p.email || p.userId}
                    {p.userId === currentUserId && ' (You)'}
                  </MemberCheckItem>
                ))}
                {participants.length === 0 && (
                  <MutedText>No participants yet. Invite users first.</MutedText>
                )}
              </MemberCheckList>
            </Field>
            <Field>
              <Label htmlFor="group-payer">Payer</Label>
              <Select id="group-payer" data-testid="group-payer-input" value={groupForm.payerUserId} onChange={(e) => setGroupForm(f => ({ ...f, payerUserId: e.target.value }))} disabled={groupLoading}>
                <option value="">Select payer...</option>
                {participants.filter(p => groupForm.memberIds.includes(p.userId)).map(p => (
                  <option key={p.userId} value={p.userId}>{p.displayName || p.email || p.userId}</option>
                ))}
              </Select>
            </Field>
            <ModalFooter>
              <Button type="button" $variant="outline" onClick={() => setShowCreateGroup(false)} disabled={groupLoading}>Cancel</Button>
              <Button type="submit" $variant="primary" disabled={groupLoading || !groupForm.name.trim() || groupForm.memberIds.length === 0} data-testid="create-group-submit">
                {groupLoading ? 'Creating...' : 'Create Group'}
              </Button>
            </ModalFooter>
          </Form>
        </ModalBody>
      </Modal>

      {/* Edit Group Modal */}
      <Modal open={showEditGroup} onClose={() => setShowEditGroup(false)} dataTestId="edit-group-modal">
        <ModalHeader>
          <ModalTitle>Edit Group</ModalTitle>
        </ModalHeader>
        <ModalBody>
          <Form onSubmit={handleEditGroup}>
            <Field>
              <Label htmlFor="edit-group-name">Group Name</Label>
              <Input id="edit-group-name" data-testid="edit-group-name-input" value={editGroupForm.name} onChange={(e) => setEditGroupForm(f => ({ ...f, name: e.target.value }))} disabled={editGroupLoading} />
            </Field>
            <Field>
              <Label htmlFor="edit-group-desc">Description (optional)</Label>
              <TextArea id="edit-group-desc" data-testid="edit-group-description-input" value={editGroupForm.description} onChange={(e) => setEditGroupForm(f => ({ ...f, description: e.target.value }))} disabled={editGroupLoading} />
            </Field>
            <Field>
              <Label>Members</Label>
              <MemberCheckList>
                {participants.map(p => (
                  <MemberCheckItem key={p.userId}>
                    <input
                      type="checkbox"
                      data-testid={`edit-group-member-checkbox-${p.userId}`}
                      checked={editGroupForm.memberIds.includes(p.userId)}
                      disabled={editGroupLoading}
                      onChange={(e) => {
                        const checked = e.target.checked;
                        setEditGroupForm(f => {
                          const ids = checked
                            ? [...f.memberIds, p.userId]
                            : f.memberIds.filter(id => id !== p.userId);
                          const payer = ids.includes(f.payerUserId) ? f.payerUserId : '';
                          return { ...f, memberIds: ids, payerUserId: payer };
                        });
                      }}
                    />
                    {p.displayName || p.email || p.userId}
                    {p.userId === currentUserId && ' (You)'}
                  </MemberCheckItem>
                ))}
              </MemberCheckList>
            </Field>
            <Field>
              <Label htmlFor="edit-group-payer">Payer</Label>
              <Select id="edit-group-payer" data-testid="edit-group-payer-input" value={editGroupForm.payerUserId} onChange={(e) => setEditGroupForm(f => ({ ...f, payerUserId: e.target.value }))} disabled={editGroupLoading}>
                <option value="">Select payer...</option>
                {participants.filter(p => editGroupForm.memberIds.includes(p.userId)).map(p => (
                  <option key={p.userId} value={p.userId}>{p.displayName || p.email || p.userId}</option>
                ))}
              </Select>
            </Field>
            <ModalFooter>
              <Button type="button" $variant="outline" onClick={() => setShowEditGroup(false)} disabled={editGroupLoading}>Cancel</Button>
              <Button type="submit" $variant="primary" disabled={editGroupLoading || !editGroupForm.name.trim() || editGroupForm.memberIds.length === 0} data-testid="edit-group-submit">
                {editGroupLoading ? 'Saving...' : 'Save Changes'}
              </Button>
            </ModalFooter>
          </Form>
        </ModalBody>
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal open={showDeleteConfirm} onClose={() => setShowDeleteConfirm(false)} dataTestId="delete-confirm-modal">
        <ModalHeader>
          <ModalTitle>Delete Event</ModalTitle>
        </ModalHeader>
        <ModalBody>
          <DeleteModalContent>
            <p style={{ margin: '0 0 12px', fontWeight: 600, fontSize: 16 }}>
              Are you sure you want to delete &ldquo;{event?.name}&rdquo;?
            </p>
            {pendingSettlementTotal !== null && pendingSettlementTotal > 0 && (
              <WarningBox>
                <p style={{ margin: 0, fontWeight: 600, fontSize: 14 }}>
                  ⚠️ Pending Settlement: {currSym}{pendingSettlementTotal.toFixed(2)} {event?.currency}
                </p>
                <p style={{ margin: '6px 0 0', fontSize: 13 }}>
                  This amount has not been settled yet. Deleting this event means this amount must be <strong>settled manually</strong> outside the application.
                </p>
              </WarningBox>
            )}
            <DangerText>
              ⚠️ This action cannot be undone. The following will happen:
            </DangerText>
            <ul style={{ margin: '0 0 16px', paddingLeft: 20, fontSize: 14, lineHeight: 1.7 }}>
              <li>All expenses associated with this event will be permanently deleted.</li>
              <li>All pending settlements will be <strong>terminated</strong>.</li>
              <li>All participants will lose access to this event.</li>
              <li>All groups within this event will be removed.</li>
              <li>All pending invitations will be revoked.</li>
            </ul>
            <MutedText>
              Only the event creator or admins can perform this action.
            </MutedText>
          </DeleteModalContent>
          <ModalFooter>
            <Button type="button" $variant="outline" onClick={() => setShowDeleteConfirm(false)} disabled={deleteLoading}>
              Cancel
            </Button>
            <Button
              type="button"
              $variant="danger"
              onClick={handleDeleteEvent}
              disabled={deleteLoading}
              data-testid="confirm-delete-btn"
            >
              {deleteLoading ? 'Deleting...' : 'Delete Event Permanently'}
            </Button>
          </ModalFooter>
        </ModalBody>
      </Modal>

      {/* Generic Confirmation Modal (replaces all window.confirm calls) */}
      <Modal open={confirmModal.open} onClose={closeConfirmModal}>
        <ModalHeader>
          <ModalTitle>{confirmModal.title}</ModalTitle>
        </ModalHeader>
        <ModalBody>
          <p style={{ margin: '0 0 20px', fontSize: 14, lineHeight: 1.6 }}>{confirmModal.message}</p>
          <ModalFooter>
            <Button type="button" $variant="outline" onClick={closeConfirmModal}>Cancel</Button>
            <Button type="button" $variant={confirmModal.variant === 'warning' ? 'primary' : 'danger'} onClick={confirmModal.onConfirm}>
              {confirmModal.confirmLabel}
            </Button>
          </ModalFooter>
        </ModalBody>
      </Modal>

      {/* Mark Paid Modal */}
      <Modal open={showMarkPaidModal} onClose={() => setShowMarkPaidModal(false)}>
        <ModalHeader>
          <ModalTitle>Pay Externally and Mark Paid</ModalTitle>
        </ModalHeader>
        <ModalBody>
          {!markPaidTarget ? (
            <p style={{ margin: 0 }}>No settlement selected.</p>
          ) : (
            <>
              {(() => {
                const settlementCurrency = markPaidTarget.settlementCurrency || markPaidTarget.currency;
                const isINR = settlementCurrency === 'INR';
                const payeeMethods = ((markPaidTarget as any).payeePaymentMethods || []) as Array<{ label: string; type: string; details: string; currency: string }>;
                return (
                  <>
                    <p style={{ marginTop: 0, fontSize: 14 }}>
                      {isINR
                        ? 'Complete payment via UPI / Net Banking / Bank Transfer outside Traxettle.'
                        : 'Complete payment via Bank Transfer / Card App / PayPal / Wise / SWIFT outside Traxettle.'}
                    </p>
                    <div style={{ marginBottom: 12 }}>
                      <strong style={{ fontSize: 13 }}>Payee Methods ({settlementCurrency})</strong>
                      {payeeMethods.length === 0 ? (
                        <p style={{ margin: '6px 0 0', fontSize: 12, opacity: 0.75 }}>Payee has not configured a method for this currency yet.</p>
                      ) : (
                        payeeMethods.map((m, idx) => (
                          <div key={`${m.label}-${idx}`} style={{ border: '1px solid var(--color-border, #eee)', borderRadius: 8, padding: '8px 10px', marginTop: 8 }}>
                            <div style={{ fontWeight: 600, fontSize: 13 }}>{m.label} · {m.currency}</div>
                            <div style={{ fontSize: 12, opacity: 0.75 }}>{String(m.type || '').toUpperCase()}</div>
                            <div style={{ fontSize: 12, marginTop: 2 }}>{m.details}</div>
                          </div>
                        ))
                      )}
                    </div>
                  </>
                );
              })()}
              <Field>
                <Label htmlFor="mark-paid-reference">Reference ID (required)</Label>
                <Input
                  id="mark-paid-reference"
                  value={markPaidReferenceId}
                  onChange={(e) => setMarkPaidReferenceId(e.target.value)}
                  placeholder="UTR / txn ID / bank reference"
                />
              </Field>
              <Field>
                <Label htmlFor="mark-paid-proof">Proof URL (optional)</Label>
                <Input
                  id="mark-paid-proof"
                  value={markPaidProofUrl}
                  onChange={(e) => setMarkPaidProofUrl(e.target.value)}
                  placeholder="https://... uploaded proof url"
                />
              </Field>
              <Field>
                <Label htmlFor="mark-paid-upload">Upload Proof File</Label>
                <Input
                  id="mark-paid-upload"
                  type="file"
                  onChange={(e) => {
                    const file = e.currentTarget.files?.[0];
                    if (file) void handleUploadMarkPaidProof(file);
                  }}
                />
                <div style={{ fontSize: 12, opacity: 0.75 }}>
                  {markPaidUploading ? 'Uploading proof…' : 'This upload auto-fills Proof URL.'}
                </div>
              </Field>
              <Field>
                <Label htmlFor="mark-paid-note">Note (optional)</Label>
                <Input
                  id="mark-paid-note"
                  value={markPaidNote}
                  onChange={(e) => setMarkPaidNote(e.target.value)}
                  placeholder="Any additional context for payee"
                />
              </Field>
            </>
          )}
          <ModalFooter>
            <Button type="button" $variant="outline" onClick={() => setShowMarkPaidModal(false)} disabled={markPaidSubmitting || markPaidUploading}>
              Cancel
            </Button>
            <Button
              type="button"
              $variant="primary"
              disabled={markPaidSubmitting || markPaidUploading || !markPaidTarget || !markPaidReferenceId.trim()}
              onClick={() => markPaidTarget && doMarkPaid(markPaidTarget.id, markPaidTarget.settlementCurrency || markPaidTarget.currency)}
            >
              {markPaidSubmitting ? 'Submitting…' : 'I\'ve Paid'}
            </Button>
          </ModalFooter>
        </ModalBody>
      </Modal>

      {/* Settlement Details Modal */}
      <Modal open={showSettlementModal} onClose={() => setShowSettlementModal(false)}>
        <ModalHeader>
          <ModalTitle>Settlement Details</ModalTitle>
        </ModalHeader>
        <ModalBody>
          {(() => {
            const nonZeroSettlements = settlements.filter(s => s.amount > 0.01);
            if (nonZeroSettlements.length === 0) {
              return <p style={{ textAlign: 'center', padding: 20, opacity: 0.6 }}>No settlements — everyone is even.</p>;
            }
            const totalAmt = nonZeroSettlements.reduce((sum, s) => sum + s.amount, 0);
            const hasFx = nonZeroSettlements.some(s => s.settlementCurrency && s.settlementCurrency !== s.currency);
            const settlCurrSym = hasFx ? (CURRENCY_SYMBOLS[(nonZeroSettlements[0] as any).settlementCurrency] || (nonZeroSettlements[0] as any).settlementCurrency || '') : '';
            const approvals = (event as any)?.settlementApprovals as Record<string, SettlementApproval> | undefined;
            const approvalEntries = approvals ? Object.entries(approvals) : [];

            return (
              <div>
                <div style={{ marginBottom: 16 }}>
                  <strong>Status:</strong> <Badge $variant={statusBadgeVariant(event.status)}>{event.status}</Badge>
                  <span style={{ marginLeft: 12 }}><strong>Total:</strong> {currSym}{totalAmt.toFixed(2)}</span>
                  {hasFx && <span style={{ marginLeft: 8, fontSize: 12, opacity: 0.7 }}>≈ {settlCurrSym}{nonZeroSettlements.reduce((s, t) => s + (t.settlementAmount || t.amount), 0).toFixed(2)}</span>}
                </div>

                {approvalEntries.length > 0 && (
                  <div style={{ marginBottom: 16 }}>
                    <strong style={{ fontSize: 13 }}>Approvals:</strong>
                    {approvalEntries.map(([entityId, approval]) => (
                      <div key={entityId} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0' }}>
                        <StatusDot $status={approval.approved ? 'completed' : 'pending'} />
                        <span style={{ flex: 1, fontSize: 13 }}>{approval.displayName || entityId}</span>
                        <Badge $variant={approval.approved ? 'success' : 'warning'} style={{ fontSize: 10 }}>
                          {approval.approved ? 'Approved' : 'Pending'}
                        </Badge>
                      </div>
                    ))}
                  </div>
                )}

                <div style={{ borderTop: '1px solid var(--color-border, #eee)', paddingTop: 12 }}>
                  <strong style={{ fontSize: 13, marginBottom: 8, display: 'block' }}>Transactions:</strong>
                  {nonZeroSettlements.map((s) => {
                    const displayAmt = s.settlementAmount && s.settlementCurrency && s.settlementCurrency !== s.currency
                      ? `${CURRENCY_SYMBOLS[s.settlementCurrency] || s.settlementCurrency}${s.settlementAmount.toFixed(2)}`
                      : `${currSym}${s.amount.toFixed(2)}`;
                    return (
                      <div key={s.id} style={{ padding: '8px 0', borderBottom: '1px solid var(--color-border, #f0f0f0)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ flex: 1 }}>
                            <strong>{getEntityName(s.fromEntityId, s.fromEntityType)}</strong>
                            <span style={{ margin: '0 6px', opacity: 0.5 }}>→</span>
                            <strong>{getEntityName(s.toEntityId, s.toEntityType)}</strong>
                          </span>
                          <span style={{ fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{displayAmt}</span>
                          <Badge $variant={s.status === 'completed' ? 'success' : s.status === 'initiated' ? 'warning' : 'default'} style={{ fontSize: 10 }}>
                            {s.status}
                          </Badge>
                        </div>
                        <div style={{ marginTop: 8, paddingLeft: 4 }}>
                          <div style={{ fontSize: 11, fontWeight: 700, opacity: 0.8, marginBottom: 6 }}>Timeline</div>
                          {((s as any).auditTrail || []).length === 0 ? (
                            <div style={{ fontSize: 12, opacity: 0.6 }}>No activity yet.</div>
                          ) : (
                            ((s as any).auditTrail || []).map((entry: any, idx: number) => (
                              <div key={`${entry.id || idx}`} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', marginBottom: 6 }}>
                                <span style={{ width: 6, height: 6, borderRadius: 3, background: 'var(--color-primary)', marginTop: 6 }} />
                                <div style={{ fontSize: 12 }}>
                                  <div style={{ fontWeight: 600 }}>{String(entry.action || 'update').replace(/_/g, ' ')}</div>
                                  <div style={{ opacity: 0.75 }}>by {getUserName(entry.actorUserId || '')} · {formatDate(entry.createdAt)}</div>
                                  {entry.referenceId ? <div>Ref: {entry.referenceId}</div> : null}
                                  {entry.proofUrl ? <div style={{ color: 'var(--color-primary)' }}>Proof: {entry.proofUrl}</div> : null}
                                  {entry.note ? <div>{entry.note}</div> : null}
                                </div>
                              </div>
                            ))
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })()}
          <ModalFooter>
            <Button type="button" $variant="outline" onClick={() => setShowSettlementModal(false)}>Close</Button>
          </ModalFooter>
        </ModalBody>
      </Modal>
    </Page>
  );
}
