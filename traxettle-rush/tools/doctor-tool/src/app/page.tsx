'use client';

import { useMemo } from 'react';
import styled from 'styled-components';
import { AppShell } from '@/components/layout/AppShell';
import { PlatformTabs } from '@/components/nav/PlatformTabs';
import { EnvironmentRail } from '@/components/nav/EnvironmentRail';
import { StepList } from '@/components/steps/StepList';
import { useDoctorState } from '@/state/useDoctorState';
import { getWorkflow } from '@/workflows/getWorkflow';
import type { WorkflowStep } from '@/types';

const Grid = styled.div`
  display: grid;
  grid-template-columns: 360px 1fr;
  gap: 18px;
  align-items: start;

  @media (max-width: 980px) {
    grid-template-columns: 1fr;
  }
`;

const LeftCol = styled.div`
  position: sticky;
  top: 94px; /* header height + spacing */
  display: flex;
  flex-direction: column;
  gap: 14px;
  align-self: start;

  @media (max-width: 980px) {
    position: static;
    top: auto;
  }
`;

const RightCol = styled.div`
  min-width: 0;
`;

export default function Page() {
  const {
    state,
    setPlatform,
    setEnvironment,
    completeStep,
    skipStep,
    resetEnvironment,
    markEnvironmentSkipped,
  } = useDoctorState();

  const workflow = useMemo(() => getWorkflow(state.platform), [state.platform]);
  const stepsForEnv = (workflow.steps as WorkflowStep[]).filter(
    (s: WorkflowStep) => s.environment === state.environment,
  );

  return (
    <AppShell headerTitle="Traxettle Doctor" headerSubtitle="Guided setup: Prerequisites → Utility → Local → Staging → Production">
      <PlatformTabs platform={state.platform} onChange={setPlatform} />

      <Grid>
        <LeftCol>
          <EnvironmentRail
            environment={state.environment}
            envStatus={state.envStatus}
            onChange={setEnvironment}
            onReset={resetEnvironment}
            onSkipEnv={markEnvironmentSkipped}
          />
        </LeftCol>

        <RightCol>
          <StepList
            platform={state.platform}
            environment={state.environment}
            steps={stepsForEnv}
            stepStatus={state.stepStatus}
            onComplete={completeStep}
            onSkip={skipStep}
          />
        </RightCol>
      </Grid>
    </AppShell>
  );
}
