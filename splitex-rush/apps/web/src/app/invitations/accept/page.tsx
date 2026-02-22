'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import styled from 'styled-components';
import {
  Button,
  Card,
  CardBody,
  Badge,
  useToast,
} from '@splitex/ui';
import { api } from '../../../utils/api';
import { getResolvedApiBaseUrl } from '../../../config/dev-options';
import type { Invitation } from '@splitex/shared';

interface EnrichedInvitation extends Invitation {
  eventName?: string;
  inviterName?: string;
}

const Page = styled.div`
  width: 100%;
  max-width: 520px;
  margin: 0 auto;
  padding: 48px 16px;
`;

const Header = styled.div`
  text-align: center;
  margin-bottom: 32px;
`;

const Logo = styled.div`
  font-size: 28px;
  font-weight: 700;
  color: ${(p) => p.theme.colors.primary};
  letter-spacing: -0.03em;
  margin-bottom: 8px;
`;

const Subtitle = styled.p`
  color: ${(p) => p.theme.colors.muted};
  font-size: 14px;
  margin: 0;
`;

const InviteCard = styled(Card)`
  margin-bottom: 24px;
`;

const InviteBody = styled(CardBody)`
  text-align: center;
  padding: 32px 24px;
`;

const EventName = styled.h2`
  font-size: 22px;
  font-weight: 700;
  margin: 0 0 8px;
  color: ${(p) => p.theme.colors.text};
`;

const InviteDetail = styled.p`
  color: ${(p) => p.theme.colors.muted};
  font-size: 14px;
  line-height: 1.6;
  margin: 0 0 6px;
`;

const MessageBlock = styled.div`
  background: ${(p) => p.theme.colors.background};
  border-left: 4px solid ${(p) => p.theme.colors.primary};
  padding: 12px 16px;
  margin: 16px 0;
  border-radius: 0 8px 8px 0;
  text-align: left;
`;

const MessageText = styled.p`
  margin: 0;
  color: ${(p) => p.theme.colors.muted};
  font-style: italic;
  font-size: 14px;
`;

const Actions = styled.div`
  display: flex;
  gap: 12px;
  justify-content: center;
  margin-top: 24px;
`;

const StatusMessage = styled.div<{ $type?: 'success' | 'error' | 'warning' }>`
  text-align: center;
  padding: 32px 24px;
  color: ${(p) =>
    p.$type === 'success' ? p.theme.colors.success :
    p.$type === 'error' ? p.theme.colors.error :
    p.$type === 'warning' ? p.theme.colors.warning :
    p.theme.colors.muted};
  font-size: 15px;
`;

const LoadingText = styled.div`
  text-align: center;
  padding: 64px;
  color: ${(p) => p.theme.colors.muted};
  font-size: 15px;
`;

const ExpiryText = styled.p`
  color: ${(p) => p.theme.colors.muted};
  font-size: 12px;
  margin: 16px 0 0;
`;

function formatDate(d: any): string {
  if (!d) return '';
  return new Date(d).toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

function statusBadgeVariant(status: string) {
  if (status === 'accepted') return 'success';
  if (status === 'pending') return 'warning';
  if (status === 'declined' || status === 'expired') return 'error';
  return 'default';
}

export default function AcceptInvitationPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get('token');
  const { push: pushToast } = useToast();

  const [invitation, setInvitation] = useState<EnrichedInvitation | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState('');
  const [actionDone, setActionDone] = useState<'accepted' | 'declined' | null>(null);
  const [loggedInEmail, setLoggedInEmail] = useState<string | null>(null);

  // Detect logged-in user's email for identity check
  useEffect(() => {
    async function detectUser() {
      try {
        const { getAuth } = await import('firebase/auth');
        const auth = getAuth();
        if (auth.currentUser?.email) {
          setLoggedInEmail(auth.currentUser.email);
        }
      } catch {
        // Not logged in via Firebase — check localStorage mock token
        const uid = typeof window !== 'undefined' ? localStorage.getItem('splitex.uid') : null;
        if (uid) setLoggedInEmail(uid);
      }
    }
    detectUser();
  }, []);

  const fetchInvitation = useCallback(async () => {
    if (!token) {
      setError('No invitation token provided. Please check the link from your email.');
      setLoading(false);
      return;
    }

    try {
      const apiBase = getResolvedApiBaseUrl();
      const res = await fetch(`${apiBase}/api/invitations/token/${token}`);
      const json = await res.json();

      if (!res.ok || !json.success) {
        if (res.status === 404) {
          setError('This invitation was not found. It may have been revoked or the link is invalid.');
        } else {
          setError(json.error || 'Failed to load invitation.');
        }
        setLoading(false);
        return;
      }

      setInvitation(json.data);
    } catch (err: any) {
      setError('Unable to connect to the server. Please try again later.');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { fetchInvitation(); }, [fetchInvitation]);

  const handleAccept = async () => {
    if (!invitation) return;
    setActionLoading(true);
    try {
      await api.post(`/api/invitations/${invitation.id}/accept`);
      setActionDone('accepted');
      pushToast({ type: 'success', title: 'Invitation Accepted', message: 'You have joined the event!' });
      // Redirect to dashboard where the event will now appear
      setTimeout(() => {
        router.push('/dashboard');
      }, 2000);
    } catch (err: any) {
      if (err.message?.includes('expired')) {
        setError('This invitation has expired.');
      } else if (err.message?.includes('already been')) {
        setError(err.message);
      } else {
        pushToast({ type: 'error', title: 'Error', message: err.message || 'Failed to accept invitation. Please log in first.' });
      }
    } finally {
      setActionLoading(false);
    }
  };

  const handleDecline = async () => {
    if (!invitation) return;
    setActionLoading(true);
    try {
      await api.post(`/api/invitations/${invitation.id}/decline`);
      setActionDone('declined');
      pushToast({ type: 'success', title: 'Invitation Declined', message: 'You have declined the invitation.' });
    } catch (err: any) {
      if (err.message?.includes('already been')) {
        setError(err.message);
      } else {
        pushToast({ type: 'error', title: 'Error', message: err.message || 'Failed to decline invitation. Please log in first.' });
      }
    } finally {
      setActionLoading(false);
    }
  };

  const isExpired = invitation ? new Date(invitation.expiresAt) < new Date() : false;
  const isAlreadyResponded = invitation ? invitation.status !== 'pending' : false;

  if (loading) {
    return (
      <Page data-testid="accept-invitation-page">
        <Header>
          <Logo>Splitex</Logo>
          <Subtitle>Loading invitation...</Subtitle>
        </Header>
        <LoadingText>Please wait...</LoadingText>
      </Page>
    );
  }

  if (error) {
    return (
      <Page data-testid="accept-invitation-page">
        <Header>
          <Logo>Splitex</Logo>
        </Header>
        <InviteCard>
          <StatusMessage $type="error" data-testid="invitation-error">
            {error}
          </StatusMessage>
          <div style={{ textAlign: 'center', paddingBottom: 24 }}>
            <Button $variant="outline" onClick={() => router.push('/login')} data-testid="go-login-btn">
              Go to Login
            </Button>
          </div>
        </InviteCard>
      </Page>
    );
  }

  if (actionDone) {
    return (
      <Page data-testid="accept-invitation-page">
        <Header>
          <Logo>Splitex</Logo>
        </Header>
        <InviteCard>
          <StatusMessage
            $type={actionDone === 'accepted' ? 'success' : 'warning'}
            data-testid="invitation-action-done"
          >
            {actionDone === 'accepted'
              ? `You've joined "${invitation?.eventName || 'the event'}"! Redirecting...`
              : 'You have declined the invitation.'}
          </StatusMessage>
          <div style={{ textAlign: 'center', paddingBottom: 24 }}>
            {actionDone === 'accepted' ? (
              <Button $variant="primary" onClick={() => router.push(`/events/${invitation?.eventId}`)} data-testid="go-event-btn">
                Go to Event
              </Button>
            ) : (
              <Button $variant="outline" onClick={() => router.push('/dashboard')} data-testid="go-dashboard-btn">
                Go to Dashboard
              </Button>
            )}
          </div>
        </InviteCard>
      </Page>
    );
  }

  return (
    <Page data-testid="accept-invitation-page">
      <Header>
        <Logo>Splitex</Logo>
        <Subtitle>You&apos;ve been invited to an event</Subtitle>
      </Header>

      <InviteCard>
        <InviteBody>
          <EventName data-testid="invite-event-name">
            {invitation?.eventName || invitation?.eventId || 'Event'}
          </EventName>

          <InviteDetail data-testid="invite-detail">
            <strong>{invitation?.inviterName || invitation?.invitedBy}</strong> invited you to join as a{' '}
            <Badge $variant="default">{invitation?.role}</Badge>
          </InviteDetail>

          {invitation?.inviteeEmail && (
            <InviteDetail>
              Sent to: {invitation.inviteeEmail}
            </InviteDetail>
          )}

          {invitation?.message && (
            <MessageBlock>
              <MessageText>&ldquo;{invitation.message}&rdquo;</MessageText>
            </MessageBlock>
          )}

          <ExpiryText>
            {isExpired
              ? 'This invitation has expired.'
              : `Expires on ${formatDate(invitation?.expiresAt)}`}
          </ExpiryText>

          {isExpired && (
            <StatusMessage $type="error" data-testid="invitation-expired">
              This invitation has expired and can no longer be accepted.
            </StatusMessage>
          )}

          {isAlreadyResponded && !isExpired && (
            <StatusMessage
              $type={invitation?.status === 'accepted' ? 'success' : 'warning'}
              data-testid="invitation-already-responded"
            >
              This invitation has already been {invitation?.status}.
            </StatusMessage>
          )}

          {!isExpired && !isAlreadyResponded && loggedInEmail && invitation?.inviteeEmail &&
            loggedInEmail !== invitation.inviteeEmail && (
            <StatusMessage $type="warning" data-testid="identity-warning">
              ⚠️ You are signed in as <strong>{loggedInEmail}</strong>, but this invitation was sent to <strong>{invitation.inviteeEmail}</strong>.
              If you accept, it will be linked to your current account.
              <br />
              <Button $variant="ghost" onClick={() => router.push('/login')} style={{ marginTop: 8, fontSize: 13 }}>
                Switch account
              </Button>
            </StatusMessage>
          )}

          {!isExpired && !isAlreadyResponded && (
            <Actions>
              <Button
                $variant="primary"
                onClick={handleAccept}
                disabled={actionLoading}
                data-testid="accept-btn"
              >
                {actionLoading ? 'Accepting...' : 'Accept Invitation'}
              </Button>
              <Button
                $variant="outline"
                onClick={handleDecline}
                disabled={actionLoading}
                data-testid="decline-btn"
              >
                {actionLoading ? '...' : 'Decline'}
              </Button>
            </Actions>
          )}
        </InviteBody>
      </InviteCard>

      <div style={{ textAlign: 'center' }}>
        <Button $variant="ghost" onClick={() => router.push('/login')} data-testid="login-link">
          Sign in to a different account
        </Button>
      </div>
    </Page>
  );
}
