import type { ReactNode } from "react";
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Field } from "./field";
import { Input } from "./input";

describe("Field", () => {
  it("renders label linked to control via htmlFor", () => {
    render(
      <Field id="name" label="Name">
        {(controlProps) => <Input {...controlProps} />}
      </Field>,
    );
    const label = screen.getByText("Name");
    expect(label).toHaveAttribute("for", "name");
    expect(screen.getByRole("textbox")).toHaveAttribute("id", "name");
  });

  it("renders error message with matching id", () => {
    render(
      <Field id="email" label="Email" error="Required">
        {(controlProps) => <Input {...controlProps} />}
      </Field>,
    );
    const error = screen.getByRole("alert");
    expect(error).toHaveTextContent("Required");
    expect(error).toHaveAttribute("id", "email-error");
  });

  it("injects aria-invalid=true on the control when error is set", () => {
    render(
      <Field id="email" label="Email" error="Required">
        {(controlProps) => <Input {...controlProps} />}
      </Field>,
    );
    expect(screen.getByRole("textbox")).toHaveAttribute("aria-invalid", "true");
  });

  it("injects aria-describedby pointing to error id on the control", () => {
    render(
      <Field id="email" label="Email" error="Required">
        {(controlProps) => <Input {...controlProps} />}
      </Field>,
    );
    expect(screen.getByRole("textbox")).toHaveAttribute("aria-describedby", "email-error");
  });

  it('treats error="" as invalid (not the same as no error): wires aria-invalid/describedby and renders the alert', () => {
    render(
      <Field id="email" label="Email" error="">
        {(controlProps) => <Input {...controlProps} />}
      </Field>,
    );
    expect(screen.getByRole("textbox")).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByRole("textbox")).toHaveAttribute("aria-describedby", "email-error");
    expect(screen.getByRole("alert")).toHaveAttribute("id", "email-error");
  });

  it("does not render error block when no error", () => {
    render(
      <Field id="name" label="Name">
        {(controlProps) => <Input {...controlProps} />}
      </Field>,
    );
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("renders hint text with an id, wired into aria-describedby, when no error", () => {
    render(
      <Field id="name" label="Name" hint="Help text">
        {(controlProps) => <Input {...controlProps} />}
      </Field>,
    );
    const hint = screen.getByText("Help text");
    expect(hint).toHaveAttribute("id", "name-hint");
    expect(screen.getByRole("textbox")).toHaveAttribute("aria-describedby", "name-hint");
  });

  it("prefers the error over the hint: hides hint and points describedby at the error", () => {
    render(
      <Field id="name" label="Name" hint="Help text" error="Required">
        {(controlProps) => <Input {...controlProps} />}
      </Field>,
    );
    expect(screen.queryByText("Help text")).not.toBeInTheDocument();
    expect(screen.getByRole("textbox")).toHaveAttribute("aria-describedby", "name-error");
  });

  it("does not let labelProps override which control the label targets", () => {
    render(
      <Field
        id="email"
        label="Email"
        // @ts-expect-error labelProps omits htmlFor at the type level; this
        // simulates a caller bypassing that (e.g. via `as any`) to prove the
        // runtime still wins.
        labelProps={{ htmlFor: "wrong-id" }}
      >
        {(controlProps) => <Input {...controlProps} />}
      </Field>,
    );
    expect(screen.getByText("Email")).toHaveAttribute("for", "email");
  });

  it("supports a render-prop child for composite controls, applying props to the caller-chosen element", () => {
    // A Select-shaped composite: the top-level element (the "Select" stand-in)
    // renders no DOM node of its own, and forwards nothing to its child. The
    // render-prop form lets the caller put the control props on the actual
    // DOM-facing element instead.
    function FakeSelectRoot({ children }: { children: ReactNode }) {
      return <div data-testid="select-root">{children}</div>;
    }

    render(
      <Field id="visibility" label="Visibility" error="Required">
        {(controlProps) => (
          <FakeSelectRoot>
            <button type="button" data-testid="select-trigger" {...controlProps}>
              Pick
            </button>
          </FakeSelectRoot>
        )}
      </Field>,
    );

    const trigger = screen.getByTestId("select-trigger");
    expect(trigger).toHaveAttribute("id", "visibility");
    expect(trigger).toHaveAttribute("aria-invalid", "true");
    expect(trigger).toHaveAttribute("aria-describedby", "visibility-error");
    // The wrapper the caller chose not to tag stays untouched.
    expect(screen.getByTestId("select-root")).not.toHaveAttribute("aria-invalid");
  });
});
