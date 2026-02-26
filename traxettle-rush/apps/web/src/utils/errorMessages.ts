/**
 * Maps raw error messages and Firebase error codes to user-friendly messages.
 */

const FIREBASE_ERROR_MAP: Record<string, string> = {
  'auth/invalid-phone-number': 'The phone number format is invalid. Please use the format +[country code][number].',
  'auth/too-many-requests': 'Too many attempts. Please wait a few minutes before trying again.',
  'auth/quota-exceeded': 'SMS quota exceeded. Please try again later or use a different sign-in method.',
  'auth/captcha-check-failed': 'Security verification failed. Please refresh the page and try again.',
  'auth/missing-phone-number': 'Please enter a valid phone number.',
  'auth/invalid-verification-code': 'The verification code is incorrect. Please check and try again.',
  'auth/code-expired': 'The verification code has expired. Please request a new one.',
  'auth/invalid-verification-id': 'Your verification session has expired. Please request a new code.',
  'auth/popup-closed-by-user': 'Sign-in was cancelled. Please try again when ready.',
  'auth/cancelled-popup-request': 'Only one sign-in popup can be open at a time.',
  'auth/popup-blocked': 'The sign-in popup was blocked by your browser. Please allow popups for this site.',
  'auth/account-exists-with-different-credential': 'An account already exists with this email using a different sign-in method.',
  'auth/email-already-in-use': 'This email is already registered. Please sign in instead.',
  'auth/weak-password': 'Password is too weak. Please use at least 6 characters.',
  'auth/invalid-email': 'The email address is not valid.',
  'auth/user-disabled': 'This account has been disabled. Please contact support.',
  'auth/user-not-found': 'No account found with this email. Please check the address or register a new account.',
  'auth/wrong-password': 'Incorrect password. Please try again or use "Forgot password?" to reset it.',
  'auth/invalid-credential': 'Invalid email or password. Please check your credentials and try again.',
  'auth/network-request-failed': 'Network error. Please check your internet connection and try again.',
  'auth/internal-error': 'An unexpected error occurred. Please try again.',
  'auth/operation-not-allowed': 'This sign-in method is not enabled. Please contact support.',
};

const NETWORK_ERROR_PATTERNS: Array<[RegExp, string]> = [
  [/failed to fetch/i, 'Unable to connect to the server. Please check your internet connection or try again later.'],
  [/network\s*(error|request\s*failed)/i, 'Network error. Please check your internet connection and try again.'],
  [/timeout/i, 'The request timed out. Please try again.'],
  [/ERR_CONNECTION_REFUSED/i, 'Unable to reach the server. Please try again later.'],
  [/load failed/i, 'Unable to connect to the server. Please check your internet connection or try again later.'],
];

export function toUserFriendlyError(error: unknown): string {
  if (!error) return 'Something went wrong. Please try again.';

  // Firebase errors have a `code` property
  if (typeof error === 'object' && error !== null && 'code' in error) {
    const code = (error as { code: string }).code;
    if (FIREBASE_ERROR_MAP[code]) {
      return FIREBASE_ERROR_MAP[code];
    }
  }

  // Extract message string
  const message =
    typeof error === 'string'
      ? error
      : error instanceof Error
        ? error.message
        : typeof error === 'object' && error !== null && 'message' in error
          ? String((error as { message: unknown }).message)
          : '';

  // Check Firebase error code embedded in message (e.g. "Firebase: Error (auth/xxx)")
  const firebaseCodeMatch = message.match(/\(auth\/[^)]+\)/);
  if (firebaseCodeMatch) {
    const code = firebaseCodeMatch[0].slice(1, -1); // remove parens
    if (FIREBASE_ERROR_MAP[code]) {
      return FIREBASE_ERROR_MAP[code];
    }
  }

  // Check network error patterns
  for (const [pattern, friendlyMessage] of NETWORK_ERROR_PATTERNS) {
    if (pattern.test(message)) {
      return friendlyMessage;
    }
  }

  // If the message looks like a system/technical error, replace it
  if (
    message.includes('TypeError') ||
    message.includes('SyntaxError') ||
    message.includes('ReferenceError') ||
    message.includes('Unexpected token') ||
    message.startsWith('Cannot ') ||
    message.length > 200
  ) {
    return 'Something went wrong. Please try again.';
  }

  // Return the message if it looks user-readable, otherwise generic
  return message || 'Something went wrong. Please try again.';
}
