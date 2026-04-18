'use client';

import React, { useMemo } from 'react';
import styled from 'styled-components';
import { CheckCircle2, ChevronDown, ChevronUp, CircleDashed, SkipForward } from 'lucide-react';
import type { StepState, WorkflowStep } from '@/types';
import { ScriptBlock } from '@/components/steps/ScriptBlock';

const Card = styled.div`
  border-radius: 12px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  background: rgba(17, 31, 58, 0.4);
  overflow: hidden;
  transition: all 0.2s ease;
`;

const Top = styled.button`
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  padding: 16px;
  background: transparent;
  border: none;
  color: #ffffff;
  cursor: pointer;
  text-align: left;

  &:hover {
    background: rgba(255, 255, 255, 0.05);
  }
`;

const Left = styled.div`
  display: flex;
  align-items: flex-start;
  gap: 12px;
  flex: 1;
`;

const StepNo = styled.div`
  min-width: 34px;
  height: 34px;
  border-radius: 10px;
  display: grid;
  place-items: center;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.12);
  color: rgba(255, 255, 255, 0.9);
  font-size: 13px;
  font-weight: 800;
  margin-top: 2px;
`;

const TitleRow = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 4px;
  flex-wrap: wrap;
`;

const Title = styled.div`
  font-size: 14px;
  font-weight: 600;
  color: #ffffff;
`;

const Badge = styled.span<{ $state: StepState }>`
  padding: 2px 6px;
  border-radius: 4px;
  font-size: 11px;
  font-weight: 500;
  background: ${(props: { $state: StepState }) => {
    if (props.$state === 'done') return 'rgba(34, 197, 94, 0.2)';
    if (props.$state === 'skipped') return 'rgba(251, 146, 60, 0.2)';
    return 'rgba(255, 255, 255, 0.1)';
  }};
  color: ${(props: { $state: StepState }) => {
    if (props.$state === 'done') return '#22c55e';
    if (props.$state === 'skipped') return '#fb923c';
    return 'rgba(255, 255, 255, 0.7)';
  }};
`;

const Kind = styled.span`
  padding: 2px 6px;
  border-radius: 4px;
  font-size: 10px;
  font-weight: 600;
  background: rgba(79, 140, 255, 0.2);
  color: #4f8cff;
  text-transform: uppercase;
`;

const Why = styled.div`
  font-size: 12px;
  color: rgba(255, 255, 255, 0.6);
  line-height: 1.4;
`;

const Body = styled.div`
  padding: 0 16px 16px;
  display: flex;
  flex-direction: column;
  gap: 16px;
`;

const Section = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
`;

const SectionTitle = styled.div`
  font-size: 13px;
  font-weight: 600;
  color: #ffffff;
`;

const List = styled.ul`
  margin: 0;
  padding-left: 18px;
  color: rgba(255, 255, 255, 0.8);
  font-size: 13px;
  line-height: 1.5;

  li {
    margin-bottom: 4px;
  }
`;

const Scripts = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
`;

const Actions = styled.div`
  display: flex;
  gap: 8px;
  padding-top: 8px;
  border-top: 1px solid rgba(255, 255, 255, 0.1);
`;

const BtnPrimary = styled.button`
  padding: 8px 16px;
  border-radius: 6px;
  border: 1px solid rgba(79, 140, 255, 0.5);
  background: rgba(79, 140, 255, 0.2);
  color: #4f8cff;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;

  &:hover {
    background: rgba(79, 140, 255, 0.3);
    border-color: #4f8cff;
  }
`;

const BtnGhost = styled.button`
  padding: 8px 16px;
  border-radius: 6px;
  border: 1px solid rgba(255, 255, 255, 0.2);
  background: transparent;
  color: rgba(255, 255, 255, 0.7);
  font-size: 13px;
  cursor: pointer;
  transition: all 0.2s ease;

  &:hover {
    background: rgba(255, 255, 255, 0.1);
    color: #ffffff;
  }
`;

function stateLabel(state: StepState): string {
  if (state === 'done') return 'Done';
  if (state === 'skipped') return 'Skipped';
  return 'Todo';
}

export function StepCard(props: {
  index: number;
  step: WorkflowStep;
  state: StepState;
  isOpen: boolean;
  onToggle: () => void;
  onComplete: () => void;
  onSkip: () => void;
}) {
  const { index, step, state, isOpen, onToggle, onComplete, onSkip } = props;

  const Icon = useMemo(() => {
    if (state === 'done') return CheckCircle2;
    if (state === 'skipped') return SkipForward;
    return CircleDashed;
  }, [state]);

  return (
    <Card>
      <Top type="button" onClick={onToggle}>
        <Left>
          <Icon size={18} />
          <StepNo aria-label={`Step ${index + 1}`}>{index + 1}</StepNo>
          <div>
            <TitleRow>
              <Title>{step.title}</Title>
              <Badge $state={state}>{stateLabel(state)}</Badge>
              <Kind>{step.kind.toUpperCase()}</Kind>
            </TitleRow>
            <Why>{step.whyThisMatters}</Why>
          </div>
        </Left>

        {isOpen ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
      </Top>

      {isOpen && (
        <Body>
          <Section>
            <SectionTitle>Do this</SectionTitle>
            <List>
              {step.instructions
                .map(t => t.trimEnd())
                .filter(t => t.trim().length > 0)
                .map((t, i) => (
                  <li key={i}>{t}</li>
                ))}
            </List>
          </Section>

          {step.scripts && step.scripts.length > 0 && (
            <Section>
              <SectionTitle>Run in Terminal</SectionTitle>
              <Scripts>
                {step.scripts.map(s => (
                  <ScriptBlock key={s.label} label={s.label} command={s.command} />
                ))}
              </Scripts>
            </Section>
          )}

          {step.snippets && step.snippets.length > 0 && (
            <Section>
              <SectionTitle>Copy / Paste</SectionTitle>
              <Scripts>
                {step.snippets.map(s => (
                  <ScriptBlock key={s.label} label={s.label} command={s.text} />
                ))}
              </Scripts>
            </Section>
          )}

          {step.expected && step.expected.length > 0 && (
            <Section>
              <SectionTitle>Expected</SectionTitle>
              <List>
                {step.expected.map((t, i) => (
                  <li key={i}>{t}</li>
                ))}
              </List>
            </Section>
          )}

          <Actions>
            <BtnPrimary type="button" onClick={onComplete}>
              Mark as {step.kind === 'verify' ? 'Verified' : 'Done'}
            </BtnPrimary>
            {step.skippable && (
              <BtnGhost type="button" onClick={onSkip}>
                Skip this step
              </BtnGhost>
            )}
          </Actions>
        </Body>
      )}
    </Card>
  );
}
