import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactElement } from "react";

import { I18nProvider } from "@/i18n";
import { RuleForm } from "@/components/rules/RuleForm";
import type { RbacRule } from "@/api/rules";

vi.mock("@/hooks/useQuery", () => ({
  useQuery: () => ({ data: [], isLoading: false, error: null }),
}));

function renderForm(ui: ReactElement) {
  return render(<I18nProvider>{ui}</I18nProvider>);
}

const startsWithRule: RbacRule = {
  id: "rule-1",
  name: "deny-us-zones",
  description: "",
  capability_type: "tool",
  capability_id: "fast-time-convert-time",
  permission: "tools.execute",
  phase: "pre_invocation",
  predicate: "subject.id == 'becky@example.com' && args.target_timezone.startsWith('US/')",
  effect: "deny",
  priority: 100,
  is_active: true,
  is_system: false,
  expires_at: null,
  created_by: "admin@example.com",
  created_at: "2026-10-06T00:00:00Z",
  updated_at: null,
} as unknown as RbacRule;

describe("RuleForm predicate tabs", () => {
  it("opens in raw mode and disables the builder tab for unrepresentable predicates", async () => {
    renderForm(<RuleForm open rule={startsWithRule} onOpenChange={() => {}} onSaved={() => {}} />);
    const rawTab = screen.getByRole("button", { name: /raw/i });
    expect(rawTab).toHaveAttribute("data-variant", "default");
    const builderTab = screen.getByRole("button", { name: /builder/i });
    expect(builderTab).toBeDisabled();
  });

  it("re-enables the builder tab once the raw text becomes representable", async () => {
    const user = userEvent.setup();
    renderForm(<RuleForm open rule={startsWithRule} onOpenChange={() => {}} onSaved={() => {}} />);
    const builderTab = screen.getByRole("button", { name: /builder/i });
    expect(builderTab).toBeDisabled();
    const textarea = screen.getByLabelText(/predicate/i);
    await user.clear(textarea);
    await user.type(textarea, "args.timezone == 'UTC'");
    expect(builderTab).toBeEnabled();
    await user.click(builderTab);
    expect(screen.getByTestId("predicate-builder")).toBeInTheDocument();
  });

  it("carries the builder output into the raw tab when switching", async () => {
    const user = userEvent.setup();
    renderForm(<RuleForm open rule={null} onOpenChange={() => {}} onSaved={() => {}} />);
    const rawTab = screen.getByRole("button", { name: /raw/i });
    await user.click(rawTab);
    const textarea = screen.getByLabelText(/predicate/i);
    await user.clear(textarea);
    await user.type(textarea, "args.timezone != ''");
    await user.click(screen.getByRole("button", { name: /builder/i }));
    await user.click(rawTab);
    expect(textarea).toHaveValue("args.timezone != ''");
  });
});
