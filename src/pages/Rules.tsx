import { useState } from "react";
import { useQuery } from "@/hooks/useQuery";
import { useIntl } from "react-intl";
import { toast } from "sonner";
import { Plus } from "lucide-react";

import { rulesApi, type RbacRule } from "@/api/rules";
import { RuleDeleteDialog } from "@/components/rules/RuleDeleteDialog";
import { RuleForm } from "@/components/rules/RuleForm";
import { RulesTable } from "@/components/rules/RulesTable";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ApiError } from "@/api/client";
import { extractApiErrorDetail } from "@/utils/errors";

const ALL_CAPABILITIES = "all";

export function Rules() {
  const intl = useIntl();
  const [capabilityFilter, setCapabilityFilter] = useState<string>(ALL_CAPABILITIES);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<RbacRule | null>(null);
  const [deleting, setDeleting] = useState<RbacRule | null>(null);
  const [refetchKey, setRefetchKey] = useState(0);

  const query = capabilityFilter === ALL_CAPABILITIES ? "" : `?capability_type=${capabilityFilter}`;
  // The query re-runs when the filter or the mutation counter changes.
  const { data, isLoading, error } = useQuery<RbacRule[]>(
    refetchKey >= 0 ? `/rbac/rules${query}` : null,
  );
  const rules = data ?? [];

  const refresh = () => setRefetchKey((k) => k + 1);

  const handleActiveChange = async (rule: RbacRule, isActive: boolean) => {
    try {
      await rulesApi.update(rule.id, { is_active: isActive });
      toast.success(intl.formatMessage({ id: "rules.title" }), { description: rule.name });
      refresh();
    } catch (err) {
      toast.error((err instanceof ApiError ? extractApiErrorDetail(err.body) : null) ?? "");
    }
  };

  const handleDelete = async () => {
    if (!deleting) return;
    const rule = deleting;
    setDeleting(null);
    try {
      await rulesApi.remove(rule.id);
      toast.success(intl.formatMessage({ id: "rules.delete" }), { description: rule.name });
      refresh();
    } catch (err) {
      toast.error((err instanceof ApiError ? extractApiErrorDetail(err.body) : null) ?? "");
    }
  };

  return (
    <section aria-label={intl.formatMessage({ id: "rules.title" })} className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <p className="text-sm text-muted-foreground">
          {intl.formatMessage({ id: "rules.description" })}
        </p>
        <div className="flex items-center gap-2">
          <Select value={capabilityFilter} onValueChange={setCapabilityFilter}>
            <SelectTrigger
              className="w-40"
              aria-label={intl.formatMessage({ id: "rules.form.capabilityType" })}
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_CAPABILITIES}>
                {intl.formatMessage({ id: "rules.capability.route" })} · *
              </SelectItem>
              {(
                ["tool", "resource", "prompt", "server", "gateway", "a2a_agent", "route"] as const
              ).map((c) => (
                <SelectItem key={c} value={c}>
                  {intl.formatMessage({ id: `rules.capability.${c}` })}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            onClick={() => {
              setEditing(null);
              setFormOpen(true);
            }}
          >
            <Plus className="size-4" />
            {intl.formatMessage({ id: "rules.create" })}
          </Button>
        </div>
      </div>

      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {(error instanceof ApiError ? extractApiErrorDetail(error.body) : null) ?? ""}
        </p>
      ) : (
        <RulesTable
          rules={rules}
          isLoading={isLoading}
          onEdit={(rule) => {
            setEditing(rule);
            setFormOpen(true);
          }}
          onDelete={setDeleting}
          onActiveChange={handleActiveChange}
        />
      )}

      <RuleForm
        open={formOpen}
        rule={editing}
        onOpenChange={(open) => {
          setFormOpen(open);
          if (!open) setEditing(null);
        }}
        onSaved={refresh}
      />
      <RuleDeleteDialog
        rule={deleting}
        onCancel={() => setDeleting(null)}
        onConfirm={handleDelete}
      />
    </section>
  );
}
