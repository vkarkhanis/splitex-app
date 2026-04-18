'use client';

import styled from 'styled-components';

export const Select = styled.select<{ $hasError?: boolean }>`
  border-radius: ${(p) => p.theme.radii.md};
  padding: 11px 14px;
  font-size: 14px;
  font-family: inherit;
  border: 1px solid ${(p) => (p.$hasError ? p.theme.colors.error : p.theme.colors.border)};
  background: ${(p) => (p.$hasError ? p.theme.colors.errorBg : p.theme.colors.surface)};
  color: ${(p) => p.theme.colors.text};
  outline: none;
  appearance: none;
  cursor: pointer;
  transition: border-color 0.2s ease, box-shadow 0.2s ease;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%23666' d='M6 8L1 3h10z'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 12px center;
  padding-right: 32px;

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
