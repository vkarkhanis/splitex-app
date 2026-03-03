import type { Platform, WorkflowStep } from '@/types';
import { mobileSteps } from '@/workflows/mobileSteps';
import { webSteps } from '@/workflows/webSteps';

export function getWorkflow(platform: Platform): { steps: WorkflowStep[] } {
  return {
    steps: platform === 'mobile' ? mobileSteps : webSteps,
  };
}
