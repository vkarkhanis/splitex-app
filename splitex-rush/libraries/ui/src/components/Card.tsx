'use client';

import styled from 'styled-components';

export const Card = styled.div`
  border-radius: 16px;
  border: 1px solid ${(p) => p.theme.colors.border};
  background: ${(p) => p.theme.colors.surface};
  color: ${(p) => p.theme.colors.text};
  box-shadow: 0 26px 80px rgba(0,0,0,0.22);
  padding: 22px;
`;

export const CardHeader = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 18px;
`;

export const CardTitle = styled.h1`
  margin: 0;
  font-size: 26px;
  letter-spacing: -0.02em;
`;

export const CardSubtitle = styled.p`
  margin: 0;
  font-size: 14px;
  color: ${(p) => p.theme.colors.muted};
`;

export const CardBody = styled.div`
  display: flex;
  flex-direction: column;
  gap: 14px;
`;
