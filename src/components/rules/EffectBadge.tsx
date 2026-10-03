import { useIntl } from "react-intl";

import { Badge } from "@/components/ui/badge";
import type { RuleEffect } from "@/api/rules";

interface EffectBadgeProps {
  effect: RuleEffect;
}

export function EffectBadge({ effect }: EffectBadgeProps) {
  const intl = useIntl();
  return (
    <Badge
      variant={effect === "deny" ? "destructive" : "secondary"}
      data-testid={`rule-effect-${effect}`}
    >
      {intl.formatMessage({ id: effect === "deny" ? "rules.effect.deny" : "rules.effect.allow" })}
    </Badge>
  );
}
