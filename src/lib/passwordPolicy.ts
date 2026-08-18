// Shared 3-of-4-character-class password complexity check, used by
// ResetPassword.tsx and PasswordChangeRequired.tsx so the policy can't drift
// between the two forms.
const CHARACTER_CLASS_PATTERNS = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/];
export const MIN_PASSWORD_CHARACTER_CLASSES = 3;

export function countPasswordCharacterClasses(password: string): number {
  return CHARACTER_CLASS_PATTERNS.filter((pattern) => pattern.test(password)).length;
}
