import { toUserFriendlyError } from '../../utils/errorMessages';

describe('toUserFriendlyError', () => {
  test('returns generic message for empty error', () => {
    expect(toUserFriendlyError(undefined)).toBe('Something went wrong. Please try again.');
  });

  test('maps firebase code from error object', () => {
    expect(toUserFriendlyError({ code: 'auth/invalid-email' })).toBe('The email address is not valid.');
  });

  test('maps firebase code embedded in message', () => {
    const error = new Error('Firebase: Error (auth/wrong-password).');
    expect(toUserFriendlyError(error)).toBe('Incorrect password. Please try again or use "Forgot password?" to reset it.');
  });

  test('maps network errors', () => {
    expect(toUserFriendlyError('Failed to fetch')).toBe(
      'Unable to connect to the server. Please check your internet connection or try again later.',
    );
  });

  test('hides technical system errors', () => {
    expect(toUserFriendlyError('TypeError: Cannot read properties of undefined')).toBe(
      'Something went wrong. Please try again.',
    );
  });

  test('returns readable user message as-is', () => {
    expect(toUserFriendlyError('Email or password is required')).toBe('Email or password is required');
  });

  test('reads message from non-Error object', () => {
    expect(toUserFriendlyError({ message: 'Please retry later' })).toBe('Please retry later');
  });

  test('returns generic for unknown object payload', () => {
    expect(toUserFriendlyError({ foo: 'bar' })).toBe('Something went wrong. Please try again.');
  });

  test('falls back to raw message when firebase code in text is unknown', () => {
    expect(toUserFriendlyError('Firebase: Error (auth/unknown-reason).')).toBe(
      'Firebase: Error (auth/unknown-reason).',
    );
  });

  test('maps representative errors snapshot', () => {
    expect([
      toUserFriendlyError({ code: 'auth/invalid-email' }),
      toUserFriendlyError('Failed to fetch'),
      toUserFriendlyError(new Error('Firebase: Error (auth/wrong-password).')),
      toUserFriendlyError('Email or password is required'),
    ]).toMatchSnapshot();
  });
});
