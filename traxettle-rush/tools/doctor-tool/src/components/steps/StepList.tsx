'use client';

import React, { useMemo, useState } from 'react';
import styled from 'styled-components';
import type { Environment, Platform, StepState, WorkflowStep } from '@/types';
import { StepCard } from '@/components/steps/StepCard';

const Wrap = styled.section`
  display: flex;
  flex-direction: column;
  gap: 16px;
`;

const HeaderRow = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding-bottom: 8px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
`;

const Title = styled.div`
  font-size: 16px;
  font-weight: 600;
  color: #ffffff;
`;

const Meta = styled.div`
  font-size: 13px;
  color: rgba(255, 255, 255, 0.6);
`;

const List = styled.div`
  display: flex;
  flex-direction: column;
  gap: 12px;
`;

export function StepList(props: {
  platform: Platform;
  environment: Environment;
  steps: WorkflowStep[];
  stepStatus: Record<string, StepState>;
  onComplete: (id: string) => void;
  onSkip: (id: string) => void;
}) {
  const { steps, stepStatus, onComplete, onSkip } = props;
  const [openStepId, setOpenStepId] = useState<string | null>(steps[0]?.id ?? null);

  const progress = useMemo(() => {
    const total = steps.length;
    const done = steps.filter(s => stepStatus[s.id] === 'done').length;
    const skipped = steps.filter(s => stepStatus[s.id] === 'skipped').length;
    return { total, done, skipped };
  }, [steps, stepStatus]);

  return (
    <Wrap>
      <HeaderRow>
        <Title>Steps</Title>
        <Meta>
          Done: {progress.done}/{progress.total} | Skipped: {progress.skipped}
        </Meta>
      </HeaderRow>

      <List>
        {steps.map((step, idx) => (
          <StepCard
            key={step.id}
            index={idx}
            step={step}
            state={stepStatus[step.id] ?? 'todo'}
            isOpen={openStepId === step.id}
            onToggle={() => setOpenStepId(prev => (prev === step.id ? null : step.id))}
            onComplete={() => onComplete(step.id)}
            onSkip={() => onSkip(step.id)}
          />
        ))}
      </List>
    </Wrap>
  );
}
