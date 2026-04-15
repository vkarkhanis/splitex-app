export const PASSWORD_RULE_MESSAGE =
  'Use at least 8 characters with uppercase, lowercase, and a number.';

export function isStrongPassword(password: string): boolean {
  return /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/.test(password);
}
