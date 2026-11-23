import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { readAsStringAsync, EncodingType } from 'expo-file-system/legacy';
import {
  ADVANCE_KIND_LABEL,
  CONTRIBUTION_STATUS,
  advanceStatusText,
  canApproveDraw,
  describeSettleUpRow,
  earlyRepaymentImpact,
  entityKey,
  formatMinor,
  fromMinor,
  isPoolSideLeg,
  lentTopUps,
  outstandingLoans,
  poolErrorText,
  poolLegLabel,
  poolNoun,
  poolPaymentActions,
  poolPaymentActionsText,
  REIMBURSEMENT_STATUS,
  REPAYMENT_STATUS,
  reimbursementStatus,
  repaymentStatus,
  settleUpFigures,
  settleUpRows,
  toMinor,
} from '@traxettle/shared';
import type {
  Event as TraxettleEvent,
  EventParticipant,
  Group,
  PoolAdvance,
  PoolContribution,
  PoolDrawStatus,
  PoolLedger,
  Settlement,
} from '@traxettle/shared';
import { api } from '../api';
import { useTheme } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';
import { useFeedback } from '../context/FeedbackContext';
import { useEventSocket } from '../hooks/useSocket';
import { fontSizes, radii, spacing } from '../theme';
import { PoolMeterView, ProofLink } from '../components/pool/PoolViews';
import { pickReceiptImage, poolService } from '../services/pool';
import type { ClosePreview, CoverEntry, ImagePickerLike } from '../services/pool';

/** A success toast: title and message. */
type Done = { title: string; message?: string };

type Sheet =
  | { kind: 'none' }
  | { kind: 'amount'; title: string; hint?: string; initialMinor: number; giftChoice?: { loanLabel: string }; submit: (minor: number, gift: boolean) => Promise<unknown>; done?: (gift: boolean) => Done }
  | { kind: 'markPaid'; contribution: PoolContribution }
  | { kind: 'amounts' }
  | { kind: 'reconcile'; mode: 'close' | 'settle' }
  // Money handed over (§9.3, §10.6).
  | { kind: 'giveMoney' }
  | { kind: 'returnMoney'; byCustodian: boolean }
  | { kind: 'payBack'; userId: string };

export default function PoolScreen({ route, navigation }: any) {
  const { eventId } = route.params as { eventId: string };
  const { colors } = useTheme().theme;
  const { user } = useAuth();
  const me: string | null = user?.userId || null;

  const [event, setEvent] = useState<TraxettleEvent | null>(null);
  const [participants, setParticipants] = useState<EventParticipant[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [legs, setLegs] = useState<Settlement[]>([]);
  const [ledger, setLedger] = useState<PoolLedger | null>(null);
  const [viewCycleId, setViewCycleId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [sheet, setSheet] = useState<Sheet>({ kind: 'none' });
  const [busy, setBusy] = useState(false);
  const { pushToast } = useFeedback();

  const load = useCallback(async () => {
    try {
      const [e, p, g, st, l] = await Promise.all([
        api.get<TraxettleEvent>(`/api/events/${eventId}`),
        api.get<EventParticipant[]>(`/api/events/${eventId}/participants`),
        api.get<Group[]>(`/api/groups/event/${eventId}`),
        api.get<Settlement[]>(`/api/settlements/event/${eventId}`),
        poolService.ledger(eventId, viewCycleId || undefined),
      ]);
      setEvent(e.data);
      setParticipants(p.data || []);
      setGroups(g.data || []);
      setLegs((st.data || []).filter((s) => isPoolSideLeg(s)));
      setLedger(l);
    } catch (err) {
      Alert.alert('Could not load', poolErrorText(err, 'INR'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [eventId, viewCycleId]);

  useEffect(() => { void load(); }, [load]);
  useFocusEffect(useCallback(() => { void load(); }, [load]));
  useEventSocket(eventId, useCallback(() => { void load(); }, [load]));

  if (loading || !event || !ledger) {
    return <View style={[st.center, { backgroundColor: colors.background }]}><ActivityIndicator color={colors.primary} /></View>;
  }

  const config = event.poolConfig!;
  const currency = event.currency;
  const noun = poolNoun(config);
  const isAdmin = Boolean(me && (event.createdBy === me || (event.admins || []).includes(me)));
  const isCustodian = me === config.custodianUserId;
  const isManager = isAdmin || isCustodian;
  const { summary, contributions, entries, spenders, cycles } = ledger;
  const cycle = summary.cycle;
  const viewingPast = Boolean(viewCycleId) && cycle.status === 'closed';
  const canAct = cycle.status === 'open' && !viewingPast && (event.status === 'active' || event.status === 'review');
  const sponsor = config.funderMode === 'sponsor';
  // Your own pending expenses wait for someone else (unless you hold the money).
  const approvableDraws = entries.filter((e) => e.type === 'draw' && e.status === 'pending'
    && canApproveDraw(me ?? '', e.actorUserId, config.custodianUserId, isManager));
  // Payments waiting on you come first, so they're seen without scrolling.
  const myPayments = poolPaymentActions(legs, me);
  const myPaymentsText = poolPaymentActionsText(myPayments.toConfirm.length, myPayments.toPay.length);
  const myLegIds = new Set([...myPayments.toConfirm, ...myPayments.toPay].map((l) => l.id));
  const orderedLegs = [...legs].sort((a, b) => Number(myLegIds.has(b.id)) - Number(myLegIds.has(a.id)));
  const money = (v: number, signed = false) => formatMinor(v, currency, { signed });
  // Money others lent to a sponsor pool: the custodian pays it back at close (design doc §10).
  const lent = sponsor ? lentTopUps(contributions, config.custodianUserId) : { totalMinor: 0, byUser: {} as Record<string, number> };

  const nameOf = (type: 'user' | 'group', id: string) => {
    if (type === 'group') return groups.find((g) => g.id === id)?.name || 'Group';
    if (id === me) return 'You';
    const p = participants.find((x) => x.userId === id);
    return p?.displayName || p?.email || 'Member';
  };

  // ── Money handed over (§9.3, §10.6) ──
  const advances: PoolAdvance[] = ledger.advances || [];
  const holdings = summary.holdings;
  const userKeyOf = (uid: string) => {
    const group = groups.find((g) => (g.members || []).includes(uid));
    return group ? entityKey('group', group.id) : entityKey('user', uid);
  };
  /** The person who hands over for an entity key (a group's payer). */
  const userForKey = (key: string) => {
    const [type, ...rest] = key.split(':');
    const id = rest.join(':');
    if (type !== 'group') return id;
    const group = groups.find((g) => g.id === id);
    return group?.payerUserId || group?.representative || group?.members?.[0] || id;
  };
  const keyLabel = (key: string) => {
    const [type, ...rest] = key.split(':');
    return nameOf(type as 'user' | 'group', rest.join(':'));
  };
  const myHeld = me && holdings ? holdings.heldBy[userKeyOf(me)] || 0 : 0;
  const handOverOpen = canAct && event.status === 'active' && Boolean(holdings);
  const holders = holdings ? Object.entries(holdings.heldBy).filter(([, v]) => v > 0) : [];
  const loans = outstandingLoans(contributions, advances, config.custodianUserId);
  // Who can be handed money: anyone allowed to spend from the pool, except the custodian.
  const adminIds = [event.createdBy, ...(event.admins || [])];
  const spenderIds = participants.map((p) => p.userId).filter((uid) => uid !== config.custodianUserId && (!sponsor
    || adminIds.includes(uid)
    || (config.authorizedSpenders || []).includes(uid)
    || groups.some((g) => (config.authorizedSpenderGroups || []).includes(g.id) && (g.members || []).includes(uid))));
  const custodianName = nameOf('user', config.custodianUserId);
  const showHoldings = Boolean(holdings) && (Object.keys(holdings!.heldBy).length > 0 || holdings!.pendingOutMinor > 0 || advances.length > 0);

  /** `label` titles the error alert; `done`, when given, is the success toast (the same words as web). */
  const run = async (label: string, fn: () => Promise<unknown>, done?: Done) => {
    setBusy(true);
    try {
      await fn();
      if (done) pushToast('success', done.title, done.message);
      setSheet({ kind: 'none' });
      await load();
    } catch (err) {
      Alert.alert(label, poolErrorText(err, currency));
    } finally {
      setBusy(false);
    }
  };

  const card = [st.card, { backgroundColor: colors.surface, borderColor: colors.border }];
  const h2 = [st.h2, { color: colors.text }];
  const meta = [st.meta, { color: colors.textSecondary }];

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 80 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); void load(); }} />}>
        {/* Summary */}
        <View style={card} testID="pool-summary">
          <Text style={h2} testID="pool-title">{noun} · {cycle.label}</Text>
          <Text style={meta}>{cycle.status === 'open' ? 'Open' : cycle.status === 'reconciling' ? 'Settling up' : 'Closed'} · held by {nameOf('user', config.custodianUserId)}</Text>
          {viewingPast && (
            <TouchableOpacity onPress={() => setViewCycleId(null)} style={{ marginTop: spacing.sm }}>
              <Text style={{ color: colors.primary }}>Viewing a closed cycle — back to current</Text>
            </TouchableOpacity>
          )}
          <View style={{ marginTop: spacing.md }}><PoolMeterView overdraft={summary.overdraft} currency={currency} /></View>
          <Text style={[meta, { marginTop: spacing.sm }]}>
            {cycle.openingBalanceMinor !== 0 ? `carried in ${money(cycle.openingBalanceMinor)} · ` : ''}
            collected {money(summary.totals.confirmedRegularMinor + summary.totals.confirmedTopUpMinor)} · spent {money(summary.totals.poolSpendMinor)}
            {summary.totals.reimbursementsMinor ? ` · reimbursed ${money(summary.totals.reimbursementsMinor)}` : ''}
          </Text>
          {showHoldings && holdings && (
            <Text style={[meta, { marginTop: spacing.xs }]} testID="pool-holdings">
              {isCustodian
                ? `With you ${money(holdings.withCustodianMinor)} · With spenders ${money(holdings.withSpendersMinor)}${holdings.pendingOutMinor > 0 ? ` · ${money(holdings.pendingOutMinor)} waiting to be confirmed` : ''}`
                : myHeld > 0
                  ? `You're holding ${money(myHeld)} of the ${noun.toLowerCase()}'s money.`
                  : myHeld < 0
                    ? `The ${noun.toLowerCase()} owes you ${money(-myHeld)} for spends beyond the money you held.`
                    : `With ${custodianName} ${money(holdings.withCustodianMinor)} · With spenders ${money(holdings.withSpendersMinor)}`}
            </Text>
          )}
          {isCustodian && handOverOpen && loans.totalMinor > 0 && (
            <View testID="pool-loans">
              {Object.entries(loans.byUser).map(([uid, owed]) => (
                <View key={uid} style={[st.row, { borderColor: colors.border }]}>
                  <Text style={[meta, { flex: 1 }]}>{nameOf('user', uid)} lent the {noun.toLowerCase()} money: {money(owed)} still to pay back.</Text>
                  <Btn testID={`pay-back-${uid}`} label="Pay back now" color={colors.primary} small outline onPress={() => setSheet({ kind: 'payBack', userId: uid })} />
                </View>
              ))}
            </View>
          )}
          {lent.totalMinor > 0 && (
            <Text style={[meta, { marginTop: spacing.xs }]} testID="pool-lent">
              {isCustodian
                ? `You'll pay back ${money(lent.totalMinor)} that others added, when the ${noun.toLowerCase()} closes.`
                : me && lent.byUser[me]
                  ? `${money(lent.byUser[me])} to get back from ${nameOf('user', config.custodianUserId)} when the ${noun.toLowerCase()} closes.`
                  : `Lent by others: ${money(lent.totalMinor)} (paid back at close).`}
            </Text>
          )}
          {config.preset === 'target_collection' && summary.funding.targetMinor !== null && (
            <Text style={[st.banner, { color: summary.funding.state === 'funded' ? colors.info : colors.warning, backgroundColor: summary.funding.state === 'funded' ? colors.infoBg : colors.warningBg }]}>
              {summary.funding.state === 'funded'
                ? `Fully collected — you're clear to spend.`
                : `Collected ${money(summary.funding.fundedMinor)} of ${money(summary.funding.targetMinor)}. Spending unlocks at the target.`}
            </Text>
          )}
          {summary.arrears.length > 0 && !sponsor && (
            <Text style={[st.banner, { color: colors.warning, backgroundColor: colors.warningBg }]} testID="pool-arrears">
              {summary.arrears.length} contribution{summary.arrears.length === 1 ? '' : 's'} outstanding ({money(summary.arrears.reduce((s, a) => s + a.outstandingMinor, 0))})
            </Text>
          )}
          {summary.overdraft.zone === 'blocked' && summary.overdraft.baselineMinor > 0 && canAct && (
            <Text style={[st.banner, { color: colors.error, backgroundColor: colors.errorBg }]}>
              New pool spending is paused. Expenses already paid can still be recorded and will be flagged.
            </Text>
          )}

          {canAct && (
            <View style={st.actions}>
              <Btn testID="pool-add-money" label="Add money" color={colors.primary} outline onPress={() => setSheet({
                kind: 'amount', title: `Add money to the ${noun.toLowerCase()}`, initialMinor: 0,
                hint: isCustodian ? 'Money you hold is added straight away.' : `${nameOf('user', config.custodianUserId)} confirms once it arrives.`,
                // Anyone but the custodian is lending to the event, unless they give it (§10).
                giftChoice: isCustodian ? undefined : {
                  loanLabel: sponsor
                    ? `${nameOf('user', config.custodianUserId)} pays it back when the ${noun.toLowerCase()} closes`
                    : `Paid back to me when the ${noun.toLowerCase()} settles up`,
                },
                submit: async (minor, gift) => {
                  const c = await poolService.topUp(eventId, { amountMinor: minor, ...(gift ? { gift: true } : {}) });
                  if (!isCustodian && c?.id) await poolService.markPaid(c.id, { amountMinor: minor });
                },
                done: () => ({ title: 'Money added', message: isCustodian ? `Added to the ${noun.toLowerCase()}.` : 'Waiting for the custodian to confirm.' }),
              })} />
              {isCustodian && handOverOpen && spenderIds.length > 0 && (
                <Btn testID="pool-give-money" label="Give money" color={colors.primary} outline onPress={() => setSheet({ kind: 'giveMoney' })} />
              )}
              {isCustodian && handOverOpen && holders.length > 0 && (
                <Btn testID="pool-record-returned" label="Money returned" color={colors.primary} outline onPress={() => setSheet({ kind: 'returnMoney', byCustodian: true })} />
              )}
              {!isCustodian && handOverOpen && myHeld > 0 && (
                <Btn testID="pool-return-money" label="Return money" color={colors.primary} outline onPress={() => setSheet({ kind: 'returnMoney', byCustodian: false })} />
              )}
              {isManager && !sponsor && <Btn testID="pool-set-amounts" label="Set amounts" color={colors.primary} outline onPress={() => setSheet({ kind: 'amounts' })} />}
              {isManager && config.cycleMode === 'recurring' && <Btn testID="pool-close-cycle" label={`Close ${cycle.label}`} color={colors.secondary} onPress={() => setSheet({ kind: 'reconcile', mode: 'close' })} />}
              {isAdmin && event.status === 'active' && <Btn testID="pool-settle-up" label={sponsor ? 'Finish & report' : 'Settle up'} color={colors.primary} onPress={() => setSheet({ kind: 'reconcile', mode: 'settle' })} />}
            </View>
          )}
        </View>

        {/* Pool payments (above approvals: payments waiting on you are listed first) */}
        {event.status === 'active' && legs.length > 0 && (
          <View style={card} testID="pool-payments">
            <Text style={h2}>Pool payments</Text>
            {myPaymentsText && (
              <Text testID="pool-payments-mine" style={[meta, { color: colors.warning, fontWeight: '600', marginBottom: spacing.xs }]}>
                {myPaymentsText}
              </Text>
            )}
            {orderedLegs.map((leg) => (
              <View key={leg.id} style={[st.row, { borderColor: colors.border }]}>
                <View style={{ flex: 1 }}>
                  <Text style={[st.rowTitle, { color: colors.text }]}>{nameOf('user', leg.fromUserId)} → {nameOf('user', leg.toUserId)}</Text>
                  <Text style={meta}>{poolLegLabel(leg) || 'Payment'} · {leg.status === 'completed' ? 'Done' : leg.status === 'netted' ? 'In final settlement' : leg.status === 'initiated' ? 'Paid — awaiting confirmation' : 'To pay'}</Text>
                </View>
                <Text style={[st.amount, { color: colors.text }]}>{money(toMinor(leg.amount, currency))}</Text>
                {me === leg.fromUserId && (leg.status === 'pending' || leg.status === 'failed') && (
                  <Btn label="Mark paid" color={colors.primary} small disabled={busy} onPress={() => run('Mark paid', () => poolService.payLeg(leg.id), { title: 'Marked as paid', message: `Waiting for ${nameOf('user', leg.toUserId)} to confirm.` })} />
                )}
                {me === leg.toUserId && leg.status === 'initiated' && (
                  <>
                    <Btn label="Received" color={colors.success} small disabled={busy} onPress={() => run('Confirm', () => poolService.confirmLeg(leg.id), { title: 'Confirmed', message: 'Recorded as received.' })} />
                    <Btn label="Not received" color={colors.error} small outline disabled={busy} onPress={() => run('Reject', () => poolService.rejectLeg(leg.id), { title: 'Marked as not received' })} />
                  </>
                )}
              </View>
            ))}
          </View>
        )}

        {/* Approvals */}
        {approvableDraws.length > 0 && (
          <View style={card} testID="pool-pending-approvals">
            <Text style={h2}>Waiting for your approval</Text>
            {approvableDraws.map((e) => (
              <View key={e.id} style={[st.row, { borderColor: colors.border }]}>
                <View style={{ flex: 1 }}>
                  <Text style={[st.rowTitle, { color: colors.text }]}>{e.title}</Text>
                  <Text style={meta}>
                    {e.fundingSource === 'pool_reimbursement' ? 'Reimbursement' : e.alreadyIncurred ? 'Pool spend · already paid' : 'Pool spend · asking first'}
                    {e.paidFrom === 'advance' ? ' · money they hold' : e.paidFrom === 'sponsor_card' ? ` · ${custodianName === 'You' ? 'your' : `${custodianName}'s`} card or UPI` : ''}
                    {' · '}{nameOf('user', e.actorUserId)}{e.receiptUrls.length ? ` · ${e.receiptUrls.length} receipt(s)` : ''}
                  </Text>
                </View>
                <Text style={[st.amount, { color: colors.text }]}>{money(-e.amountMinor)}</Text>
                <Btn testID={`approve-${e.id}`} label="Approve" color={colors.success} small disabled={busy || !canAct}
                  onPress={() => run('Approve', () => poolService.approveDraw(e.id), {
                    title: 'Approved', message: e.fundingSource === 'pool_reimbursement' ? 'A reimbursement payment was created.' : 'Deducted from the pool.',
                  })} />
                <Btn testID={`reject-${e.id}`} label="Reject" color={colors.error} small outline disabled={busy || !canAct}
                  onPress={() => {
                    const reject = () => run('Reject', () => poolService.rejectDraw(e.id), { title: 'Rejected' });
                    // Rejecting money already spent from the pool means the spender owes it back (§9.2):
                    // as a repayment, or (paid from money they hold) as part of what they hold (§9.3).
                    if (e.fundingSource === 'pool' && e.alreadyIncurred && e.actorUserId !== config.custodianUserId) {
                      const who = nameOf('user', e.actorUserId);
                      const text = e.paidFrom === 'advance'
                        ? `${who} paid this with ${noun.toLowerCase()} money they hold. If you reject it, the ${money(-e.amountMinor)} stays with them, to be returned or settled at the end.`
                        : `${who} says this was already paid with the ${noun.toLowerCase()}'s money. If you reject it, ${who} owes ${money(-e.amountMinor)} back to ${custodianName.replace(/^You$/, 'you')}.`;
                      Alert.alert('Reject this spend?', text, [
                        { text: 'Cancel', style: 'cancel' },
                        { text: 'Reject', style: 'destructive', onPress: () => { void reject(); } },
                      ]);
                    } else {
                      void reject();
                    }
                  }} />
              </View>
            ))}
          </View>
        )}

        {/* Money handed over (§9.3, §10.6) */}
        {advances.length > 0 && (
          <View style={card} testID="pool-movements">
            <Text style={h2}>Money handed over</Text>
            <Text style={meta}>Advances to spenders, money returned and loans paid back early</Text>
            {[...advances].reverse().map((a) => {
              const waiting = a.status === 'initiated' && handOverOpen;
              return (
                <View key={a.id} style={[st.row, { borderColor: colors.border }]} testID={`advance-${a.id}`}>
                  <View style={{ flex: 1 }}>
                    <Text style={[st.rowTitle, { color: colors.text }]}>
                      {ADVANCE_KIND_LABEL[a.kind]} · {advanceStatusText(a, me ?? '', (uid) => nameOf('user', uid))}
                    </Text>
                    <Text style={meta}>
                      {nameOf('user', a.fromUserId)} → {nameOf('user', a.toUserId)} · {new Date(a.confirmedAt || a.createdAt).toLocaleDateString()}
                      {a.note ? ` · ${a.note}` : ''}
                      {a.proofUrl ? <>{' · '}<ProofLink url={a.proofUrl} testID={`advance-proof-${a.id}`} /></> : null}
                      {a.status === 'rejected' && a.rejectionReason ? ` · ${a.rejectionReason}` : ''}
                    </Text>
                  </View>
                  <Text style={[st.amount, { color: a.status === 'rejected' || a.status === 'cancelled' ? colors.muted : colors.text }]}>{money(a.amountMinor)}</Text>
                  {waiting && a.toUserId === me && (
                    <>
                      <Btn testID={`advance-confirm-${a.id}`} label="Received" color={colors.success} small disabled={busy} onPress={() => run('Confirm', () => poolService.confirmAdvance(a.id), { title: 'Confirmed', message: 'Recorded as received.' })} />
                      <Btn testID={`advance-reject-${a.id}`} label="Not received" color={colors.error} small outline disabled={busy} onPress={() => run('Not received', () => poolService.rejectAdvance(a.id), { title: 'Marked as not received' })} />
                    </>
                  )}
                  {waiting && a.createdBy === me && a.toUserId !== me && (
                    <Btn testID={`advance-cancel-${a.id}`} label="Cancel" color={colors.muted} small outline disabled={busy} onPress={() => run('Cancel', () => poolService.cancelAdvance(a.id), { title: 'Cancelled' })} />
                  )}
                </View>
              );
            })}
          </View>
        )}

        {/* Contributions */}
        <View style={card} testID="pool-contributions">
          <Text style={h2}>{sponsor ? 'Budget' : 'Contributions'}</Text>
          {!sponsor && <Text style={meta}>{money(summary.totals.confirmedRegularMinor)} of {money(summary.totals.expectedRegularMinor)} received</Text>}
          {contributions.length === 0 && <Text style={[meta, { marginTop: spacing.sm }]}>No contributions yet{isManager ? ' — use “Set amounts”.' : '.'}</Text>}
          {contributions.map((c) => {
            const status = CONTRIBUTION_STATUS[c.status];
            const mine = c.fromUserId === me;
            const outstanding = Math.max(0, c.expectedMinor - c.receivedMinor);
            return (
              <View key={c.id} style={[st.row, { borderColor: colors.border }]} testID={`contribution-${c.id}`}>
                <View style={{ flex: 1 }}>
                  <Text style={[st.rowTitle, { color: colors.text }]}>
                    {nameOf(c.fromEntityType, c.fromEntityId)}{c.kind === 'top_up' ? (c.gift ? ' · gift' : c.fromUserId === config.custodianUserId ? ' · top-up' : ' · top-up · paid back at close') : c.kind === 'overdraft_cover' ? ' · covered shortfall' : ''}
                  </Text>
                  <Text style={meta}>
                    {status.label} · {c.kind === 'regular' ? `${money(c.receivedMinor)} of ${money(c.expectedMinor)}` : money(c.receivedMinor || c.expectedMinor)}
                    {c.status === 'initiated' && c.claimedMinor ? ` · says ${money(c.claimedMinor)}` : ''}
                    {c.rejectionReason && c.status !== 'confirmed' ? ` · not received: ${c.rejectionReason}` : ''}
                    {c.proofUrl ? <>{' · '}<ProofLink url={c.proofUrl} testID={`contribution-proof-${c.id}`} /></> : null}
                  </Text>
                </View>
                {canAct && mine && (c.status === 'pending' || c.status === 'partial' || c.status === 'initiated') && (
                  <Btn testID={`mark-paid-${c.id}`} label={c.status === 'initiated' ? 'Update' : 'Mark paid'} color={colors.primary} small onPress={() => setSheet({ kind: 'markPaid', contribution: c })} />
                )}
                {canAct && isCustodian && (c.status === 'initiated' || ((c.status === 'pending' || c.status === 'partial') && !mine && outstanding > 0)) && (
                  <Btn testID={`confirm-${c.id}`} label={c.status === 'initiated' ? 'Confirm' : 'Record'} color={colors.success} small onPress={() => setSheet({
                    kind: 'amount', title: 'Confirm money received', initialMinor: c.claimedMinor || outstanding,
                    hint: c.kind === 'top_up' && c.fromUserId !== config.custodianUserId
                      ? (c.gift ? `A gift from ${nameOf(c.fromEntityType, c.fromEntityId)}: it isn't paid back.` : `You'll pay this back to ${nameOf(c.fromEntityType, c.fromEntityId)} when the ${noun.toLowerCase()} closes.`)
                      : 'Only confirmed money counts toward the balance.',
                    submit: (minor) => poolService.confirm(c.id, minor),
                    done: () => ({ title: 'Confirmed', message: `Added to the ${noun.toLowerCase()}.` }),
                  })} />
                )}
                {canAct && isCustodian && c.status === 'initiated' && (
                  <Btn label="Not received" color={colors.error} small outline onPress={() => run('Not received', () => poolService.reject(c.id), { title: 'Marked as not received' })} />
                )}
                {canAct && isManager && c.status === 'pending' && c.receivedMinor === 0 && c.kind === 'regular' && (
                  <Btn label="Waive" color={colors.muted} small outline onPress={() => run('Waive', () => poolService.waive(c.id), { title: 'Waived', message: 'Excused for this cycle.' })} />
                )}
              </View>
            );
          })}
        </View>

        {/* Sponsor budgets: who may spend */}
        {sponsor && (
          <View style={card} testID="pool-spender-permissions">
            <Text style={h2}>Who can spend</Text>
            <Text style={meta}>Spenders pay from the budget or claim reimbursements with a receipt.</Text>
            {participants.filter((p) => p.userId !== config.custodianUserId).map((p) => {
              const allowed = (config.authorizedSpenders || []).includes(p.userId);
              return (
                <View key={p.userId} style={[st.row, { borderColor: colors.border }]}>
                  <Text style={[st.rowTitle, { color: colors.text, flex: 1 }]}>{p.displayName || p.email || 'Member'}</Text>
                  <Btn testID={`spender-${p.userId}`} label={allowed ? 'Can spend ✓' : 'Allow'} color={allowed ? colors.success : colors.primary} small outline={!allowed}
                    disabled={!isAdmin || busy || event.status !== 'active'}
                    onPress={() => run('Update spenders', () => poolService.updateConfig(eventId, {
                      authorizedSpenders: allowed
                        ? (config.authorizedSpenders || []).filter((id) => id !== p.userId)
                        : [...(config.authorizedSpenders || []), p.userId],
                    }), { title: 'Saved', message: 'Spending permissions updated.' })} />
                </View>
              );
            })}
            {participants.length <= 1 && <Text style={[meta, { marginTop: spacing.sm }]}>Invite people from the event screen, then allow them here.</Text>}
            {/* Spends on the sponsor's card or UPI (§9.3): on unless the sponsor turns it off. */}
            <View style={[st.row, { borderColor: colors.border }]}>
              <View style={{ flex: 1 }}>
                <Text style={[st.rowTitle, { color: colors.text }]}>Spenders can pay with my card or UPI</Text>
                <Text style={meta}>Turn off if you never share them: spenders then only see money they hold and their own money.</Text>
              </View>
              <Btn testID="allow-card-spends" label={config.allowSponsorCardSpends === false ? 'Off' : 'On ✓'}
                color={config.allowSponsorCardSpends === false ? colors.muted : colors.success} small outline={config.allowSponsorCardSpends === false}
                disabled={!isAdmin || busy || event.status !== 'active'}
                onPress={() => run('Update setting', () => poolService.updateConfig(eventId, { allowSponsorCardSpends: config.allowSponsorCardSpends === false }), { title: 'Saved', message: 'Spending permissions updated.' })} />
            </View>
          </View>
        )}

        {/* Spenders */}
        {spenders.length > 0 && (
          <View style={card} testID="pool-spenders">
            <Text style={h2}>Spending by person</Text>
            {spenders.map((sp) => (
              <View key={`${sp.spenderType}:${sp.spenderId}`} style={[st.row, { borderColor: colors.border }]}>
                <Text style={[st.rowTitle, { color: colors.text, flex: 1 }]}>{nameOf(sp.spenderType, sp.spenderId)}</Text>
                <Text style={meta}>
                  {money(sp.spentMinor)}{sp.capMinor !== null ? ` / ${money(sp.capMinor)}` : ''}{sp.pendingMinor ? ` (+${money(sp.pendingMinor)} pending)` : ''}
                  {sp.heldMinor ? (sp.heldMinor > 0 ? ` · holding ${money(sp.heldMinor)}` : ` · owed ${money(-sp.heldMinor)}`) : ''}
                </Text>
              </View>
            ))}
          </View>
        )}

        {/* Activity */}
        <View style={card} testID="pool-ledger">
          <Text style={h2}>Activity</Text>
          {entries.length === 0 && <Text style={[meta, { marginTop: spacing.sm }]}>Contributions and pool expenses will appear here.</Text>}
          {entries.map((e) => {
            const handOver = e.type === 'advance';
            return (
              <View key={`${e.type}-${e.id}`} style={[st.row, { borderColor: colors.border }]} testID={`ledger-${e.id}`}>
                <View style={{ flex: 1 }}>
                  <Text style={[st.rowTitle, { color: colors.text }]}>{e.title}</Text>
                  <Text style={meta}>
                    {handOver
                      ? `${nameOf('user', e.fromUserId || e.actorUserId)} → ${nameOf('user', e.toUserId || '')}`
                      : e.entityType ? nameOf(e.entityType, e.entityId!) : nameOf('user', e.actorUserId)} · {new Date(e.at).toLocaleDateString()}
                    {e.status === 'pending' ? ' · awaiting approval' : e.status === 'rejected' ? ' · rejected' : e.status === 'initiated' ? ' · awaiting confirmation' : ''}
                    {e.paidFrom === 'advance' ? ' · paid with money they hold' : e.paidFrom === 'sponsor_card' ? " · on the custodian's card or UPI" : ''}
                    {e.fundingSource === 'pool_reimbursement' ? payBackText(e.status, e.settlementStatus, event.status) : repayText(e.status, e.settlementStatus, event.status)}
                    {e.flags?.includes('exceeds_tolerance') ? ' · over the limit' : ''}
                    {e.receiptUrls.length ? ` · ${e.receiptUrls.length} ${handOver ? 'proof' : 'receipt(s)'}` : ''}
                  </Text>
                </View>
                {/* Advances and returns move money between holders: shown plainly, not as money in or out. */}
                {handOver && e.advanceKind !== 'repayment'
                  ? <Text style={[st.amount, { color: colors.text }]}>{money(Math.abs(e.amountMinor))}</Text>
                  : <Text style={[st.amount, { color: !e.counted ? colors.muted : e.amountMinor > 0 ? colors.success : colors.text }]}>{money(e.amountMinor, true)}</Text>}
              </View>
            );
          })}
        </View>

        {/* Cycle history */}
        {cycles.length > 1 && (
          <View style={card} testID="pool-cycles">
            <Text style={h2}>Cycle history</Text>
            {[...cycles].reverse().map((c) => (
              <TouchableOpacity key={c.id} style={[st.row, { borderColor: colors.border }]} disabled={c.id === cycle.id}
                onPress={() => setViewCycleId(c.status === 'closed' ? c.id : null)}>
                <Text style={[st.rowTitle, { color: colors.text, flex: 1 }]}>{c.label}</Text>
                <Text style={meta}>{c.reconciliation ? `${c.reconciliation.disposition === 'carry_forward' ? 'carried' : 'settled'} ${money(c.reconciliation.closingBalanceMinor)}` : c.status}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        <TouchableOpacity onPress={() => navigation.navigate('CreateExpense', { eventId })} style={[st.fab, { backgroundColor: colors.primary }]} testID="pool-add-expense">
          <Text style={{ color: colors.white, fontWeight: '700' }}>+ Add expense</Text>
        </TouchableOpacity>
      </ScrollView>

      {sheet.kind === 'amount' && (
        <AmountSheet title={sheet.title} hint={sheet.hint} currency={currency} initialMinor={sheet.initialMinor} busy={busy} giftChoice={sheet.giftChoice}
          onClose={() => setSheet({ kind: 'none' })} onSubmit={(minor, gift) => run(sheet.title, () => sheet.submit(minor, gift), sheet.done?.(gift))} />
      )}
      {sheet.kind === 'markPaid' && (
        <MarkPaidSheet contribution={sheet.contribution} currency={currency} busy={busy}
          onClose={() => setSheet({ kind: 'none' })}
          onSubmit={(body) => run('Mark as paid', () => poolService.markPaid(sheet.contribution.id, body), { title: 'Marked as paid', message: `${custodianName} will confirm once it arrives.` })} />
      )}
      {sheet.kind === 'amounts' && (
        <AmountsSheet ledger={ledger} currency={currency} nameOf={nameOf} busy={busy}
          onClose={() => setSheet({ kind: 'none' })}
          onSubmit={(rows) => run('Set amounts', () => poolService.setContributions(eventId, rows), { title: 'Amounts saved' })} />
      )}
      {sheet.kind === 'reconcile' && (
        <ReconcileSheet eventId={eventId} mode={sheet.mode} currency={currency} noun={noun} busy={busy} nameOf={nameOf}
          custodianKey={entityKey('user', config.custodianUserId)}
          keyOf={userKeyOf}
          waitingHandOvers={advances.filter((a) => a.status === 'initiated').length}
          onClose={() => setSheet({ kind: 'none' })}
          onSubmit={(cover) => run(sheet.mode === 'close' ? 'Close cycle' : 'Settle up',
            () => (sheet.mode === 'close' ? poolService.closeCycle(eventId, { cover }) : poolService.dissolve(eventId, { cover })),
            sheet.mode === 'close'
              ? { title: 'Cycle closed', message: 'A new cycle has started.' }
              : { title: 'Settling up', message: 'Everyone can now review the final payments.' })} />
      )}
      {sheet.kind === 'giveMoney' && holdings && (
        <HandOverSheet title="Give money to a spender" eventId={eventId} currency={currency} busy={busy} submitLabel="Give money"
          people={spenderIds.map((uid) => ({ id: uid, label: nameOf('user', uid) }))}
          maxMinor={holdings.withCustodianMinor - holdings.pendingOutMinor}
          blocked={summary.overdraft.latched || summary.totals.balanceMinor <= 0
            ? `There's no ${noun.toLowerCase()} money to hand out: spending is paused or the ${noun.toLowerCase()} is empty.` : undefined}
          hint="They confirm once they have it. Moving money between spenders? Record a return from one and an advance to the other. The cash can go directly."
          onClose={() => setSheet({ kind: 'none' })}
          onSubmit={(body) => run('Give money', () => poolService.recordAdvance(eventId, { kind: 'advance', ...body }), { title: 'Money handed over', message: 'Waiting for them to confirm.' })} />
      )}
      {sheet.kind === 'returnMoney' && holdings && (
        <HandOverSheet title={sheet.byCustodian ? 'Money returned to you' : `Return ${noun.toLowerCase()} money`} eventId={eventId} currency={currency} busy={busy}
          submitLabel={sheet.byCustodian ? 'Record' : 'Return money'}
          people={sheet.byCustodian ? holders.map(([key, held]) => ({ id: userForKey(key), label: `${keyLabel(key)} (holds ${money(held)})`, maxMinor: held })) : undefined}
          maxMinor={sheet.byCustodian ? undefined : myHeld}
          hint={sheet.byCustodian ? 'Recorded straight away: you are the one receiving it.' : `${custodianName} confirms once it arrives.`}
          onClose={() => setSheet({ kind: 'none' })}
          onSubmit={(body) => run('Return money', () => poolService.recordAdvance(eventId, { kind: 'return', ...body }),
            { title: 'Money returned', message: sheet.byCustodian ? 'Recorded.' : `Waiting for ${custodianName} to confirm.` })} />
      )}
      {sheet.kind === 'payBack' && (
        <HandOverSheet title={`Pay ${nameOf('user', sheet.userId)} back now`} eventId={eventId} currency={currency} busy={busy} submitLabel="I've paid"
          fixedUserId={sheet.userId}
          maxMinor={loans.byUser[sheet.userId] || 0}
          initialMinor={loans.byUser[sheet.userId] || 0}
          warningFor={(amountMinor) => {
            const impact = earlyRepaymentImpact(config, cycle.openingBalanceMinor, summary.totals, cycle.overdraftLatchedAt, amountMinor);
            if (impact.alreadyPaused) return `Spending is paused. Paying ${nameOf('user', sheet.userId)} ${money(amountMinor)} now means you'll need to add ${money(impact.addToResumeMinor)} before anyone can spend again.`;
            if (impact.pauses) return `This pauses spending. You'll need to add ${money(impact.addToResumeMinor)} before anyone can spend again.`;
            return null;
          }}
          hint={`Pay them outside the app, then record it here. ${nameOf('user', sheet.userId)} confirms they received it.`}
          onClose={() => setSheet({ kind: 'none' })}
          onSubmit={(body) => run('Pay back', () => poolService.recordAdvance(eventId, { kind: 'repayment', ...body, userId: sheet.userId }),
            { title: 'Paid back', message: `Waiting for ${nameOf('user', sheet.userId)} to confirm.` })} />
      )}
    </View>
  );
}

// ── Pieces ─────────────────────────────────────────────────────────────

function Btn(props: { label: string; color: string; onPress: () => void; outline?: boolean; small?: boolean; disabled?: boolean; testID?: string }) {
  return (
    <TouchableOpacity testID={props.testID} disabled={props.disabled} onPress={props.onPress}
      style={[st.btn, props.small && st.btnSmall, { borderColor: props.color, backgroundColor: props.outline ? 'transparent' : props.color, opacity: props.disabled ? 0.5 : 1 }]}>
      <Text style={{ color: props.outline ? props.color : '#fff', fontWeight: '700', fontSize: props.small ? fontSizes.xs : fontSizes.sm }}>{props.label}</Text>
    </TouchableOpacity>
  );
}

function Sheet(props: { title: string; children: React.ReactNode; onClose: () => void; footer: React.ReactNode }) {
  const { colors } = useTheme().theme;
  return (
    <Modal transparent animationType="slide" onRequestClose={props.onClose}>
      <View style={st.sheetBackdrop}>
        <View style={[st.sheet, { backgroundColor: colors.surface }]}>
          <Text style={[st.h2, { color: colors.text, marginBottom: spacing.md }]}>{props.title}</Text>
          <ScrollView style={{ maxHeight: 420 }}>{props.children}</ScrollView>
          <View style={[st.actions, { justifyContent: 'flex-end' }]}>
            <Btn label="Cancel" color={colors.muted} outline onPress={props.onClose} />
            {props.footer}
          </View>
        </View>
      </View>
    </Modal>
  );
}

/** `eventStatus` decides how a payment folded into the final settlement reads (§11). */
function payBackText(status: string, settlementStatus?: string | null, eventStatus?: string): string {
  const payBack = reimbursementStatus({ status: status as PoolDrawStatus }, settlementStatus, eventStatus);
  return payBack ? ` · ${REIMBURSEMENT_STATUS[payBack].label.toLowerCase()}` : '';
}

function repayText(status: string, settlementStatus?: string | null, eventStatus?: string): string {
  const repay = repaymentStatus(status, settlementStatus, eventStatus);
  return repay ? ` · ${REPAYMENT_STATUS[repay].label.toLowerCase()}` : '';
}

function parseMinor(text: string, currency: string): number | null {
  const n = Number(text);
  return text.trim() && Number.isFinite(n) && n > 0 ? toMinor(n, currency) : null;
}

function AmountSheet(props: { title: string; hint?: string; currency: string; initialMinor: number; busy: boolean; giftChoice?: { loanLabel: string }; onClose: () => void; onSubmit: (minor: number, gift: boolean) => void }) {
  const { colors } = useTheme().theme;
  const [text, setText] = useState(props.initialMinor > 0 ? String(fromMinor(props.initialMinor, props.currency)) : '');
  const [gift, setGift] = useState(false);
  const minor = parseMinor(text, props.currency);
  const option = (value: boolean, label: string, testID: string) => (
    <TouchableOpacity testID={testID} onPress={() => setGift(value)} style={[st.choice, { borderColor: gift === value ? colors.primary : colors.border, backgroundColor: gift === value ? colors.primary + '12' : 'transparent' }]}>
      <Text style={{ color: gift === value ? colors.primary : colors.text, fontWeight: gift === value ? '700' : '400' }}>{gift === value ? '◉' : '○'}  {label}</Text>
    </TouchableOpacity>
  );
  return (
    <Sheet title={props.title} onClose={props.onClose}
      footer={<Btn testID="amount-submit" label="Save" color={colors.primary} disabled={props.busy || minor === null} onPress={() => minor !== null && props.onSubmit(minor, gift)} />}>
      <TextInput testID="amount-input" autoFocus keyboardType="decimal-pad" value={text} onChangeText={setText}
        style={[st.input, { borderColor: colors.border, color: colors.text }]} placeholder={`Amount (${props.currency})`} placeholderTextColor={colors.muted} />
      {props.giftChoice && (
        <View style={{ marginTop: spacing.md, gap: spacing.sm }}>
          {option(false, props.giftChoice.loanLabel, 'top-up-loan')}
          {option(true, "It's a gift — don't pay me back", 'top-up-gift')}
        </View>
      )}
      {props.hint && <Text style={[st.meta, { color: colors.textSecondary, marginTop: spacing.sm }]}>{props.hint}</Text>}
    </Sheet>
  );
}

function MarkPaidSheet(props: { contribution: PoolContribution; currency: string; busy: boolean; onClose: () => void; onSubmit: (body: { amountMinor?: number; reference?: string; proofUrl?: string }) => void }) {
  const { colors } = useTheme().theme;
  const c = props.contribution;
  const outstanding = Math.max(0, c.expectedMinor - c.receivedMinor);
  const [text, setText] = useState(outstanding > 0 ? String(fromMinor(outstanding, props.currency)) : '');
  const [reference, setReference] = useState('');
  const [proofUrl, setProofUrl] = useState<string | undefined>(c.proofUrl || undefined);
  const [uploading, setUploading] = useState(false);
  const minor = parseMinor(text, props.currency);

  const attach = async () => {
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const imagePicker = require('expo-image-picker') as ImagePickerLike;
      const file = await pickReceiptImage('library', {
        imagePicker,
        readAsBase64: (uri) => readAsStringAsync(uri, { encoding: EncodingType.Base64 }),
        alert: (t, m) => Alert.alert(t, m),
      });
      if (!file) return;
      setUploading(true);
      setProofUrl(await poolService.uploadContributionProof(c.id, file));
    } catch (err) {
      Alert.alert('Upload failed', poolErrorText(err, props.currency));
    } finally {
      setUploading(false);
    }
  };

  return (
    <Sheet title="Mark your contribution as paid" onClose={props.onClose}
      footer={<Btn testID="mark-paid-submit" label="Mark paid" color={colors.primary} disabled={props.busy || uploading || minor === null}
        onPress={() => minor !== null && props.onSubmit({ amountMinor: minor, reference: reference.trim() || undefined, proofUrl })} />}>
      <Text style={[st.meta, { color: colors.textSecondary, marginBottom: spacing.sm }]}>Pay the custodian any way you like, then record it here.</Text>
      <TextInput keyboardType="decimal-pad" value={text} onChangeText={setText} style={[st.input, { borderColor: colors.border, color: colors.text }]} placeholder="Amount sent" placeholderTextColor={colors.muted} />
      <TextInput value={reference} onChangeText={setReference} style={[st.input, { borderColor: colors.border, color: colors.text, marginTop: spacing.sm }]} placeholder="Reference (optional)" placeholderTextColor={colors.muted} />
      <View style={[st.actions, { marginTop: spacing.sm }]}>
        <Btn label={proofUrl ? 'Proof attached ✓' : uploading ? 'Uploading…' : 'Attach proof'} color={colors.primary} outline disabled={uploading} onPress={() => void attach()} />
      </View>
    </Sheet>
  );
}

function AmountsSheet(props: {
  ledger: PoolLedger; currency: string; busy: boolean; nameOf: (t: 'user' | 'group', id: string) => string;
  onClose: () => void; onSubmit: (rows: Array<{ entityId: string; entityType: 'user' | 'group'; expectedMinor: number }>) => void;
}) {
  const { colors } = useTheme().theme;
  const roster = props.ledger.summary.cycle.roster;
  const [values, setValues] = useState<Record<string, string>>(() => {
    const map: Record<string, string> = {};
    for (const r of roster) {
      const c = props.ledger.contributions.find((x) => x.kind === 'regular' && x.fromEntityId === r.entityId && x.fromEntityType === r.entityType);
      map[entityKey(r.entityType, r.entityId)] = c ? String(fromMinor(c.expectedMinor, props.currency)) : '';
    }
    return map;
  });
  const rows = roster.map((r) => ({ ...r, text: values[entityKey(r.entityType, r.entityId)] || '' })).filter((r) => r.text.trim() !== '');
  const invalid = rows.some((r) => !Number.isFinite(Number(r.text)) || Number(r.text) < 0);
  return (
    <Sheet title="What does each person put in?" onClose={props.onClose}
      footer={<Btn label="Save" color={colors.primary} disabled={props.busy || invalid || rows.length === 0}
        onPress={() => props.onSubmit(rows.map((r) => ({ entityId: r.entityId, entityType: r.entityType, expectedMinor: toMinor(Number(r.text), props.currency) })))} />}>
      {roster.map((r) => {
        const key = entityKey(r.entityType, r.entityId);
        return (
          <View key={key} style={[st.row, { borderColor: colors.border }]}>
            <Text style={{ flex: 1, color: colors.text }}>{props.nameOf(r.entityType, r.entityId)}</Text>
            <TextInput keyboardType="decimal-pad" value={values[key] || ''} onChangeText={(t) => setValues((v) => ({ ...v, [key]: t }))}
              style={[st.input, { width: 120, borderColor: colors.border, color: colors.text }]} placeholder="0" placeholderTextColor={colors.muted} />
          </View>
        );
      })}
    </Sheet>
  );
}

function ReconcileSheet(props: {
  eventId: string; mode: 'close' | 'settle'; currency: string; noun: string; busy: boolean; custodianKey: string;
  /** A user's entity key (their group's, if they're in one), as the settlement plan uses. */
  keyOf: (userId: string) => string;
  /** Hand-overs still waiting for confirmation: closing waits for them (§9.3). */
  waitingHandOvers: number;
  nameOf: (t: 'user' | 'group', id: string) => string; onClose: () => void; onSubmit: (cover?: CoverEntry[]) => void;
}) {
  const { colors } = useTheme().theme;
  const [preview, setPreview] = useState<ClosePreview | null>(null);
  // Settle-up only (§11): repayments and claims folded into the final payments, and pool payments
  // that stay separate. Closing a cycle moves no money now.
  const folded = props.mode === 'settle' ? preview?.folded ?? [] : [];
  const separate = props.mode === 'settle' ? preview?.separate ?? [] : [];
  const rows = preview ? settleUpRows(preview.settlementBalances, folded, props.keyOf) : [];
  const [error, setError] = useState('');
  useEffect(() => {
    let cancelled = false;
    poolService.previewClose(props.eventId, { forDissolution: props.mode === 'settle' })
      .then((p) => { if (!cancelled) setPreview(p); })
      .catch((err) => { if (!cancelled) setError(poolErrorText(err, props.currency)); });
    return () => { cancelled = true; };
  }, [props.eventId, props.mode, props.currency]);

  const keyName = (k: string) => {
    const [type, ...rest] = k.split(':');
    return props.nameOf(type as 'user' | 'group', rest.join(':'));
  };
  const money = (v: number) => formatMinor(v, props.currency);
  const cover = (): CoverEntry[] | undefined => {
    if (!preview || preview.coverNeededMinor <= 0) return undefined;
    const [type, ...rest] = props.custodianKey.split(':');
    return [{ entityType: type as 'user' | 'group', entityId: rest.join(':'), amountMinor: preview.coverNeededMinor }];
  };

  return (
    <Sheet title={props.mode === 'close' ? 'Close this cycle' : `Settle up the ${props.noun.toLowerCase()}`} onClose={props.onClose}
      footer={<Btn testID="reconcile-submit" label={props.mode === 'close' ? 'Close cycle' : 'Settle up'} color={colors.primary}
        disabled={props.busy || !preview || preview.pendingDraws > 0 || props.waitingHandOvers > 0} onPress={() => props.onSubmit(cover())} />}>
      {error ? <Text style={{ color: colors.error }}>{error}</Text> : null}
      {!preview && !error && <ActivityIndicator color={colors.primary} />}
      {preview && (
        <View testID="reconcile-preview">
          {preview.pendingDraws > 0 && <Text style={{ color: colors.error, marginBottom: spacing.sm }}>Approve or reject the pending expenses first.</Text>}
          {props.waitingHandOvers > 0 && (
            <Text testID="reconcile-waiting-handovers" style={{ color: colors.error, marginBottom: spacing.sm }}>
              {props.waitingHandOvers} hand-over{props.waitingHandOvers === 1 ? ' is' : 's are'} waiting for confirmation. Confirm, reject or cancel {props.waitingHandOvers === 1 ? 'it' : 'them'} first.
            </Text>
          )}
          {(() => {
            // The same figures as web, in an order that adds up (shared settleUpFigures).
            const figures = settleUpFigures(preview);
            const result = figures[figures.length - 1];
            const line = figures.slice(0, -1)
              .map((f, i) => `${i === 0 ? f.label : f.label.toLowerCase()} ${money(f.key === 'carried_in' ? f.amountMinor : Math.abs(f.amountMinor))}`)
              .join(' · ');
            return (
              <>
                <Text testID="reconcile-figures" style={{ color: colors.text }}>{line}</Text>
                <Text testID="reconcile-figure-result" style={{ color: colors.text, fontWeight: '700', marginTop: spacing.xs }}>
                  {result.label} {money(result.amountMinor)}
                </Text>
              </>
            );
          })()}
          {preview.coverNeededMinor > 0 && (
            <Text style={{ color: colors.textSecondary, marginTop: spacing.xs }}>The custodian is recorded as covering the {money(preview.coverNeededMinor)} shortfall (change it on the web if someone else did).</Text>
          )}
          <Text style={{ color: colors.text, fontWeight: '700', marginTop: spacing.md }}>{preview.disposition === 'carry_forward' ? 'Carried into next cycle' : 'What happens next'}</Text>
          {preview.disposition === 'carry_forward'
            ? preview.entityShares.filter((sh) => sh.netMinor !== 0).map((sh) => (
              <Text key={`${sh.entityType}:${sh.entityId}`} style={{ color: colors.text }}>
                {props.nameOf(sh.entityType, sh.entityId)}: {sh.netMinor > 0 ? `in credit ${money(sh.netMinor)}` : `owes ${money(-sh.netMinor)}`}
              </Text>
            ))
            : rows.map((row) => {
              const words = describeSettleUpRow(row, props.currency, props.noun);
              return (
                <View key={row.key} testID={`reconcile-row-${row.key}`} style={{ marginTop: 2 }}>
                  <Text style={{ color: colors.text }}>{keyName(row.key)}: {words.headline}</Text>
                  {words.detail && <Text style={{ color: colors.textSecondary, fontSize: fontSizes.xs }}>{words.detail}</Text>}
                </View>
              );
            })}
          {preview.disposition === 'settle' && rows.length === 0 && (
            <Text style={{ color: colors.text }}>
              {separate.length > 0 ? `Nothing to pay out of the ${props.noun.toLowerCase()}.` : 'Nobody owes anybody anything.'}
            </Text>
          )}
          {folded.length > 0 && (
            <View testID="reconcile-folded">
              <Text style={{ color: colors.text, fontWeight: '700', marginTop: spacing.md }}>Included in the final settlement</Text>
              {folded.map((f) => (
                <Text key={f.settlementId || f.expenseId || `${f.fromUserId}-${f.toUserId}-${f.amountMinor}`} style={{ color: colors.text }}>
                  {props.nameOf('user', f.fromUserId)} → {props.nameOf('user', f.toUserId)}: {money(f.amountMinor)} · {poolLegLabel({ kind: f.kind })}{f.title ? ` · ${f.title}` : ''}
                </Text>
              ))}
              <Text style={{ color: colors.textSecondary, marginTop: spacing.xs }}>
                These are included in the payments above instead of being paid on their own.
              </Text>
            </View>
          )}
          {separate.length > 0 && (
            <View testID="reconcile-separate">
              <Text style={{ color: colors.text, fontWeight: '700', marginTop: spacing.md }}>Paid separately</Text>
              {separate.map((leg) => (
                <Text key={leg.settlementId} style={{ color: colors.text }}>
                  {props.nameOf('user', leg.fromUserId)} → {props.nameOf('user', leg.toUserId)}: {money(leg.amountMinor)} · {poolLegLabel({ kind: leg.kind as Settlement['kind'] })}
                  {leg.status === 'initiated' ? ' · sent, awaiting confirmation' : ''}
                </Text>
              ))}
              <Text style={{ color: colors.textSecondary, marginTop: spacing.xs }}>
                These are already being paid, or belong to an earlier cycle, so they're paid on their own.
              </Text>
            </View>
          )}
        </View>
      )}
    </Sheet>
  );
}

/**
 * Record money handed over (§9.3, §10.6): an advance, a return, or paying a lender back early.
 * Proof is optional (decision D4: one file, as on contributions).
 */
function HandOverSheet(props: {
  title: string; eventId: string; currency: string; busy: boolean; submitLabel: string;
  people?: Array<{ id: string; label: string; maxMinor?: number }>;
  fixedUserId?: string;
  maxMinor?: number;
  initialMinor?: number;
  blocked?: string;
  hint?: string;
  warningFor?: (amountMinor: number) => string | null;
  onClose: () => void;
  onSubmit: (body: { userId?: string; amountMinor: number; note?: string; proofUrl?: string }) => void;
}) {
  const { colors } = useTheme().theme;
  const [userId, setUserId] = useState(props.fixedUserId || props.people?.[0]?.id || '');
  const [text, setText] = useState(props.initialMinor && props.initialMinor > 0 ? String(fromMinor(props.initialMinor, props.currency)) : '');
  const [note, setNote] = useState('');
  const [proofUrl, setProofUrl] = useState<string | undefined>(undefined);
  const [uploading, setUploading] = useState(false);
  const minor = parseMinor(text, props.currency);
  const person = props.people?.find((p) => p.id === userId);
  const max = person?.maxMinor ?? props.maxMinor;
  const tooMuch = minor !== null && max !== undefined && minor > max;
  const warning = minor !== null && props.warningFor ? props.warningFor(minor) : null;

  const attach = async () => {
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const imagePicker = require('expo-image-picker') as ImagePickerLike;
      const file = await pickReceiptImage('library', {
        imagePicker,
        readAsBase64: (uri) => readAsStringAsync(uri, { encoding: EncodingType.Base64 }),
        alert: (t, m) => Alert.alert(t, m),
      });
      if (!file) return;
      setUploading(true);
      setProofUrl(await poolService.uploadAdvanceProof(props.eventId, file));
    } catch (err) {
      Alert.alert('Upload failed', poolErrorText(err, props.currency));
    } finally {
      setUploading(false);
    }
  };

  return (
    <Sheet title={props.title} onClose={props.onClose}
      footer={<Btn testID="handover-submit" label={props.submitLabel} color={colors.primary}
        disabled={props.busy || uploading || minor === null || tooMuch || Boolean(props.blocked) || (Boolean(props.people) && !userId)}
        onPress={() => minor !== null && props.onSubmit({
          ...(props.people || props.fixedUserId ? { userId } : {}),
          amountMinor: minor,
          note: note.trim() || undefined,
          proofUrl,
        })} />}>
      {props.blocked && <Text testID="handover-blocked" style={[st.banner, { color: colors.error, backgroundColor: colors.errorBg, marginTop: 0, marginBottom: spacing.sm }]}>{props.blocked}</Text>}
      {props.people && (
        <View style={{ gap: spacing.xs, marginBottom: spacing.sm }} testID="handover-who">
          {props.people.map((p) => (
            <TouchableOpacity key={p.id} testID={`handover-who-${p.id}`} onPress={() => setUserId(p.id)}
              style={[st.choice, { borderColor: userId === p.id ? colors.primary : colors.border, backgroundColor: userId === p.id ? colors.primary + '12' : 'transparent' }]}>
              <Text style={{ color: userId === p.id ? colors.primary : colors.text, fontWeight: userId === p.id ? '700' : '400' }}>{userId === p.id ? '◉' : '○'}  {p.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}
      <TextInput testID="handover-amount" autoFocus={!props.people} keyboardType="decimal-pad" value={text} onChangeText={setText}
        style={[st.input, { borderColor: colors.border, color: colors.text }]} placeholder={`Amount (${props.currency})`} placeholderTextColor={colors.muted} />
      {max !== undefined && <Text style={[st.meta, { color: colors.textSecondary }]}>Up to {formatMinor(Math.max(0, max), props.currency)}</Text>}
      <TextInput testID="handover-note" value={note} onChangeText={setNote} maxLength={500}
        style={[st.input, { borderColor: colors.border, color: colors.text, marginTop: spacing.sm }]} placeholder="Note (optional)" placeholderTextColor={colors.muted} />
      <View style={[st.actions, { marginTop: spacing.sm }]}>
        <Btn label={proofUrl ? 'Proof attached ✓' : uploading ? 'Uploading…' : 'Attach proof'} color={colors.primary} outline disabled={uploading} onPress={() => void attach()} />
      </View>
      {tooMuch && <Text testID="handover-too-much" style={[st.banner, { color: colors.error, backgroundColor: colors.errorBg }]}>That's more than {formatMinor(Math.max(0, max!), props.currency)}.</Text>}
      {warning && <Text testID="handover-warning" style={[st.banner, { color: colors.warning, backgroundColor: colors.warningBg }]}>{warning}</Text>}
      {props.hint && <Text style={[st.meta, { color: colors.textSecondary, marginTop: spacing.sm }]}>{props.hint}</Text>}
    </Sheet>
  );
}

const st = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  card: { borderWidth: 1, borderRadius: radii.lg, padding: spacing.lg, marginBottom: spacing.lg },
  h2: { fontSize: fontSizes.lg, fontWeight: '800' },
  meta: { fontSize: fontSizes.xs, marginTop: 2 },
  banner: { fontSize: fontSizes.xs, fontWeight: '600', padding: spacing.sm, borderRadius: radii.sm, marginTop: spacing.sm, overflow: 'hidden' },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.md },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.sm, borderBottomWidth: StyleSheet.hairlineWidth, flexWrap: 'wrap' },
  rowTitle: { fontSize: fontSizes.sm, fontWeight: '600' },
  amount: { fontSize: fontSizes.sm, fontWeight: '700', fontVariant: ['tabular-nums'] },
  btn: { borderWidth: 1.5, borderRadius: radii.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  btnSmall: { paddingHorizontal: spacing.sm, paddingVertical: 4 },
  input: { borderWidth: 1, borderRadius: radii.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, fontSize: fontSizes.md },
  choice: { borderWidth: 1, borderRadius: radii.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  sheetBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  sheet: { borderTopLeftRadius: radii.xl, borderTopRightRadius: radii.xl, padding: spacing.lg, paddingBottom: spacing.xxxl },
  fab: { alignSelf: 'center', borderRadius: radii.full, paddingHorizontal: spacing.xl, paddingVertical: spacing.md },
});
