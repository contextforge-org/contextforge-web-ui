import { useIntl } from "react-intl";
import { Lock, MoreVertical, Pencil, Trash2 } from "lucide-react";

import type { CapabilityType, RbacRule } from "@/api/rules";
import { EffectBadge } from "./EffectBadge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Loading } from "@/components/ui/loading";
import { EmptyStatePlaceholder } from "@/components/dashboard/EmptyStatePlaceholder";

const CAPABILITY_ORDER: CapabilityType[] = [
  "tool",
  "resource",
  "prompt",
  "server",
  "gateway",
  "a2a_agent",
  "route",
];

interface RulesTableProps {
  rules: RbacRule[];
  isLoading: boolean;
  /** Hide row actions for read-only surfaces (inherited rules views). */
  readOnly?: boolean;
  onEdit?: (rule: RbacRule) => void;
  onDelete?: (rule: RbacRule) => void;
  onActiveChange?: (rule: RbacRule, isActive: boolean) => void;
}

export function RulesTable({
  rules,
  isLoading,
  readOnly = false,
  onEdit,
  onDelete,
  onActiveChange,
}: RulesTableProps) {
  const intl = useIntl();

  if (isLoading) {
    return (
      <div
        role="status"
        aria-live="polite"
        aria-busy="true"
        className="flex h-32 items-center justify-center"
      >
        <Loading variant="inline" />
        <span className="sr-only">{intl.formatMessage({ id: "rules.loading" })}</span>
      </div>
    );
  }

  if (rules.length === 0) {
    return <EmptyStatePlaceholder messageId="rules.empty.title" />;
  }

  return (
    <Table aria-label={intl.formatMessage({ id: "rules.title" })}>
      <TableHeader>
        <TableRow>
          <TableHead>{intl.formatMessage({ id: "rules.columns.name" })}</TableHead>
          <TableHead>{intl.formatMessage({ id: "rules.columns.capability" })}</TableHead>
          <TableHead>{intl.formatMessage({ id: "rules.columns.phase" })}</TableHead>
          <TableHead>{intl.formatMessage({ id: "rules.columns.predicate" })}</TableHead>
          <TableHead>{intl.formatMessage({ id: "rules.columns.effect" })}</TableHead>
          <TableHead className="text-right">
            {intl.formatMessage({ id: "rules.columns.priority" })}
          </TableHead>
          <TableHead>{intl.formatMessage({ id: "rules.columns.active" })}</TableHead>
          {!readOnly && <TableHead className="w-12" />}
        </TableRow>
      </TableHeader>
      <TableBody>
        {rules.map((rule) => (
          <TableRow key={rule.id} data-testid={`rule-row-${rule.name}`}>
            <TableCell className="font-medium">
              <span className="flex items-center gap-2">
                {rule.name}
                {rule.is_system && (
                  <span
                    title={intl.formatMessage({ id: "rules.systemRule" })}
                    aria-label={intl.formatMessage({ id: "rules.systemRule" })}
                  >
                    <Lock className="size-3.5 text-muted-foreground" />
                  </span>
                )}
              </span>
            </TableCell>
            <TableCell>
              {intl.formatMessage({ id: `rules.capability.${rule.capability_type}` })}
              {rule.capability_id
                ? `: ${rule.capability_id}`
                : rule.permission
                  ? ` · ${rule.permission}`
                  : ""}
            </TableCell>
            <TableCell>{intl.formatMessage({ id: `rules.phase.${rule.phase}` })}</TableCell>
            <TableCell>
              <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">
                {rule.predicate}
              </code>
            </TableCell>
            <TableCell>
              <EffectBadge effect={rule.effect} />
            </TableCell>
            <TableCell className="text-right">{rule.priority}</TableCell>
            <TableCell>
              <Switch
                checked={rule.is_active}
                disabled={readOnly || rule.is_system}
                onCheckedChange={(checked) => onActiveChange?.(rule, checked)}
                aria-label={intl.formatMessage({ id: "rules.columns.active" })}
              />
            </TableCell>
            {!readOnly && (
              <TableCell>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={intl.formatMessage({ id: "common.actions" })}
                    >
                      <MoreVertical className="size-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onSelect={() => onEdit?.(rule)} disabled={rule.is_system}>
                      <Pencil className="size-4" />
                      {intl.formatMessage({ id: "rules.edit" })}
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      className="text-destructive"
                      onSelect={() => onDelete?.(rule)}
                      disabled={rule.is_system}
                    >
                      <Trash2 className="size-4" />
                      {intl.formatMessage({ id: "rules.delete" })}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </TableCell>
            )}
          </TableRow>
        ))}
      </TableBody>
      <TableCaption>{intl.formatMessage({ id: "rules.layerNote" })}</TableCaption>
    </Table>
  );
}

export { CAPABILITY_ORDER };
