'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import styled from 'styled-components';
import { Button, Card, CardBody, CardHeader, CardSubtitle, CardTitle, Badge } from '@traxettle/ui';

const HELP_URL = 'https://www.karkhanislabs.com/traxettle';

const Page = styled.div`
  width: 100%;
  max-width: 920px;
  animation: fadeIn 0.3s ease;
`;

const HeaderRow = styled.div`
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
  margin-bottom: 14px;
`;

const Title = styled.h1`
  margin: 0;
  font-size: 26px;
  font-weight: 900;
  letter-spacing: -0.03em;
  color: ${(p) => p.theme.colors.text};
`;

const Subtitle = styled.p`
  margin: 6px 0 0;
  color: ${(p) => p.theme.colors.muted};
  font-size: 14px;
  line-height: 1.55;
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
  line-height: 1.6;
`;

const Tip = styled.div`
  padding: 12px 14px;
  border-radius: ${(p) => p.theme.radii.lg};
  border: 1px solid ${(p) => p.theme.colors.border};
  background: ${(p) => p.theme.colors.surfaceHover};
  color: ${(p) => p.theme.colors.textSecondary};
  font-size: 13px;
  line-height: 1.6;
`;

export default function HelpPage() {
  const router = useRouter();

  return (
    <Page data-testid="help-page">
      <HeaderRow>
        <div>
          <Title>Help & Features</Title>
          <Subtitle>
            Quick guidance inside the app, plus a single place to read the full docs.
          </Subtitle>
        </div>
        <Button
          type="button"
          $variant="primary"
          onClick={() => window.open(HELP_URL, '_blank', 'noopener,noreferrer')}
          data-testid="help-open-website"
        >
          Open Help Website
        </Button>
      </HeaderRow>

      <Grid>
        <Col $span={7}>
          <Card>
            <CardHeader>
              <CardTitle>What you can do in Traxettle</CardTitle>
              <CardSubtitle>Core features that work for everyone.</CardSubtitle>
            </CardHeader>
            <CardBody>
              <List>
                <li>Create events and add shared + private expenses</li>
                <li>Split by equal, ratio, or custom amounts</li>
                <li>Generate a settlement plan and approve it together</li>
                <li>Track payments with proof uploads (optional)</li>
                <li>Close events when everything is completed</li>
              </List>
              <div style={{ height: 12 }} />
              <Tip>
                Tip: If you ever see <strong>“Expenses have changed”</strong> during settlement review, regenerate the settlement before continuing approvals.
              </Tip>
            </CardBody>
          </Card>
        </Col>

        <Col $span={5}>
          <Card>
            <CardHeader>
              <CardTitle>Pro features</CardTitle>
              <CardSubtitle>Unlock advanced capabilities in the mobile app.</CardSubtitle>
            </CardHeader>
            <CardBody>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
                <Badge $variant="warning">Multi-currency settlement</Badge>
                <Badge $variant="warning">Advanced analytics</Badge>
                <Badge $variant="warning">More power-user features</Badge>
              </div>
              <List>
                <li>Pro is purchased in the mobile app (Play Store / App Store)</li>
                <li>Sign in with the same account on web and mobile</li>
              </List>
              <div style={{ height: 12 }} />
              <Button type="button" $variant="outline" onClick={() => router.push('/pro')} data-testid="help-go-pro">
                Learn how to get Pro
              </Button>
            </CardBody>
          </Card>

          <div style={{ height: 14 }} />

          <Card>
            <CardHeader>
              <CardTitle>Analytics</CardTitle>
              <CardSubtitle>Coming soon</CardSubtitle>
            </CardHeader>
            <CardBody>
              <Tip>
                We’re revisiting analytics in a future major release to make it more accurate, more useful, and easier to understand.
              </Tip>
            </CardBody>
          </Card>
        </Col>
      </Grid>
    </Page>
  );
}
