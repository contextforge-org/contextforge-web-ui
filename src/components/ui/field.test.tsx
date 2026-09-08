import type { ReactNode } from "react";
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

  it("injects aria-invalid=true on the control when error is set", () => {
    render(
      <Field id="email" label="Email" error="Required">
        <Input id="email" />
      </Field>,
    );
    expect(screen.getByRole("textbox")).toHaveAttribute("aria-invalid", "true");
  });

  it("injects aria-describedby pointing to error id on the control", () => {
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

  it("renders hint text with an id, wired into aria-describedby, when no error", () => {
    render(
      <Field id="name" label="Name" hint="Help text">
        <Input id="name" />
      </Field>,
    );
    const hint = screen.getByText("Help text");
    expect(hint).toHaveAttribute("id", "name-hint");
    expect(screen.getByRole("textbox")).toHaveAttribute("aria-describedby", "name-hint");
  });

  it("prefers the error over the hint: hides hint and points describedby at the error", () => {
    render(
      <Field id="name" label="Name" hint="Help text" error="Required">
        <Input id="name" />
      </Field>,
    );
    expect(screen.queryByText("Help text")).not.toBeInTheDocument();
    expect(screen.getByRole("textbox")).toHaveAttribute("aria-describedby", "name-error");
  });

  it("only clones aria attributes onto the control it was given, not siblings the caller renders alongside it", () => {
    // The control prop takes exactly one element, so a second control can't
    // slip in and get tagged aria-invalid/aria-describedby by accident (a
    // caller who wants a trailing action renders it outside <Field>, e.g.
    // `<div><Field ...>...</Field><Button>Clear</Button></div>`).
    render(
      <div>
        <Field id="name" label="Name" error="Required">
          <Input id="name" />
        </Field>
        <button type="button">Clear</button>
      </div>,
    );
    const clearButton = screen.getByRole("button", { name: "Clear" });
    expect(clearButton).not.toHaveAttribute("aria-invalid");
    expect(clearButton).not.toHaveAttribute("aria-describedby");
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
        <Input id="email" />
      </Field>,
    );
    expect(screen.getByText("Email")).toHaveAttribute("for", "email");
  });

  it("supports a render-prop child for composite controls, applying props to the caller-chosen element", () => {
    // A Select-shaped composite: the top-level element (the "Select" stand-in)
    // renders no DOM node of its own, and forwards nothing to its child.
    // cloneElement onto it would silently drop aria-invalid/aria-describedby;
    // the render-prop form lets the caller put them on the actual control.
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
