'use client';

import React, { useMemo, useState } from 'react';
import styled from 'styled-components';
import { Button, Card, CardBody, CardHeader, CardSubtitle, CardTitle, Input, useToast } from '@traxettle/ui';
import { fromMinor, toMinor } from '@traxettle/shared';
import type { Event as TraxettleEvent, EventParticipant, Group } from '@traxettle/shared';
import { poolApi } from '../../utils/pool-api';
import { toPoolError } from './poolFormat';

const Table = styled.table`
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
  th, td { text-align: left; padding: 8px 4px; border-bottom: 1px solid ${(p) => p.theme.colors.border}; vertical-align: middle; }
`;

interface Props {
  event: TraxettleEvent;
  participants: EventParticipant[];
  groups: Group[];
  canEdit: boolean;
  onSaved: () => void;
}

/**
 * Sponsor budgets: who may spend from the budget, optionally with a limit.
 * Spenders are not contributors and nothing is split with them.
 */
export function SpenderPermissions({ event, participants, groups, canEdit, onSaved }: Props) {
  const { push: pushToast } = useToast();
  const config = event.poolConfig!;
  const initial = useMemo(() => ({
    users: new Set(config.authorizedSpenders || []),
    groups: new Set(config.authorizedSpenderGroups || []),
    caps: Object.fromEntries(Object.entries(config.spenderCapsMinor || {}).map(([k, v]) => [k, String(fromMinor(v, event.currency))])) as Record<string, string>,
  }), [config, event.currency]);
  const [users, setUsers] = useState(initial.users);
  const [groupIds, setGroupIds] = useState(initial.groups);
  const [caps, setCaps] = useState(initial.caps);
  const [saving, setSaving] = useState(false);

  const toggle = (set: Set<string>, id: string, update: (s: Set<string>) => void) => {
    const next = new Set(set);
    if (next.has(id)) next.delete(id); else next.add(id);
    update(next);
  };

  const save = async () => {
    setSaving(true);
    try {
      const spenderCapsMinor: Record<string, number> = {};
      for (const [id, text] of Object.entries(caps)) {
        const n = Number(text);
        if (text.trim() && Number.isFinite(n) && n >= 0 && (users.has(id) || groupIds.has(id))) spenderCapsMinor[id] = toMinor(n, event.currency);
      }
      await poolApi.updateConfig(event.id, {
        authorizedSpenders: [...users],
        authorizedSpenderGroups: [...groupIds],
        spenderCapsMinor,
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
        <CardTitle>Who can spend from the budget</CardTitle>
        <CardSubtitle>Spenders pay from the budget or claim reimbursements with a receipt. You approve each spend.</CardSubtitle>
      </CardHeader>
      <CardBody>
        {others.length === 0 && groups.length === 0 ? (
          <div style={{ fontSize: 13 }}>Invite people below, then choose who can spend.</div>
        ) : (
          <Table>
            <thead><tr><th>Can spend</th><th>Who</th><th>Limit ({event.currency})</th></tr></thead>
            <tbody>
              {others.map((p) => (
                <tr key={p.userId}>
                  <td><input type="checkbox" aria-label={`Allow ${p.displayName || p.email} to spend`} checked={users.has(p.userId)} disabled={!canEdit}
                    onChange={() => toggle(users, p.userId, setUsers)} data-testid={`spender-${p.userId}`} /></td>
                  <td>{p.displayName || p.email || 'Member'}</td>
                  <td>{capCell(p.userId, users.has(p.userId))}</td>
                </tr>
              ))}
              {groups.map((g) => (
                <tr key={g.id}>
                  <td><input type="checkbox" aria-label={`Allow group ${g.name} to spend`} checked={groupIds.has(g.id)} disabled={!canEdit}
                    onChange={() => toggle(groupIds, g.id, setGroupIds)} /></td>
                  <td>{g.name} <span style={{ opacity: 0.6 }}>(group · {g.members.length})</span></td>
                  <td>{capCell(g.id, groupIds.has(g.id))}</td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
        {canEdit && (
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
            <Button $variant="primary" onClick={save} disabled={saving} data-testid="save-spenders">{saving ? 'Saving…' : 'Save'}</Button>
          </div>
        )}
      </CardBody>
    </Card>
  );
}
