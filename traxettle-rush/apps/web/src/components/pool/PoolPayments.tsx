'use client';

import React, { useState } from 'react';
import styled from 'styled-components';
import { Badge, Button, Card, CardBody, CardHeader, CardSubtitle, CardTitle, Field, Input, Label, Modal, ModalBody, ModalFooter, ModalHeader, ModalTitle, useToast } from '@traxettle/ui';
import { toMinor } from '@traxettle/shared';
import type { Settlement } from '@traxettle/shared';
import { api } from '../../utils/api';
import { formatMinor, toPoolError } from './poolFormat';

const List = styled.ul`
  list-style: none;
  margin: 0;
  padding: 0;
`;

const Row = styled.li`
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
  padding: 10px 0;
  border-bottom: 1px solid ${(p) => p.theme.colors.border};
  &:last-child { border-bottom: none; }
`;

const Meta = styled.div`
  font-size: 12px;
  color: ${(p) => p.theme.colors.muted};
`;

const KIND_LABEL: Record<string, string> = {
  pool_reimbursement: 'Reimbursement',
  pool_member_exit: 'Leaving settlement',
  pool_cycle: 'Cycle refund',
};

const STATUS: Record<string, { label: string; tone: 'default' | 'success' | 'warning' | 'info' | 'error' }> = {
  pending: { label: 'To pay', tone: 'warning' },
  initiated: { label: 'Paid — awaiting confirmation', tone: 'info' },
  failed: { label: 'Retry needed', tone: 'error' },
  completed: { label: 'Done', tone: 'success' },
};

interface Props {
  legs: Settlement[];
  currentUserId: string | null;
  nameOf: (type: 'user' | 'group', id: string) => string;
  onChanged: () => void;
}

/**
 * Payments that belong to an active pool (reimbursements, payouts to someone
 * leaving, per-cycle refunds). They use the normal settlement pay → confirm
 * flow but never lock or settle the event.
 */
export function PoolPayments({ legs, currentUserId, nameOf, onChanged }: Props) {
  const { push: pushToast } = useToast();
  const [paying, setPaying] = useState<Settlement | null>(null);
  const [reference, setReference] = useState('');
  const [busy, setBusy] = useState(false);

  if (legs.length === 0) return null;
  const sorted = [...legs].sort((a, b) => Number(a.status === 'completed') - Number(b.status === 'completed'));

  const act = async (label: string, fn: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await fn();
      pushToast({ type: 'success', title: label, message: '' });
      setPaying(null);
      setReference('');
      onChanged();
    } catch (err) {
      pushToast({ type: 'error', title: label, message: toPoolError(err).message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card data-testid="pool-payments">
      <CardHeader>
        <CardTitle>Pool payments</CardTitle>
        <CardSubtitle>Pay outside the app, then mark it paid here; the recipient confirms.</CardSubtitle>
      </CardHeader>
      <CardBody>
        <List>
          {sorted.map((leg) => {
            const status = STATUS[leg.status] || STATUS.pending;
            const note = leg.auditTrail?.[0]?.note;
            const isPayer = currentUserId === leg.fromUserId;
            const isPayee = currentUserId === leg.toUserId;
            return (
              <Row key={leg.id} data-testid={`pool-leg-${leg.id}`}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>
                    {nameOf('user', leg.fromUserId)} → {nameOf('user', leg.toUserId)}{' '}
                    <Badge>{KIND_LABEL[leg.kind || ''] || 'Payment'}</Badge> <Badge $variant={status.tone}>{status.label}</Badge>
                  </div>
                  {note && <Meta>{note}</Meta>}
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <strong style={{ fontVariantNumeric: 'tabular-nums' }}>{formatMinor(toMinor(leg.amount, leg.currency), leg.currency)}</strong>
                  {isPayer && (leg.status === 'pending' || leg.status === 'failed') && (
                    <Button $size="sm" $variant="primary" disabled={busy} onClick={() => setPaying(leg)} data-testid={`pool-leg-pay-${leg.id}`}>Mark as paid</Button>
                  )}
                  {isPayee && leg.status === 'initiated' && (
                    <>
                      <Button $size="sm" $variant="primary" disabled={busy} data-testid={`pool-leg-confirm-${leg.id}`}
                        onClick={() => act('Payment confirmed', () => api.post(`/api/settlements/${leg.id}/approve`, {}))}>Confirm received</Button>
                      <Button $size="sm" $variant="ghost" disabled={busy}
                        onClick={() => act('Marked as not received', () => api.post(`/api/settlements/${leg.id}/reject`, { reason: 'Payment not received' }))}>Not received</Button>
                    </>
                  )}
                </div>
              </Row>
            );
          })}
        </List>
      </CardBody>
      {paying && (
        <Modal open onClose={() => setPaying(null)}>
          <ModalHeader><ModalTitle>Mark as paid</ModalTitle></ModalHeader>
          <ModalBody>
            <Meta style={{ marginBottom: 10 }}>
              Send {formatMinor(toMinor(paying.amount, paying.currency), paying.currency)} to {nameOf('user', paying.toUserId)}, then record it.
            </Meta>
            <Field>
              <Label htmlFor="leg-ref">Reference (optional)</Label>
              <Input id="leg-ref" value={reference} onChange={(e) => setReference(e.target.value)} placeholder="UPI / transaction ID" />
            </Field>
          </ModalBody>
          <ModalFooter>
            <Button $variant="outline" onClick={() => setPaying(null)}>Cancel</Button>
            <Button $variant="primary" disabled={busy} data-testid="pool-leg-pay-submit"
              onClick={() => act('Marked as paid', () => api.post(`/api/settlements/${paying.id}/pay`, { referenceId: reference.trim(), note: 'Paid outside the app' }))}>
              Mark as paid
            </Button>
          </ModalFooter>
        </Modal>
      )}
    </Card>
  );
}
