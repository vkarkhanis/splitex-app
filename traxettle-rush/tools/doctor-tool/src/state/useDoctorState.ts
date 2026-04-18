'use client';

import { useCallback, useEffect, useState } from 'react';
import type { DoctorState, Environment, EnvState, Platform, StepState } from '@/types';
import { getWorkflow } from '@/workflows/getWorkflow';

const STORAGE_KEY = 'traxettle_doctor_state_v1';

function makeDefaultState(): DoctorState {
  return {
    platform: 'mobile',
    environment: 'prerequisites',
    stepStatus: {},
    envStatus: {
      prerequisites: 'in_progress',
      utility: 'todo',
      local: 'todo',
      staging: 'todo',
      production: 'todo',
    },
  };
}

function safeParse(raw: string | null): DoctorState | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as DoctorState;
  } catch {
    return null;
  }
}

export function useDoctorState() {
  const [state, setState] = useState<DoctorState>(makeDefaultState);

  const recomputeEnvStatus = useCallback((draft: DoctorState): DoctorState => {
    const wf = getWorkflow(draft.platform);
    const nextEnvStatus: Record<Environment, EnvState> = { ...draft.envStatus };

    (['prerequisites', 'utility', 'local', 'staging', 'production'] as Environment[]).forEach(env => {
      const steps = wf.steps.filter(s => s.environment === env);
      if (steps.length === 0) return;

      // If env explicitly skipped, don't override
      if (nextEnvStatus[env] === 'skipped') return;

      const allTerminal = steps.every(s => {
        const st = draft.stepStatus[s.id] ?? 'todo';
        return st === 'done' || st === 'skipped';
      });

      if (allTerminal) {
        nextEnvStatus[env] = 'done';
      } else if (env === draft.environment) {
        // Only current env is considered in_progress
        if (nextEnvStatus[env] === 'todo') nextEnvStatus[env] = 'in_progress';
      }
    });

    return { ...draft, envStatus: nextEnvStatus };
  }, []);

  useEffect(() => {
    const saved = safeParse(localStorage.getItem(STORAGE_KEY));
    if (saved) setState(saved);
  }, []);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [state]);

  const setPlatform = useCallback((platform: Platform) => {
    setState((prev: DoctorState) => recomputeEnvStatus({ ...prev, platform }));
  }, []);

  const setEnvironment = useCallback((environment: Environment) => {
    setState((prev: DoctorState) => {
      const nextEnvStatus: Record<Environment, EnvState> = { ...prev.envStatus };
      if (nextEnvStatus[environment] === 'todo') nextEnvStatus[environment] = 'in_progress';
      return recomputeEnvStatus({ ...prev, environment, envStatus: nextEnvStatus });
    });
  }, []);

  const completeStep = useCallback((stepId: string) => {
    setState((prev: DoctorState) => {
      const nextStepStatus: Record<string, StepState> = { ...prev.stepStatus, [stepId]: 'done' };
      return recomputeEnvStatus({ ...prev, stepStatus: nextStepStatus });
    });
  }, []);

  const skipStep = useCallback((stepId: string) => {
    setState((prev: DoctorState) => {
      const nextStepStatus: Record<string, StepState> = { ...prev.stepStatus, [stepId]: 'skipped' };
      return recomputeEnvStatus({ ...prev, stepStatus: nextStepStatus });
    });
  }, []);

  const resetEnvironment = useCallback((env: Environment) => {
    setState((prev: DoctorState) => {
      const wf = getWorkflow(prev.platform);
      const ids = wf.steps.filter(s => s.environment === env).map(s => s.id);

      const nextStepStatus: Record<string, StepState> = { ...prev.stepStatus };
      for (const id of ids) {
        delete nextStepStatus[id];
      }

      const nextEnvStatus: Record<Environment, EnvState> = { ...prev.envStatus };
      nextEnvStatus[env] = env === 'prerequisites' || env === 'utility' ? 'in_progress' : 'todo';

      return recomputeEnvStatus({ ...prev, stepStatus: nextStepStatus, envStatus: nextEnvStatus });
    });
  }, []);

  const markEnvironmentSkipped = useCallback((env: Environment) => {
    setState((prev: DoctorState) =>
      recomputeEnvStatus({ ...prev, envStatus: { ...prev.envStatus, [env]: 'skipped' } }),
    );
  }, []);

  return {
    state,
    setPlatform,
    setEnvironment,
    completeStep,
    skipStep,
    resetEnvironment,
    markEnvironmentSkipped,
  };
}
