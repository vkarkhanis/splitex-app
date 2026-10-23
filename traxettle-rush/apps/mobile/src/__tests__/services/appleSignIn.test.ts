const mockSignInAsync = jest.fn();
const mockIsAvailableAsync = jest.fn();

jest.mock('expo-apple-authentication', () => ({
  signInAsync: (...args: unknown[]) => mockSignInAsync(...args),
  isAvailableAsync: (...args: unknown[]) => mockIsAvailableAsync(...args),
  AppleAuthenticationScope: { FULL_NAME: 0, EMAIL: 1 },
}));

jest.mock('expo-crypto', () => ({
  randomUUID: jest.fn(() => 'raw-nonce'),
  digestStringAsync: jest.fn(async (_algorithm: string, data: string) => `sha256(${data})`),
  CryptoDigestAlgorithm: { SHA256: 'SHA-256' },
}));

import { Platform } from 'react-native';
import {
  isAppleSignInAvailable,
  requestAppleAuthorizationCode,
  requestAppleSignIn,
} from '../../services/appleSignIn';

const cancelled = Object.assign(new Error('The user canceled the authorization attempt'), { code: 'ERR_REQUEST_CANCELED' });

describe('appleSignIn', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (Platform as { OS: string }).OS = 'ios';
  });

  describe('isAppleSignInAvailable', () => {
    it('asks the device on iOS', async () => {
      mockIsAvailableAsync.mockResolvedValue(true);
      await expect(isAppleSignInAvailable()).resolves.toBe(true);
    });

    it('is never offered on Android', async () => {
      (Platform as { OS: string }).OS = 'android';
      await expect(isAppleSignInAvailable()).resolves.toBe(false);
      expect(mockIsAvailableAsync).not.toHaveBeenCalled();
    });

    it('treats an error as unavailable', async () => {
      mockIsAvailableAsync.mockRejectedValue(new Error('boom'));
      await expect(isAppleSignInAvailable()).resolves.toBe(false);
    });
  });

  describe('requestAppleSignIn', () => {
    it('sends Apple the hashed nonce and returns the raw one for the server to check', async () => {
      mockSignInAsync.mockResolvedValue({
        identityToken: 'apple-id-token',
        fullName: { givenName: 'Ann', familyName: 'Lee' },
      });

      await expect(requestAppleSignIn()).resolves.toEqual({
        identityToken: 'apple-id-token',
        rawNonce: 'raw-nonce',
        fullName: 'Ann Lee',
      });
      expect(mockSignInAsync).toHaveBeenCalledWith({ requestedScopes: [0, 1], nonce: 'sha256(raw-nonce)' });
    });

    it('returns a null name when Apple shares none (every sign-in after the first)', async () => {
      mockSignInAsync.mockResolvedValue({ identityToken: 't', fullName: { givenName: null, familyName: null } });
      await expect(requestAppleSignIn()).resolves.toEqual(expect.objectContaining({ fullName: null }));
    });

    it('returns null when the person cancels', async () => {
      mockSignInAsync.mockRejectedValue(cancelled);
      await expect(requestAppleSignIn()).resolves.toBeNull();
    });

    it('passes on other failures', async () => {
      mockSignInAsync.mockRejectedValue(Object.assign(new Error('failed'), { code: 'ERR_REQUEST_FAILED' }));
      await expect(requestAppleSignIn()).rejects.toThrow('failed');
    });

    it('fails if Apple returns no identity token', async () => {
      mockSignInAsync.mockResolvedValue({ identityToken: null, fullName: null });
      await expect(requestAppleSignIn()).rejects.toThrow('did not return an identity token');
    });
  });

  describe('requestAppleAuthorizationCode', () => {
    it('returns a fresh authorization code', async () => {
      mockSignInAsync.mockResolvedValue({ authorizationCode: 'auth-code' });
      await expect(requestAppleAuthorizationCode()).resolves.toBe('auth-code');
      expect(mockSignInAsync).toHaveBeenCalledWith({ requestedScopes: [] });
    });

    it('returns null when the person cancels', async () => {
      mockSignInAsync.mockRejectedValue(cancelled);
      await expect(requestAppleAuthorizationCode()).resolves.toBeNull();
    });
  });
});
