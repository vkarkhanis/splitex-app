import type { Platform, WorkflowStep } from '@/types';

export function securityUtilitySteps(platform: Platform): WorkflowStep[] {
  return [
    {
      id: 'u-security-jwt-secrets',
      platform,
      environment: 'utility',
      section: 'Security',
      title: 'Generate JWT secrets (needed for API deploy)',
      whyThisMatters:
        'The API uses JWT secrets to sign login tokens. These secrets are NOT from Firebase/GCP — you generate them yourself and keep them private.',
      kind: 'action',
      skippable: false,
      instructions: [
        '1) Run the command below (it prints 2 lines)',
        '2) Copy the printed values',
        '3) When the configure script asks for:',
        '   - JWT secret → paste JWT_SECRET',
        '   - JWT refresh secret → paste JWT_REFRESH_SECRET',
        'Important:',
        '- Use different secrets for staging vs production',
        '- Do not share these secrets in chat/email',
      ],
      scripts: [
        {
          label: 'Generate JWT_SECRET + JWT_REFRESH_SECRET',
          command:
            "node -e \"const crypto=require('crypto'); console.log('JWT_SECRET='+crypto.randomBytes(48).toString('base64url')); console.log('JWT_REFRESH_SECRET='+crypto.randomBytes(48).toString('base64url'));\"",
        },
      ],
      expected: ['You have two new values ready to paste into configure-staging.sh / configure-prod.sh.'],
    },
  ];
}

