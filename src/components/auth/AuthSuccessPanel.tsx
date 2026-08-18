import { useEffect, useRef } from "react";
import { CircleCheck } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Shared success state for ResetPassword / PasswordChangeRequired: a
 * CircleCheck heading (focus-managed for screen-reader/keyboard users),
 * body copy, and a single CTA. Not used by ForgotPassword, which shows its
 * success state as an InlineNotification instead of this pattern.
 */
export function AuthSuccessPanel({
  titleId,
  title,
  body,
  ctaLabel,
  onCta,
}: {
  titleId: string;
  title: string;
  body: string;
  ctaLabel: string;
  onCta: () => void;
}) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    // This component only mounts once the success state is entered, so
    // focusing on mount is equivalent to the old useEffect([succeeded]).
    headingRef.current?.focus();
  }, []);

  return (
    <div className="space-y-6">
      <div role="status" className="space-y-4">
        <h1
          id={titleId}
          ref={headingRef}
          tabIndex={-1}
          className="flex items-center gap-2 text-base font-semibold leading-6 text-neutral-900 dark:text-neutral-100 outline-none"
        >
          <CircleCheck
            className="size-6 shrink-0 text-emerald-500 dark:text-emerald-400"
            aria-hidden="true"
          />
          {title}
        </h1>
        <p className="text-[13px] leading-4 text-neutral-500 dark:text-neutral-400">{body}</p>
      </div>
      <Button type="button" size="xs" className="w-full" onClick={onCta}>
        {ctaLabel}
      </Button>
    </div>
  );
}
