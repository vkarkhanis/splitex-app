'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import styled from 'styled-components';
import {
  Button,
  Card,
  CardBody,
  CardHeader,
  CardTitle,
  CardSubtitle,
  Badge,
  EmptyState,
  useToast,
} from '@traxettle/ui';
import { api } from '../../utils/api';
import type { Invitation } from '@traxettle/shared';

const Page = styled.div`
  width: 100%;
  max-width: 760px;
`;

const ListItem = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 0;
  border-bottom: 1px solid ${(p) => p.theme.colors.border};
  gap: 12px;

  &:last-child { border-bottom: none; }
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

const Actions = styled.div`
  display: flex;
  gap: 8px;
`;

const LoadingText = styled.div`
  text-align: center;
  padding: 48px;
  color: ${(p) => p.theme.colors.muted};
`;

const ErrorDiv = styled.div`
  font-size: 14px;
  color: ${(p) => p.theme.colors.error};
  font-weight: 500;
`;

function statusBadgeVariant(status: string) {
  if (status === 'accepted') return 'success';
  if (status === 'pending') return 'warning';
  if (status === 'declined' || status === 'expired') return 'error';
  return 'default';
}

function formatDate(d: any): string {
  if (!d) return '';
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function InvitationsPage() {
  const { push: pushToast } = useToast();
  const router = useRouter();

  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchInvitations = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await api.get<Invitation[]>('/api/invitations/my');
      setInvitations(res.data || []);
    } catch (err: any) {
      setError(err.message || 'Failed to load invitations');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchInvitations(); }, [fetchInvitations]);

  const handleAccept = async (invitationId: string) => {
    try {
      const res = await api.post(`/api/invitations/${invitationId}/accept`);
      pushToast({ type: 'success', title: 'Invitation Accepted', message: 'You have joined the event.' });
      fetchInvitations();
      // Navigate to the event
      if (res.data?.eventId) {
        router.push(`/events/${res.data.eventId}`);
      }
    } catch (err: any) {
      pushToast({ type: 'error', title: 'Error', message: err.message });
    }
  };

  const handleDecline = async (invitationId: string) => {
    try {
      await api.post(`/api/invitations/${invitationId}/decline`);
      pushToast({ type: 'success', title: 'Invitation Declined', message: 'You have declined the invitation.' });
      fetchInvitations();
    } catch (err: any) {
      pushToast({ type: 'error', title: 'Error', message: err.message });
    }
  };

  return (
    <Page data-testid="invitations-page">
      <CardHeader>
        <CardTitle>My Invitations</CardTitle>
        <CardSubtitle>View and respond to event invitations.</CardSubtitle>
      </CardHeader>

      {loading ? (
        <LoadingText>Loading invitations...</LoadingText>
      ) : error ? (
        <div style={{ textAlign: 'center', padding: 24 }}><ErrorDiv>{error}</ErrorDiv></div>
      ) : invitations.length === 0 ? (
        <EmptyState
          title="No invitations"
          description="You don't have any pending invitations."
          dataTestId="empty-invitations"
        />
      ) : (
        <Card>
          <CardBody>
            {invitations.map((inv) => (
              <ListItem key={inv.id} data-testid={`invitation-row-${inv.id}`}>
                <ListItemInfo>
                  <ListItemTitle>{(inv as any).eventName || inv.eventId}</ListItemTitle>
                  <ListItemSub>
                    From: {(inv as any).inviterName || inv.invitedBy} · Role: {inv.role} · Sent: {formatDate(inv.createdAt)}
                    {inv.message ? ` · "${inv.message}"` : ''}
                  </ListItemSub>
                </ListItemInfo>
                <Badge $variant={statusBadgeVariant(inv.status)}>{inv.status}</Badge>
                {inv.status === 'pending' && (
                  <Actions>
                    <Button
                      $variant="primary"
                      onClick={() => handleAccept(inv.id)}
                      data-testid={`accept-invitation-${inv.id}`}
                    >
                      Accept
                    </Button>
                    <Button
                      $variant="outline"
                      onClick={() => handleDecline(inv.id)}
                      data-testid={`decline-invitation-${inv.id}`}
                    >
                      Decline
                    </Button>
                  </Actions>
                )}
              </ListItem>
            ))}
          </CardBody>
        </Card>
      )}
    </Page>
  );
}
