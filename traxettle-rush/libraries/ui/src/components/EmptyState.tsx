'use client';

import React from 'react';
import styled from 'styled-components';

interface EmptyStateProps {
  title: string;
  description?: string;
  action?: React.ReactNode;
  dataTestId?: string;
}

const Container = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 48px 24px;
  text-align: center;
  gap: 12px;
`;

const Title = styled.h3`
  margin: 0;
  font-size: 18px;
  font-weight: 700;
  color: ${(p) => p.theme.colors.text};
`;

const Description = styled.p`
  margin: 0;
  font-size: 14px;
  color: ${(p) => p.theme.colors.muted};
  max-width: 360px;
`;

const ActionWrapper = styled.div`
  margin-top: 8px;
`;

export function EmptyState({ title, description, action, dataTestId }: EmptyStateProps) {
  return (
    <Container data-testid={dataTestId}>
      <Title>{title}</Title>
      {description && <Description>{description}</Description>}
      {action && <ActionWrapper>{action}</ActionWrapper>}
    </Container>
  );
}
