import { describe, expect, it, vi } from "vitest";
import { fireEvent, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { renderWithProviders as render } from "@/test/test-utils";
import {
  areHeaderRowsValid,
  createHeaderRow,
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
      { id: "4", name: "X-Empty", value: "" },
    ];

    expect(getForwardableHeaders(rows)).toEqual({ "X-Api-Key": "abc" });
  });

  it("flags BFF-stripped and invalid header names", () => {
    expect(getHeaderNameError("Authorization")).toBe("denied");
    expect(getHeaderNameError("Content-Type")).toBe("denied");
    expect(getHeaderNameError("Cookie")).toBe("denied");
    expect(getHeaderNameError("Forwarded")).toBe("denied");
    expect(getHeaderNameError("X-Requested-With")).toBe("denied");
    expect(getHeaderNameError("X-Real-IP")).toBe("denied");
    expect(getHeaderNameError("X-CSRF-Token")).toBe("denied");
    expect(getHeaderNameError("X-Forwarded-For")).toBe("denied");
    expect(getHeaderNameError("Bad Header")).toBe("invalid");
    expect(getHeaderNameError("")).toBeNull();
    expect(getHeaderNameError("X-Tenant-Id")).toBeNull();
  });

  it("reports aggregate row validity", () => {
    expect(areHeaderRowsValid([{ id: "1", name: "X-Tenant-Id", value: "team-a" }])).toBe(true);
    expect(areHeaderRowsValid([{ id: "1", name: "Authorization", value: "secret" }])).toBe(false);
  });

  it("creates unique blank header rows", () => {
    const row = createHeaderRow();

    expect(row.name).toBe("");
    expect(row.value).toBe("");
    expect(row.id).toBeTruthy();
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

  it("shows an inline error for invalid header names", () => {
    render(
      <ToolHeadersEditor
        rows={[{ id: "1", name: "Bad Header", value: "secret" }]}
        onChange={vi.fn()}
      />,
    );

    expect(screen.getByText("Enter a valid HTTP header name.")).toBeInTheDocument();
  });

  it("notifies callers when validity changes", () => {
    const onValidityChange = vi.fn();
    const { rerender } = render(
      <ToolHeadersEditor
        rows={[{ id: "1", name: "X-Api-Key", value: "abc" }]}
        onChange={vi.fn()}
        onValidityChange={onValidityChange}
      />,
    );

    expect(onValidityChange).toHaveBeenLastCalledWith(true);

    rerender(
      <ToolHeadersEditor
        rows={[{ id: "1", name: "Authorization", value: "abc" }]}
        onChange={vi.fn()}
        onValidityChange={onValidityChange}
      />,
    );

    expect(onValidityChange).toHaveBeenLastCalledWith(false);
  });

  it("emits row updates for name and value changes", async () => {
    const onChange = vi.fn();
    render(
      <ToolHeadersEditor rows={[{ id: "1", name: "X-Api-Key", value: "" }]} onChange={onChange} />,
    );

    fireEvent.change(screen.getByLabelText("Header 1 name"), {
      target: { value: "X-Tenant-Id" },
    });
    expect(onChange).toHaveBeenLastCalledWith([{ id: "1", name: "X-Tenant-Id", value: "" }]);

    fireEvent.change(screen.getByLabelText("Header 1 value"), {
      target: { value: "team-a" },
    });
    expect(onChange).toHaveBeenLastCalledWith([{ id: "1", name: "X-Api-Key", value: "team-a" }]);
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
