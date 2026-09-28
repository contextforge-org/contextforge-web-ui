import { describe, it, expect, vi } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithProviders as render } from "@/test/test-utils";
import { SsoSettings } from "./SsoSettings";

const mockUseAuthContext = vi.fn();

vi.mock("@/auth/AuthContext", () => ({
  useAuthContext: () => mockUseAuthContext(),
}));

describe("SsoSettings", () => {
  it("shows Disabled and no provider field when SSO is off", () => {
    mockUseAuthContext.mockReturnValue({ ssoEnabled: false });

    render(<SsoSettings />);

    expect(screen.getByLabelText("Status")).toHaveValue("Disabled");
    expect(screen.queryByLabelText("Provider")).not.toBeInTheDocument();
  });

  it("shows Enabled and the provider name when SSO is on", () => {
    mockUseAuthContext.mockReturnValue({ ssoEnabled: true, ssoProviderName: "Keycloak" });

    render(<SsoSettings />);

    expect(screen.getByLabelText("Status")).toHaveValue("Enabled");
    expect(screen.getByLabelText("Provider")).toHaveValue("Keycloak");
  });

  it("shows Enabled but no provider field when the provider name hasn't resolved yet", () => {
    mockUseAuthContext.mockReturnValue({ ssoEnabled: true, ssoProviderName: undefined });

    render(<SsoSettings />);

    expect(screen.getByLabelText("Status")).toHaveValue("Enabled");
    expect(screen.queryByLabelText("Provider")).not.toBeInTheDocument();
  });

  it("renders every field read-only", () => {
    mockUseAuthContext.mockReturnValue({ ssoEnabled: true, ssoProviderName: "Keycloak" });

    render(<SsoSettings />);

    expect(screen.getByLabelText("Status")).toHaveAttribute("readonly");
    expect(screen.getByLabelText("Provider")).toHaveAttribute("readonly");
  });
});
