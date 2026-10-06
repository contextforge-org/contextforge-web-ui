import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const refetch = vi.fn();

const rulesApi = vi.hoisted(() => ({ remove: vi.fn().mockResolvedValue(undefined) }));
const RULES = vi.hoisted(() => [
  {
    id: "rule-1",
    name: "deny-us-zones",
    description: "",
    capability_type: "tool",
    capability_id: "fast-time-convert-time",
    permission: "tools.execute",
    phase: "pre_invocation",
    predicate: "args.timezone.startsWith('US/')",
    effect: "deny",
    priority: 100,
    is_active: true,
    is_system: false,
    expires_at: null,
    created_by: "admin@example.com",
    created_at: "2026-10-06T00:00:00Z",
    updated_at: null,
  },
]);

vi.mock("@/hooks/useQuery", () => ({
  useQuery: vi.fn((key: string) => {
    if (key.startsWith("/tools")) {
      return { data: [], isLoading: false, error: null };
    }
    return { data: RULES, isLoading: false, error: null, refetch };
  }),
}));
vi.mock("@/api/rules", () => ({ rulesApi }));

import { I18nProvider } from "@/i18n";
import { Rules } from "@/pages/Rules";

describe("Rules page", () => {
  beforeEach(() => {
    refetch.mockClear();
    rulesApi.remove.mockClear();
  });

  it("refetches the rule list after a delete is confirmed", async () => {
    const user = userEvent.setup();
    render(
      <I18nProvider>
        <Rules />
      </I18nProvider>,
    );
    await user.click(screen.getAllByRole("button", { name: /actions/i })[0]);
    await user.click(await screen.findByText("Delete rule"));
    await user.click(screen.getByTestId("confirm-delete-rule"));
    await screen.findByRole("button", { name: /actions/i });
    expect(rulesApi.remove).toHaveBeenCalledWith("rule-1");
    expect(refetch).toHaveBeenCalled();
  });
});
