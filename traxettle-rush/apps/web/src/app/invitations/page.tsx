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
import { toUserFriendlyError } from '../../utils/errorMessages';

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
  const [mode, setMode] = useState<'latest' | 'active'>('latest');

  const fetchInvitations = useCallback(async (nextMode: 'latest' | 'active' = mode) => {
    setLoading(true);
    setError('');
    try {
      const url = nextMode === 'active'
        ? '/api/invitations/my?filter=active'
        : '/api/invitations/my?filter=active&limit=5';
      const res = await api.get<Invitation[]>(url);
      setInvitations(res.data || []);
      setMode(nextMode);
    } catch (err: any) {
      setError(toUserFriendlyError(err));
    } finally {
      setLoading(false);
    }
  }, [mode]);

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
      pushToast({ type: 'error', title: 'Error', message: toUserFriendlyError(err) });
    }
  };

  const handleDecline = async (invitationId: string) => {
    try {
      await api.post(`/api/invitations/${invitationId}/decline`);
      pushToast({ type: 'success', title: 'Invitation Declined', message: 'You have declined the invitation.' });
      fetchInvitations();
    } catch (err: any) {
      pushToast({ type: 'error', title: 'Error', message: toUserFriendlyError(err) });
    }
  };

  const emailHistory = async () => {
    try {
      await api.post('/api/invitations/history-email', {});
      pushToast({ type: 'success', title: 'Email sent', message: 'Invitation history has been emailed to you.' });
    } catch (err: any) {
      pushToast({ type: 'error', title: 'Email failed', message: toUserFriendlyError(err) });
    }
  };

  return (
    <Page data-testid="invitations-page">
      <CardHeader>
        <CardTitle>My Invitations</CardTitle>
        <CardSubtitle>Showing {mode === 'active' ? 'all active invitations' : 'your newest 5 active invitations'}.</CardSubtitle>
      </CardHeader>

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
        {mode !== 'active' ? (
          <Button type="button" $variant="outline" onClick={() => fetchInvitations('active')}>See all active invitations</Button>
        ) : (
          <Button type="button" $variant="outline" onClick={() => fetchInvitations('latest')}>Back to latest 5</Button>
        )}
        <Button type="button" $variant="outline" onClick={emailHistory}>View history (email me)</Button>
      </div>

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
