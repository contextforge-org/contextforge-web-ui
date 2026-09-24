// Shared vectors for validateDestination (this package) and
// server/src/routes/auth/sso-login.ts's safeReturnTo -- keeps both in sync.

export interface RedirectValidationVector {
  next: string;
  expected: string;
}

export const REDIRECT_VALIDATION_VECTORS: RedirectValidationVector[] = [
  { next: "/app/tools", expected: "/app/tools" },
  { next: "/app/tools?page=2", expected: "/app/tools?page=2" },
  { next: "/app", expected: "/app" },
  { next: "/app/", expected: "/app/" },
  { next: "https://evil.example.com", expected: "/app/" },
  { next: "//evil.example.com", expected: "/app/" },
  { next: "/app/../admin", expected: "/app/" },
  { next: "/admin", expected: "/app/" },
  { next: "/app/login", expected: "/app/" },
  { next: "/app/login?next=%2Fapp%2Ftools", expected: "/app/" },
  { next: "/appx", expected: "/app/" },
  { next: "/app?x=//evil.com", expected: "/app?x=//evil.com" },
  { next: "/app/%2e%2e/admin", expected: "/app/%2e%2e/admin" },
];
