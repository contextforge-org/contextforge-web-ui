// Shared 3-of-4-character-class password complexity check, used by
// ResetPassword.tsx and PasswordChangeRequired.tsx so the policy can't drift
// between the two forms.
//
// The "special character" class is an explicit ASCII punctuation set, not
// `/[^A-Za-z0-9]/` — that broader pattern also matches whitespace/control
// characters (so a trailing space would count) and non-ASCII letters (á, ñ,
// ç — which the other three classes already treat as neither upper- nor
// lowercase, so counting them here just double-credits the same character).
const CHARACTER_CLASS_PATTERNS = [/[a-z]/, /[A-Z]/, /\d/, /[!"#$%&'()*+,\-./:;<=>?@[\]^_`{|}~]/];
export const MIN_PASSWORD_CHARACTER_CLASSES = 3;

export function countPasswordCharacterClasses(password: string): number {
  return CHARACTER_CLASS_PATTERNS.filter((pattern) => pattern.test(password)).length;
}
