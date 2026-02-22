import React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { ThemeProvider } from 'styled-components';

const mockToastPush = jest.fn();
const mockRouterPush = jest.fn();

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockRouterPush }),
}));

jest.mock('@splitex/ui', () => {
  const ReactLib = require('react');
  return {
    Button: ({ children, $variant, ...props }: any) => ReactLib.createElement('button', props, children),
    Card: ({ children, ...props }: any) => ReactLib.createElement('div', props, children),
    CardBody: ({ children, ...props }: any) => ReactLib.createElement('div', props, children),
    CardHeader: ({ children, ...props }: any) => ReactLib.createElement('div', props, children),
    CardSubtitle: ({ children, ...props }: any) => ReactLib.createElement('div', props, children),
    CardTitle: ({ children, ...props }: any) => ReactLib.createElement('h2', props, children),
    Field: ({ children, ...props }: any) => ReactLib.createElement('div', props, children),
    Input: ({ ...props }: any) => ReactLib.createElement('input', props),
    Label: ({ children, ...props }: any) => ReactLib.createElement('label', props, children),
    useToast: () => ({ push: mockToastPush }),
  };
});

jest.mock('../../config/firebase-client', () => ({
  getFirebaseServices: () => ({
    auth: {
      currentUser: {
        getIdToken: jest.fn().mockResolvedValue('token-123'),
      },
    },
  }),
}));

jest.mock('firebase/auth', () => ({
  onAuthStateChanged: (_auth: unknown, callback: (user: any) => void) => {
    callback({
      getIdToken: jest.fn().mockResolvedValue('token-123'),
    });
    return () => {};
  },
}));

describe('Profile page notifications toggle', () => {
  const theme = {
    colors: {
      muted: '#666',
      error: '#c00',
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
    (global as any).fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        data: {
          userId: 'u1',
          displayName: 'Test User',
          email: 'test@example.com',
          tier: 'free',
          preferences: {
            notifications: true,
            currency: 'USD',
            timezone: 'UTC',
          },
        },
      }),
    });
  });

  test('toggles notifications when input is clicked', async () => {
    const mod = await import('../../app/profile/page');
    const ProfilePage = mod.default;

    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        React.createElement(
          ThemeProvider as any,
          { theme },
          React.createElement(ProfilePage),
        ),
      );
    });

    await act(async () => {
      await Promise.resolve();
    });

    const notificationsInput = container.querySelector('#notifications') as HTMLInputElement;
    expect(notificationsInput).toBeTruthy();
    expect(notificationsInput.value).toBe('Enabled');

    await act(async () => {
      notificationsInput.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect((container.querySelector('#notifications') as HTMLInputElement).value).toBe('Disabled');

    await act(async () => {
      root.unmount();
    });
    container.remove();
  });
});
