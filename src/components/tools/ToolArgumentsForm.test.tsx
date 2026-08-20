import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { fireEvent, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { renderWithProviders as render } from "@/test/test-utils";
import {
  buildFormSpec,
  seedToolArguments,
  ToolArgumentsForm,
  validateToolArguments,
} from "./ToolArgumentsForm";

const SCHEMA = {
  type: "object",
  required: ["query"],
  properties: {
    query: { type: "string", description: "Search query" },
    limit: { type: "integer" },
    include_closed: { type: "boolean" },
    labels: { type: "array", items: { type: "string" } },
    mode: { type: "string", enum: ["fast", "full"] },
    owner: {
      type: "object",
      required: ["email"],
      properties: {
        email: { type: "string", format: "email" },
      },
    },
  },
};

function FormHarness({
  schema = SCHEMA,
  onValidityChange = vi.fn(),
  onArgsChange = vi.fn(),
}: {
  schema?: Record<string, unknown>;
  onValidityChange?: (valid: boolean) => void;
  onArgsChange?: (value: Record<string, unknown>) => void;
}) {
  const [value, setValue] = useState(() => seedToolArguments(schema));
  return (
    <ToolArgumentsForm
      schema={schema}
      value={value}
      onChange={(next) => {
        setValue(next);
        onArgsChange(next);
      }}
      onValidityChange={onValidityChange}
    />
  );
}

describe("ToolArgumentsForm", () => {
  it("builds a primitive schema form with one-level nested fields", () => {
    const spec = buildFormSpec(SCHEMA);

    expect(spec.complex).toBe(false);
    expect(spec.fields.map((field) => field.label)).toEqual([
      "query",
      "limit",
      "include_closed",
      "labels",
      "mode",
      "owner.email",
    ]);
  });

  it("validates required fields", () => {
    const spec = buildFormSpec(SCHEMA);
    expect(validateToolArguments(seedToolArguments(SCHEMA), spec.fields)).toEqual({
      query: "required",
      "owner.email": "required",
    });
  });

  it("renders supported controls and emits typed values", async () => {
    const user = userEvent.setup();
    const onArgsChange = vi.fn();
    render(<FormHarness onArgsChange={onArgsChange} />);

    await user.type(screen.getByLabelText(/query/i), "cloudflare");
    await user.type(screen.getByLabelText(/limit/i), "5");
    await user.click(screen.getByLabelText(/include_closed/i));
    await user.type(screen.getByLabelText(/labels/i), "bug, ui");

    expect(onArgsChange).toHaveBeenLastCalledWith(
      expect.objectContaining({
        query: "cloudflare",
        limit: 5,
        include_closed: true,
        labels: ["bug", "ui"],
      }),
    );
  });

  it("falls back to raw JSON for complex schemas", async () => {
    const onArgsChange = vi.fn();
    render(
      <FormHarness
        schema={{ type: "object", oneOf: [{ properties: { q: { type: "string" } } }] }}
        onArgsChange={onArgsChange}
      />,
    );

    expect(screen.getByText("Complex schema: JSON editor")).toBeInTheDocument();
    const rawJson = screen.getByLabelText("Tool arguments as JSON");
    fireEvent.change(rawJson, { target: { value: "{{" } });
    expect(screen.getByText("Enter valid JSON.")).toBeInTheDocument();

    fireEvent.change(rawJson, { target: { value: '{"query":"ok"}' } });
    expect(onArgsChange).toHaveBeenLastCalledWith({ query: "ok" });
  });
});
