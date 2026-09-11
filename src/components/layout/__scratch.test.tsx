import { describe, it, vi, beforeEach } from "vitest";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@/hooks/useTheme";
import { I18nProvider } from "@/i18n";
import { render, screen } from "@testing-library/react";
import type { User } from "../../types/user";
import { HeaderProfileMenu } from "./HeaderProfileMenu";

const mockUser: User = {
  email: "bobo@cf.com", full_name: "Bobo Example", is_admin: false, is_active: true,
  auth_provider: "local", email_verified: true, password_change_required: false,
  created_at: new Date().toISOString(), failed_login_attempts: 0, is_locked: false,
};
vi.mock("@/auth/useAuth", () => ({ useAuth: () => ({ user: mockUser, logout: vi.fn() }) }));
vi.mock("@/router", async () => {
  const actual = await vi.importActual<typeof import("@/router")>("@/router");
  return { ...actual, useRouter: () => ({ path: "/app/", params: {}, navigate: vi.fn() }) };
});

describe("scratch: scroll lock while the language list is open", () => {
  beforeEach(() => localStorage.clear());

  it("reports body state before and after opening the select", async () => {
    const user = userEvent.setup();
    render(<I18nProvider><ThemeProvider><HeaderProfileMenu /></ThemeProvider></I18nProvider>);

    await user.click(screen.getByRole("button", { name: "Bobo Example" }));
    console.log("PANEL OPEN  -> overflow=%o scrollLocked=%o padRight=%o",
      document.body.style.overflow, document.body.getAttribute("data-scroll-locked"), document.body.style.paddingRight);

    await user.click(screen.getByRole("combobox", { name: "Language" }));
    await screen.findByRole("option", { name: "Español" });
    console.log("SELECT OPEN -> overflow=%o scrollLocked=%o padRight=%o",
      document.body.style.overflow, document.body.getAttribute("data-scroll-locked"), document.body.style.paddingRight);
    console.log("body inline style:", document.body.getAttribute("style"));
  });
});
