/**
 * Google sign-in on the login screen. Since google-signin 13, closing the account picker resolves
 * `{ type: 'cancelled' }` instead of throwing SIGN_IN_CANCELLED, so the screen must treat it as a
 * quiet no-op rather than as a missing ID token.
 */
import React from 'react';
import { act, create, ReactTestInstance, ReactTestRenderer } from 'react-test-renderer';

jest.mock('react-native', () => {
  const R = require('react');
  const host = (name: string) => (props: any) => R.createElement(name, props, props.children);
  return {
    View: host('View'),
    Text: host('Text'),
    TextInput: host('TextInput'),
    TouchableOpacity: host('TouchableOpacity'),
    ActivityIndicator: host('ActivityIndicator'),
    KeyboardAvoidingView: host('KeyboardAvoidingView'),
    Pressable: host('Pressable'),
    Platform: { OS: 'ios' },
    Alert: { alert: jest.fn() },
    StyleSheet: { create: (s: any) => s },
  };
});
jest.mock('../../context/ThemeContext', () => ({
  useTheme: () => ({ theme: { colors: new Proxy({}, { get: () => '#123456' }) } }),
}));
const mockLoginWithGoogle = jest.fn();
jest.mock('../../context/AuthContext', () => ({
  useAuth: () => ({ login: jest.fn(), loginWithGoogle: mockLoginWithGoogle, sendEmailLinkSignIn: jest.fn() }),
}));
jest.mock('../../context/FeedbackContext', () => ({ useFeedback: () => ({ pushToast: jest.fn() }) }));
jest.mock('../../api', () => ({ api: { post: jest.fn() }, isStagingModeEnabled: async () => false }));
jest.mock('../../config/env', () => ({ ENV: { GOOGLE_WEB_CLIENT_ID: 'web-client.apps.googleusercontent.com' } }));
jest.mock('../../components/PasswordInput', () => () => null);
jest.mock('../../components/AppleSignInButton', () => ({
  __esModule: true,
  default: () => null,
  useAppleSignInAvailable: () => false,
}));
jest.mock('../../services/environment-switch', () => ({ switchEnvironmentAndRebootstrap: jest.fn() }));
const mockSignIn = jest.fn();
jest.mock('@react-native-google-signin/google-signin', () => ({
  GoogleSignin: { signIn: () => mockSignIn(), signOut: jest.fn(async () => null), hasPlayServices: jest.fn(async () => true) },
  // Mirrors the library's helper (v13+).
  isCancelledResponse: (response: any) => response?.type === 'cancelled',
  statusCodes: { SIGN_IN_CANCELLED: 'SIGN_IN_CANCELLED', IN_PROGRESS: 'IN_PROGRESS', PLAY_SERVICES_NOT_AVAILABLE: 'PLAY_SERVICES_NOT_AVAILABLE' },
}));

import { Alert } from 'react-native';
import LoginScreen from '../../screens/LoginScreen';

function textOf(node: ReactTestInstance): string {
  return node.children.map((child) => (typeof child === 'string' ? child : textOf(child))).join('');
}

async function pressGoogle(): Promise<void> {
  let tree!: ReactTestRenderer;
  await act(async () => {
    tree = create(<LoginScreen navigation={{ navigate: jest.fn() }} />);
  });
  const button = tree.root.findAll(
    (node) => (node.type as unknown) === 'Pressable' && textOf(node) === 'Sign in with Google',
  )[0];
  expect(button).toBeDefined();
  await act(async () => {
    await button.props.onPress();
  });
}

describe('LoginScreen Google sign-in', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('does nothing when the user closes the Google account picker', async () => {
    mockSignIn.mockResolvedValue({ type: 'cancelled', data: null });
    await pressGoogle();
    expect(mockLoginWithGoogle).not.toHaveBeenCalled();
    expect(Alert.alert).not.toHaveBeenCalled();
  });

  it('signs in with the ID token from a successful response', async () => {
    mockSignIn.mockResolvedValue({ type: 'success', data: { idToken: 'google-id-token' } });
    await pressGoogle();
    expect(mockLoginWithGoogle).toHaveBeenCalledWith('google-id-token');
    expect(Alert.alert).not.toHaveBeenCalled();
  });
});
