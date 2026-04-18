'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import styled from 'styled-components';
import { Button, Card, CardBody, CardHeader, CardSubtitle, CardTitle } from '@traxettle/ui';
import { getMobileSubscribeLinks } from '../../../../utils/mobile-subscribe';

const DEFAULT_MOBILE_SCHEME = 'com.traxettle.app';

const Page = styled.div`
  width: 100%;
  max-width: 760px;
  animation: fadeIn 0.3s ease;
`;

const Actions = styled.div`
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
  margin-top: 12px;
`;

const Hint = styled.div`
  font-size: 12px;
  color: ${(p) => p.theme.colors.muted};
  line-height: 1.6;
`;

function getFriendlyWebUrl(origin: string): string {
  const o = String(origin || '');
  if (o.includes('traxettle-staging')) return 'https://traxettle-staging.web.app';
  if (o.includes('traxettle-production')) return 'https://traxettle-production.web.app';
  return o || '—';
}

export default function OpenEventPage() {
  const params = useParams();
  const eventId = params.eventId as string;
  const { playStoreUrl, appStoreUrl } = getMobileSubscribeLinks();

  const deepLink = useMemo(() => `${DEFAULT_MOBILE_SCHEME}://events/${eventId}`, [eventId]);
  const webEventUrl = useMemo(() => `/events/${eventId}`, [eventId]);
  const [showFallback, setShowFallback] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const t = window.setTimeout(() => {
      if (cancelled) return;
      // If the app didn't open, show install instructions.
      if (!document.hidden) setShowFallback(true);
    }, 1200);
    try {
      window.location.href = deepLink;
    } catch {
      setShowFallback(true);
    }
    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, [deepLink]);

  return (
    <Page data-testid="open-event-page">
      <Card>
        <CardHeader>
          <CardTitle>Opening Traxettle…</CardTitle>
          <CardSubtitle>
            If Traxettle is installed on your phone, it should open automatically.
          </CardSubtitle>
        </CardHeader>
        <CardBody>
          {showFallback ? (
            <>
              <Hint>
                We couldn’t open the app automatically. Install Traxettle, then try again.
              </Hint>
              <Actions>
                <Button type="button" $variant="primary" onClick={() => (window.location.href = deepLink)}>
                  Try opening again
                </Button>
                <Button type="button" $variant="outline" onClick={() => window.open(playStoreUrl, '_blank', 'noopener,noreferrer')}>
                  Install (Android)
                </Button>
                <Button type="button" $variant="outline" onClick={() => window.open(appStoreUrl, '_blank', 'noopener,noreferrer')}>
                  Install (iOS)
                </Button>
                <Button type="button" $variant="outline" onClick={() => (window.location.href = webEventUrl)}>
                  Continue on Web
                </Button>
              </Actions>
              <div style={{ height: 12 }} />
              <Hint>
                Web link: <strong>{getFriendlyWebUrl(window.location.origin)}</strong>
              </Hint>
            </>
          ) : (
            <Hint>
              If nothing happens, please wait a second and then use the buttons below.
              <div style={{ height: 10 }} />
              <Actions>
                <Button type="button" $variant="outline" onClick={() => setShowFallback(true)}>
                  Show options
                </Button>
                <Button type="button" $variant="outline" onClick={() => (window.location.href = webEventUrl)}>
                  Continue on Web
                </Button>
              </Actions>
            </Hint>
          )}
        </CardBody>
      </Card>
    </Page>
  );
}

