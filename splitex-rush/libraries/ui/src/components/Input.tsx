'use client';

import styled from 'styled-components';

export const Field = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
`;

export const Label = styled.label`
  font-size: 13px;
  font-weight: 600;
  color: ${(p) => p.theme.colors.text};
`;

export const Input = styled.input<{ $hasError?: boolean }>`
  border-radius: 12px;
  padding: 12px 12px;
  font-size: 14px;
  border: 1px solid ${(p) => (p.$hasError ? '#ef4444' : p.theme.colors.border)};
  background: ${(p) => (p.$hasError ? 'rgba(239,68,68,0.08)' : p.theme.colors.surface)};
  color: ${(p) => p.theme.colors.text};
  outline: none;

  &::placeholder {
    color: rgba(127, 127, 127, 0.8);
  }

  &:focus {
    border-color: ${(p) => p.theme.colors.primary};
    box-shadow: 0 0 0 4px rgba(59,130,246,0.18);
  }
`;

export const ErrorText = styled.div`
  font-size: 12px;
  color: #ef4444;
`;
