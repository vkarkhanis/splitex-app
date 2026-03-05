'use client';

import React from 'react';
import { RotateCcw, SkipForward } from 'lucide-react';
import styled from 'styled-components';
import type { Environment, EnvState } from '@/types';

const ENVS: Environment[] = ['prerequisites', 'utility', 'local', 'staging', 'production'];

function envLabel(env: Environment): string {
  if (env === 'prerequisites') return '📋 Prerequisites';
  if (env === 'utility') return '🛠️ Utility';
  if (env === 'local') return '🏠 Local';
  if (env === 'staging') return '🔧 Staging';
  return '🚀 Production';
}

function envIcon(env: Environment): string {
  if (env === 'prerequisites') return '📋';
  if (env === 'utility') return '🛠️';
  if (env === 'local') return '🏠';
  if (env === 'staging') return '🔧';
  return '🚀';
}

function envColor(state: EnvState): string {
  if (state === 'done') return '#22c55e';
  if (state === 'skipped') return '#fb923c';
  if (state === 'in_progress') return '#4f8cff';
  return 'rgba(255, 255, 255, 0.3)';
}

const Wrap = styled.div`
  display: flex;
  flex-direction: column;
  gap: 16px;
`;

const Section = styled.div`
  display: flex;
  flex-direction: column;
  gap: 12px;
`;

const SectionTitle = styled.div`
  font-size: 12px;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.6);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin-bottom: 4px;
`;

const EnvRow = styled.div`
  display: flex;
  gap: 8px;
  background: rgba(17, 31, 58, 0.6);
  border-radius: 12px;
  padding: 6px;
  border: 1px solid rgba(255, 255, 255, 0.1);
`;

const Pill = styled.button<{ $state: EnvState; $active: boolean }>`
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 16px 12px;
  border-radius: 8px;
  border: 2px solid transparent;
  background: ${(props: { $state: EnvState; $active: boolean }) => {
    if (props.$active) return 'rgba(79, 140, 255, 0.2)';
    return 'rgba(255, 255, 255, 0.05)';
  }};
  border-color: ${(props: { $state: EnvState; $active: boolean }) => {
    if (props.$active) return '#4f8cff';
    return 'transparent';
  }};
  color: #ffffff;
  cursor: pointer;
  transition: all 0.3s ease;
  position: relative;
  flex: 1;

  ${(props: { $state: EnvState; $active: boolean }) => 
    props.$active && `
    box-shadow: 0 0 20px rgba(79, 140, 255, 0.3);
    backdrop-filter: blur(10px);
  `}

  &:hover {
    background: rgba(255, 255, 255, 0.1);
    transform: translateY(-2px);
  }

  &:active {
    transform: translateY(0);
  }
`;

const EnvIcon = styled.div`
  font-size: 24px;
  margin-bottom: 4px;
`;

const PillText = styled.span`
  font-size: 14px;
  font-weight: 600;
  margin-bottom: 2px;
`;

const PillState = styled.span<{ $state: EnvState }>`
  font-size: 11px;
  color: ${(props: { $state: EnvState }) => envColor(props.$state)};
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 0.5px;
`;

const ActionsSection = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
  background: rgba(17, 31, 58, 0.4);
  border-radius: 12px;
  padding: 12px;
  border: 1px solid rgba(255, 255, 255, 0.08);
`;

const ActionsRow = styled.div`
  display: flex;
  gap: 8px;
`;

const ActionBtn = styled.button`
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  border-radius: 8px;
  border: 1px solid rgba(255, 255, 255, 0.15);
  background: rgba(255, 255, 255, 0.05);
  color: rgba(255, 255, 255, 0.8);
  cursor: pointer;
  font-size: 13px;
  font-weight: 500;
  transition: all 0.2s ease;
  flex: 1;

  &:hover {
    background: rgba(255, 255, 255, 0.1);
    border-color: rgba(255, 255, 255, 0.25);
    color: #ffffff;
    transform: translateY(-1px);
  }

  &:active {
    transform: translateY(0);
  }
`;

const ActionBtnWarn = styled(ActionBtn)`
  border-color: rgba(251, 146, 60, 0.3);
  background: rgba(251, 146, 60, 0.1);
  color: rgba(251, 146, 60, 0.9);

  &:hover {
    background: rgba(251, 146, 60, 0.2);
    border-color: rgba(251, 146, 60, 0.5);
    color: #fb923c;
  }
`;

const Help = styled.div`
  font-size: 12px;
  color: rgba(255, 255, 255, 0.5);
  font-style: italic;
  text-align: center;
  padding: 8px;
  background: rgba(255, 255, 255, 0.02);
  border-radius: 8px;
  border: 1px solid rgba(255, 255, 255, 0.05);
`;

export function EnvironmentRail(props: {
  environment: Environment;
  envStatus: Record<Environment, EnvState>;
  onChange: (e: Environment) => void;
  onReset: (e: Environment) => void;
  onSkipEnv: (e: Environment) => void;
}) {
  const { environment, envStatus, onChange, onReset, onSkipEnv } = props;

  return (
    <Wrap>
      <Section>
        <SectionTitle>Environment</SectionTitle>
        <EnvRow>
          {ENVS.map(env => {
            const state = envStatus[env];
            const isActive = env === environment;
            return (
              <Pill
                key={env}
                type="button"
                $state={state}
                $active={isActive}
                onClick={() => onChange(env)}
                title={`Status: ${state}`}
              >
                <EnvIcon>{envIcon(env)}</EnvIcon>
                <PillText>{envLabel(env)}</PillText>
                <PillState $state={state}>{state}</PillState>
              </Pill>
            );
          })}
        </EnvRow>
      </Section>

      <ActionsSection>
        <SectionTitle>Actions</SectionTitle>
        <ActionsRow>
          <ActionBtn type="button" onClick={() => onReset(environment)}>
            <RotateCcw size={16} />
            Reset Current
          </ActionBtn>
          <ActionBtnWarn type="button" onClick={() => onSkipEnv(environment)}>
            <SkipForward size={16} />
            Skip Current
          </ActionBtnWarn>
        </ActionsRow>
      </ActionsSection>

      <Help>
        💡 Tip: Switch between Mobile/Web tabs anytime. Progress is saved automatically.
      </Help>
    </Wrap>
  );
}
