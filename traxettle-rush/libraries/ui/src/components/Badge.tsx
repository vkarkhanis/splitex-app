'use client';

import styled, { css } from 'styled-components';

export type BadgeVariant = 'default' | 'success' | 'warning' | 'error' | 'info';

export const Badge = styled.span<{ $variant?: BadgeVariant }>`
  display: inline-flex;
  align-items: center;
  padding: 4px 10px;
  border-radius: ${(p) => p.theme.radii.full};
  font-size: 12px;
  font-weight: 600;
  line-height: 1;
  white-space: nowrap;
  letter-spacing: 0.01em;

  ${(p) => {
    const v = p.$variant ?? 'default';
    if (v === 'success') {
      return css`
        background: ${p.theme.colors.successBg};
        color: ${p.theme.colors.success};
      `;
    }
    if (v === 'warning') {
      return css`
        background: ${p.theme.colors.warningBg};
        color: ${p.theme.colors.warning};
      `;
    }
    if (v === 'error') {
      return css`
        background: ${p.theme.colors.errorBg};
        color: ${p.theme.colors.error};
      `;
    }
    if (v === 'info') {
      return css`
        background: ${p.theme.colors.infoBg};
        color: ${p.theme.colors.info};
      `;
    }
    return css`
      background: ${p.theme.colors.surfaceHover};
      color: ${p.theme.colors.muted};
    `;
  }}
`;
