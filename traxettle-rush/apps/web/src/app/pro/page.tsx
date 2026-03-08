'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import styled from 'styled-components';
import { Button, Card, CardBody, CardHeader, CardSubtitle, CardTitle, useToast } from '@traxettle/ui';
import { getMobileSubscribeLinks, openMobileAppOrStore } from '../../utils/mobile-subscribe';

const Page = styled.div`
  width: 100%;
  max-width: 720px;
`;

const Actions = styled.div`
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
  margin-top: 12px;
`;

const Note = styled.div`
  margin-top: 10px;
  font-size: 12px;
  color: ${(p) => p.theme.colors.muted};
  line-height: 1.55;
`;

const Callout = styled.div`
  margin-top: 14px;
  border: 1px solid ${(p) => p.theme.colors.border};
  background: ${(p) => p.theme.colors.surfaceAlt};
  border-radius: 10px;
  padding: 12px 12px;
  font-size: 13px;
  line-height: 1.6;
`;

export default function ProPage() {
  const router = useRouter();
  const { pushToast } = useToast();
  const { playStoreUrl, appStoreUrl } = getMobileSubscribeLinks();

  return (
    <Page data-testid="pro-page">
      <Card>
        <CardHeader>
          <CardTitle>Upgrade to Pro</CardTitle>
          <CardSubtitle>Subscriptions are purchased in the mobile app.</CardSubtitle>
        </CardHeader>
        <CardBody>
          <Callout>
            Traxettle Pro is purchased via Google Play / App Store. This keeps billing secure, avoids duplicate subscriptions,
            and makes restorations work reliably across devices.
          </Callout>

          <Actions>
            <Button
              type="button"
              $variant="primary"
              onClick={() => {
                pushToast({ type: 'info', title: 'Opening mobile app…', message: 'If the app is not installed, we will open the store.' });
                openMobileAppOrStore({ path: 'pro' });
              }}
            >
              Open Mobile App
            </Button>
            <Button type="button" $variant="outline" onClick={() => window.open(playStoreUrl, '_blank', 'noopener,noreferrer')}>
              Google Play
            </Button>
            <Button type="button" $variant="outline" onClick={() => window.open(appStoreUrl, '_blank', 'noopener,noreferrer')}>
              App Store
            </Button>
            <Button type="button" $variant="outline" onClick={() => router.back()}>
              Back
            </Button>
          </Actions>

          <Note>
            If you don’t have the app installed: the store link will open. If you already have the app installed: “Open Mobile App”
            should switch you to Traxettle and take you to the Pro screen (best-effort, depends on browser).
          </Note>
        </CardBody>
      </Card>
    </Page>
  );
}

