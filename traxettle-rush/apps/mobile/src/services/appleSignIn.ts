import { Platform } from 'react-native';
import * as AppleAuthentication from 'expo-apple-authentication';
import * as Crypto from 'expo-crypto';

export interface AppleSignInResult {
  identityToken: string;
  /** Sent to our API, which checks Apple's token carries its SHA-256 (so a token can't be replayed). */
  rawNonce: string;
  /** Apple shares the name only on the first authorization; null afterwards. */
  fullName: string | null;
}

/** Sign in with Apple is offered on iOS devices that support it. */
export async function isAppleSignInAvailable(): Promise<boolean> {
  if (Platform.OS !== 'ios') return false;
  try {
    return await AppleAuthentication.isAvailableAsync();
  } catch {
    return false;
  }
}

const isCancel = (err: any) => err?.code === 'ERR_REQUEST_CANCELED' || err?.code === 'ERR_CANCELED';

/** Shows Apple's sign-in sheet. Returns null if the person cancels it. */
export async function requestAppleSignIn(): Promise<AppleSignInResult | null> {
  const rawNonce = Crypto.randomUUID();
  const hashedNonce = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, rawNonce);
  try {
    const credential = await AppleAuthentication.signInAsync({
      requestedScopes: [
        AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
        AppleAuthentication.AppleAuthenticationScope.EMAIL,
      ],
      nonce: hashedNonce,
    });
    if (!credential.identityToken) throw new Error('Apple did not return an identity token');
    const name = [credential.fullName?.givenName, credential.fullName?.familyName].filter(Boolean).join(' ').trim();
    return { identityToken: credential.identityToken, rawNonce, fullName: name || null };
  } catch (err) {
    if (isCancel(err)) return null;
    throw err;
  }
}

/**
 * Asks Apple again, at account deletion, for a fresh authorization code, which our API uses to
 * revoke the Sign in with Apple authorization (Apple requires it). Returns null if cancelled.
 */
export async function requestAppleAuthorizationCode(): Promise<string | null> {
  try {
    const credential = await AppleAuthentication.signInAsync({ requestedScopes: [] });
    return credential.authorizationCode || null;
  } catch (err) {
    if (isCancel(err)) return null;
    throw err;
  }
}
