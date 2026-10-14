'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import styled from 'styled-components';
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  CardSubtitle,
  CardTitle,
  EmptyState,
  Field,
  Input,
  Label,
  Modal,
  ModalBody,
  ModalFooter,
  ModalHeader,
  ModalTitle,
  Select,
  useToast,
} from '@traxettle/ui';
import { REIMBURSEMENT_STATUS, entityKey, fromMinor, isPoolSideLeg, reimbursementStatus, toMinor } from '@traxettle/shared';
import type {
  Event as TraxettleEvent,
  EventParticipant,
  Group,
  PoolContribution,
  PoolDrawStatus,
  PoolLedger,
  PoolLedgerEntry,
  ReconcileResult,
  Settlement,
} from '@traxettle/shared';
import { getResolvedApiBaseUrl } from '../../config/dev-options';
import { poolApi, RECEIPT_ACCEPT, MAX_RECEIPT_BYTES } from '../../utils/pool-api';
import type { CoverEntry } from '../../utils/pool-api';
import { PoolMeter } from './PoolMeter';
import { PoolPayments } from './PoolPayments';
import { CONTRIBUTION_STATUS, formatMinor, poolErrorText, poolNoun, toPoolError } from './poolFormat';

const Stack = styled.div`
  display: flex;
  flex-direction: column;
  gap: 16px;
`;

const HeaderRow = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 12px;
  flex-wrap: wrap;
`;

const Actions = styled.div`
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
`;

const Totals = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 6px 14px;
  font-size: 12px;
  color: ${(p) => p.theme.colors.muted};
  margin-top: 10px;
`;

const Banner = styled.div<{ $tone: 'info' | 'warning' | 'error' }>`
  font-size: 12px;
  line-height: 1.5;
  padding: 8px 12px;
  border-radius: 8px;
  margin-top: 10px;
  color: ${(p) => (p.$tone === 'error' ? p.theme.colors.error : p.$tone === 'warning' ? p.theme.colors.warning : p.theme.colors.info)};
  background: ${(p) => (p.$tone === 'error' ? p.theme.colors.errorBg : p.$tone === 'warning' ? p.theme.colors.warningBg : p.theme.colors.infoBg)};
`;

const List = styled.ul`
  list-style: none;
  margin: 0;
  padding: 0;
`;

const Item = styled.li`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 0;
  border-bottom: 1px solid ${(p) => p.theme.colors.border};
  &:last-child { border-bottom: none; }
  flex-wrap: wrap;
`;

const ItemMain = styled.div`
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
`;

const ItemTitle = styled.div`
  font-size: 14px;
  font-weight: 600;
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
`;

const ItemMeta = styled.div`
  font-size: 12px;
  color: ${(p) => p.theme.colors.muted};
`;

const Amount = styled.div<{ $tone?: 'in' | 'out' | 'muted' }>`
  font-size: 14px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  color: ${(p) => (p.$tone === 'in' ? p.theme.colors.success : p.$tone === 'muted' ? p.theme.colors.muted : p.theme.colors.text)};
  text-decoration: ${(p) => (p.$tone === 'muted' ? 'line-through' : 'none')};
`;

const SmallLink = styled.a`
  font-size: 12px;
  color: ${(p) => p.theme.colors.primary};
`;

const Table = styled.table`
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
  th, td { text-align: left; padding: 6px 4px; border-bottom: 1px solid ${(p) => p.theme.colors.border}; }
  td:last-child, th:last-child { text-align: right; font-variant-numeric: tabular-nums; }
`;

function resolveFileHref(url: string): string {
  const raw = String(url || '').trim();
  if (!raw || /^https?:\/\//i.test(raw)) return raw;
  return raw.startsWith('/') ? `${getResolvedApiBaseUrl().replace(/\/$/, '')}${raw}` : raw;
}


interface Props {
  event: TraxettleEvent;
  currentUserId: string | null;
  participants: EventParticipant[];
  groups: Group[];
  /** The event's settlement legs; pool-side ones are paid from this tab while active. */
  settlements: Settlement[];
  /** Bump to reload (e.g. on a `pool:updated` socket message). */
  refreshKey: number;
  /** Called after any change that may affect the rest of the page. */
  onChanged: () => void;
}

type ModalState =
  | { kind: 'none' }
  | { kind: 'markPaid'; contribution: PoolContribution }
  | { kind: 'confirm'; contribution: PoolContribution }
  | { kind: 'reject'; target: 'contribution' | 'draw'; id: string; title: string }
  | { kind: 'topUp' }
  | { kind: 'amounts' }
  | { kind: 'close' }
  | { kind: 'settle' };

export function PoolTab({ event, currentUserId, participants, groups, settlements, refreshKey, onChanged }: Props) {
  const { push: pushToast } = useToast();
  const config = event.poolConfig!;
  const currency = event.currency;
  const noun = poolNoun(config);

  const [ledger, setLedger] = useState<PoolLedger | null>(null);
  const [viewCycleId, setViewCycleId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [modal, setModal] = useState<ModalState>({ kind: 'none' });
  const [busy, setBusy] = useState(false);

  const isAdmin = Boolean(currentUserId && (event.createdBy === currentUserId || (event.admins || []).includes(currentUserId)));
  const isCustodian = currentUserId === config.custodianUserId;
  const isManager = isAdmin || isCustodian;
  const eventEditable = event.status === 'active' || event.status === 'review';

  const load = useCallback(async () => {
    try {
      setLoadError('');
      const res = await poolApi.ledger(event.id, viewCycleId || undefined);
      setLedger(res.data || null);
    } catch (err) {
      setLoadError(toPoolError(err, 'Could not load the pool').message);
    } finally {
      setLoading(false);
    }
  }, [event.id, viewCycleId]);

  useEffect(() => { void load(); }, [load, refreshKey]);

  const nameOf = useCallback((entityType: 'user' | 'group', id: string) => {
    if (entityType === 'group') return groups.find((g) => g.id === id)?.name || 'Group';
    if (id === currentUserId) return 'You';
    const p = participants.find((x) => x.userId === id);
    return p?.displayName || p?.email || 'Member';
  }, [groups, participants, currentUserId]);

  const run = async (label: string, fn: () => Promise<unknown>, success?: string) => {
    setBusy(true);
    try {
      await fn();
      if (success) pushToast({ type: 'success', title: label, message: success });
      setModal({ kind: 'none' });
      await load();
      onChanged();
    } catch (err) {
      pushToast({ type: 'error', title: label, message: poolErrorText(err, currency) });
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <Card><CardBody>Loading {noun.toLowerCase()}…</CardBody></Card>;
  if (loadError || !ledger) {
    return <EmptyState title={`Couldn't load the ${noun.toLowerCase()}`} description={loadError} action={<Button onClick={() => void load()}>Retry</Button>} />;
  }

  const { summary, contributions, entries, spenders, cycles } = ledger;
  const cycle = summary.cycle;
  const viewingPast = Boolean(viewCycleId) && cycle.status === 'closed';
  const cycleOpen = cycle.status === 'open' && !viewingPast;
  const canAct = cycleOpen && eventEditable;
  const pendingDraws = entries.filter((e) => e.type === 'draw' && e.status === 'pending');
  const outstanding = summary.arrears.reduce((s, a) => s + a.outstandingMinor, 0);
  const sponsor = config.funderMode === 'sponsor';

  return (
    <Stack data-testid="pool-tab">
      {/* ── Summary ───────────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <HeaderRow>
            <div>
              <CardTitle data-testid="pool-title">{noun} · {cycle.label}</CardTitle>
              <CardSubtitle>
                {cycle.status === 'open' ? 'Open' : cycle.status === 'reconciling' ? 'Settling up' : 'Closed'}
                {' · '}held by {nameOf('user', config.custodianUserId)}
              </CardSubtitle>
            </div>
            {canAct && (
              <Actions>
                <Button $variant="outline" $size="sm" onClick={() => setModal({ kind: 'topUp' })} data-testid="pool-add-money">Add money</Button>
                {isManager && !sponsor && (
                  <Button $variant="outline" $size="sm" onClick={() => setModal({ kind: 'amounts' })} data-testid="pool-set-amounts">Set amounts</Button>
                )}
                {isManager && config.cycleMode === 'recurring' && (
                  <Button $variant="secondary" $size="sm" onClick={() => setModal({ kind: 'close' })} data-testid="pool-close-cycle">Close {cycle.label}</Button>
                )}
                {isAdmin && event.status === 'active' && (
                  <Button $variant="primary" $size="sm" onClick={() => setModal({ kind: 'settle' })} data-testid="pool-settle-up">
                    {sponsor ? 'Finish & report' : 'Settle up'}
                  </Button>
                )}
              </Actions>
            )}
          </HeaderRow>
        </CardHeader>
        <CardBody>
          {viewingPast && (
            <Banner $tone="info">
              Viewing a closed cycle. <SmallLink href="#" onClick={(e) => { e.preventDefault(); setViewCycleId(null); }}>Back to the current cycle</SmallLink>
            </Banner>
          )}
          <PoolMeter overdraft={summary.overdraft} currency={currency} />
          <Totals data-testid="pool-totals">
            {cycle.openingBalanceMinor !== 0 && <span>carried in {formatMinor(cycle.openingBalanceMinor, currency)}</span>}
            <span>collected {formatMinor(summary.totals.confirmedRegularMinor + summary.totals.confirmedTopUpMinor, currency)}</span>
            <span>spent {formatMinor(summary.totals.poolSpendMinor, currency)}</span>
            {summary.totals.reimbursementsMinor > 0 && <span>reimbursed {formatMinor(summary.totals.reimbursementsMinor, currency)}</span>}
            {summary.totals.pendingDrawsMinor > 0 && <span>awaiting approval {formatMinor(summary.totals.pendingDrawsMinor, currency)}</span>}
          </Totals>
          {summary.funding.targetMinor !== null && config.preset === 'target_collection' && (
            <Banner $tone={summary.funding.state === 'funded' ? 'info' : 'warning'} data-testid="pool-funding">
              {summary.funding.state === 'funded'
                ? `Fully collected (${formatMinor(summary.funding.fundedMinor, currency)}). You're clear to spend.`
                : `Collected ${formatMinor(summary.funding.fundedMinor, currency)} of ${formatMinor(summary.funding.targetMinor, currency)} — spending unlocks once the target is reached.`}
            </Banner>
          )}
          {outstanding > 0 && !sponsor && (
            <Banner $tone="warning" data-testid="pool-arrears">
              {summary.arrears.length} contribution{summary.arrears.length === 1 ? '' : 's'} outstanding ({formatMinor(outstanding, currency)}).
            </Banner>
          )}
          {cycle.status === 'reconciling' && (
            <Banner $tone="info">Settling up: the payments below the expense list close out this {noun.toLowerCase()}.</Banner>
          )}
          {summary.overdraft.zone === 'blocked' && summary.overdraft.baselineMinor > 0 && canAct && (
            <Banner $tone="error">
              New pool spending is paused. Expenses already paid can still be recorded — they&apos;ll be flagged for {isCustodian ? 'your review' : nameOf('user', config.custodianUserId)}.
            </Banner>
          )}
        </CardBody>
      </Card>

      {/* ── Pending approvals ────────────────────────────────────── */}
      {isManager && pendingDraws.length > 0 && (
        <Card data-testid="pool-pending-approvals">
          <CardHeader><CardTitle>Waiting for your approval</CardTitle></CardHeader>
          <CardBody>
            <List>
              {pendingDraws.map((e) => (
                <Item key={e.id}>
                  <ItemMain>
                    <ItemTitle>
                      {e.title}
                      <Badge $variant="info">{e.fundingSource === 'pool_reimbursement' ? 'Reimbursement' : 'Pool spend'}</Badge>
                      {e.flags?.map((f) => <Badge key={f} $variant="warning">{f === 'exceeds_spender_cap' ? 'Over spending limit' : 'Over limit'}</Badge>)}
                    </ItemTitle>
                    <ItemMeta>
                      {nameOf('user', e.actorUserId)} · {new Date(e.at).toLocaleDateString()}
                      {e.receiptUrls.map((u, i) => <span key={u}> · <SmallLink href={resolveFileHref(u)} target="_blank" rel="noreferrer">receipt{e.receiptUrls.length > 1 ? ` ${i + 1}` : ''}</SmallLink></span>)}
                    </ItemMeta>
                  </ItemMain>
                  <Actions>
                    <Amount>{formatMinor(-e.amountMinor, currency)}</Amount>
                    <Button $size="sm" $variant="primary" disabled={busy || !canAct} data-testid={`approve-draw-${e.id}`}
                      onClick={() => run('Approved', () => poolApi.approveDraw(e.id), e.fundingSource === 'pool_reimbursement' ? 'A reimbursement payment was created.' : 'Deducted from the pool.')}>
                      Approve
                    </Button>
                    <Button $size="sm" $variant="ghost" disabled={busy || !canAct} onClick={() => setModal({ kind: 'reject', target: 'draw', id: e.id, title: e.title })}>Reject</Button>
                  </Actions>
                </Item>
              ))}
            </List>
          </CardBody>
        </Card>
      )}

      {event.status === 'active' && (
        <PoolPayments legs={settlements.filter((s) => isPoolSideLeg(s))} currentUserId={currentUserId} nameOf={nameOf} onChanged={onChanged} />
      )}

      {/* ── Contributions / budget ───────────────────────────────── */}
      <Card data-testid="pool-contributions">
        <CardHeader>
          <CardTitle>{sponsor ? 'Budget' : 'Contributions'}</CardTitle>
          {!sponsor && (
            <CardSubtitle>
              {formatMinor(summary.totals.confirmedRegularMinor, currency)} of {formatMinor(summary.totals.expectedRegularMinor, currency)} received
            </CardSubtitle>
          )}
        </CardHeader>
        <CardBody>
          {contributions.length === 0 ? (
            <EmptyState title="No contributions yet" description={isManager ? 'Use “Set amounts” to decide what each person puts in.' : 'The custodian will set what each person puts in.'} />
          ) : (
            <List>
              {contributions.map((c) => {
                const status = CONTRIBUTION_STATUS[c.status];
                const mine = c.fromUserId === currentUserId;
                const outstandingC = Math.max(0, c.expectedMinor - c.receivedMinor);
                return (
                  <Item key={c.id} data-testid={`contribution-${c.id}`}>
                    <ItemMain>
                      <ItemTitle>
                        {nameOf(c.fromEntityType, c.fromEntityId)}
                        {c.kind !== 'regular' && <Badge>{c.kind === 'top_up' ? 'Top-up' : 'Covered shortfall'}</Badge>}
                        <Badge $variant={status.tone}>{status.label}</Badge>
                      </ItemTitle>
                      <ItemMeta>
                        {c.kind === 'regular' ? `${formatMinor(c.receivedMinor, currency)} of ${formatMinor(c.expectedMinor, currency)}` : formatMinor(c.receivedMinor || c.expectedMinor, currency)}
                        {c.status === 'initiated' && c.claimedMinor ? ` · says they sent ${formatMinor(c.claimedMinor, currency)}` : ''}
                        {c.paymentReference ? ` · ref ${c.paymentReference}` : ''}
                        {c.rejectionReason && c.status !== 'confirmed' ? ` · not received: ${c.rejectionReason}` : ''}
                        {c.proofUrl && <> · <SmallLink href={resolveFileHref(c.proofUrl)} target="_blank" rel="noreferrer">proof</SmallLink></>}
                      </ItemMeta>
                    </ItemMain>
                    {canAct && (
                      <Actions>
                        {mine && (c.status === 'pending' || c.status === 'partial' || c.status === 'initiated') && (
                          <Button $size="sm" $variant="primary" onClick={() => setModal({ kind: 'markPaid', contribution: c })} data-testid={`mark-paid-${c.id}`}>
                            {c.status === 'initiated' ? 'Update payment' : 'Mark as paid'}
                          </Button>
                        )}
                        {isCustodian && c.status === 'initiated' && (
                          <>
                            <Button $size="sm" $variant="primary" onClick={() => setModal({ kind: 'confirm', contribution: c })} data-testid={`confirm-${c.id}`}>Confirm</Button>
                            <Button $size="sm" $variant="ghost" onClick={() => setModal({ kind: 'reject', target: 'contribution', id: c.id, title: nameOf(c.fromEntityType, c.fromEntityId) })}>Not received</Button>
                          </>
                        )}
                        {isCustodian && !mine && (c.status === 'pending' || c.status === 'partial') && outstandingC > 0 && (
                          <Button $size="sm" $variant="outline" onClick={() => setModal({ kind: 'confirm', contribution: c })}>Record payment</Button>
                        )}
                        {isManager && c.status === 'pending' && c.receivedMinor === 0 && c.kind === 'regular' && (
                          <Button $size="sm" $variant="ghost" disabled={busy} onClick={() => run('Waived', () => poolApi.waive(c.id), 'Excused for this cycle.')}>Waive</Button>
                        )}
                      </Actions>
                    )}
                  </Item>
                );
              })}
            </List>
          )}
        </CardBody>
      </Card>

      {/* ── Spenders ─────────────────────────────────────────────── */}
      {spenders.length > 0 && (
        <Card data-testid="pool-spenders">
          <CardHeader><CardTitle>Spending by person</CardTitle></CardHeader>
          <CardBody>
            <Table>
              <thead><tr><th>Spender</th><th>Awaiting approval</th><th>Spent</th></tr></thead>
              <tbody>
                {spenders.map((s) => (
                  <tr key={`${s.spenderType}:${s.spenderId}`}>
                    <td>{nameOf(s.spenderType, s.spenderId)}</td>
                    <td>{s.pendingMinor ? formatMinor(s.pendingMinor, currency) : '—'}</td>
                    <td>{formatMinor(s.spentMinor, currency)}{s.capMinor !== null ? ` / ${formatMinor(s.capMinor, currency)}` : ''}</td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </CardBody>
        </Card>
      )}

      {/* ── Activity ─────────────────────────────────────────────── */}
      <Card data-testid="pool-ledger">
        <CardHeader><CardTitle>Activity</CardTitle><CardSubtitle>Every rupee in and out, with receipts.</CardSubtitle></CardHeader>
        <CardBody>
          {entries.length === 0 ? (
            <EmptyState title="Nothing yet" description="Contributions and pool expenses will appear here." />
          ) : (
            <List>
              {entries.map((e) => <LedgerRow key={`${e.type}-${e.id}`} entry={e} currency={currency} nameOf={nameOf} />)}
            </List>
          )}
        </CardBody>
      </Card>

      {/* ── Cycle history ────────────────────────────────────────── */}
      {cycles.length > 1 && (
        <Card data-testid="pool-cycles">
          <CardHeader><CardTitle>Cycle history</CardTitle></CardHeader>
          <CardBody>
            <List>
              {[...cycles].reverse().map((c) => (
                <Item key={c.id}>
                  <ItemMain>
                    <ItemTitle>{c.label} <Badge $variant={c.status === 'closed' ? 'default' : 'success'}>{c.status}</Badge></ItemTitle>
                    <ItemMeta>
                      {c.reconciliation
                        ? `${c.reconciliation.disposition === 'carry_forward' ? 'carried forward' : 'settled'} ${formatMinor(c.reconciliation.closingBalanceMinor, currency)}`
                        : `opened with ${formatMinor(c.openingBalanceMinor, currency)}`}
                      {c.closeReason === 'membership_change' ? ' · closed when membership changed' : ''}
                    </ItemMeta>
                  </ItemMain>
                  {c.id !== cycle.id && (
                    <Button $size="sm" $variant="ghost" onClick={() => setViewCycleId(c.status === 'closed' ? c.id : null)}>View</Button>
                  )}
                </Item>
              ))}
            </List>
          </CardBody>
        </Card>
      )}

      {/* ── Modals ───────────────────────────────────────────────── */}
      {modal.kind === 'markPaid' && (
        <MarkPaidModal contribution={modal.contribution} currency={currency} busy={busy}
          onClose={() => setModal({ kind: 'none' })}
          onSubmit={(body) => run('Marked as paid', () => poolApi.markPaid(modal.contribution.id, body), `${nameOf('user', config.custodianUserId)} will confirm once it arrives.`)} />
      )}
      {modal.kind === 'confirm' && (
        <AmountModal title="Confirm money received" label="Amount received" currency={currency} busy={busy}
          initialMinor={modal.contribution.claimedMinor || Math.max(0, modal.contribution.expectedMinor - modal.contribution.receivedMinor)}
          hint="Only confirmed money counts toward the pool balance."
          submitLabel="Confirm"
          onClose={() => setModal({ kind: 'none' })}
          onSubmit={(minor) => run('Confirmed', () => poolApi.confirm(modal.contribution.id, minor), 'Added to the pool.')} />
      )}
      {modal.kind === 'reject' && (
        <ReasonModal title={modal.target === 'draw' ? `Reject “${modal.title}”?` : `Mark ${modal.title}'s payment as not received?`}
          busy={busy} onClose={() => setModal({ kind: 'none' })}
          onSubmit={(reason) => run('Updated', () => (modal.target === 'draw' ? poolApi.rejectDraw(modal.id, reason) : poolApi.reject(modal.id, reason)))} />
      )}
      {modal.kind === 'topUp' && (
        <AmountModal title={`Add money to the ${noun.toLowerCase()}`} label="Amount" currency={currency} busy={busy} initialMinor={0}
          hint={isCustodian ? 'Money you hold is added straight away.' : `${nameOf('user', config.custodianUserId)} confirms once it arrives.`}
          submitLabel="Add"
          onClose={() => setModal({ kind: 'none' })}
          onSubmit={(minor) => run('Money added', async () => {
            const res = await poolApi.topUp(event.id, { amountMinor: minor });
            if (!isCustodian && res.data) await poolApi.markPaid(res.data.id, { amountMinor: minor });
          }, isCustodian ? 'Added to the pool.' : 'Waiting for the custodian to confirm.')} />
      )}
      {modal.kind === 'amounts' && (
        <AmountsModal cycle={cycle} contributions={contributions} currency={currency} busy={busy} nameOf={nameOf}
          onClose={() => setModal({ kind: 'none' })}
          onSubmit={(rows) => run('Amounts saved', () => poolApi.setContributions(event.id, rows))} />
      )}
      {(modal.kind === 'close' || modal.kind === 'settle') && (
        <ReconcileModal eventId={event.id} mode={modal.kind} currency={currency} noun={noun} busy={busy} nameOf={nameOf}
          custodianKey={entityKey('user', config.custodianUserId)}
          rosterKeys={cycle.roster.map((r) => entityKey(r.entityType, r.entityId))}
          onClose={() => setModal({ kind: 'none' })}
          onSubmit={(cover) => run(modal.kind === 'close' ? 'Cycle closed' : 'Settling up',
            () => (modal.kind === 'close' ? poolApi.closeCycle(event.id, { cover }) : poolApi.dissolve(event.id, { cover })),
            modal.kind === 'close' ? 'A new cycle has started.' : 'Everyone can now review the final payments.')} />
      )}
    </Stack>
  );
}

// ── Pieces ─────────────────────────────────────────────────────────────

function LedgerRow({ entry: e, currency, nameOf }: { entry: PoolLedgerEntry; currency: string; nameOf: (t: 'user' | 'group', id: string) => string }) {
  const who = e.entityType ? nameOf(e.entityType, e.entityId!) : nameOf('user', e.actorUserId);
  let state: React.ReactNode = null;
  if (e.type === 'draw') {
    if (e.status === 'pending') state = <Badge $variant="info">Awaiting approval</Badge>;
    else if (e.status === 'rejected') state = <Badge $variant="error">Rejected</Badge>;
    else if (e.fundingSource === 'pool_reimbursement') {
      const payBack = reimbursementStatus({ status: e.status as PoolDrawStatus }, e.settlementStatus);
      if (payBack) state = <Badge $variant={REIMBURSEMENT_STATUS[payBack].tone}>{REIMBURSEMENT_STATUS[payBack].label}</Badge>;
    }
  } else if (e.status === 'initiated') {
    state = <Badge $variant="info">Awaiting confirmation</Badge>;
  }
  return (
    <Item data-testid={`ledger-${e.id}`}>
      <ItemMain>
        <ItemTitle>
          {e.title}
          {state}
          {e.flags?.includes('exceeds_tolerance') && <Badge $variant="warning">Over the overdraft limit</Badge>}
          {e.flags?.includes('underfunded') && <Badge $variant="warning">Before target reached</Badge>}
        </ItemTitle>
        <ItemMeta>
          {who} · {new Date(e.at).toLocaleDateString()}
          {e.receiptUrls.map((u, i) => <span key={u}> · <SmallLink href={resolveFileHref(u)} target="_blank" rel="noreferrer">{e.type === 'draw' ? 'receipt' : 'proof'}{e.receiptUrls.length > 1 ? ` ${i + 1}` : ''}</SmallLink></span>)}
        </ItemMeta>
      </ItemMain>
      <Amount $tone={!e.counted ? 'muted' : e.amountMinor > 0 ? 'in' : 'out'}>{formatMinor(e.amountMinor, currency, { signed: true })}</Amount>
    </Item>
  );
}

function parseMajor(text: string, currency: string): number | null {
  const n = Number(text);
  if (!text.trim() || !Number.isFinite(n) || n <= 0) return null;
  return toMinor(n, currency);
}

function AmountModal(props: {
  title: string; label: string; hint?: string; currency: string; initialMinor: number; submitLabel: string; busy: boolean;
  onClose: () => void; onSubmit: (minor: number) => void;
}) {
  const [text, setText] = useState(props.initialMinor > 0 ? String(fromMinor(props.initialMinor, props.currency)) : '');
  const minor = parseMajor(text, props.currency);
  return (
    <Modal open onClose={props.onClose} dataTestId="pool-amount-modal">
      <ModalHeader><ModalTitle>{props.title}</ModalTitle></ModalHeader>
      <ModalBody>
        <Field>
          <Label htmlFor="pool-amount">{props.label}</Label>
          <Input id="pool-amount" type="number" min="0" step="any" inputMode="decimal" value={text} onChange={(e) => setText(e.target.value)} autoFocus data-testid="pool-amount-input" />
        </Field>
        {props.hint && <ItemMeta style={{ marginTop: 8 }}>{props.hint}</ItemMeta>}
      </ModalBody>
      <ModalFooter>
        <Button $variant="outline" onClick={props.onClose}>Cancel</Button>
        <Button $variant="primary" disabled={props.busy || minor === null} onClick={() => minor !== null && props.onSubmit(minor)} data-testid="pool-amount-submit">{props.submitLabel}</Button>
      </ModalFooter>
    </Modal>
  );
}

function ReasonModal(props: { title: string; busy: boolean; onClose: () => void; onSubmit: (reason?: string) => void }) {
  const [reason, setReason] = useState('');
  return (
    <Modal open onClose={props.onClose}>
      <ModalHeader><ModalTitle>{props.title}</ModalTitle></ModalHeader>
      <ModalBody>
        <Field>
          <Label htmlFor="pool-reason">Reason (optional)</Label>
          <Input id="pool-reason" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} />
        </Field>
      </ModalBody>
      <ModalFooter>
        <Button $variant="outline" onClick={props.onClose}>Cancel</Button>
        <Button $variant="danger" disabled={props.busy} onClick={() => props.onSubmit(reason.trim() || undefined)} data-testid="reason-submit">Confirm</Button>
      </ModalFooter>
    </Modal>
  );
}

function MarkPaidModal(props: {
  contribution: PoolContribution; currency: string; busy: boolean;
  onClose: () => void; onSubmit: (body: { amountMinor?: number; reference?: string; note?: string; proofUrl?: string }) => void;
}) {
  const { push: pushToast } = useToast();
  const c = props.contribution;
  const outstanding = Math.max(0, c.expectedMinor - c.receivedMinor);
  const [text, setText] = useState(outstanding > 0 ? String(fromMinor(outstanding, props.currency)) : '');
  const [reference, setReference] = useState('');
  const [proofUrl, setProofUrl] = useState(c.proofUrl || '');
  const [uploading, setUploading] = useState(false);
  const minor = parseMajor(text, props.currency);

  const onFile = async (file?: File) => {
    if (!file) return;
    if (file.size > MAX_RECEIPT_BYTES) {
      pushToast({ type: 'error', title: 'File too large', message: 'Proof must be under 5MB.' });
      return;
    }
    setUploading(true);
    try {
      setProofUrl(await poolApi.uploadContributionProof(c.id, file));
    } catch (err) {
      pushToast({ type: 'error', title: 'Upload failed', message: toPoolError(err, 'Could not upload the proof').message });
    } finally {
      setUploading(false);
    }
  };

  return (
    <Modal open onClose={props.onClose} dataTestId="pool-mark-paid-modal">
      <ModalHeader><ModalTitle>Mark your contribution as paid</ModalTitle></ModalHeader>
      <ModalBody>
        <ItemMeta style={{ marginBottom: 10 }}>Pay the custodian any way you like (UPI, bank transfer, cash), then record it here.</ItemMeta>
        <Field>
          <Label htmlFor="mp-amount">Amount sent</Label>
          <Input id="mp-amount" type="number" min="0" step="any" value={text} onChange={(e) => setText(e.target.value)} data-testid="mark-paid-amount" />
        </Field>
        <Field>
          <Label htmlFor="mp-ref">Reference (optional)</Label>
          <Input id="mp-ref" value={reference} onChange={(e) => setReference(e.target.value)} placeholder="UPI / transaction ID" maxLength={200} />
        </Field>
        <Field>
          <Label htmlFor="mp-proof">Proof (optional)</Label>
          <Input id="mp-proof" type="file" accept={RECEIPT_ACCEPT} onChange={(e) => void onFile(e.target.files?.[0])} disabled={uploading} />
          {uploading && <ItemMeta>Uploading…</ItemMeta>}
          {proofUrl && !uploading && <ItemMeta>Proof attached ✓</ItemMeta>}
        </Field>
      </ModalBody>
      <ModalFooter>
        <Button $variant="outline" onClick={props.onClose}>Cancel</Button>
        <Button $variant="primary" disabled={props.busy || uploading || minor === null} data-testid="mark-paid-submit"
          onClick={() => minor !== null && props.onSubmit({ amountMinor: minor, reference: reference.trim() || undefined, proofUrl: proofUrl || undefined })}>
          Mark as paid
        </Button>
      </ModalFooter>
    </Modal>
  );
}

function AmountsModal(props: {
  cycle: PoolLedger['summary']['cycle']; contributions: PoolContribution[]; currency: string; busy: boolean;
  nameOf: (t: 'user' | 'group', id: string) => string;
  onClose: () => void; onSubmit: (rows: Array<{ entityId: string; entityType: 'user' | 'group'; expectedMinor: number }>) => void;
}) {
  const initial = useMemo(() => {
    const map: Record<string, string> = {};
    for (const r of props.cycle.roster) {
      const c = props.contributions.find((x) => x.kind === 'regular' && x.fromEntityId === r.entityId && x.fromEntityType === r.entityType);
      map[entityKey(r.entityType, r.entityId)] = c ? String(fromMinor(c.expectedMinor, props.currency)) : '';
    }
    return map;
  }, [props.cycle.roster, props.contributions, props.currency]);
  const [values, setValues] = useState(initial);
  const [all, setAll] = useState('');

  const rows = props.cycle.roster
    .map((r) => ({ ...r, text: values[entityKey(r.entityType, r.entityId)] || '' }))
    .filter((r) => r.text.trim() !== '');
  const invalid = rows.some((r) => !Number.isFinite(Number(r.text)) || Number(r.text) < 0);

  return (
    <Modal open onClose={props.onClose} dataTestId="pool-amounts-modal">
      <ModalHeader><ModalTitle>What does each person put in?</ModalTitle></ModalHeader>
      <ModalBody>
        <Field>
          <Label htmlFor="amt-all">Same for everyone</Label>
          <div style={{ display: 'flex', gap: 8 }}>
            <Input id="amt-all" type="number" min="0" step="any" value={all} onChange={(e) => setAll(e.target.value)} />
            <Button $variant="outline" type="button" onClick={() => setValues(Object.fromEntries(Object.keys(values).map((k) => [k, all])))}>Apply</Button>
          </div>
        </Field>
        <Table>
          <tbody>
            {props.cycle.roster.map((r) => {
              const key = entityKey(r.entityType, r.entityId);
              return (
                <tr key={key}>
                  <td>{props.nameOf(r.entityType, r.entityId)}</td>
                  <td>
                    <Input aria-label={`Amount for ${props.nameOf(r.entityType, r.entityId)}`} type="number" min="0" step="any"
                      value={values[key] || ''} onChange={(e) => setValues((v) => ({ ...v, [key]: e.target.value }))} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </Table>
        <ItemMeta style={{ marginTop: 8 }}>Different amounts are fine (e.g. club tiers). Agreed amounts also decide each person&apos;s fair share of spending.</ItemMeta>
      </ModalBody>
      <ModalFooter>
        <Button $variant="outline" onClick={props.onClose}>Cancel</Button>
        <Button $variant="primary" disabled={props.busy || invalid || rows.length === 0}
          onClick={() => props.onSubmit(rows.map((r) => ({ entityId: r.entityId, entityType: r.entityType, expectedMinor: toMinor(Number(r.text), props.currency) })))}>
          Save
        </Button>
      </ModalFooter>
    </Modal>
  );
}

function ReconcileModal(props: {
  eventId: string; mode: 'close' | 'settle'; currency: string; noun: string; busy: boolean;
  custodianKey: string; rosterKeys: string[];
  nameOf: (t: 'user' | 'group', id: string) => string;
  onClose: () => void; onSubmit: (cover?: CoverEntry[]) => void;
}) {
  type Preview = ReconcileResult & { pendingDraws: number; coverNeededMinor: number };
  // Each result remembers which coverer it was computed for, so a change of
  // coverer shows "working it out" until the matching preview arrives.
  const [result, setResult] = useState<{ key: string; preview?: Preview; error?: string } | null>(null);
  const [coverKey, setCoverKey] = useState(props.custodianKey);

  const coverFrom = (key: string, amountMinor: number): CoverEntry[] => {
    const [type, ...rest] = key.split(':');
    return [{ entityType: type as 'user' | 'group', entityId: rest.join(':'), amountMinor }];
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const forDissolution = props.mode === 'settle';
        // The server defaults any uncovered shortfall to the custodian; re-preview
        // with the chosen person so the breakdown matches what will be committed.
        let data = (await poolApi.previewClose(props.eventId, { forDissolution })).data!;
        if (data.coverNeededMinor > 0 && coverKey !== props.custodianKey) {
          const needed = data.coverNeededMinor;
          data = { ...(await poolApi.previewClose(props.eventId, { forDissolution, cover: coverFrom(coverKey, needed) })).data!, coverNeededMinor: needed };
        }
        if (!cancelled) setResult({ key: coverKey, preview: data });
      } catch (err) {
        if (!cancelled) setResult({ key: coverKey, error: toPoolError(err, 'Could not preview').message });
      }
    })();
    return () => { cancelled = true; };
  }, [props.eventId, props.mode, coverKey, props.custodianKey]);

  const current = result && result.key === coverKey ? result : null;
  const preview = current?.preview ?? null;
  const error = current?.error ?? '';
  const shortfall = preview?.coverNeededMinor ?? 0;
  const coverFor = (): CoverEntry[] | undefined => (shortfall > 0 ? coverFrom(coverKey, shortfall) : undefined);
  const keyName = (k: string) => {
    const [type, ...rest] = k.split(':');
    return props.nameOf(type as 'user' | 'group', rest.join(':'));
  };
  const money = (v: number) => formatMinor(v, props.currency);

  return (
    <Modal open onClose={props.onClose} dataTestId="pool-reconcile-modal">
      <ModalHeader>
        <ModalTitle>{props.mode === 'close' ? 'Close this cycle' : `Settle up the ${props.noun.toLowerCase()}`}</ModalTitle>
      </ModalHeader>
      <ModalBody>
        {error && <Banner $tone="error">{error}</Banner>}
        {!preview && !error && <ItemMeta>Working it out…</ItemMeta>}
        {preview && (
          <>
            {preview.pendingDraws > 0 && <Banner $tone="error">Approve or reject the {preview.pendingDraws} pending expense(s) first.</Banner>}
            <Table>
              <tbody>
                {preview.openingBalanceMinor !== 0 && <tr><td>Carried in</td><td>{money(preview.openingBalanceMinor)}</td></tr>}
                <tr><td>Collected</td><td>{money(preview.confirmedContributionsMinor)}</td></tr>
                <tr><td>Spent from the pool</td><td>{money(-(preview.poolSpendMinor + preview.reimbursementsMinor))}</td></tr>
                <tr><td><strong>{preview.preCoverBalanceMinor >= 0 ? 'Left over' : 'Short by'}</strong></td><td><strong>{money(Math.abs(preview.preCoverBalanceMinor))}</strong></td></tr>
              </tbody>
            </Table>

            {shortfall > 0 && (
              <Field style={{ marginTop: 12 }}>
                <Label htmlFor="cover-who">Who covered the {money(shortfall)} shortfall?</Label>
                <Select id="cover-who" value={coverKey} onChange={(e) => setCoverKey(e.target.value)} data-testid="cover-select">
                  {[...new Set([props.custodianKey, ...props.rosterKeys])].map((k) => <option key={k} value={k}>{keyName(k)}</option>)}
                </Select>
                <ItemMeta>They fronted the money, so they&apos;re credited for it.</ItemMeta>
              </Field>
            )}

            <div style={{ marginTop: 12, fontSize: 13, fontWeight: 600 }}>
              {preview.disposition === 'carry_forward' ? 'Carried into next cycle' : 'What happens next'}
            </div>
            <Table data-testid="reconcile-shares">
              <tbody>
                {preview.disposition === 'carry_forward'
                  ? preview.entityShares.filter((s) => s.netMinor !== 0).map((s) => (
                    <tr key={`${s.entityType}:${s.entityId}`}>
                      <td>{props.nameOf(s.entityType, s.entityId)}</td>
                      <td>{s.netMinor > 0 ? `in credit ${money(s.netMinor)}` : `owes ${money(-s.netMinor)}`}</td>
                    </tr>
                  ))
                  : Object.entries(preview.settlementBalances).map(([k, v]) => (
                    <tr key={k}><td>{keyName(k)}</td><td>{v > 0 ? `gets back ${money(v)}` : `pays ${money(-v)}`}</td></tr>
                  ))}
                {preview.disposition === 'settle' && Object.keys(preview.settlementBalances).length === 0 && (
                  <tr><td colSpan={2}>Nobody owes anybody anything{preview.shareBasis === 'custodian' && preview.closingBalanceMinor > 0 ? ` — ${money(preview.closingBalanceMinor)} stays with the sponsor` : ''}.</td></tr>
                )}
              </tbody>
            </Table>
            <ItemMeta style={{ marginTop: 8 }}>
              {props.mode === 'settle'
                ? 'Everyone approves the payments, pays outside the app, and confirms — just like a normal settlement.'
                : 'No money moves now. Balances roll into the next cycle.'}
            </ItemMeta>
          </>
        )}
      </ModalBody>
      <ModalFooter>
        <Button $variant="outline" onClick={props.onClose}>Cancel</Button>
        <Button $variant="primary" data-testid="reconcile-submit"
          disabled={props.busy || !preview || preview.pendingDraws > 0}
          onClick={() => props.onSubmit(coverFor())}>
          {props.mode === 'close' ? 'Close cycle' : 'Settle up'}
        </Button>
      </ModalFooter>
    </Modal>
  );
}
