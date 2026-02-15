'use client';

import styled from 'styled-components';

export const Card = styled.div`
  border-radius: ${(p) => p.theme.radii.lg};
  border: 1px solid ${(p) => p.theme.colors.border};
  background: ${(p) => p.theme.colors.surface};
  color: ${(p) => p.theme.colors.text};
  box-shadow: ${(p) => p.theme.shadows.lg};
  padding: 24px;
  animation: fadeIn 0.3s ease;
  transition: border-color 0.2s ease, box-shadow 0.2s ease;
`;

export const CardHeader = styled.div`
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-bottom: 20px;
`;

export const CardTitle = styled.h1`
  margin: 0;
  font-size: 24px;
  font-weight: 700;
  letter-spacing: -0.025em;
  line-height: 1.3;
`;

export const CardSubtitle = styled.p`
  margin: 0;
  font-size: 14px;
  color: ${(p) => p.theme.colors.muted};
  line-height: 1.5;
`;

export const CardBody = styled.div`
  display: flex;
  flex-direction: column;
  gap: 16px;
`;
