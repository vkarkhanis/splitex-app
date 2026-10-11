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
  CONTRIBUTION_STATUS,
  entityKey,
  formatMinor,
  fromMinor,
  isPoolSideLeg,
  poolErrorText,
  poolNoun,
  toMinor,
} from '@traxettle/shared';
import type {
  Event as TraxettleEvent,
  EventParticipant,
  Group,
  PoolContribution,
  PoolLedger,
  Settlement,
} from '@traxettle/shared';
import { api } from '../api';
import { useTheme } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';
import { useEventSocket } from '../hooks/useSocket';
import { fontSizes, radii, spacing } from '../theme';
import { PoolMeterView } from '../components/pool/PoolViews';
import { pickReceiptImage, poolService } from '../services/pool';
import type { ClosePreview, CoverEntry, ImagePickerLike } from '../services/pool';

type Sheet =
  | { kind: 'none' }
  | { kind: 'amount'; title: string; hint?: string; initialMinor: number; submit: (minor: number) => Promise<unknown> }
  | { kind: 'markPaid'; contribution: PoolContribution }
  | { kind: 'amounts' }
  | { kind: 'reconcile'; mode: 'close' | 'settle' };

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
  const pendingDraws = entries.filter((e) => e.type === 'draw' && e.status === 'pending');
  const money = (v: number, signed = false) => formatMinor(v, currency, { signed });

  const nameOf = (type: 'user' | 'group', id: string) => {
    if (type === 'group') return groups.find((g) => g.id === id)?.name || 'Group';
    if (id === me) return 'You';
    const p = participants.find((x) => x.userId === id);
    return p?.displayName || p?.email || 'Member';
  };

  const run = async (label: string, fn: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await fn();
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
                submit: async (minor) => {
                  const c = await poolService.topUp(eventId, { amountMinor: minor });
                  if (!isCustodian && c?.id) await poolService.markPaid(c.id, { amountMinor: minor });
                },
              })} />
              {isManager && !sponsor && <Btn testID="pool-set-amounts" label="Set amounts" color={colors.primary} outline onPress={() => setSheet({ kind: 'amounts' })} />}
              {isManager && config.cycleMode === 'recurring' && <Btn testID="pool-close-cycle" label={`Close ${cycle.label}`} color={colors.secondary} onPress={() => setSheet({ kind: 'reconcile', mode: 'close' })} />}
              {isAdmin && event.status === 'active' && <Btn testID="pool-settle-up" label={sponsor ? 'Finish & report' : 'Settle up'} color={colors.primary} onPress={() => setSheet({ kind: 'reconcile', mode: 'settle' })} />}
            </View>
          )}
        </View>

        {/* Approvals */}
        {isManager && pendingDraws.length > 0 && (
          <View style={card} testID="pool-pending-approvals">
            <Text style={h2}>Waiting for your approval</Text>
            {pendingDraws.map((e) => (
              <View key={e.id} style={[st.row, { borderColor: colors.border }]}>
                <View style={{ flex: 1 }}>
                  <Text style={[st.rowTitle, { color: colors.text }]}>{e.title}</Text>
                  <Text style={meta}>{e.fundingSource === 'pool_reimbursement' ? 'Reimbursement' : 'Pool spend'} · {nameOf('user', e.actorUserId)}{e.receiptUrls.length ? ` · ${e.receiptUrls.length} receipt(s)` : ''}</Text>
                </View>
                <Text style={[st.amount, { color: colors.text }]}>{money(-e.amountMinor)}</Text>
                <Btn testID={`approve-${e.id}`} label="Approve" color={colors.success} small disabled={busy || !canAct}
                  onPress={() => run('Approve', () => poolService.approveDraw(e.id))} />
                <Btn label="Reject" color={colors.error} small outline disabled={busy || !canAct}
                  onPress={() => run('Reject', () => poolService.rejectDraw(e.id))} />
              </View>
            ))}
          </View>
        )}

        {/* Pool payments */}
        {event.status === 'active' && legs.length > 0 && (
          <View style={card} testID="pool-payments">
            <Text style={h2}>Pool payments</Text>
            {legs.map((leg) => (
              <View key={leg.id} style={[st.row, { borderColor: colors.border }]}>
                <View style={{ flex: 1 }}>
                  <Text style={[st.rowTitle, { color: colors.text }]}>{nameOf('user', leg.fromUserId)} → {nameOf('user', leg.toUserId)}</Text>
                  <Text style={meta}>{leg.kind === 'pool_reimbursement' ? 'Reimbursement' : leg.kind === 'pool_member_exit' ? 'Leaving settlement' : 'Cycle refund'} · {leg.status === 'completed' ? 'Done' : leg.status === 'initiated' ? 'Paid — awaiting confirmation' : 'To pay'}</Text>
                </View>
                <Text style={[st.amount, { color: colors.text }]}>{money(toMinor(leg.amount, currency))}</Text>
                {me === leg.fromUserId && (leg.status === 'pending' || leg.status === 'failed') && (
                  <Btn label="Mark paid" color={colors.primary} small disabled={busy} onPress={() => run('Mark paid', () => poolService.payLeg(leg.id))} />
                )}
                {me === leg.toUserId && leg.status === 'initiated' && (
                  <>
                    <Btn label="Received" color={colors.success} small disabled={busy} onPress={() => run('Confirm', () => poolService.confirmLeg(leg.id))} />
                    <Btn label="Not received" color={colors.error} small outline disabled={busy} onPress={() => run('Reject', () => poolService.rejectLeg(leg.id))} />
                  </>
                )}
              </View>
            ))}
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
                    {nameOf(c.fromEntityType, c.fromEntityId)}{c.kind === 'top_up' ? ' · top-up' : c.kind === 'overdraft_cover' ? ' · covered shortfall' : ''}
                  </Text>
                  <Text style={meta}>
                    {status.label} · {c.kind === 'regular' ? `${money(c.receivedMinor)} of ${money(c.expectedMinor)}` : money(c.receivedMinor || c.expectedMinor)}
                    {c.status === 'initiated' && c.claimedMinor ? ` · says ${money(c.claimedMinor)}` : ''}
                    {c.rejectionReason && c.status !== 'confirmed' ? ` · not received: ${c.rejectionReason}` : ''}
                  </Text>
                </View>
                {canAct && mine && (c.status === 'pending' || c.status === 'partial' || c.status === 'initiated') && (
                  <Btn testID={`mark-paid-${c.id}`} label={c.status === 'initiated' ? 'Update' : 'Mark paid'} color={colors.primary} small onPress={() => setSheet({ kind: 'markPaid', contribution: c })} />
                )}
                {canAct && isCustodian && (c.status === 'initiated' || ((c.status === 'pending' || c.status === 'partial') && !mine && outstanding > 0)) && (
                  <Btn testID={`confirm-${c.id}`} label={c.status === 'initiated' ? 'Confirm' : 'Record'} color={colors.success} small onPress={() => setSheet({
                    kind: 'amount', title: 'Confirm money received', initialMinor: c.claimedMinor || outstanding,
                    hint: 'Only confirmed money counts toward the balance.',
                    submit: (minor) => poolService.confirm(c.id, minor),
                  })} />
                )}
                {canAct && isCustodian && c.status === 'initiated' && (
                  <Btn label="Not received" color={colors.error} small outline onPress={() => run('Not received', () => poolService.reject(c.id))} />
                )}
                {canAct && isManager && c.status === 'pending' && c.receivedMinor === 0 && c.kind === 'regular' && (
                  <Btn label="Waive" color={colors.muted} small outline onPress={() => run('Waive', () => poolService.waive(c.id))} />
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
                    }))} />
                </View>
              );
            })}
            {participants.length <= 1 && <Text style={[meta, { marginTop: spacing.sm }]}>Invite people from the event screen, then allow them here.</Text>}
          </View>
        )}

        {/* Spenders */}
        {spenders.length > 0 && (
          <View style={card} testID="pool-spenders">
            <Text style={h2}>Spending by person</Text>
            {spenders.map((sp) => (
              <View key={`${sp.spenderType}:${sp.spenderId}`} style={[st.row, { borderColor: colors.border }]}>
                <Text style={[st.rowTitle, { color: colors.text, flex: 1 }]}>{nameOf(sp.spenderType, sp.spenderId)}</Text>
                <Text style={meta}>{money(sp.spentMinor)}{sp.capMinor !== null ? ` / ${money(sp.capMinor)}` : ''}{sp.pendingMinor ? ` (+${money(sp.pendingMinor)} pending)` : ''}</Text>
              </View>
            ))}
          </View>
        )}

        {/* Activity */}
        <View style={card} testID="pool-ledger">
          <Text style={h2}>Activity</Text>
          {entries.length === 0 && <Text style={[meta, { marginTop: spacing.sm }]}>Contributions and pool expenses will appear here.</Text>}
          {entries.map((e) => (
            <View key={`${e.type}-${e.id}`} style={[st.row, { borderColor: colors.border }]}>
              <View style={{ flex: 1 }}>
                <Text style={[st.rowTitle, { color: colors.text }]}>{e.title}</Text>
                <Text style={meta}>
                  {e.entityType ? nameOf(e.entityType, e.entityId!) : nameOf('user', e.actorUserId)} · {new Date(e.at).toLocaleDateString()}
                  {e.status === 'pending' ? ' · awaiting approval' : e.status === 'rejected' ? ' · rejected' : ''}
                  {e.fundingSource === 'pool_reimbursement' && e.status === 'approved' ? (e.settlementStatus === 'completed' ? ' · reimbursed' : ' · to reimburse') : ''}
                  {e.flags?.includes('exceeds_tolerance') ? ' · over the limit' : ''}
                  {e.receiptUrls.length ? ` · ${e.receiptUrls.length} receipt(s)` : ''}
                </Text>
              </View>
              <Text style={[st.amount, { color: !e.counted ? colors.muted : e.amountMinor > 0 ? colors.success : colors.text }]}>{money(e.amountMinor, true)}</Text>
            </View>
          ))}
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
        <AmountSheet title={sheet.title} hint={sheet.hint} currency={currency} initialMinor={sheet.initialMinor} busy={busy}
          onClose={() => setSheet({ kind: 'none' })} onSubmit={(minor) => run(sheet.title, () => sheet.submit(minor))} />
      )}
      {sheet.kind === 'markPaid' && (
        <MarkPaidSheet contribution={sheet.contribution} currency={currency} busy={busy}
          onClose={() => setSheet({ kind: 'none' })}
          onSubmit={(body) => run('Mark as paid', () => poolService.markPaid(sheet.contribution.id, body))} />
      )}
      {sheet.kind === 'amounts' && (
        <AmountsSheet ledger={ledger} currency={currency} nameOf={nameOf} busy={busy}
          onClose={() => setSheet({ kind: 'none' })}
          onSubmit={(rows) => run('Set amounts', () => poolService.setContributions(eventId, rows))} />
      )}
      {sheet.kind === 'reconcile' && (
        <ReconcileSheet eventId={eventId} mode={sheet.mode} currency={currency} noun={noun} busy={busy} nameOf={nameOf}
          custodianKey={entityKey('user', config.custodianUserId)}
          onClose={() => setSheet({ kind: 'none' })}
          onSubmit={(cover) => run(sheet.mode === 'close' ? 'Close cycle' : 'Settle up',
            () => (sheet.mode === 'close' ? poolService.closeCycle(eventId, { cover }) : poolService.dissolve(eventId, { cover })))} />
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

function parseMinor(text: string, currency: string): number | null {
  const n = Number(text);
  return text.trim() && Number.isFinite(n) && n > 0 ? toMinor(n, currency) : null;
}

function AmountSheet(props: { title: string; hint?: string; currency: string; initialMinor: number; busy: boolean; onClose: () => void; onSubmit: (minor: number) => void }) {
  const { colors } = useTheme().theme;
  const [text, setText] = useState(props.initialMinor > 0 ? String(fromMinor(props.initialMinor, props.currency)) : '');
  const minor = parseMinor(text, props.currency);
  return (
    <Sheet title={props.title} onClose={props.onClose}
      footer={<Btn testID="amount-submit" label="Save" color={colors.primary} disabled={props.busy || minor === null} onPress={() => minor !== null && props.onSubmit(minor)} />}>
      <TextInput testID="amount-input" autoFocus keyboardType="decimal-pad" value={text} onChangeText={setText}
        style={[st.input, { borderColor: colors.border, color: colors.text }]} placeholder={`Amount (${props.currency})`} placeholderTextColor={colors.muted} />
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
  nameOf: (t: 'user' | 'group', id: string) => string; onClose: () => void; onSubmit: (cover?: CoverEntry[]) => void;
}) {
  const { colors } = useTheme().theme;
  const [preview, setPreview] = useState<ClosePreview | null>(null);
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
        disabled={props.busy || !preview || preview.pendingDraws > 0} onPress={() => props.onSubmit(cover())} />}>
      {error ? <Text style={{ color: colors.error }}>{error}</Text> : null}
      {!preview && !error && <ActivityIndicator color={colors.primary} />}
      {preview && (
        <View testID="reconcile-preview">
          {preview.pendingDraws > 0 && <Text style={{ color: colors.error, marginBottom: spacing.sm }}>Approve or reject the pending expenses first.</Text>}
          <Text style={{ color: colors.text }}>Collected {money(preview.confirmedContributionsMinor)} · spent {money(preview.poolSpendMinor + preview.reimbursementsMinor)}</Text>
          <Text style={{ color: colors.text, fontWeight: '700', marginTop: spacing.xs }}>
            {preview.preCoverBalanceMinor >= 0 ? `Left over ${money(preview.preCoverBalanceMinor)}` : `Short by ${money(-preview.preCoverBalanceMinor)}`}
          </Text>
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
            : Object.entries(preview.settlementBalances).map(([k, v]) => (
              <Text key={k} style={{ color: colors.text }}>{keyName(k)}: {v > 0 ? `gets back ${money(v)}` : `pays ${money(-v)}`}</Text>
            ))}
          {preview.disposition === 'settle' && Object.keys(preview.settlementBalances).length === 0 && (
            <Text style={{ color: colors.text }}>Nobody owes anybody anything.</Text>
          )}
        </View>
      )}
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
  sheetBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  sheet: { borderTopLeftRadius: radii.xl, borderTopRightRadius: radii.xl, padding: spacing.lg, paddingBottom: spacing.xxxl },
  fab: { alignSelf: 'center', borderRadius: radii.full, paddingHorizontal: spacing.xl, paddingVertical: spacing.md },
});
