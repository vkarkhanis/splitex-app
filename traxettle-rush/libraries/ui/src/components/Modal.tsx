'use client';

import React, { useEffect, useCallback } from 'react';
import styled from 'styled-components';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
  dataTestId?: string;
}

const Overlay = styled.div`
  position: fixed;
  inset: 0;
  z-index: 1000;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  backdrop-filter: blur(4px);
`;

const ModalContainer = styled.div`
  background: ${(p) => p.theme.colors.surface};
  border: 1px solid ${(p) => p.theme.colors.border};
  border-radius: ${(p) => p.theme.radii.xl};
  box-shadow: ${(p) => p.theme.shadows.xl};
  max-width: 560px;
  width: 100%;
  max-height: 90vh;
  overflow-y: auto;
  padding: 24px;
  animation: fadeIn 0.2s ease;
`;

const CloseButton = styled.button`
  position: absolute;
  top: 16px;
  right: 16px;
  background: none;
  border: none;
  color: ${(p) => p.theme.colors.muted};
  cursor: pointer;
  font-size: 18px;
  padding: 4px 8px;
  border-radius: ${(p) => p.theme.radii.sm};
  transition: all 0.15s ease;

  &:hover {
    background: ${(p) => p.theme.colors.surfaceHover};
    color: ${(p) => p.theme.colors.text};
  }
`;

const ModalWrapper = styled.div`
  position: relative;
`;

export function Modal({ open, onClose, children, dataTestId }: ModalProps) {
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    },
    [onClose]
  );

  useEffect(() => {
    if (open) {
      document.addEventListener('keydown', handleKeyDown);
      document.body.style.overflow = 'hidden';
    }
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = '';
    };
  }, [open, handleKeyDown]);

  if (!open) return null;

  return (
    <Overlay onClick={onClose} data-testid={dataTestId ? `${dataTestId}-overlay` : undefined}>
      <ModalContainer
        onClick={(e) => e.stopPropagation()}
        data-testid={dataTestId}
      >
        <ModalWrapper>
          <CloseButton onClick={onClose} data-testid={dataTestId ? `${dataTestId}-close` : undefined}>
            ✕
          </CloseButton>
          {children}
        </ModalWrapper>
      </ModalContainer>
    </Overlay>
  );
}

export const ModalHeader = styled.div`
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-bottom: 18px;
  padding-right: 32px;
`;

export const ModalTitle = styled.h2`
  margin: 0;
  font-size: 20px;
  font-weight: 700;
  letter-spacing: -0.02em;
`;

export const ModalBody = styled.div`
  display: flex;
  flex-direction: column;
  gap: 14px;
`;

export const ModalFooter = styled.div`
  display: flex;
  gap: 10px;
  justify-content: flex-end;
  padding-top: 18px;
  border-top: 1px solid ${(p) => p.theme.colors.border};
  margin-top: 18px;
`;
