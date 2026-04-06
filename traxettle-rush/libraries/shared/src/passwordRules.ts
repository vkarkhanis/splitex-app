export const PASSWORD_RULE_MESSAGE =
  'Use at least 8 characters with uppercase, lowercase, and a number.';

const PASSWORD_RULE_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/;

export function isStrongPassword(password: string): boolean {
  return PASSWORD_RULE_REGEX.test(password);
}
