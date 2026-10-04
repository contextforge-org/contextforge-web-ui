import { useEffect, useMemo, useState } from "react";
import { useIntl } from "react-intl";
import { toast } from "sonner";
import { z } from "zod";

import {
  rulesApi,
  toolAttributesApi,
  type CapabilityType,
  type RbacRule,
  type RuleEffect,
  type RulePhase,
} from "@/api/rules";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Combobox, type ComboboxOption } from "@/components/ui/combobox";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { ApiError } from "@/api/client";
import { extractApiErrorDetail } from "@/utils/errors";

const CAPABILITY_TYPES: CapabilityType[] = [
  "tool",
  "resource",
  "prompt",
  "server",
  "gateway",
  "a2a_agent",
  "route",
];
const OPERATORS = ["==", "!=", ">", ">=", "<", "<=", "in", "not in"] as const;
type Operator = (typeof OPERATORS)[number];
type Joiner = "&" | "|";

/** Attribute families the builder offers; the name narrows the family. */
const FAMILIES = ["role", "perm", "team", "args"] as const;
const SPECIALS = ["authenticated", "token.is_admin", "subject.id"] as const;
type Attribute = (typeof FAMILIES)[number] | (typeof SPECIALS)[number];

interface Condition {
  attribute: Attribute;
  name: string;
  operator: Operator | "";
  value: string;
}

interface BuilderState {
  conditions: Condition[];
  joiner: Joiner;
}

const createSchema = z.object({
  name: z.string().trim().min(1),
  predicate: z.string().trim().min(1),
  capability_type: z.enum([
    "tool",
    "resource",
    "prompt",
    "server",
    "gateway",
    "a2a_agent",
    "route",
  ]),
  effect: z.enum(["allow", "deny"]),
});

function quote(value: string): string {
  return value === "" || /^-?\d+(\.\d+)?$/.test(value) ? value : `'${value.replace(/'/g, "")}'`;
}

function conditionToString(condition: Condition): string {
  const attr = FAMILIES.includes(condition.attribute as (typeof FAMILIES)[number])
    ? `${condition.attribute}.${condition.name}`.replace(/\.$/, "")
    : condition.attribute;
  if (!condition.operator) return attr;
  if (condition.operator === "in" || condition.operator === "not in")
    return `${attr} ${condition.operator} ${condition.value}`;
  return `${attr} ${condition.operator} ${quote(condition.value)}`;
}

function compile(builder: BuilderState): string {
  return builder.conditions.map(conditionToString).filter(Boolean).join(` ${builder.joiner} `);
}

/** Parse a predicate into builder rows; null when it uses forms the builder cannot express. */
function parseToBuilder(predicate: string): BuilderState | null {
  if (/[()]/.test(predicate)) return null;
  const joiner: Joiner = predicate.includes("|") ? "|" : "&";
  const parts = predicate.split(/\s*[&|]\s*/).filter(Boolean);
  const conditions: Condition[] = [];
  for (const part of parts) {
    const comparison = part.match(/^([\w.]+)\s*(==|!=|>=|<=|>|<)\s*(.+)$/);
    if (comparison) {
      conditions.push(
        destructure(comparison[1], comparison[2] as Operator, comparison[3].replace(/^'|'$/g, "")),
      );
      continue;
    }
    const membership = part.match(/^([\w.]+)\s+(not\s+)?in\s+([\w.]+)$/);
    if (membership) {
      conditions.push(destructure(membership[1], membership[2] ? "not in" : "in", membership[3]));
      continue;
    }
    if (/^[\w.]+$/.test(part)) {
      conditions.push(destructure(part, "", ""));
      continue;
    }
    return null;
  }
  return conditions.length > 0 ? { conditions, joiner } : null;
}

function destructure(attr: string, operator: Operator | "", value: string): Condition {
  const [family, ...rest] = attr.split(".");
  const name = rest.join(".");
  if ((FAMILIES as readonly string[]).includes(family) && name) {
    return { attribute: family as Attribute, name, operator, value };
  }
  if ((SPECIALS as readonly string[]).includes(attr)) {
    return { attribute: attr as Attribute, name: "", operator, value };
  }
  // Unknown attribute: keep it addressable through the raw mode.
  return { attribute: family as Attribute, name: name || family, operator, value };
}

interface RuleFormProps {
  open: boolean;
  rule: RbacRule | null;
  /** Locked capability context when opened from an entity tab. */
  capabilityType?: CapabilityType;
  capabilityId?: string;
  serverContext?: string;
  contextTools?: string[];
  /** Open in read-only mode (system rules). */
  readOnly?: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}

export function RuleForm({
  open,
  rule,
  capabilityType,
  capabilityId,
  serverContext,
  contextTools,
  readOnly = false,
  onOpenChange,
  onSaved,
}: RuleFormProps) {
  const intl = useIntl();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [capabilityTypeState, setCapabilityType] = useState<CapabilityType>("tool");
  const [capabilityIdState, setCapabilityId] = useState("");
  const [permission, setPermission] = useState("");
  const [phase, setPhase] = useState<RulePhase>("pre_invocation");
  const [effect, setEffect] = useState<RuleEffect>("deny");
  const [priority, setPriority] = useState(100);
  const [isActive, setIsActive] = useState(true);
  const [predicate, setPredicate] = useState("authenticated");
  const [mode, setMode] = useState<"builder" | "raw">("builder");
  const [builder, setBuilder] = useState<BuilderState>({
    conditions: [{ attribute: "authenticated", name: "", operator: "", value: "" }],
    joiner: "&",
  });
  const [errors, setErrors] = useState<{ name?: string; predicate?: string }>({});
  const [availableAttrs, setAvailableAttrs] = useState<string[]>([]);
  const [expiresAt, setExpiresAt] = useState("");
  const [roleNames, setRoleNames] = useState<string[]>([]);
  const [teamNames, setTeamNames] = useState<string[]>([]);
  const locked = (capabilityType !== undefined && !serverContext) || readOnly;
  const [entityNames, setEntityNames] = useState<{ id: string; name: string }[]>([]);
  const [allPermissions, setAllPermissions] = useState<string[]>([]);

  // Fetch role and team names for predicate value typeahead.
  useEffect(() => {
    if (!open) return;
    import("@/api/client").then(({ api }) => {
      api
        .get<{ name: string }[]>("/rbac/roles")
        .then((roles) => setRoleNames(roles.map((r) => r.name)))
        .catch(() => setRoleNames([]));
      api
        .get<{ name: string }[]>("/teams")
        .then((teams) => setTeamNames(teams.map((t) => t.name)))
        .catch(() => setTeamNames([]));
    });
  }, [open]);

  // Fetch the full permission list once for the permission combobox.
  useEffect(() => {
    if (!open) return;
    import("@/api/client").then(({ api }) =>
      api
        .get<{ all_permissions?: string[] } | string[]>("/rbac/permissions/available")
        .then((resp) =>
          setAllPermissions(Array.isArray(resp) ? resp : (resp.all_permissions ?? [])),
        )
        .catch(() => setAllPermissions([])),
    );
  }, [open]);

  // Filter permissions by the selected capability type.
  const permissionOptions = useMemo(() => {
    if (allPermissions.length === 0) return [];
    const prefixes: Record<string, string[]> = {
      tool: ["tools."],
      resource: ["resources."],
      prompt: ["prompts."],
      server: ["servers."],
      gateway: ["gateways."],
      a2a_agent: ["a2a."],
      route: [], // route covers everything else
    };
    const selected = prefixes[capabilityTypeState] ?? [];
    const filtered =
      selected.length > 0
        ? allPermissions.filter((p) => selected.some((prefix) => p.startsWith(prefix)))
        : allPermissions.filter(
            (p) =>
              !["tools.", "resources.", "prompts.", "servers.", "gateways.", "a2a."].some(
                (prefix) => p.startsWith(prefix),
              ),
          );
    return [
      { value: "", label: intl.formatMessage({ id: "rules.form.permissionHint" }) },
      ...filtered.map((p): ComboboxOption => ({ value: p, label: p })),
    ];
  }, [allPermissions, capabilityTypeState, intl]);

  // Fetch entity names for the picker when the rule is not locked.
  useEffect(() => {
    if (!open) {
      setEntityNames([]);
      return;
    }
    const path =
      capabilityTypeState === "tool"
        ? "/tools"
        : capabilityTypeState === "server"
          ? "/servers"
          : capabilityTypeState === "gateway"
            ? "/gateways"
            : null;
    if (!path) {
      setEntityNames([]);
      return;
    }
    import("@/api/client").then(({ api }) =>
      api
        .get<{ id: string; name: string; displayName?: string; slug?: string }[]>(path)
        .then((items) => {
          setEntityNames(
            items.map((item) => ({
              id: item.slug ?? item.name,
              name: item.displayName || item.name,
            })),
          );
        })
        .catch(() => setEntityNames([])),
    );
  }, [open, capabilityTypeState, contextTools]);

  // Fetch the attribute names available for args.* predicates when the
  // rule targets a tool, gateway, or server.
  useEffect(() => {
    if (!open) return;
    const params: { toolName?: string; gatewayId?: string; serverId?: string } = {};
    if (capabilityTypeState === "tool" && (capabilityIdState || capabilityId)) {
      params.toolName = capabilityIdState || capabilityId || undefined;
    } else if (capabilityTypeState === "gateway" && (capabilityIdState || capabilityId)) {
      params.gatewayId = capabilityIdState || capabilityId || undefined;
    } else if (capabilityTypeState === "server" && (capabilityIdState || capabilityId)) {
      params.serverId = capabilityIdState || capabilityId || undefined;
    }
    if (Object.keys(params).length === 0) {
      setAvailableAttrs([]);
      return;
    }
    toolAttributesApi
      .get(params)
      .then((r) => setAvailableAttrs(r.all_attributes))
      .catch(() => setAvailableAttrs([]));
  }, [open, capabilityTypeState, capabilityIdState, capabilityId]);

  useEffect(() => {
    if (!open) return;
    setName(rule?.name ?? "");
    setDescription(rule?.description ?? "");
    setCapabilityType(rule?.capability_type ?? capabilityType ?? "tool");
    setCapabilityId(rule?.capability_id ?? capabilityId ?? "");
    setPermission(rule?.permission ?? "");
    setPhase(rule?.phase ?? "pre_invocation");
    setEffect(rule?.effect ?? "deny");
    setPriority(rule?.priority ?? 100);
    setIsActive(rule?.is_active ?? true);
    setPredicate(rule?.predicate ?? "authenticated");
    setExpiresAt(rule?.expires_at ? rule.expires_at.slice(0, 16) : "");
    setErrors({});
    const parsed = parseToBuilder(rule?.predicate ?? "authenticated");
    if (parsed) {
      setBuilder(parsed);
      setMode("builder");
    } else {
      setMode("raw");
    }
  }, [open, rule, capabilityType, capabilityId]);

  const effectivePredicate = useMemo(
    () => (mode === "builder" ? compile(builder) : predicate),
    [mode, builder, predicate],
  );

  const updateCondition = (index: number, patch: Partial<Condition>) => {
    setBuilder((b) => ({
      ...b,
      conditions: b.conditions.map((c, i) => (i === index ? { ...c, ...patch } : c)),
    }));
  };

  const submit = async () => {
    const parsed = createSchema.safeParse({
      name,
      predicate: effectivePredicate,
      capability_type: capabilityTypeState,
      effect,
    });
    if (!parsed.success) {
      setErrors({
        name: name.trim() ? undefined : "required",
        predicate: effectivePredicate.trim() ? undefined : "required",
      });
      return;
    }
    try {
      if (rule) {
        await rulesApi.update(rule.id, {
          description,
          capability_id: capabilityIdState || null,
          permission: permission || null,
          phase,
          predicate: effectivePredicate,
          effect,
          priority,
          is_active: isActive,
          expires_at: expiresAt ? new Date(expiresAt).toISOString() : null,
        });
      } else {
        await rulesApi.create({
          name,
          description,
          capability_type: capabilityTypeState,
          capability_id: capabilityIdState || null,
          permission: permission || null,
          phase,
          predicate: effectivePredicate,
          effect,
          priority,
          expires_at: expiresAt ? new Date(expiresAt).toISOString() : null,
        });
      }
      toast.success(intl.formatMessage({ id: rule ? "rules.edit" : "rules.create" }), {
        description: name,
      });
      onOpenChange(false);
      onSaved();
    } catch (err) {
      // The gateway owns predicate validation; surface its detail inline.
      setErrors({
        predicate: (err instanceof ApiError ? extractApiErrorDetail(err.body) : null) ?? "",
      });
      toast.error((err instanceof ApiError ? extractApiErrorDetail(err.body) : null) ?? "");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {intl.formatMessage({ id: rule ? "rules.edit" : "rules.create" })}
          </DialogTitle>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="rule-name">{intl.formatMessage({ id: "rules.form.name" })}</Label>
            <Input
              id="rule-name"
              value={name}
              placeholder={intl.formatMessage({ id: "rules.form.namePlaceholder" })}
              onChange={(e) => setName(e.target.value)}
              aria-invalid={errors.name !== undefined}
              aria-describedby={errors.name !== undefined ? "rule-name-error" : undefined}
            />
            {errors.name !== undefined && (
              <p id="rule-name-error" className="text-sm text-destructive">
                {intl.formatMessage({ id: "rules.form.errors.name" })}
              </p>
            )}
          </div>
          <div className="grid gap-2">
            <Label htmlFor="rule-description">
              {intl.formatMessage({ id: "rules.form.description" })}
            </Label>
            <Input
              id="rule-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label htmlFor="rule-capability">
                {intl.formatMessage({ id: "rules.form.capabilityType" })}
              </Label>
              <Select
                value={capabilityTypeState}
                onValueChange={(v) => setCapabilityType(v as CapabilityType)}
                disabled={locked}
              >
                <SelectTrigger id="rule-capability">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CAPABILITY_TYPES.map((c) => (
                    <SelectItem key={c} value={c}>
                      {intl.formatMessage({ id: `rules.capability.${c}` })}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="rule-capability-id">
                {intl.formatMessage({ id: "rules.form.capabilityId" })}
              </Label>
              {entityNames.length > 0 ? (
                <Combobox
                  options={[
                    { value: "", label: intl.formatMessage({ id: "rules.capability.all" }) },
                    ...entityNames.map((e): ComboboxOption => ({ value: e.id, label: e.name })),
                  ]}
                  value={capabilityIdState}
                  onValueChange={setCapabilityId}
                  placeholder={intl.formatMessage({ id: "rules.form.capabilityIdHint" })}
                  searchPlaceholder={intl.formatMessage({ id: "rules.form.attributeNames" })}
                  allowCustomValue
                  className="w-full"
                />
              ) : (
                <Input
                  id="rule-capability-id"
                  value={capabilityIdState}
                  placeholder="name"
                  onChange={(e) => setCapabilityId(e.target.value)}
                  aria-describedby="rule-capability-id-hint"
                />
              )}
              <p id="rule-capability-id-hint" className="text-xs text-muted-foreground">
                {intl.formatMessage({
                  id: locked ? "rules.entity.title" : "rules.form.capabilityIdHint",
                })}
              </p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label htmlFor="rule-permission">
                {intl.formatMessage({ id: "rules.form.permission" })}
              </Label>
              {permissionOptions.length > 0 ? (
                <Combobox
                  options={permissionOptions}
                  value={permission}
                  onValueChange={setPermission}
                  placeholder="tools.read"
                  searchPlaceholder={intl.formatMessage({ id: "rules.form.attributeNames" })}
                  allowCustomValue
                  className="w-full"
                />
              ) : (
                <Input
                  id="rule-permission"
                  value={permission}
                  placeholder="tools.read"
                  onChange={(e) => setPermission(e.target.value)}
                  aria-describedby="rule-permission-hint"
                />
              )}
              <p id="rule-permission-hint" className="text-xs text-muted-foreground">
                {intl.formatMessage({ id: "rules.form.permissionHint" })}
              </p>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="rule-phase">{intl.formatMessage({ id: "rules.form.phase" })}</Label>
              <Select value={phase} onValueChange={(v) => setPhase(v as RulePhase)}>
                <SelectTrigger id="rule-phase">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="pre_invocation">
                    {intl.formatMessage({ id: "rules.phase.pre_invocation" })}
                  </SelectItem>
                  <SelectItem value="post_invocation">
                    {intl.formatMessage({ id: "rules.phase.post_invocation" })}
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid gap-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="rule-predicate">
                {intl.formatMessage({ id: "rules.form.predicate" })}
              </Label>
              <div className="flex gap-1 text-xs">
                <Button
                  type="button"
                  variant={mode === "builder" ? "default" : "ghost"}
                  size="sm"
                  onClick={() => setMode("builder")}
                >
                  {intl.formatMessage({ id: "rules.form.predicateBuilder" })}
                </Button>
                <Button
                  type="button"
                  variant={mode === "raw" ? "default" : "ghost"}
                  size="sm"
                  onClick={() => setMode("raw")}
                >
                  {intl.formatMessage({ id: "rules.form.predicateRaw" })}
                </Button>
              </div>
            </div>
            {mode === "builder" ? (
              <div className="space-y-2" data-testid="predicate-builder">
                {builder.conditions.map((condition, index) => (
                  <div key={index} className="grid grid-cols-[1fr_1fr_auto] items-center gap-2">
                    <div className="grid gap-1">
                      <Select
                        value={condition.attribute}
                        onValueChange={(v) =>
                          updateCondition(index, {
                            attribute: v as Attribute,
                            name: (SPECIALS as readonly string[]).includes(v) ? "" : condition.name,
                            operator: "",
                            value: "",
                          })
                        }
                      >
                        <SelectTrigger
                          aria-label={intl.formatMessage({ id: "rules.form.attribute" })}
                        >
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {SPECIALS.map((s) => (
                            <SelectItem key={s} value={s}>
                              {s}
                            </SelectItem>
                          ))}
                          {FAMILIES.map((f) => (
                            <SelectItem key={f} value={f}>
                              {f === "args"
                                ? intl.formatMessage({ id: "rules.form.argsFamily" })
                                : `${f}.*`}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {(FAMILIES as readonly string[]).includes(condition.attribute) &&
                        condition.attribute === "args" &&
                        availableAttrs.length > 0 && (
                          <Select
                            value={condition.name}
                            onValueChange={(v) => updateCondition(index, { name: v })}
                          >
                            <SelectTrigger
                              aria-label={`${intl.formatMessage({ id: "rules.form.attribute" })} ${index + 1}`}
                            >
                              <SelectValue
                                placeholder={intl.formatMessage({
                                  id: "rules.form.attributeNames",
                                })}
                              />
                            </SelectTrigger>
                            <SelectContent>
                              {availableAttrs.map((a) => (
                                <SelectItem key={a} value={a}>
                                  {a}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        )}
                      {(FAMILIES as readonly string[]).includes(condition.attribute) &&
                        (condition.attribute !== "args" || availableAttrs.length === 0) && (
                          <Input
                            value={condition.name}
                            placeholder="name"
                            onChange={(e) => updateCondition(index, { name: e.target.value })}
                            aria-label={`${intl.formatMessage({ id: "rules.form.attribute" })} ${index + 1}`}
                          />
                        )}
                    </div>
                    <div className="grid gap-1">
                      {(FAMILIES as readonly string[]).includes(condition.attribute) && (
                        <Select
                          value={condition.operator || "truthy"}
                          onValueChange={(v) =>
                            updateCondition(index, {
                              operator: v === "truthy" ? "" : (v as Operator),
                            })
                          }
                        >
                          <SelectTrigger
                            aria-label={intl.formatMessage({ id: "rules.form.operator" })}
                          >
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="truthy">—</SelectItem>
                            {OPERATORS.map((o) => (
                              <SelectItem key={o} value={o}>
                                {o}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                      {condition.operator &&
                        condition.operator !== "in" &&
                        condition.operator !== "not in" &&
                        (condition.attribute === "role" && roleNames.length > 0 ? (
                          <Combobox
                            options={roleNames.map((r): ComboboxOption => ({ value: r, label: r }))}
                            value={condition.value}
                            onValueChange={(v) => updateCondition(index, { value: v })}
                            placeholder={intl.formatMessage({ id: "rules.form.value" })}
                            allowCustomValue
                            className="w-full"
                          />
                        ) : condition.attribute === "team" && teamNames.length > 0 ? (
                          <Combobox
                            options={teamNames.map((t): ComboboxOption => ({ value: t, label: t }))}
                            value={condition.value}
                            onValueChange={(v) => updateCondition(index, { value: v })}
                            placeholder={intl.formatMessage({ id: "rules.form.value" })}
                            allowCustomValue
                            className="w-full"
                          />
                        ) : (
                          <Input
                            value={condition.value}
                            placeholder={intl.formatMessage({ id: "rules.form.value" })}
                            onChange={(e) => updateCondition(index, { value: e.target.value })}
                            aria-label={`${intl.formatMessage({ id: "rules.form.value" })} ${index + 1}`}
                          />
                        ))}
                      {(condition.operator === "in" || condition.operator === "not in") && (
                        <Input
                          value={condition.value}
                          placeholder="collection"
                          onChange={(e) => updateCondition(index, { value: e.target.value })}
                          aria-label={`${intl.formatMessage({ id: "rules.form.value" })} ${index + 1}`}
                        />
                      )}
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label={intl.formatMessage({ id: "common.delete" })}
                      disabled={builder.conditions.length === 1}
                      onClick={() =>
                        setBuilder((b) => ({
                          ...b,
                          conditions: b.conditions.filter((_, i) => i !== index),
                        }))
                      }
                    >
                      ×
                    </Button>
                  </div>
                ))}
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      setBuilder((b) => ({
                        ...b,
                        conditions: [
                          ...b.conditions,
                          { attribute: "role", name: "", operator: "", value: "" },
                        ],
                      }))
                    }
                  >
                    {intl.formatMessage({ id: "rules.form.addCondition" })}
                  </Button>
                  {builder.conditions.length > 1 && (
                    <Select
                      value={builder.joiner}
                      onValueChange={(v) => setBuilder((b) => ({ ...b, joiner: v as Joiner }))}
                    >
                      <SelectTrigger
                        className="w-20"
                        aria-label={intl.formatMessage({ id: "rules.form.join" })}
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="&">&amp;</SelectItem>
                        <SelectItem value="|">|</SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                </div>
                <code
                  className="rounded bg-muted px-2 py-1 font-mono text-xs"
                  data-testid="compiled-predicate"
                >
                  {effectivePredicate || "—"}
                </code>
              </div>
            ) : (
              <Textarea
                id="rule-predicate"
                value={predicate}
                className="font-mono text-xs"
                onChange={(e) => setPredicate(e.target.value)}
                aria-invalid={errors.predicate !== undefined}
                rows={3}
              />
            )}
            {mode === "builder" && !parseToBuilder(effectivePredicate) && effectivePredicate && (
              <p className="text-xs text-muted-foreground">
                {intl.formatMessage({ id: "rules.form.predicateFallback" })}
              </p>
            )}
            {errors.predicate !== undefined && (
              <p role="alert" className="text-sm text-destructive">
                {errors.predicate || intl.formatMessage({ id: "rules.form.errors.predicate" })}
              </p>
            )}
          </div>

          <div className="grid grid-cols-3 items-end gap-4">
            <div className="grid gap-2">
              <Label>{intl.formatMessage({ id: "rules.form.effect" })}</Label>
              <RadioGroup
                value={effect}
                onValueChange={(v) => setEffect(v as RuleEffect)}
                className="flex gap-4"
              >
                <div className="flex items-center gap-2">
                  <RadioGroupItem value="deny" id="effect-deny" />
                  <Label htmlFor="effect-deny">
                    {intl.formatMessage({ id: "rules.effect.deny" })}
                  </Label>
                </div>
                <div className="flex items-center gap-2">
                  <RadioGroupItem value="allow" id="effect-allow" />
                  <Label htmlFor="effect-allow">
                    {intl.formatMessage({ id: "rules.effect.allow" })}
                  </Label>
                </div>
              </RadioGroup>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="rule-expires">
                {intl.formatMessage({ id: "rules.form.expiresAt" })}
              </Label>
              <Input
                id="rule-expires"
                type="datetime-local"
                value={expiresAt}
                onChange={(e) => setExpiresAt(e.target.value)}
                disabled={readOnly}
                aria-describedby="rule-expires-hint"
              />
              <p id="rule-expires-hint" className="text-xs text-muted-foreground">
                {intl.formatMessage({ id: "rules.form.expiresAtHint" })}
              </p>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="rule-priority">
                {intl.formatMessage({ id: "rules.form.priority" })}
              </Label>
              <Input
                id="rule-priority"
                type="number"
                value={priority}
                onChange={(e) => setPriority(Number(e.target.value))}
              />
            </div>
            <div className="flex items-center gap-2">
              <Switch id="rule-active" checked={isActive} onCheckedChange={setIsActive} />
              <Label htmlFor="rule-active">{intl.formatMessage({ id: "rules.form.active" })}</Label>
            </div>
          </div>
        </div>
        <DialogFooter>
          {readOnly && (
            <p className="mr-auto text-xs text-muted-foreground">
              {intl.formatMessage({ id: "rules.readOnly" })}
            </p>
          )}
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {intl.formatMessage({ id: "common.button.cancel" })}
          </Button>
          {!readOnly && (
            <Button onClick={submit} data-testid="submit-rule">
              {intl.formatMessage({ id: rule ? "rules.edit" : "rules.create" })}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
