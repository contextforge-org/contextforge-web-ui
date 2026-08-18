import type { ReactNode } from "react";

/**
 * Shared <main>/<section> chrome for the auth pages (ForgotPassword,
 * ResetPassword, PasswordChangeRequired). `compact` switches to the
 * narrower/rounder success-panel sizing used once a page's success state is
 * entered.
 */
export function AuthCard({
  titleId,
  compact = false,
  children,
}: {
  titleId: string;
  compact?: boolean;
  children: ReactNode;
}) {
  return (
    <main className="min-h-screen flex items-center justify-center bg-neutral-50 dark:bg-neutral-900 px-4">
      <section
        className={`w-full bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 shadow-sm ${
          compact ? "max-w-[400px] rounded-xl p-6" : "max-w-sm rounded-lg p-8"
        }`}
        aria-labelledby={titleId}
      >
        {children}
      </section>
    </main>
  );
}
