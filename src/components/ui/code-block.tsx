import { Highlight, themes, type Language } from "prism-react-renderer";
import { useIntl } from "react-intl";

import { CopyButton } from "@/components/ui/copy-button";
import { cn } from "@/lib/utils";

export type CodeBlockLanguage = "bash" | "json" | "python" | "tsx" | "markdown" | "xml" | "text";

export interface CodeBlockProps {
  code: string;
  language: CodeBlockLanguage;
  /** Accessible label for the Copy button. Defaults to a generic "Copy code". */
  copyLabel?: string;
  /** Hide the built-in Copy affordance. */
  hideCopy?: boolean;
  className?: string;
  /** Pre-element padding override (defaults to p-4). */
  padding?: string;
}

const TOKEN_LANGUAGE: Record<CodeBlockLanguage, Language> = {
  bash: "bash",
  json: "json",
  python: "python",
  tsx: "tsx",
  markdown: "markdown",
  xml: "xml",
  // No "text" Prism grammar is registered — falls back to unhighlighted
  // tokens, same as "bash" does today, which is what raw text content wants.
  text: "text",
};

/**
 * Always-dark monospace code block with prism-react-renderer syntax
 * highlighting. Use anywhere a `<pre><code>` snippet appears in the UI;
 * code blocks are intentionally dark in light mode too (a common docs/IDE
 * convention).
 *
 * Token coloring comes from the `vsDark` theme; that pairs reasonably well
 * with the rewrite's neutral-900/950 backgrounds without per-token overrides.
 */
export function CodeBlock({
  code,
  language,
  copyLabel,
  hideCopy = false,
  className,
  padding = "p-4",
}: CodeBlockProps) {
  const intl = useIntl();
  const prismLanguage = TOKEN_LANGUAGE[language];
  const ariaLabel = copyLabel ?? intl.formatMessage({ id: "common.copyCode" });

  return (
    <div className={cn("relative", className)}>
      <Highlight code={code} language={prismLanguage} theme={themes.vsDark}>
        {({ className: prismClassName, style, tokens, getLineProps, getTokenProps }) => (
          <pre
            className={cn(
              "max-h-[420px] overflow-auto rounded-md border border-border bg-neutral-900 font-mono text-[12px] leading-relaxed dark:bg-neutral-950",
              padding,
              !hideCopy && "pr-12",
              prismClassName,
            )}
            style={style}
          >
            <code>
              {tokens.map((line, i) => {
                // prism-react-renderer types `key` loosely as `{}`; strip it
                // out of the spread so React uses our map index instead.
                const { key: _lineKey, ...lineRest } = getLineProps({ line });
                return (
                  <div key={i} {...lineRest}>
                    {line.map((token, j) => {
                      const { key: _tokenKey, ...tokenRest } = getTokenProps({ token });
                      return <span key={j} {...tokenRest} />;
                    })}
                  </div>
                );
              })}
            </code>
          </pre>
        )}
      </Highlight>
      {!hideCopy && (
        <div className="absolute right-2 top-2">
          <CopyButton
            value={code}
            label={ariaLabel}
            className="size-7 text-neutral-400 hover:bg-neutral-800 hover:text-neutral-100"
          />
        </div>
      )}
    </div>
  );
}
