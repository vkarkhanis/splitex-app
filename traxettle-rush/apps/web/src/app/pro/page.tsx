'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import styled from 'styled-components';
import { Badge, Button, Card, CardBody, CardHeader, CardSubtitle, CardTitle } from '@traxettle/ui';
import { getMobileSubscribeLinks } from '../../utils/mobile-subscribe';

const Page = styled.div`
  width: 100%;
  max-width: 920px;
  animation: fadeIn 0.3s ease;
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
  margin-top: 12px;
  border: 1px solid ${(p) => p.theme.colors.border};
  background: ${(p) => p.theme.colors.surfaceHover};
  border-radius: 10px;
  padding: 12px 12px;
  font-size: 13px;
  line-height: 1.6;
`;

const Grid = styled.div`
  display: grid;
  grid-template-columns: repeat(12, 1fr);
  gap: 14px;
`;

const Col = styled.div<{ $span?: number }>`
  grid-column: span ${(p) => p.$span || 12};
  @media (max-width: 920px) {
    grid-column: span 12;
  }
`;

const List = styled.ul`
  margin: 0;
  padding-left: 18px;
  color: ${(p) => p.theme.colors.textSecondary};
  font-size: 13px;
  line-height: 1.65;
`;

export default function ProPage() {
  const router = useRouter();
  const { playStoreUrl, appStoreUrl } = getMobileSubscribeLinks();

  return (
    <Page data-testid="pro-page">
      <Grid>
        <Col $span={7}>
          <Card>
            <CardHeader>
              <CardTitle>Pro</CardTitle>
              <CardSubtitle>Learn how to get Pro (purchased in the mobile app).</CardSubtitle>
            </CardHeader>
            <CardBody>
              <Callout>
                Pro is purchased via Google Play / App Store. This keeps billing secure, avoids duplicate subscriptions, and makes restorations work across devices.
              </Callout>

              <div style={{ height: 14 }} />
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <Badge $variant="warning">Multi-currency settlement</Badge>
                <Badge $variant="warning">Advanced analytics</Badge>
                <Badge $variant="warning">More power-user features</Badge>
              </div>

              <div style={{ height: 14 }} />
              <List>
                <li>Install the Traxettle mobile app</li>
                <li>Sign in with the <strong>same account</strong> you use on web</li>
                <li>Open <strong>Upgrade to Pro</strong> in the mobile app and subscribe</li>
                <li>Come back to the web app (your plan updates automatically)</li>
              </List>

              <Actions>
                <Button type="button" $variant="primary" onClick={() => window.open(playStoreUrl, '_blank', 'noopener,noreferrer')}>
                  Open Google Play
                </Button>
                <Button type="button" $variant="outline" onClick={() => window.open(appStoreUrl, '_blank', 'noopener,noreferrer')}>
                  Open App Store
                </Button>
                <Button type="button" $variant="outline" onClick={() => router.back()}>
                  Back
                </Button>
              </Actions>

              <Note>
                If you already have the app installed, open it and go to the Pro screen to subscribe.
              </Note>
            </CardBody>
          </Card>
        </Col>

        <Col $span={5}>
          <Card>
            <CardHeader>
              <CardTitle>Good to know</CardTitle>
              <CardSubtitle>How web and mobile stay in sync.</CardSubtitle>
            </CardHeader>
            <CardBody>
              <List>
                <li>Pro status is linked to your Traxettle account</li>
                <li>After subscribing, refresh the web page if needed</li>
                <li>If you used a different login method on mobile, Pro won’t match — use the same account</li>
              </List>
              <div style={{ height: 12 }} />
              <Button type="button" $variant="outline" onClick={() => router.push('/help')}>
                Help & Features
              </Button>
            </CardBody>
          </Card>
        </Col>
      </Grid>
    </Page>
  );
}
