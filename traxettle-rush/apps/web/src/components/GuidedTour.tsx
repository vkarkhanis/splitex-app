'use client';

import React, { useEffect, useMemo, useState } from 'react';
import styled from 'styled-components';
import { Button } from '@traxettle/ui';

type TourStep = {
  label?: string;
  title: string;
  body: string;
  selector?: string;
};

type GuidedTourProps = {
  open: boolean;
  steps: TourStep[];
  step: number;
  onStepChange: (step: number) => void;
  onSkip: () => void;
  onComplete: () => void;
};

const Backdrop = styled.div`
  position: fixed;
  inset: 0;
  z-index: 950;
  pointer-events: none;
`;

const DimPanel = styled.div<{ $top: number; $left: number; $width: number; $height: number; }>`
  position: fixed;
  top: ${(p) => p.$top}px;
  left: ${(p) => p.$left}px;
  width: ${(p) => p.$width}px;
  height: ${(p) => p.$height}px;
  background:
    linear-gradient(180deg, rgba(15, 23, 42, 0.58), rgba(15, 23, 42, 0.5));
  pointer-events: none;
`;

const Spotlight = styled.div<{ $visible: boolean; $x: number; $y: number; $width: number; $height: number; }>`
  position: fixed;
  left: ${(p) => p.$x}px;
  top: ${(p) => p.$y}px;
  width: ${(p) => p.$width}px;
  height: ${(p) => p.$height}px;
  border-radius: 18px;
  border: 2px solid rgba(255, 255, 255, 0.94);
  box-shadow:
    0 0 0 1px rgba(14, 165, 233, 0.24),
    0 0 0 10px rgba(14, 165, 233, 0.12),
    0 24px 70px rgba(14, 165, 233, 0.18);
  background: rgba(255, 255, 255, 0.03);
  opacity: ${(p) => (p.$visible ? 1 : 0)};
  transition: all 0.25s ease;
  pointer-events: none;
`;

const TargetLabel = styled.div<{ $top: number; $left: number; }>`
  position: fixed;
  z-index: 961;
  top: ${(p) => p.$top}px;
  left: ${(p) => p.$left}px;
  border-radius: 999px;
  padding: 7px 10px;
  background: rgba(15, 23, 42, 0.94);
  color: white;
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  box-shadow: 0 16px 36px rgba(15, 23, 42, 0.28);
`;

const TourCard = styled.div<{ $anchored: boolean; $top: number; $left: number; }>`
  position: fixed;
  z-index: 960;
  width: min(400px, calc(100vw - 28px));
  left: ${(p) => (p.$anchored ? `${p.$left}px` : '50%')};
  top: ${(p) => (p.$anchored ? `${p.$top}px` : '50%')};
  transform: ${(p) => (p.$anchored ? 'translateY(0)' : 'translate(-50%, -50%)')};
  border-radius: ${(p) => p.theme.radii.xl};
  border: 1px solid rgba(255, 255, 255, 0.16);
  background:
    linear-gradient(180deg, rgba(255,255,255,0.98), rgba(248,250,252,0.96));
  box-shadow: 0 24px 80px rgba(15, 23, 42, 0.28);
  padding: 22px;

  @media (max-width: 1366px) {
    width: min(360px, calc(100vw - 28px));
    padding: 20px;
  }
`;

const StepPill = styled.div`
  display: inline-flex;
  align-items: center;
  gap: 8px;
  border-radius: 999px;
  background: rgba(14, 165, 233, 0.1);
  color: ${(p) => p.theme.colors.primary};
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  padding: 7px 10px;
`;

const Kickoff = styled.div`
  margin-top: 12px;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: ${(p) => p.theme.colors.muted};
`;

const Title = styled.h3`
  margin: 14px 0 8px;
  font-size: 24px;
  line-height: 1.1;
  letter-spacing: -0.03em;
  color: ${(p) => p.theme.colors.text};
`;

const Body = styled.p`
  margin: 0;
  color: ${(p) => p.theme.colors.textSecondary};
  font-size: 14px;
  line-height: 1.6;

  @media (max-width: 1366px) {
    font-size: 13px;
    line-height: 1.55;
  }
`;

const Actions = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-top: 20px;
  flex-wrap: wrap;
`;

const ActionCluster = styled.div`
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
`;

export default function GuidedTour({
  open,
  steps,
  step,
  onStepChange,
  onSkip,
  onComplete,
}: GuidedTourProps) {
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null);
  const activeStep = steps[step];

  useEffect(() => {
    const selector = activeStep?.selector;
    if (!open || !selector || typeof window === 'undefined') {
      setTargetRect(null);
      return;
    }

    const updateRect = () => {
      const node = document.querySelector(selector);
      setTargetRect(node instanceof HTMLElement ? node.getBoundingClientRect() : null);
    };

    updateRect();
    window.addEventListener('resize', updateRect);
    window.addEventListener('scroll', updateRect, true);

    return () => {
      window.removeEventListener('resize', updateRect);
      window.removeEventListener('scroll', updateRect, true);
    };
  }, [activeStep?.selector, open]);

  const cardPosition = useMemo(() => {
    if (!targetRect || typeof window === 'undefined') {
      return { anchored: false, top: 0, left: 0 };
    }

    const horizontalInset = window.innerWidth <= 1366 ? 14 : 16;
    const width = Math.min(window.innerWidth <= 1366 ? 360 : 400, window.innerWidth - horizontalInset * 2);
    const preferredTop = targetRect.bottom + 18;
    const top = preferredTop + 228 < window.innerHeight
      ? preferredTop
      : Math.max(16, targetRect.top - 238);
    const preferredLeft = targetRect.left + (targetRect.width / 2) - (width / 2);
    const left = Math.min(
      Math.max(horizontalInset, preferredLeft),
      Math.max(horizontalInset, window.innerWidth - width - horizontalInset),
    );

    return { anchored: true, top, left };
  }, [targetRect]);

  const dimPanels = useMemo(() => {
    if (!targetRect || typeof window === 'undefined') return [];
    const pad = 14;
    const left = Math.max(0, targetRect.left - pad);
    const top = Math.max(0, targetRect.top - pad);
    const right = Math.min(window.innerWidth, targetRect.right + pad);
    const bottom = Math.min(window.innerHeight, targetRect.bottom + pad);

    return [
      { top: 0, left: 0, width: window.innerWidth, height: top },
      { top: bottom, left: 0, width: window.innerWidth, height: Math.max(0, window.innerHeight - bottom) },
      { top, left: 0, width: left, height: Math.max(0, bottom - top) },
      { top, left: right, width: Math.max(0, window.innerWidth - right), height: Math.max(0, bottom - top) },
    ];
  }, [targetRect]);

  if (!open || !activeStep) return null;

  const isLast = step === steps.length - 1;

  return (
    <>
      <Backdrop />
      {dimPanels.map((panel, index) => (
        <DimPanel
          key={`tour-dim-${index}`}
          $top={panel.top}
          $left={panel.left}
          $width={panel.width}
          $height={panel.height}
        />
      ))}
      <Spotlight
        $visible={Boolean(targetRect)}
        $x={targetRect ? targetRect.left - 8 : 0}
        $y={targetRect ? targetRect.top - 8 : 0}
        $width={targetRect ? targetRect.width + 16 : 0}
        $height={targetRect ? targetRect.height + 16 : 0}
      />
      {targetRect && activeStep.label && typeof window !== 'undefined' ? (
        <TargetLabel
          $left={Math.min(Math.max(16, targetRect.left), Math.max(16, window.innerWidth - 176))}
          $top={Math.max(16, targetRect.top - 40)}
        >
          {activeStep.label}
        </TargetLabel>
      ) : null}
      <TourCard $anchored={cardPosition.anchored} $top={cardPosition.top} $left={cardPosition.left}>
        <StepPill>
          Step {step + 1} of {steps.length}
        </StepPill>
        <Kickoff>{activeStep.label ? `Highlighted: ${activeStep.label}` : 'Quick orientation'}</Kickoff>
        <Title>{activeStep.title}</Title>
        <Body>{activeStep.body}</Body>
        <Actions>
          <Button type="button" $variant="ghost" onClick={onSkip}>
            Skip tour
          </Button>
          <ActionCluster>
            {step > 0 && (
              <Button type="button" $variant="outline" onClick={() => onStepChange(step - 1)}>
                Back
              </Button>
            )}
            <Button
              type="button"
              $variant="primary"
              onClick={() => (isLast ? onComplete() : onStepChange(step + 1))}
            >
              {isLast ? 'Finish' : 'Next'}
            </Button>
          </ActionCluster>
        </Actions>
      </TourCard>
    </>
  );
}
