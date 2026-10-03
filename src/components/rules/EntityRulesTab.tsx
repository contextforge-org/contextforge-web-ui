import { useState } from "react";
import { useIntl } from "react-intl";
import { toast } from "sonner";
import { Plus } from "lucide-react";

import { rulesApi, type CapabilityType, type EntityRulesSummary, type RbacRule } from "@/api/rules";
import { RuleDeleteDialog } from "@/components/rules/RuleDeleteDialog";
import { RuleForm } from "@/components/rules/RuleForm";
import { RulesTable } from "@/components/rules/RulesTable";
import { Button } from "@/components/ui/button";
import { useQuery } from "@/hooks/useQuery";
import { ApiError } from "@/api/client";
import { extractApiErrorDetail } from "@/utils/errors";
import { useAuthContext } from "@/auth/AuthContext";

interface EntityRulesTabProps {
  capabilityType: CapabilityType;
  capabilityId: string;
}

export function EntityRulesTab({ capabilityType, capabilityId }: EntityRulesTabProps) {
  const intl = useIntl();
  const { hasPermission } = useAuthContext();
  const canManage = hasPermission("rbac.rules.manage");
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<RbacRule | null>(null);
  const [deleting, setDeleting] = useState<RbacRule | null>(null);
  const [refetchKey, setRefetchKey] = useState(0);

  const { data, isLoading } = useQuery<EntityRulesSummary>(
    refetchKey >= 0
      ? `/rbac/rules/entity-summary?capability_type=${capabilityType}&capability_id=${encodeURIComponent(capabilityId)}`
      : null,
  );
  const summary: EntityRulesSummary = data ?? { rules: [], inherited: [], defaults: {} };

  const refresh = () => setRefetchKey((k) => k + 1);

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
    <div className="space-y-6" data-testid={`entity-rules-${capabilityType}`}>
      <p className="text-sm text-muted-foreground">
        {intl.formatMessage({ id: "rules.layerNote" })}
      </p>

      <section aria-label={intl.formatMessage({ id: "rules.entity.title" })} className="space-y-2">
        <div className="flex items-center justify-between">
          <h4 className="text-sm font-semibold">
            {intl.formatMessage({ id: "rules.entity.title" })}
          </h4>
          {canManage && (
            <Button
              size="sm"
              onClick={() => {
                setEditing(null);
                setFormOpen(true);
              }}
            >
              <Plus className="size-4" />
              {intl.formatMessage({ id: "rules.create" })}
            </Button>
          )}
        </div>
        <RulesTable
          rules={summary.rules}
          isLoading={isLoading}
          readOnly={!canManage}
          onEdit={(rule) => {
            setEditing(rule);
            setFormOpen(true);
          }}
          onDelete={setDeleting}
          onActiveChange={async (rule, isActive) => {
            try {
              await rulesApi.update(rule.id, { is_active: isActive });
              refresh();
            } catch (err) {
              toast.error((err instanceof ApiError ? extractApiErrorDetail(err.body) : null) ?? "");
            }
          }}
        />
      </section>

      <section
        aria-label={intl.formatMessage({ id: "rules.inherited.title" })}
        className="space-y-2"
      >
        <h4 className="text-sm font-semibold">
          {intl.formatMessage({ id: "rules.inherited.title" })}
        </h4>
        <p className="text-xs text-muted-foreground">
          {intl.formatMessage({ id: "rules.inherited.description" })}
        </p>
        <RulesTable rules={summary.inherited} isLoading={isLoading} readOnly />
      </section>

      <details>
        <summary className="cursor-pointer text-sm font-semibold">
          {intl.formatMessage({ id: "rules.defaults.title" })}
        </summary>
        <dl className="mt-2 space-y-1 text-sm">
          {Object.entries(summary.defaults).map(([role, permissions]) => (
            <div key={role} className="flex gap-2">
              <dt className="font-mono text-xs">{role}</dt>
              <dd className="text-muted-foreground">{permissions.join(", ") || "—"}</dd>
            </div>
          ))}
          {Object.keys(summary.defaults).length === 0 && (
            <p className="text-xs text-muted-foreground">
              {intl.formatMessage({ id: "rules.empty.title" })}
            </p>
          )}
        </dl>
      </details>

      <RuleForm
        open={formOpen}
        rule={editing}
        capabilityType={capabilityType}
        capabilityId={capabilityId}
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
    </div>
  );
}
