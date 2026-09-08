import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Field } from "./field";
import { Input } from "./input";

describe("Field", () => {
  it("renders label linked to control via htmlFor", () => {
    render(
      <Field id="name" label="Name">
        <Input id="name" />
      </Field>,
    );
    const label = screen.getByText("Name");
    expect(label).toHaveAttribute("for", "name");
    expect(screen.getByRole("textbox")).toHaveAttribute("id", "name");
  });

  it("renders error message with matching id", () => {
    render(
      <Field id="email" label="Email" error="Required">
        <Input id="email" />
      </Field>,
    );
    const error = screen.getByRole("alert");
    expect(error).toHaveTextContent("Required");
    expect(error).toHaveAttribute("id", "email-error");
  });

  it("injects aria-invalid=true on child when error is set", () => {
    render(
      <Field id="email" label="Email" error="Required">
        <Input id="email" />
      </Field>,
    );
    expect(screen.getByRole("textbox")).toHaveAttribute("aria-invalid", "true");
  });

  it("injects aria-describedby pointing to error id on child", () => {
    render(
      <Field id="email" label="Email" error="Required">
        <Input id="email" />
      </Field>,
    );
    expect(screen.getByRole("textbox")).toHaveAttribute("aria-describedby", "email-error");
  });

  it("does not render error block when no error", () => {
    render(
      <Field id="name" label="Name">
        <Input id="name" />
      </Field>,
    );
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("renders hint text only when no error", () => {
    const { rerender } = render(
      <Field id="name" label="Name" hint="Help text">
        <Input id="name" />
      </Field>,
    );
    expect(screen.getByText("Help text")).toBeInTheDocument();

    rerender(
      <Field id="name" label="Name" hint="Help text" error="Required">
        <Input id="name" />
      </Field>,
    );
    expect(screen.queryByText("Help text")).not.toBeInTheDocument();
  });
});
