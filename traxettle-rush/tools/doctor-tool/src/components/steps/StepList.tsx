'use client';

import React, { useEffect, useMemo, useState } from 'react';
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
  gap: 12px;
`;

const Title = styled.div`
  font-size: 16px;
  font-weight: 600;
  color: #ffffff;
  white-space: nowrap;
`;

const Meta = styled.div`
  font-size: 13px;
  color: rgba(255, 255, 255, 0.6);
  white-space: nowrap;
`;

const Controls = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
  margin-left: auto;
`;

const Search = styled.input`
  width: min(360px, 42vw);
  padding: 10px 12px;
  border-radius: 10px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  background: rgba(17, 31, 58, 0.35);
  color: rgba(255, 255, 255, 0.9);
  font-size: 13px;
  outline: none;

  &::placeholder {
    color: rgba(255, 255, 255, 0.45);
  }

  &:focus {
    border-color: rgba(79, 140, 255, 0.75);
    box-shadow: 0 0 0 3px rgba(79, 140, 255, 0.15);
  }
`;

const Toggle = styled.button<{ $active: boolean }>`
  padding: 10px 12px;
  border-radius: 10px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  background: ${(p: { $active: boolean }) => (p.$active ? 'rgba(79, 140, 255, 0.18)' : 'rgba(255, 255, 255, 0.04)')};
  color: ${(p: { $active: boolean }) => (p.$active ? '#cfe2ff' : 'rgba(255, 255, 255, 0.75)')};
  font-size: 13px;
  cursor: pointer;
  transition: all 0.2s ease;
  white-space: nowrap;

  &:hover {
    background: ${(p: { $active: boolean }) => (p.$active ? 'rgba(79, 140, 255, 0.25)' : 'rgba(255, 255, 255, 0.08)')};
    color: #ffffff;
  }
`;

const List = styled.div`
  display: flex;
  flex-direction: column;
  gap: 12px;
`;

const SectionHeader = styled.div`
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 10px;
  margin-top: 6px;
  padding: 8px 10px;
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.08);
`;

const SectionTitle = styled.div`
  font-size: 13px;
  font-weight: 700;
  color: rgba(255, 255, 255, 0.92);
`;

const SectionMeta = styled.div`
  font-size: 12px;
  color: rgba(255, 255, 255, 0.55);
  white-space: nowrap;
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
  const [search, setSearch] = useState('');
  const [showCompleted, setShowCompleted] = useState(false);

  const initialOpenId = useMemo(() => {
    const firstTodo = steps.find(s => (stepStatus[s.id] ?? 'todo') === 'todo');
    return firstTodo?.id ?? steps[0]?.id ?? null;
  }, [steps, stepStatus]);

  const [openStepId, setOpenStepId] = useState<string | null>(initialOpenId);
  useEffect(() => {
    if (!openStepId || !steps.some(s => s.id === openStepId)) {
      setOpenStepId(initialOpenId);
    }
  }, [initialOpenId, openStepId, steps]);

  const progress = useMemo(() => {
    const total = steps.length;
    const done = steps.filter(s => stepStatus[s.id] === 'done').length;
    const skipped = steps.filter(s => stepStatus[s.id] === 'skipped').length;
    return { total, done, skipped };
  }, [steps, stepStatus]);

  const filteredSteps = useMemo(() => {
    const q = search.trim().toLowerCase();
    return steps.filter(step => {
      const state = stepStatus[step.id] ?? 'todo';
      if (!showCompleted && (state === 'done' || state === 'skipped')) return false;
      if (!q) return true;
      return (
        step.title.toLowerCase().includes(q) ||
        step.section.toLowerCase().includes(q) ||
        step.whyThisMatters.toLowerCase().includes(q) ||
        step.instructions.some(t => t.toLowerCase().includes(q)) ||
        (step.scripts ?? []).some(s => s.label.toLowerCase().includes(q) || s.command.toLowerCase().includes(q))
      );
    });
  }, [steps, stepStatus, search, showCompleted]);

  const grouped = useMemo(() => {
    const map = new Map<string, WorkflowStep[]>();
    for (const s of filteredSteps) {
      const key = s.section || 'Steps';
      const arr = map.get(key) ?? [];
      arr.push(s);
      map.set(key, arr);
    }
    return Array.from(map.entries()).map(([section, sectionSteps]) => ({ section, steps: sectionSteps }));
  }, [filteredSteps]);

  return (
    <Wrap>
      <HeaderRow>
        <Title>Steps</Title>
        <Controls>
          <Search
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search steps (e.g. Firebase, deploy, Android)…"
            aria-label="Search steps"
          />
          <Toggle type="button" $active={showCompleted} onClick={() => setShowCompleted(v => !v)}>
            {showCompleted ? 'Showing all' : 'Hide done'}
          </Toggle>
        </Controls>
        <Meta>Done: {progress.done}/{progress.total} · Skipped: {progress.skipped}</Meta>
      </HeaderRow>

      <List>
        {grouped.map(group => {
          const done = group.steps.filter(s => stepStatus[s.id] === 'done').length;
          const skipped = group.steps.filter(s => stepStatus[s.id] === 'skipped').length;
          const total = group.steps.length;
          return (
            <React.Fragment key={group.section}>
              <SectionHeader>
                <SectionTitle>{group.section}</SectionTitle>
                <SectionMeta>
                  {done}/{total} done{skipped ? ` · ${skipped} skipped` : ''}
                </SectionMeta>
              </SectionHeader>

              {group.steps.map((step, idx) => (
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
            </React.Fragment>
          );
        })}
      </List>
    </Wrap>
  );
}
