import type { Platform, WorkflowStep } from '@/types';

export function cloudUtilitySteps(platform: Platform): WorkflowStep[] {
  return [
    {
      id: 'u-cloud-clis',
      platform,
      environment: 'utility',
      section: 'Cloud',
      title: 'Install + login to Google Cloud (gcloud) and Firebase (for staging/prod deploys)',
      whyThisMatters:
        'Staging/production deployments require access to Google Cloud Run and Firebase Hosting.',
      kind: 'action',
      skippable: true,
      instructions: [
        'If you only want LOCAL development, you can skip this.',
        'Otherwise:',
        '1) Install Google Cloud CLI (gcloud)',
        '2) Install Firebase CLI (firebase-tools)',
        '3) Login: gcloud auth login',
        '4) Login: firebase login',
        '5) Verify with the checks below',
      ],
      scripts: [
        { label: 'Check gcloud', command: 'gcloud --version || echo "gcloud not found"' },
        { label: 'Check firebase', command: 'firebase --version || echo "firebase not found"' },
        { label: 'Login to gcloud', command: 'gcloud auth login' },
        { label: 'Login to Firebase', command: 'firebase login' },
      ],
      expected: ['gcloud prints a version.', 'firebase prints a version.', 'Logins succeed.'],
    },
  ];
}

