import { useEffect, useState } from "react";
import { useIntl } from "react-intl";
import { toast } from "sonner";
import { Plus, X } from "lucide-react";

import { toolAttributesApi } from "@/api/rules";
import { ApiError } from "@/api/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { extractApiErrorDetail } from "@/utils/errors";
import { useAuthContext } from "@/auth/AuthContext";

interface ForcedHeaderParamsProps {
  /** "gateway" or "server" */
  entityType: "gateway" | "server";
  entityId: string;
  /** Initial params from the entity record, if already loaded. */
  initialParams?: string[];
}

export function ForcedHeaderParams({
  entityType,
  entityId,
  initialParams,
}: ForcedHeaderParamsProps) {
  const intl = useIntl();
  const { hasPermission } = useAuthContext();
  const canManage = hasPermission("rbac.rules.manage");
  const [params, setParams] = useState<string[]>(initialParams ?? []);
  const [newParam, setNewParam] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setParams(initialParams ?? []);
  }, [initialParams]);

  const addParam = () => {
    const name = newParam.trim();
    if (!name || params.includes(name)) return;
    const next = [...params, name].sort();
    setParams(next);
    setNewParam("");
    void save(next);
  };

  const removeParam = (name: string) => {
    const next = params.filter((p) => p !== name);
    setParams(next);
    void save(next);
  };

  const save = async (next: string[]) => {
    setSaving(true);
    try {
      if (entityType === "gateway") {
        await toolAttributesApi.setGatewayForced(entityId, next);
      } else {
        await toolAttributesApi.setServerForced(entityId, next);
      }
      toast.success(intl.formatMessage({ id: "rules.forcedParams.title" }), {
        description: next.length > 0 ? next.join(", ") : "∅",
      });
    } catch (err) {
      toast.error((err instanceof ApiError ? extractApiErrorDetail(err.body) : null) ?? "");
    } finally {
      setSaving(false);
    }
  };

  return (
    <section
      aria-label={intl.formatMessage({ id: "rules.forcedParams.title" })}
      className="space-y-2"
      data-testid="forced-header-params"
    >
      <h4 className="text-sm font-semibold">
        {intl.formatMessage({ id: "rules.forcedParams.title" })}
      </h4>
      <p className="text-xs text-muted-foreground">
        {intl.formatMessage({ id: "rules.forcedParams.description" })}
      </p>
      {canManage && (
        <div className="flex items-center gap-2">
          <Input
            value={newParam}
            placeholder="parameter_name"
            onChange={(e) => setNewParam(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addParam()}
            className="w-48 font-mono text-xs"
            aria-label={intl.formatMessage({ id: "rules.forcedParams.add" })}
            disabled={saving}
          />
          <Button
            size="sm"
            variant="outline"
            onClick={addParam}
            disabled={saving || !newParam.trim()}
          >
            <Plus className="size-3.5" />
            {intl.formatMessage({ id: "rules.forcedParams.add" })}
          </Button>
        </div>
      )}
      {params.length > 0 ? (
        <div
          className="flex flex-wrap gap-1"
          role="list"
          aria-label={intl.formatMessage({ id: "rules.forcedParams.title" })}
        >
          {params.map((p) => (
            <span
              key={p}
              role="listitem"
              className="inline-flex items-center gap-1 rounded bg-muted px-2 py-0.5 font-mono text-xs"
              data-testid={`forced-param-${p}`}
            >
              {p}
              {canManage && (
                <button
                  type="button"
                  onClick={() => removeParam(p)}
                  className="text-muted-foreground hover:text-destructive"
                  aria-label={`Remove ${p}`}
                >
                  <X className="size-3" />
                </button>
              )}
            </span>
          ))}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">∅</p>
      )}
    </section>
  );
}
