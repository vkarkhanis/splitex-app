import React from 'react';
import { act, create, ReactTestRenderer } from 'react-test-renderer';

const mockInitializeApp = jest.fn();
const mockPushToast = jest.fn();
const mockAuthProvider = jest.fn(({ children }: { children: React.ReactNode }) => <>{children}</>);
const mockUseAuth = jest.fn(() => ({
  user: null,
  loading: false,
  pinSetupRequired: false,
  sessionLocked: false,
}));

jest.mock('react-native', () => {
  const React = require('react');
  return {
    Platform: { OS: 'ios' },
    AppState: {
      addEventListener: jest.fn(() => ({
        remove: jest.fn(),
      })),
    },
    Linking: {
      getInitialURL: jest.fn(async () => null),
      addEventListener: jest.fn(() => ({
        remove: jest.fn(),
      })),
    },
    View: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
    Text: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
    Pressable: ({
      children,
      onPress,
    }: {
      children?: React.ReactNode | ((state: { pressed: boolean }) => React.ReactNode);
      onPress?: () => void;
    }) => <>{typeof children === 'function' ? children({ pressed: false }) : children}</>,
    ActivityIndicator: () => null,
  };
});

jest.mock('@react-navigation/native', () => ({
  NavigationContainer: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

jest.mock('@react-navigation/native-stack', () => ({
  createNativeStackNavigator: () => ({
    Navigator: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    Screen: () => null,
  }),
}));

jest.mock('expo-status-bar', () => ({
  StatusBar: () => null,
}));

jest.mock('react-native-safe-area-context', () => ({
  SafeAreaProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

jest.mock('@react-native-google-signin/google-signin', () => ({
  GoogleSignin: {
    configure: jest.fn(),
  },
}));

jest.mock('../index', () => ({
  initializeApp: (...args: unknown[]) => mockInitializeApp(...args),
}));

jest.mock('../api', () => ({
  isStagingModeEnabled: jest.fn(async () => false),
  setStagingModeEnabled: jest.fn(async () => {}),
}));

jest.mock('../context/AuthContext', () => ({
  AuthProvider: (props: { children: React.ReactNode }) => mockAuthProvider(props),
  useAuth: () => mockUseAuth(),
}));

jest.mock('../context/ThemeContext', () => ({
  ThemeProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useTheme: () => ({
    theme: {
      isDark: false,
      colors: {
        background: '#F8FAFC',
        primary: '#0F766E',
        surface: '#FFFFFF',
        text: '#0F172A',
        textSecondary: '#475569',
        black: '#000000',
      },
    },
  }),
}));

jest.mock('../context/PurchaseContext', () => ({
  PurchaseProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

jest.mock('../context/FeedbackContext', () => ({
  FeedbackProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useFeedback: () => ({
    pushToast: mockPushToast,
  }),
}));

jest.mock('../screens/LoginScreen', () => 'LoginScreen');
jest.mock('../screens/RegisterScreen', () => 'RegisterScreen');
jest.mock('../screens/DashboardScreen', () => 'DashboardScreen');
jest.mock('../screens/EventDetailScreen', () => 'EventDetailScreen');
jest.mock('../screens/CreateEventScreen', () => 'CreateEventScreen');
jest.mock('../screens/CreateExpenseScreen', () => 'CreateExpenseScreen');
jest.mock('../screens/EditExpenseScreen', () => 'EditExpenseScreen');
jest.mock('../screens/ProfileScreen', () => 'ProfileScreen');
jest.mock('../screens/InvitationsScreen', () => 'InvitationsScreen');
jest.mock('../screens/ForgotPasswordScreen', () => 'ForgotPasswordScreen');
jest.mock('../screens/ProUpgradeScreen', () => 'ProUpgradeScreen');
jest.mock('../screens/AllEventsScreen', () => 'AllEventsScreen');
jest.mock('../screens/ClosedEventsScreen', () => 'ClosedEventsScreen');
jest.mock('../screens/HelpScreen', () => 'HelpScreen');
jest.mock('../screens/AnalyticsScreen', () => 'AnalyticsScreen');
jest.mock('../screens/UnsettledPaymentsScreen', () => 'UnsettledPaymentsScreen');
jest.mock('../screens/SetupPinScreen', () => 'SetupPinScreen');
jest.mock('../screens/UnlockScreen', () => 'UnlockScreen');

import App from '../App';

describe('App bootstrap', () => {
  let renderer: ReactTestRenderer | null = null;

  const flush = async () => {
    await act(async () => {
      await Promise.resolve();
    });
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (global as unknown as { fetch: jest.Mock }).fetch = jest.fn(async () => ({ ok: true }));
  });

  afterEach(async () => {
    if (!renderer) return;
    await act(async () => {
      renderer?.unmount();
    });
    renderer = null;
  });

  it('waits for bootstrap before mounting auth providers', async () => {
    let resolveBootstrap: (() => void) | undefined;
    mockInitializeApp.mockReturnValue(
      new Promise<void>((resolve) => {
        resolveBootstrap = resolve;
      })
    );

    await act(async () => {
      renderer = create(<App />);
    });

    expect(mockInitializeApp).toHaveBeenCalledTimes(1);
    expect(mockAuthProvider).not.toHaveBeenCalled();
    expect(JSON.stringify(renderer?.toJSON())).toContain('Initializing Traxettle');

    await act(async () => {
      resolveBootstrap?.();
      await Promise.resolve();
    });

    expect(mockAuthProvider).toHaveBeenCalled();
  });

  it('shows an initialization error state when bootstrap fails', async () => {
    mockInitializeApp.mockRejectedValueOnce(new Error('boom'));

    await act(async () => {
      renderer = create(<App />);
      await Promise.resolve();
    });

    await flush();

    expect(mockAuthProvider).not.toHaveBeenCalled();
    expect(JSON.stringify(renderer?.toJSON())).toContain('App initialization failed');
  });
});
