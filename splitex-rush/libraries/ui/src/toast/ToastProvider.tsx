'use client';

import React, { createContext, useContext, useCallback, useMemo, useState } from 'react';
import styled, { css } from 'styled-components';

export type ToastType = 'success' | 'error' | 'info' | 'warning';

export type Toast = {
  id: string;
  type: ToastType;
  title: string;
  message?: string;
  durationMs?: number;
};

type ToastContextValue = {
  push: (toast: Omit<Toast, 'id'>) => void;
};

const ToastContext = createContext<ToastContextValue | undefined>(undefined);

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}

const Container = styled.div`
  position: fixed;
  right: 16px;
  bottom: 16px;
  z-index: 9999;
  display: flex;
  flex-direction: column;
  gap: 10px;
`;

const typeBorder = {
  success: '#22c55e',
  error: '#ef4444',
  info: '#3b82f6',
  warning: '#f59e0b',
} as const;

const ToastCard = styled.div<{ $type: ToastType }>`
  width: 360px;
  max-width: calc(100vw - 32px);
  border-radius: 12px;
  padding: 12px 12px;
  border: 1px solid ${(p) => p.theme.colors.border};
  border-left: 5px solid ${(p) => typeBorder[p.$type]};
  background: ${(p) => p.theme.colors.surface};
  color: ${(p) => p.theme.colors.text};
  box-shadow: 0 18px 60px rgba(0,0,0,0.25);
`;

const TitleRow = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
`;

const Title = styled.div`
  font-size: 14px;
  font-weight: 600;
`;

const Message = styled.div`
  font-size: 13px;
  margin-top: 6px;
  color: ${(p) => p.theme.colors.muted};
`;

const CloseButton = styled.button`
  appearance: none;
  border: 0;
  background: transparent;
  cursor: pointer;
  color: ${(p) => p.theme.colors.muted};
  padding: 6px;
  border-radius: 8px;

  &:hover {
    background: rgba(127,127,127,0.12);
    color: ${(p) => p.theme.colors.text};
  }
`;

export function ToastProvider(props: { children: React.ReactNode }) {
  const { children } = props;
  const [toasts, setToasts] = useState<Toast[]>([]);

  const remove = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const push = useCallback((toast: Omit<Toast, 'id'>) => {
    const id = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const durationMs = toast.durationMs ?? (toast.type === 'error' ? 5000 : 3000);
    const next: Toast = { ...toast, id, durationMs };

    setToasts((prev) => [...prev, next]);

    window.setTimeout(() => remove(id), durationMs);
  }, [remove]);

  const value = useMemo(() => ({ push }), [push]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <Container>
        {toasts.map((t) => (
          <ToastCard key={t.id} $type={t.type}>
            <TitleRow>
              <Title>{t.title}</Title>
              <CloseButton onClick={() => remove(t.id)} aria-label="Dismiss">
                ✕
              </CloseButton>
            </TitleRow>
            {t.message ? <Message>{t.message}</Message> : null}
          </ToastCard>
        ))}
      </Container>
    </ToastContext.Provider>
  );
}
