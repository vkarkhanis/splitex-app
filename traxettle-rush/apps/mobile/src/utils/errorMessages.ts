const FIREBASE_ERROR_MAP: Record<string, string> = {
  'auth/account-exists-with-different-credential': 'An account already exists with this email using a different sign-in method.',
  'auth/email-already-in-use': 'This email is already registered. Please sign in instead.',
  'auth/invalid-email': 'The email address is not valid.',
  'auth/invalid-credential': 'Invalid email or password. Please check your credentials and try again.',
  'auth/network-request-failed': 'Network error. Please check your internet connection and try again.',
  'auth/popup-closed-by-user': 'Sign-in was cancelled. Please try again when ready.',
  'auth/popup-blocked': 'The sign-in popup was blocked. Please allow popups and try again.',
  'auth/too-many-requests': 'Too many attempts. Please wait a few minutes before trying again.',
  'auth/user-disabled': 'This account has been disabled. Please contact support.',
  'auth/user-not-found': 'No account was found with that email address.',
  'auth/weak-password': 'Password is too weak. Use at least 8 characters with uppercase, lowercase, and a number.',
  'auth/wrong-password': 'Incorrect password. Please try again or use Forgot Password.',
};

const MESSAGE_PATTERNS: Array<[RegExp, string]> = [
  [/email address is already in use by another account/i, 'This email is already linked to another sign-in method. Please use that method to sign in.'],
  [/google sign-in failed/i, 'Google sign-in could not be completed. Please try again.'],
  [/failed to fetch/i, 'Unable to connect to the server. Please try again in a moment.'],
  [/network\s*(error|request\s*failed)/i, 'Network error. Please check your internet connection and try again.'],
  [/timeout/i, 'The request timed out. Please try again.'],
  [/unable to reach server/i, 'Unable to reach the server. Please try again later.'],
];

export function toUserFriendlyError(error: unknown): string {
  if (!error) return 'Something went wrong. Please try again.';

  if (typeof error === 'object' && error !== null && 'code' in error) {
    const code = String((error as { code?: unknown }).code || '');
    if (FIREBASE_ERROR_MAP[code]) {
      return FIREBASE_ERROR_MAP[code];
    }
  }

  const message =
    typeof error === 'string'
      ? error
      : error instanceof Error
        ? error.message
        : typeof error === 'object' && error !== null && 'message' in error
          ? String((error as { message?: unknown }).message || '')
          : '';

  const firebaseCodeMatch = message.match(/\(auth\/[^)]+\)/);
  if (firebaseCodeMatch) {
    const code = firebaseCodeMatch[0].slice(1, -1);
    if (FIREBASE_ERROR_MAP[code]) {
      return FIREBASE_ERROR_MAP[code];
    }
  }

  for (const [pattern, friendly] of MESSAGE_PATTERNS) {
    if (pattern.test(message)) {
      return friendly;
    }
  }

  if (
    message.includes('TypeError') ||
    message.includes('SyntaxError') ||
    message.startsWith('Cannot ') ||
    message.length > 200
  ) {
    return 'Something went wrong. Please try again.';
  }

  return message || 'Something went wrong. Please try again.';
}
