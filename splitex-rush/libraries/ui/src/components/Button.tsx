'use client';

import styled, { css } from 'styled-components';

export type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'ghost';

export const Button = styled.button<{ $variant?: ButtonVariant; $fullWidth?: boolean }>`
  appearance: none;
  border: 0;
  cursor: pointer;
  border-radius: 12px;
  padding: 12px 14px;
  font-size: 14px;
  font-weight: 600;
  transition: transform 0.05s ease, opacity 0.2s ease;
  width: ${(p) => (p.$fullWidth ? '100%' : 'auto')};

  &:active {
    transform: translateY(1px);
  }

  &:disabled {
    opacity: 0.55;
    cursor: not-allowed;
  }

  ${(p) => {
    const v = p.$variant ?? 'primary';
    if (v === 'primary') {
      return css`
        color: #fff;
        background: linear-gradient(90deg, ${p.theme.colors.primary}, ${p.theme.colors.secondary});
      `;
    }

    if (v === 'secondary') {
      return css`
        color: ${p.theme.colors.text};
        background: ${p.theme.colors.surface};
        border: 1px solid ${p.theme.colors.border};
      `;
    }

    if (v === 'outline') {
      return css`
        color: ${p.theme.colors.primary};
        background: transparent;
        border: 1px solid ${p.theme.colors.primary};
      `;
    }

    return css`
      color: ${p.theme.colors.text};
      background: transparent;
    `;
  }}
`;
