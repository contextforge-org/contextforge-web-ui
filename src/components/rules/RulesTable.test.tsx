import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import type { ReactElement } from "react";

import { server } from "@/test/mocks/server";
import { I18nProvider } from "@/i18n";
import type { RbacRule } from "@/api/rules";
import { RuleForm } from "./RuleForm";
import { RulesTable } from "./RulesTable";

function renderTable(ui: ReactElement) {
  return render(<I18nProvider>{ui}</I18nProvider>);
}

function makeRule(overrides: Partial<RbacRule> = {}): RbacRule {
  return {
    id: "rule-1",
    name: "deny-viewer-tools",
    description: "",
    capability_type: "tool",
    capability_id: null,
    permission: "tools.read",
    phase: "pre_invocation",
    predicate: "role.viewer",
    effect: "deny",
    priority: 100,
    is_active: true,
    is_system: false,
    created_by: "admin@example.com",
    created_at: "2026-10-03T00:00:00Z",
    updated_at: null,
    ...overrides,
  };
}

describe("RulesTable", () => {
  it("renders the loading state with a live region", () => {
    renderTable(<RulesTable rules={[]} isLoading={true} />);

    const status = screen.getByRole("status", { busy: true });
    expect(status).toHaveAttribute("aria-live", "polite");
  });

  it("renders rows with name, capability, predicate, and effect", () => {
    renderTable(<RulesTable rules={[makeRule()]} isLoading={false} />);

    expect(screen.getByTestId("rule-row-deny-viewer-tools")).toBeInTheDocument();
    expect(screen.getByTestId("rule-effect-deny")).toBeInTheDocument();
    expect(screen.getByText("role.viewer")).toBeInTheDocument();
  });

  it("marks system rows with a lock and disables their switch", () => {
    renderTable(
      <RulesTable
        rules={[makeRule({ is_system: true, name: "default-viewer-tools-read" })]}
        isLoading={false}
      />,
    );

    expect(screen.getByLabelText("System rule")).toBeInTheDocument();
    expect(screen.getByRole("switch", { name: "Active" })).toBeDisabled();
  });

  it("hides row actions in read-only mode", () => {
    renderTable(<RulesTable rules={[makeRule()]} isLoading={false} readOnly />);

    expect(screen.queryByLabelText("Actions")).not.toBeInTheDocument();
  });

  it("emits edit, delete, and active-change callbacks", async () => {
    const user = userEvent.setup();
    const onEdit = vi.fn();
    const onDelete = vi.fn();
    const onActiveChange = vi.fn();
    renderTable(
      <RulesTable
        rules={[makeRule()]}
        isLoading={false}
        onEdit={onEdit}
        onDelete={onDelete}
        onActiveChange={onActiveChange}
      />,
    );

    await user.click(screen.getByRole("switch", { name: "Active" }));
    expect(onActiveChange).toHaveBeenCalledWith(expect.objectContaining({ id: "rule-1" }), false);

    await user.click(screen.getByRole("button", { name: "Actions" }));
    await user.click(screen.getByRole("menuitem", { name: "Edit rule" }));
    expect(onEdit).toHaveBeenCalledWith(expect.objectContaining({ id: "rule-1" }));

    await user.click(screen.getByRole("button", { name: "Actions" }));
    await user.click(screen.getByRole("menuitem", { name: "Delete rule" }));
    expect(onDelete).toHaveBeenCalledWith(expect.objectContaining({ id: "rule-1" }));
  });
});

describe("RuleForm", () => {
  beforeEach(() => {
    server.use(
      http.post("*/api/rbac/rules", () =>
        HttpResponse.json({ detail: "Invalid predicate: bad" }, { status: 422 }),
      ),
    );
  });

  it("compiles builder rows into the predicate and posts it", async () => {
    const user = userEvent.setup();
    const onSaved = vi.fn();
    let body: unknown;
    server.use(
      http.post("*/api/rbac/rules", async ({ request }) => {
        body = await request.json();
        return HttpResponse.json(makeRule(), { status: 201 });
      }),
    );
    render(
      <I18nProvider>
        <RuleForm open={true} rule={null} onOpenChange={() => {}} onSaved={onSaved} />
      </I18nProvider>,
    );

    await user.type(screen.getByLabelText("Name"), "block-viewers");
    // Builder default is one truthiness condition on `authenticated`.
    expect(screen.getByTestId("compiled-predicate").textContent).toBe("authenticated");

    await user.click(screen.getByTestId("submit-rule"));
    expect(body).toMatchObject({
      name: "block-viewers",
      predicate: "authenticated",
      effect: "deny",
    });
    expect(onSaved).toHaveBeenCalled();
  });

  it("locks capability fields when opened for an entity", () => {
    render(
      <I18nProvider>
        <RuleForm
          open={true}
          rule={null}
          capabilityType="tool"
          capabilityId="tool-42"
          onOpenChange={() => {}}
          onSaved={() => {}}
        />
      </I18nProvider>,
    );

    expect(screen.getByLabelText("Capability type")).toBeDisabled();
    expect(screen.getByLabelText("Entity")).toBeDisabled();
    expect(screen.getByDisplayValue("tool-42")).toBeInTheDocument();
  });

  it("surfaces the gateway 422 detail under the predicate", async () => {
    const user = userEvent.setup();
    render(
      <I18nProvider>
        <RuleForm open={true} rule={null} onOpenChange={() => {}} onSaved={() => {}} />
      </I18nProvider>,
    );

    await user.type(screen.getByLabelText("Name"), "bad-rule");
    await user.click(screen.getByTestId("submit-rule"));

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Invalid predicate");
  });
});
