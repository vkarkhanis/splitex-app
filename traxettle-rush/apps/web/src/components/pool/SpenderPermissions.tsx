'use client';

import React, { useMemo, useState } from 'react';
import styled from 'styled-components';
import { Button, Card, CardBody, CardHeader, CardSubtitle, CardTitle, Input, Select, useToast } from '@traxettle/ui';
import { fromMinor, poolNoun, toMinor } from '@traxettle/shared';
import type { Event as TraxettleEvent, EventParticipant, Group, PoolExpenseApprovalMode, PoolSpendersMode } from '@traxettle/shared';
import { poolApi } from '../../utils/pool-api';
import { toPoolError } from './poolFormat';

const Table = styled.table`
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
  th, td { text-align: left; padding: 8px 4px; border-bottom: 1px solid ${(p) => p.theme.colors.border}; vertical-align: middle; }
`;

const Row = styled.div`
  display: flex;
  gap: 8px;
  align-items: center;
  flex-wrap: wrap;
  margin-bottom: 12px;
  font-size: 13px;
`;

interface Props {
  event: TraxettleEvent;
  participants: EventParticipant[];
  groups: Group[];
  canEdit: boolean;
  onSaved: () => void;
}

/**
 * Who may spend and who may approve.
 * - A Budget: who may spend from it, optionally with a limit (spenders aren't contributors).
 * - A "Several of us" pool (Phase 3): everyone in the event, or only people chosen here.
 * - Both: who may approve other people's spends and claims, and whether spends need approval.
 */
export function SpenderPermissions({ event, participants, groups, canEdit, onSaved }: Props) {
  const { push: pushToast } = useToast();
  const config = event.poolConfig!;
  const sponsor = config.funderMode === 'sponsor';
  const noun = poolNoun(config).toLowerCase();
  const initial = useMemo(() => ({
    users: new Set(config.authorizedSpenders || []),
    groups: new Set(config.authorizedSpenderGroups || []),
    approvers: new Set(config.approverUserIds || []),
    caps: Object.fromEntries(Object.entries(config.spenderCapsMinor || {}).map(([k, v]) => [k, String(fromMinor(v, event.currency))])) as Record<string, string>,
  }), [config, event.currency]);
  const [mode, setMode] = useState<PoolSpendersMode>(config.spendersMode === 'listed' ? 'listed' : 'everyone');
  const [users, setUsers] = useState(initial.users);
  const [groupIds, setGroupIds] = useState(initial.groups);
  const [approvers, setApprovers] = useState(initial.approvers);
  const [caps, setCaps] = useState(initial.caps);
  const [approval, setApproval] = useState<PoolExpenseApprovalMode>(config.expenseApproval || 'none');
  const [threshold, setThreshold] = useState(config.approvalThresholdMinor != null ? String(fromMinor(config.approvalThresholdMinor, event.currency)) : '');
  // Spenders may record spends on the custodian's card or UPI (§9.3). On unless turned off.
  const [cardSpends, setCardSpends] = useState(config.allowSponsorCardSpends !== false);
  const [saving, setSaving] = useState(false);
  const listed = sponsor || mode === 'listed';

  const toggle = (set: Set<string>, id: string, update: (s: Set<string>) => void) => {
    const next = new Set(set);
    if (next.has(id)) next.delete(id); else next.add(id);
    update(next);
  };

  const save = async () => {
    const t = Number(threshold);
    if (approval === 'above_threshold' && (!threshold.trim() || !Number.isFinite(t) || t < 0)) {
      pushToast({ type: 'error', title: 'Could not save', message: 'Enter the amount above which spends need approval.' });
      return;
    }
    setSaving(true);
    try {
      const spenderCapsMinor: Record<string, number> = {};
      for (const [id, text] of Object.entries(caps)) {
        const n = Number(text);
        if (text.trim() && Number.isFinite(n) && n >= 0 && (users.has(id) || groupIds.has(id))) spenderCapsMinor[id] = toMinor(n, event.currency);
      }
      await poolApi.updateConfig(event.id, {
        ...(sponsor ? {} : { spendersMode: mode }),
        authorizedSpenders: [...users],
        authorizedSpenderGroups: [...groupIds],
        spenderCapsMinor: listed ? spenderCapsMinor : {},
        approverUserIds: [...approvers],
        expenseApproval: approval,
        ...(approval === 'above_threshold' ? { approvalThresholdMinor: toMinor(t, event.currency) } : {}),
        allowSponsorCardSpends: cardSpends,
      });
      pushToast({ type: 'success', title: 'Saved', message: 'Spending permissions updated.' });
      onSaved();
    } catch (err) {
      pushToast({ type: 'error', title: 'Could not save', message: toPoolError(err, 'Try again').message });
    } finally {
      setSaving(false);
    }
  };

  const others = participants.filter((p) => p.userId !== config.custodianUserId);
  const capCell = (id: string, enabled: boolean) => (
    <Input type="number" min="0" step="any" placeholder="No limit" aria-label="Spending limit" value={caps[id] || ''}
      disabled={!canEdit || !enabled} onChange={(e) => setCaps((c) => ({ ...c, [id]: e.target.value }))} style={{ maxWidth: 140 }} />
  );

  return (
    <Card data-testid="spender-permissions">
      <CardHeader>
        <CardTitle>{sponsor ? 'Who can spend from the budget' : `Who can spend and approve`}</CardTitle>
        <CardSubtitle>
          {sponsor
            ? 'Spenders pay from the budget or claim reimbursements with a receipt. You approve each spend.'
            : `Approvers decide other people's spends and claims, and nothing else. Nobody approves their own.`}
        </CardSubtitle>
      </CardHeader>
      <CardBody>
        {!sponsor && (
          <Row>
            <label htmlFor="spenders-mode">Who can spend</label>
            <Select id="spenders-mode" value={mode} disabled={!canEdit} onChange={(e) => setMode(e.target.value as PoolSpendersMode)} data-testid="spenders-mode" style={{ maxWidth: 260 }}>
              <option value="everyone">Everyone in the event</option>
              <option value="listed">Only people I choose</option>
            </Select>
            {mode === 'listed' && <span style={{ opacity: 0.7 }}>Others can still claim back money they spent, with approval.</span>}
          </Row>
        )}
        <Row>
          <label htmlFor="approval-mode">Spends need approval</label>
          <Select id="approval-mode" value={approval} disabled={!canEdit} onChange={(e) => setApproval(e.target.value as PoolExpenseApprovalMode)} data-testid="approval-mode" style={{ maxWidth: 200 }}>
            <option value="none">Never</option>
            <option value="above_threshold">Above an amount</option>
            <option value="always">Always</option>
          </Select>
          {approval === 'above_threshold' && (
            <Input type="number" min="0" step="any" aria-label="Approval threshold" placeholder={`Amount (${event.currency})`} value={threshold}
              disabled={!canEdit} onChange={(e) => setThreshold(e.target.value)} style={{ maxWidth: 160 }} data-testid="approval-threshold" />
          )}
        </Row>
        {approval === 'none' && approvers.size > 0 && (
          <div style={{ fontSize: 12, opacity: 0.75, marginBottom: 8 }} data-testid="approvers-unused">
            Spends don&apos;t need approval in this {noun}. Choose “Always” or “Above an amount” to use approvers.
          </div>
        )}
        {others.length === 0 && groups.length === 0 ? (
          <div style={{ fontSize: 13 }}>Invite people, then choose who can {listed ? 'spend and ' : ''}approve.</div>
        ) : (
          <Table>
            <thead>
              <tr>
                {listed && <th>Can spend</th>}
                <th>Who</th>
                {listed && <th>Limit ({event.currency})</th>}
                <th>Can approve</th>
              </tr>
            </thead>
            <tbody>
              {others.map((p) => {
                const name = p.displayName || p.email || 'Member';
                return (
                  <tr key={p.userId}>
                    {listed && (
                      <td><input type="checkbox" aria-label={`Allow ${name} to spend`} checked={users.has(p.userId)} disabled={!canEdit}
                        onChange={() => toggle(users, p.userId, setUsers)} data-testid={`spender-${p.userId}`} /></td>
                    )}
                    <td>{name}</td>
                    {listed && <td>{capCell(p.userId, users.has(p.userId))}</td>}
                    <td><input type="checkbox" aria-label={`Allow ${name} to approve`} checked={approvers.has(p.userId)} disabled={!canEdit}
                      onChange={() => toggle(approvers, p.userId, setApprovers)} data-testid={`approver-${p.userId}`} /></td>
                  </tr>
                );
              })}
              {listed && groups.map((g) => (
                <tr key={g.id}>
                  <td><input type="checkbox" aria-label={`Allow group ${g.name} to spend`} checked={groupIds.has(g.id)} disabled={!canEdit}
                    onChange={() => toggle(groupIds, g.id, setGroupIds)} data-testid={`spender-group-${g.id}`} /></td>
                  <td>{g.name} <span style={{ opacity: 0.6 }}>(group · {g.members.length})</span></td>
                  <td>{capCell(g.id, groupIds.has(g.id))}</td>
                  <td />
                </tr>
              ))}
            </tbody>
          </Table>
        )}
        <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', marginTop: 12, fontSize: 13 }}>
          <input type="checkbox" checked={cardSpends} disabled={!canEdit} onChange={() => setCardSpends((v) => !v)} data-testid="allow-card-spends" />
          <span>
            Spenders can pay with my card or UPI
            <span style={{ display: 'block', opacity: 0.7, fontSize: 12 }}>
              Turn this off if you never share your card or UPI: spenders then only see “money I&apos;m holding” and “my money — claim it back”.
            </span>
          </span>
        </label>
        {canEdit && (
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
            <Button $variant="primary" onClick={save} disabled={saving} data-testid="save-spenders">{saving ? 'Saving…' : 'Save'}</Button>
          </div>
        )}
      </CardBody>
    </Card>
  );
}
