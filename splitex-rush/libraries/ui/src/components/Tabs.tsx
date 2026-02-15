'use client';

import styled from 'styled-components';

export const TabList = styled.div`
  display: flex;
  border-bottom: 1px solid ${(p) => p.theme.colors.border};
  margin-bottom: 18px;
  gap: 0;
`;

export const Tab = styled.button<{ $active?: boolean }>`
  flex: 1;
  padding: 10px 16px;
  border: none;
  background: ${(p) => (p.$active ? p.theme.colors.infoBg : 'none')};
  cursor: pointer;
  font-size: 14px;
  font-weight: 600;
  font-family: inherit;
  color: ${(p) => (p.$active ? p.theme.colors.primary : p.theme.colors.muted)};
  border-bottom: 2px solid ${(p) => (p.$active ? p.theme.colors.primary : 'transparent')};
  transition: color 0.15s, border-color 0.15s, background 0.15s;

  &:hover {
    color: ${(p) => p.theme.colors.text};
    background: ${(p) => p.theme.colors.surfaceHover};
  }
`;

export const TabPanel = styled.div`
  display: flex;
  flex-direction: column;
  gap: 14px;
`;
