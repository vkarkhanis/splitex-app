'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import styled from 'styled-components';
import { Button } from '@splitex/ui';

export default function Home() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  useEffect(() => {
    const check = () => setIsAuthenticated(Boolean(window.localStorage.getItem('splitex.authToken')));
    check();
    window.addEventListener('splitex:authChange', check);
    window.addEventListener('storage', check);
    return () => {
      window.removeEventListener('splitex:authChange', check);
      window.removeEventListener('storage', check);
    };
  }, []);

  return (
    <Container>
      <Hero>
        <HeroTitle>
          Split expenses,<br />
          <GradientText>not friendships.</GradientText>
        </HeroTitle>
        <HeroSubtitle>
          Create events, invite friends, track expenses with flexible splitting, manage groups, and settle up — all in one place.
        </HeroSubtitle>
        <Actions>
          {isAuthenticated ? (
            <>
              <Link href="/dashboard">
                <Button $variant="primary" $size="lg" $fullWidth>
                  Go to Dashboard
                </Button>
              </Link>
              <Link href="/events/create">
                <Button $variant="outline" $size="lg" $fullWidth>
                  Create Event
                </Button>
              </Link>
            </>
          ) : (
            <>
              <Link href="/auth/register">
                <Button $variant="primary" $size="lg" $fullWidth>
                  Get Started Free
                </Button>
              </Link>
              <Link href="/auth/login">
                <Button $variant="outline" $size="lg" $fullWidth>
                  Sign In
                </Button>
              </Link>
            </>
          )}
        </Actions>
      </Hero>

      <FeaturesGrid>
        <FeatureCard>
          <FeatureIcon>&#9889;</FeatureIcon>
          <FeatureTitle>Flexible Splitting</FeatureTitle>
          <FeatureDesc>Equal, ratio, or custom splits. Groups as single entities. Private expenses supported.</FeatureDesc>
        </FeatureCard>
        <FeatureCard>
          <FeatureIcon>&#128101;</FeatureIcon>
          <FeatureTitle>Group Management</FeatureTitle>
          <FeatureDesc>Create reusable groups, assign representatives, and split expenses at the group level.</FeatureDesc>
        </FeatureCard>
        <FeatureCard>
          <FeatureIcon>&#128176;</FeatureIcon>
          <FeatureTitle>Smart Settlements</FeatureTitle>
          <FeatureDesc>Greedy algorithm minimizes transactions. See who owes whom and settle with one click.</FeatureDesc>
        </FeatureCard>
        <FeatureCard>
          <FeatureIcon>&#9889;</FeatureIcon>
          <FeatureTitle>Real-time Updates</FeatureTitle>
          <FeatureDesc>WebSocket-powered live updates. See changes instantly when others add expenses.</FeatureDesc>
        </FeatureCard>
      </FeaturesGrid>
    </Container>
  );
}

const Container = styled.div`
  width: 100%;
  max-width: 860px;
  animation: fadeIn 0.4s ease;
`;

const Hero = styled.div`
  text-align: center;
  padding: 40px 0 48px;
`;

const HeroTitle = styled.h1`
  font-size: 48px;
  font-weight: 800;
  letter-spacing: -0.04em;
  line-height: 1.15;
  margin: 0 0 16px;
  color: ${(p) => p.theme.colors.text};

  @media (max-width: 640px) {
    font-size: 32px;
  }
`;

const GradientText = styled.span`
  background: linear-gradient(135deg, ${(p) => p.theme.colors.primary}, ${(p) => p.theme.colors.secondary}, ${(p) => p.theme.colors.accent});
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
`;

const HeroSubtitle = styled.p`
  font-size: 18px;
  color: ${(p) => p.theme.colors.muted};
  max-width: 560px;
  margin: 0 auto 32px;
  line-height: 1.6;

  @media (max-width: 640px) {
    font-size: 15px;
  }
`;

const Actions = styled.div`
  display: flex;
  gap: 12px;
  justify-content: center;
  flex-wrap: wrap;

  a {
    min-width: 180px;
  }
`;

const FeaturesGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 16px;
  margin-top: 16px;

  @media (max-width: 640px) {
    grid-template-columns: 1fr;
  }
`;

const FeatureCard = styled.div`
  padding: 24px;
  border-radius: ${(p) => p.theme.radii.lg};
  border: 1px solid ${(p) => p.theme.colors.border};
  background: ${(p) => p.theme.colors.surface};
  transition: all 0.2s ease;

  &:hover {
    border-color: ${(p) => p.theme.colors.borderHover};
    box-shadow: ${(p) => p.theme.shadows.md};
    transform: translateY(-2px);
  }
`;

const FeatureIcon = styled.div`
  font-size: 28px;
  margin-bottom: 12px;
  line-height: 1;
`;

const FeatureTitle = styled.h3`
  margin: 0 0 6px;
  font-size: 16px;
  font-weight: 700;
  color: ${(p) => p.theme.colors.text};
`;

const FeatureDesc = styled.p`
  margin: 0;
  font-size: 13px;
  color: ${(p) => p.theme.colors.muted};
  line-height: 1.5;
`;
