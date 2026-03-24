'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import styled from 'styled-components';
import { Badge, Button, Card, CardBody, CardHeader, CardSubtitle, CardTitle, EmptyState, useToast } from '@traxettle/ui';
import { api } from '../../utils/api';
import type { Event as TraxettleEvent } from '@traxettle/shared';
import { toUserFriendlyError } from '../../utils/errorMessages';

const Page = styled.div`
  width: 100%;
  max-width: 960px;
  animation: fadeIn 0.3s ease;
`;

const TopBar = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 18px;
  gap: 12px;
  flex-wrap: wrap;
`;

const PageTitle = styled.h1`
  margin: 0;
  font-size: 24px;
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

const ErrorText = styled.div`
  text-align: center;
  padding: 24px;
  color: ${(p) => p.theme.colors.error};
  font-size: 14px;
`;

function formatDate(d: any): string {
  if (!d) return '';
  const date = new Date(d);
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function ClosedEventsPage() {
  const router = useRouter();
  const { push: pushToast } = useToast();
  const [events, setEvents] = useState<TraxettleEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchClosedEvents = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await api.get<TraxettleEvent[]>('/api/events');
      setEvents((res.data || []).filter((e) => e.status === 'closed'));
    } catch (err: any) {
      setError(toUserFriendlyError(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchClosedEvents();
  }, [fetchClosedEvents]);

  const sorted = useMemo(() => {
    return [...events].sort((a, b) => {
      const at = a.updatedAt ? Date.parse(String(a.updatedAt)) : 0;
      const bt = b.updatedAt ? Date.parse(String(b.updatedAt)) : 0;
      if (at !== bt) return bt - at;
      return (a.name || '').localeCompare(b.name || '');
    }).slice(0, 5);
  }, [events]);

  const emailHistory = async () => {
    try {
      await api.post('/api/events/history-email', {});
      pushToast({ type: 'success', title: 'Email sent', message: 'Closed events from the last 3 months have been emailed to you.' });
    } catch (err: any) {
      pushToast({ type: 'error', title: 'Email failed', message: toUserFriendlyError(err) });
    }
  };

  return (
    <Page data-testid="closed-events-page">
      <TopBar>
        <PageTitle>Closed Events</PageTitle>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <Button type="button" $variant="outline" onClick={emailHistory} disabled={events.length === 0}>Email last 3 months</Button>
          <Button type="button" $variant="outline" onClick={() => router.push('/dashboard')}>Back to Dashboard</Button>
        </div>
      </TopBar>

      {loading ? (
        <div style={{ opacity: 0.75 }}>Loading…</div>
      ) : error ? (
        <>
          <ErrorText>{error}</ErrorText>
          <div style={{ textAlign: 'center' }}>
            <Button $variant="outline" onClick={fetchClosedEvents}>Retry</Button>
          </div>
        </>
      ) : sorted.length === 0 ? (
        <EmptyState
          title="No closed events"
          description="Closed events will show here after an admin closes them."
          dataTestId="empty-closed-events"
          action={<Button $variant="primary" onClick={() => router.push('/dashboard')}>Go to Dashboard</Button>}
        />
      ) : (
        <EventGrid data-testid="closed-events-grid">
          {sorted.map((event) => (
            <EventCard
              key={event.id}
              onClick={() => router.push(`/events/${event.id}`)}
              data-testid={`closed-event-card-${event.id}`}
            >
              <CardHeader>
                <CardTitle style={{ fontSize: 18 }}>{event.name}</CardTitle>
                {event.description && <CardSubtitle>{event.description}</CardSubtitle>}
              </CardHeader>
              <CardBody>
                <EventMeta>
                  <Badge $variant="error">closed</Badge>
                  <MetaItem>{event.type}</MetaItem>
                  <MetaItem>{event.currency}</MetaItem>
                  <MetaItem>{formatDate(event.startDate)}{event.endDate ? ` – ${formatDate(event.endDate)}` : ''}</MetaItem>
                </EventMeta>
              </CardBody>
            </EventCard>
          ))}
        </EventGrid>
      )}
    </Page>
  );
}
