'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
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
} from '@splitex/ui';
import { api } from '../../utils/api';
import { useMultiEventSocket } from '../../hooks/useSocket';
import type { Event as SplitexEvent } from '@splitex/shared';

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

  const [events, setEvents] = useState<SplitexEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchEvents = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await api.get<SplitexEvent[]>('/api/events');
      // Hide closed events from the dashboard
      setEvents((res.data || []).filter(e => e.status !== 'closed'));
    } catch (err: any) {
      setError(err.message || 'Failed to load events');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchEvents();
  }, [fetchEvents]);

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

  return (
    <Page data-testid="dashboard-page">
      <TopBar>
        <PageTitle>My Events</PageTitle>
        <Link href="/events/create">
          <Button $variant="primary" data-testid="create-event-btn">
            + New Event
          </Button>
        </Link>
      </TopBar>

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
            <Button $variant="outline" onClick={fetchEvents}>Retry</Button>
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
  );
}
