'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
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
import { useMultiEventSocket } from '../../hooks/useSocket';
import type { Event as TraxettleEvent } from '@traxettle/shared';
import GuidedTour from '../../components/GuidedTour';
import { hasCompletedWebTour, markWebTourCompleted } from '../../services/onboarding';

const Page = styled.div`
  width: 100%;
  max-width: 960px;
  animation: fadeIn 0.3s ease;
`;

const TopBar = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 28px;
  gap: 16px;
  flex-wrap: wrap;
`;

const PageTitle = styled.h1`
  margin: 0;
  font-size: 28px;
  font-weight: 800;
  letter-spacing: -0.03em;
  color: ${(p) => p.theme.colors.text};
`;

const EventGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 16px;
`;

const EventCard = styled(Card)`
  cursor: pointer;
  transition: all 0.2s ease;

  &:hover {
    transform: translateY(-3px);
    box-shadow: ${(p) => p.theme.shadows.xl};
    border-color: ${(p) => p.theme.colors.borderHover};
  }
`;

const EventMeta = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  margin-top: 10px;
`;

const MetaItem = styled.span`
  font-size: 12px;
  color: ${(p) => p.theme.colors.muted};
  display: flex;
  align-items: center;
  gap: 4px;
`;

const SkeletonGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 16px;
`;

const SkeletonCard = styled.div`
  border-radius: ${(p) => p.theme.radii.lg};
  border: 1px solid ${(p) => p.theme.colors.border};
  background: ${(p) => p.theme.colors.surface};
  padding: 24px;
  animation: pulse 1.5s ease-in-out infinite;
`;

const SkeletonLine = styled.div<{ $width?: string; $height?: string }>`
  width: ${(p) => p.$width || '100%'};
  height: ${(p) => p.$height || '14px'};
  border-radius: 6px;
  background: ${(p) => p.theme.colors.surfaceHover};
  margin-bottom: 10px;
`;

const ErrorText = styled.div`
  text-align: center;
  padding: 24px;
  color: ${(p) => p.theme.colors.error};
  font-size: 14px;
`;

function statusBadgeVariant(status: string) {
  if (status === 'active') return 'success';
  if (status === 'payment') return 'info';
  if (status === 'settled') return 'warning';
  return 'default';
}

function formatDate(d: any): string {
  if (!d) return '';
  const date = new Date(d);
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function DashboardPage() {
  const { push: pushToast } = useToast();
  const router = useRouter();
  const searchParams = useSearchParams();

  const [events, setEvents] = useState<TraxettleEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [unsettledSummary, setUnsettledSummary] = useState<{ pendingCount: number; eventCount: number } | null>(null);
  const [mode, setMode] = useState<'latest' | 'active'>('latest');
  const [tourVisible, setTourVisible] = useState(false);
  const [tourStep, setTourStep] = useState(0);

  const fetchEvents = useCallback(async (nextMode: 'latest' | 'active' = mode) => {
    setLoading(true);
    setError('');
    try {
      const url = nextMode === 'active'
        ? '/api/events?filter=active'
        : '/api/events?filter=active&limit=5';
      const res = await api.get<TraxettleEvent[]>(url);
      setEvents(res.data || []);
      setMode(nextMode);
    } catch (err: any) {
      setError(err.message || 'Failed to load events');
    } finally {
      setLoading(false);
    }
  }, [mode]);

  useEffect(() => {
    fetchEvents();
  }, [fetchEvents]);

  useEffect(() => {
    const shouldReplay = searchParams.get('tour') === '1';
    if (shouldReplay || !hasCompletedWebTour()) {
      setTourStep(0);
      setTourVisible(true);
    }
  }, [searchParams]);

  useEffect(() => {
    let cancelled = false;
    api.get<{ pendingCount: number; eventCount: number }>('/api/settlements/unsettled-payments/summary')
      .then((res) => {
        if (cancelled) return;
        setUnsettledSummary(res.data || { pendingCount: 0, eventCount: 0 });
      })
      .catch(() => {
        // best-effort: don't block dashboard
      });
    return () => { cancelled = true; };
  }, []);

  // Subscribe to real-time updates for all visible events
  const eventIds = useMemo(() => events.map(e => e.id), [events]);
  useMultiEventSocket(eventIds, useCallback((type: string, payload: any) => {
    if (type === 'event:updated') {
      const eid = payload?.eventId;
      const newStatus = payload?.event?.status || payload?.status;
      if (eid && newStatus) {
        if (newStatus === 'closed') {
          // Remove closed events from dashboard
          setEvents(prev => prev.filter(e => e.id !== eid));
        } else {
          // Update event status in-place
          setEvents(prev => prev.map(e => e.id === eid ? { ...e, status: newStatus } : e));
        }
      }
    }
    if (type === 'event:deleted') {
      const eid = payload?.eventId;
      if (eid) {
        setEvents(prev => prev.filter(e => e.id !== eid));
      }
    }
  }, []));

  const emailHistory = async () => {
    try {
      await api.post('/api/events/history-email', {});
      pushToast({ type: 'success', title: 'Email sent', message: 'Your closed event history has been emailed to you.' });
    } catch (err: any) {
      pushToast({ type: 'error', title: 'Email failed', message: err.message || 'Unable to email event history.' });
    }
  };

  const finishTour = () => {
    markWebTourCompleted();
    setTourVisible(false);
    setTourStep(0);
    if (searchParams.get('tour') === '1') {
      router.replace('/dashboard');
    }
  };

  return (
    <>
    <Page data-testid="dashboard-page">
      <TopBar>
        <PageTitle>My Events</PageTitle>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {mode !== 'active' ? (
            <Button type="button" $variant="outline" onClick={() => fetchEvents('active')}>See all active events</Button>
          ) : (
            <Button type="button" $variant="outline" onClick={() => fetchEvents('latest')}>Back to latest 5</Button>
          )}
          <Button type="button" $variant="outline" onClick={emailHistory}>View history (email me)</Button>
          <Link href="/events/create">
            <Button $variant="primary" data-testid="create-event-btn">
              + New Event
            </Button>
          </Link>
        </div>
      </TopBar>

      {!!unsettledSummary?.pendingCount && unsettledSummary.pendingCount > 0 && (
        <Card style={{ marginBottom: 16 }} data-testid="unsettled-payments-card">
          <CardHeader>
            <CardTitle>Unsettled Payments</CardTitle>
            <CardSubtitle>
              You have {unsettledSummary.pendingCount} pending payment(s) across {unsettledSummary.eventCount} event(s).
            </CardSubtitle>
          </CardHeader>
          <CardBody>
            <Button $variant="primary" onClick={() => router.push('/unsettled-payments')}>
              View Unsettled Payments
            </Button>
            <Button
              $variant="outline"
              style={{ marginLeft: 10 }}
              onClick={() => pushToast({ type: 'info', title: 'Unsettled payments', message: 'These are payments owed to you that have not been initiated by the payer yet.' })}
            >
              What is this?
            </Button>
          </CardBody>
        </Card>
      )}

      {loading ? (
        <SkeletonGrid>
          {[1, 2, 3].map((i) => (
            <SkeletonCard key={i}>
              <SkeletonLine $width="60%" $height="20px" />
              <SkeletonLine $width="90%" />
              <SkeletonLine $width="40%" />
            </SkeletonCard>
          ))}
        </SkeletonGrid>
      ) : error ? (
        <>
          <ErrorText>{error}</ErrorText>
          <div style={{ textAlign: 'center' }}>
            <Button $variant="outline" onClick={() => fetchEvents()}>Retry</Button>
          </div>
        </>
      ) : events.length === 0 ? (
        <EmptyState
          title="No events yet"
          description="Create your first event to start splitting expenses with friends."
          dataTestId="empty-events"
          action={
            <Link href="/events/create">
              <Button $variant="primary">Create Event</Button>
            </Link>
          }
        />
      ) : (
        <EventGrid data-testid="events-grid">
          {events.map((event) => (
            <EventCard
              key={event.id}
              onClick={() => router.push(`/events/${event.id}`)}
              data-testid={`event-card-${event.id}`}
            >
              <CardBody>
                <CardTitle style={{ fontSize: 18 }}>{event.name}</CardTitle>
                {event.description && (
                  <CardSubtitle>{event.description}</CardSubtitle>
                )}
                <EventMeta>
                  <Badge $variant={statusBadgeVariant(event.status)} data-testid={`event-status-${event.id}`}>
                    {event.status}
                  </Badge>
                  <Badge $variant="default">{event.type}</Badge>
                  <MetaItem>{event.currency}</MetaItem>
                  {event.startDate && <MetaItem>{formatDate(event.startDate)}</MetaItem>}
                </EventMeta>
              </CardBody>
            </EventCard>
          ))}
        </EventGrid>
      )}
    </Page>
    <GuidedTour
      open={tourVisible}
      step={tourStep}
      onStepChange={setTourStep}
      onSkip={finishTour}
      onComplete={finishTour}
      steps={[
        {
          title: 'Welcome to your expense hub',
          body: 'Traxettle keeps your active events, incoming invites, and settlement follow-ups in one calm workspace. This short tour will orient you to the few controls you will use most often.',
        },
        {
          title: 'Start with a new event',
          body: 'Create a trip, household, outing, or any shared spend from here. Once the event is live, you can add expenses, invite people, and manage settlements without jumping across the app.',
          selector: '[data-testid="create-event-btn"]',
          label: 'Create event',
        },
        {
          title: 'Stay on top of incoming invites',
          body: 'Your newest invitations stay easy to find so you can accept or decline quickly and keep shared plans moving without missing a request.',
          selector: '[data-testid="nav-invitations"]',
          label: 'Invitations',
        },
        {
          title: 'Profile is your control center',
          body: 'Use the profile menu for account settings, closed events, unsettled payments, and help. You can replay this walkthrough from Profile any time you want a refresher.',
          selector: '[data-testid="profile-menu-button"]',
          label: 'Profile menu',
        },
      ]}
    />
    </>
  );
}
