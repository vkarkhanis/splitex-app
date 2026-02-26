'use client';

import styled, { css } from 'styled-components';

export type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger';

export const Button = styled.button<{ $variant?: ButtonVariant; $fullWidth?: boolean; $size?: 'sm' | 'md' | 'lg' }>`
  appearance: none;
  border: 0;
  cursor: pointer;
  border-radius: ${(p) => p.theme.radii.md};
  font-weight: 600;
  font-family: inherit;
  transition: all 0.2s ease;
  width: ${(p) => (p.$fullWidth ? '100%' : 'auto')};
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  white-space: nowrap;

  ${(p) => {
    const s = p.$size ?? 'md';
    if (s === 'sm') return css`padding: 8px 12px; font-size: 13px;`;
    if (s === 'lg') return css`padding: 14px 24px; font-size: 16px;`;
    return css`padding: 11px 18px; font-size: 14px;`;
  }}

  &:active:not(:disabled) {
    transform: translateY(1px);
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
    pointer-events: none;
  }

  ${(p) => {
    const v = p.$variant ?? 'primary';
    if (v === 'primary') {
      return css`
        color: #fff;
        background: linear-gradient(135deg, ${p.theme.colors.primary}, ${p.theme.colors.secondary});
        box-shadow: ${p.theme.shadows.sm};

        &:hover:not(:disabled) {
          box-shadow: ${p.theme.shadows.glow};
          filter: brightness(1.1);
        }
      `;
    }

    if (v === 'secondary') {
      return css`
        color: ${p.theme.colors.text};
        background: ${p.theme.colors.surface};
        border: 1px solid ${p.theme.colors.border};

        &:hover:not(:disabled) {
          background: ${p.theme.colors.surfaceHover};
          border-color: ${p.theme.colors.borderHover};
        }
      `;
    }

    if (v === 'outline') {
      return css`
        color: ${p.theme.colors.primary};
        background: transparent;
        border: 1px solid ${p.theme.colors.primary};

        &:hover:not(:disabled) {
          background: ${p.theme.colors.infoBg};
        }
      `;
    }

    if (v === 'danger') {
      return css`
        color: #fff;
        background: ${p.theme.colors.error};

        &:hover:not(:disabled) {
          filter: brightness(1.1);
          box-shadow: 0 0 16px rgba(239,68,68,0.3);
        }
      `;
    }

    return css`
      color: ${p.theme.colors.text};
      background: transparent;

      &:hover:not(:disabled) {
        background: ${p.theme.colors.surfaceHover};
      }
    `;
  }}
`;
