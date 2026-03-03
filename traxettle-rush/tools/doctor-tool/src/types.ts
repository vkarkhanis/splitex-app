export type Platform = 'mobile' | 'web';
export type Environment = 'local' | 'staging' | 'production';

export type StepKind = 'action' | 'verify';

export interface WorkflowScript {
  label: string;
  command: string;
}

export interface WorkflowStep {
  id: string;
  platform: Platform;
  environment: Environment;
  title: string;
  whyThisMatters: string;
  kind: StepKind;
  instructions: string[];
  scripts?: WorkflowScript[];
  expected?: string[];
  skippable: boolean;
}

export type StepState = 'todo' | 'done' | 'skipped';
export type EnvState = 'todo' | 'in_progress' | 'done' | 'skipped';

export interface DoctorState {
  platform: Platform;
  environment: Environment;
  stepStatus: Record<string, StepState>;
  envStatus: Record<Environment, EnvState>;
}
