import { describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { renderWithProviders as render } from "@/test/test-utils";
import {
  getForwardableHeaders,
  getHeaderNameError,
  ToolHeadersEditor,
  type ToolHeaderRow,
} from "./ToolHeadersEditor";

describe("ToolHeadersEditor", () => {
  it("filters denied and blank headers from the forwardable header map", () => {
    const rows: ToolHeaderRow[] = [
      { id: "1", name: "X-Api-Key", value: "abc" },
      { id: "2", name: "Authorization", value: "Bearer token" },
      { id: "3", name: "", value: "ignored" },
    ];

    expect(getForwardableHeaders(rows)).toEqual({ "X-Api-Key": "abc" });
  });

  it("flags BFF-stripped and invalid header names", () => {
    expect(getHeaderNameError("Authorization")).toBe("denied");
    expect(getHeaderNameError("X-Forwarded-For")).toBe("denied");
    expect(getHeaderNameError("Bad Header")).toBe("invalid");
    expect(getHeaderNameError("X-Tenant-Id")).toBeNull();
  });

  it("shows an inline warning for denied headers", () => {
    render(
      <ToolHeadersEditor
        rows={[{ id: "1", name: "Authorization", value: "secret" }]}
        onChange={vi.fn()}
      />,
    );

    expect(screen.getByText("This header is not forwardable from the web UI.")).toBeInTheDocument();
  });

  it("adds and removes header rows", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    const { rerender } = render(<ToolHeadersEditor rows={[]} onChange={onChange} />);

    await user.click(screen.getByRole("button", { name: "Add header" }));
    expect(onChange).toHaveBeenCalledWith([expect.objectContaining({ name: "", value: "" })]);

    rerender(
      <ToolHeadersEditor
        rows={[{ id: "1", name: "X-Api-Key", value: "abc" }]}
        onChange={onChange}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Remove header 1" }));
    expect(onChange).toHaveBeenLastCalledWith([]);
  });
});
