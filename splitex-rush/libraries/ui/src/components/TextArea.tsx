'use client';

import styled from 'styled-components';

export const TextArea = styled.textarea<{ $hasError?: boolean }>`
  border-radius: ${(p) => p.theme.radii.md};
  padding: 11px 14px;
  font-size: 14px;
  font-family: inherit;
  border: 1px solid ${(p) => (p.$hasError ? p.theme.colors.error : p.theme.colors.border)};
  background: ${(p) => (p.$hasError ? p.theme.colors.errorBg : p.theme.colors.surface)};
  color: ${(p) => p.theme.colors.text};
  outline: none;
  resize: vertical;
  min-height: 80px;
  transition: border-color 0.2s ease, box-shadow 0.2s ease;

  &::placeholder {
    color: ${(p) => p.theme.colors.muted};
    opacity: 0.6;
  }

  &:hover:not(:focus):not(:disabled) {
    border-color: ${(p) => p.theme.colors.borderHover};
  }

  &:focus {
    border-color: ${(p) => p.theme.colors.primary};
    box-shadow: 0 0 0 3px ${(p) => p.theme.colors.infoBg};
  }

  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
`;
