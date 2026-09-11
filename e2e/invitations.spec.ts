/**
 * Pending team invitations (#5536).
 *
 * Doubles as the preview harness while #6010 is outstanding: the inbox and
 * decline routes do not exist yet, and page.route() intercepts by URL pattern
 * without caring whether anything is there upstream. One test per visual
 * state, so `npm run e2e:ui` steps through the whole feature.
 *
 * Once #6010 lands this becomes the integration test under E2E_REAL_API=true,
 * which needs e2e/seed/seed.ts to be able to seed a pending invitation for the
 * test user first.
 */
import { test, expect } from "./fixtures/api-mock";
import type { Page } from "@playwright/test";
import { APP } from "./utils/paths";
import type { Team, TeamInvitation } from "../src/types/team";

const MOCK_TEAM: Team = {
  id: "team-1",
  name: "Engineering",
  slug: "engineering",
  description: "Core engineering team",
  created_by: "admin@example.com",
  is_personal: false,
  visibility: "private",
  max_members: 50,
  member_count: 5,
  created_at: "2026-06-01T10:00:00Z",
  updated_at: "2026-06-15T14:30:00Z",
  is_active: true,
};

const PLATFORM_INVITATION: TeamInvitation = {
  id: "inv-1",
  team_id: "team-9",
  team_name: "Platform Team",
  email: "test@example.com",
  role: "owner",
  invited_by: "janet.wu@example.com",
  invited_at: "2026-09-10T10:00:00Z",
  expires_at: "2026-09-17T10:00:00Z",
  token: "tok-platform",
  is_active: true,
  is_expired: false,
};

const DESIGN_INVITATION: TeamInvitation = {
  ...PLATFORM_INVITATION,
  id: "inv-2",
  team_id: "team-8",
  team_name: "Design Team",
  role: "member",
  invited_by: "marcus.reed@example.com",
  token: "tok-design",
};

const INVITATIONS_ROUTE = "**/users/me/invitations";

interface InvitationsMockOptions {
  /** Delays the inbox response, to hold the dialog's loading state on screen. */
  delayMs?: number;
  /** Fails the inbox fetch, for the error state. */
  status?: number;
  /** Delays accept and decline, to hold a row's in-flight state on screen. */
  resolveDelayMs?: number;
}

async function mockInvitations(
  page: Page,
  invitations: TeamInvitation[],
  { delayMs = 0, status = 200, resolveDelayMs = 0 }: InvitationsMockOptions = {},
) {
  await page.route(INVITATIONS_ROUTE, async (route) => {
    if (delayMs) await new Promise((resolve) => setTimeout(resolve, delayMs));
    await route.fulfill({
      status,
      contentType: "application/json",
      body: JSON.stringify(status === 200 ? invitations : { detail: "Something went wrong" }),
    });
  });

  for (const action of ["accept", "decline"]) {
    await page.route(`**/teams/invitations/*/${action}`, async (route) => {
      if (resolveDelayMs) await new Promise((resolve) => setTimeout(resolve, resolveDelayMs));
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(
          action === "accept"
            ? { user_email: "test@example.com", role: "member", joined_at: "2026-09-11T10:00:00Z" }
            : {},
        ),
      });
    });
  }
}

async function mockTeams(page: Page, teams: Team[]) {
  await page.route("**/teams?*", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ teams }),
    });
  });
}

test.describe("Pending team invitations", () => {
  test.beforeEach(async ({ page, apiMock }) => {
    await apiMock.mockSession();
    await page.addInitScript(() => {
      sessionStorage.setItem("mcpgateway_token", "mock-token-12345");
    });
  });

  test("shows no chip when nothing is pending", async ({ page }) => {
    await mockTeams(page, [MOCK_TEAM]);
    await mockInvitations(page, []);

    await page.goto(APP.TEAMS);
    await page.waitForLoadState("networkidle");

    await expect(page.getByRole("button", { name: /invitation/ })).toHaveCount(0);
  });

  test("one invitation: chip, then the dialog", async ({ page }) => {
    await mockTeams(page, [MOCK_TEAM]);
    await mockInvitations(page, [PLATFORM_INVITATION]);

    await page.goto(APP.TEAMS);
    await page.waitForLoadState("networkidle");

    await page.getByRole("button", { name: "1 invitation" }).click();

    const dialog = page.getByRole("dialog");
    await expect(dialog).toHaveAccessibleName("Join team");
    await expect(
      dialog.getByText("janet.wu@example.com invited you to join Platform Team as Owner."),
    ).toBeVisible();
    await expect(dialog.getByRole("button", { name: "Join Platform Team" })).toBeVisible();
    await expect(
      dialog.getByRole("button", { name: "Decline invitation to Platform Team" }),
    ).toBeVisible();
  });

  test("two invitations: plural title, one separator", async ({ page }) => {
    await mockTeams(page, [MOCK_TEAM]);
    await mockInvitations(page, [PLATFORM_INVITATION, DESIGN_INVITATION]);

    await page.goto(APP.TEAMS);
    await page.waitForLoadState("networkidle");

    await page.getByRole("button", { name: "2 invitations" }).click();

    const dialog = page.getByRole("dialog");
    await expect(dialog).toHaveAccessibleName("Join teams");
    await expect(dialog.getByRole("listitem")).toHaveCount(2);
    await expect(dialog.locator('[data-slot="separator"]')).toHaveCount(1);
  });

  test("accepting one of two confirms in place and decrements the chip", async ({ page }) => {
    await mockTeams(page, [MOCK_TEAM]);
    await mockInvitations(page, [PLATFORM_INVITATION, DESIGN_INVITATION]);

    await page.goto(APP.TEAMS);
    await page.waitForLoadState("networkidle");

    await page.getByRole("button", { name: "2 invitations" }).click();

    const dialog = page.getByRole("dialog");
    await dialog.getByRole("button", { name: "Join Platform Team" }).click();

    await expect(dialog.getByText("Invite accepted")).toBeVisible();
    // The row stays, and the second invitation is still actionable.
    await expect(
      dialog.getByText("janet.wu@example.com invited you to join Platform Team as Owner."),
    ).toBeVisible();
    await expect(dialog.getByRole("button", { name: "Join Design Team" })).toBeVisible();
    await expect(page.getByRole("button", { name: "1 invitation" })).toBeVisible();
  });

  test("declining recedes to muted text with no icon", async ({ page }) => {
    await mockTeams(page, [MOCK_TEAM]);
    await mockInvitations(page, [PLATFORM_INVITATION, DESIGN_INVITATION]);

    await page.goto(APP.TEAMS);
    await page.waitForLoadState("networkidle");

    await page.getByRole("button", { name: "2 invitations" }).click();

    const dialog = page.getByRole("dialog");
    await dialog.getByRole("button", { name: "Decline invitation to Platform Team" }).click();

    await expect(dialog.getByText("Declined")).toBeVisible();
    await expect(page.getByRole("button", { name: "1 invitation" })).toBeVisible();
  });

  test("holds the in-flight state while a request is open", async ({ page }) => {
    await mockTeams(page, [MOCK_TEAM]);
    await mockInvitations(page, [PLATFORM_INVITATION, DESIGN_INVITATION], {
      resolveDelayMs: 2000,
    });

    await page.goto(APP.TEAMS);
    await page.waitForLoadState("networkidle");

    await page.getByRole("button", { name: "2 invitations" }).click();

    const dialog = page.getByRole("dialog");
    await dialog.getByRole("button", { name: "Join Platform Team" }).click();

    await expect(dialog.getByRole("button", { name: "Join Platform Team" })).toHaveText(
      "Joining...",
    );
    await expect(
      dialog.getByRole("button", { name: "Decline invitation to Platform Team" }),
    ).toBeDisabled();
  });

  test("holds the loading state while the inbox is slow", async ({ page }) => {
    await mockTeams(page, [MOCK_TEAM]);
    await mockInvitations(page, [PLATFORM_INVITATION], { delayMs: 3000 });

    await page.goto(APP.TEAMS);

    // The chip appears only once a count is known, so it never flashes at zero.
    await expect(page.getByRole("button", { name: "1 invitation" })).toBeVisible({
      timeout: 10000,
    });
  });

  test("shows the load error with a retry", async ({ page }) => {
    await mockTeams(page, [MOCK_TEAM]);
    await mockInvitations(page, [], { status: 500 });

    await page.goto(APP.TEAMS);
    await page.waitForLoadState("networkidle");

    // No count is known, so no chip renders and the failure is not toasted.
    await expect(page.getByRole("button", { name: /invitation/ })).toHaveCount(0);
    await expect(page.getByRole("status")).toHaveCount(0);
  });

  test("closes itself once nothing is left to act on", async ({ page }) => {
    await mockTeams(page, [MOCK_TEAM]);
    await mockInvitations(page, [PLATFORM_INVITATION]);

    await page.goto(APP.TEAMS);
    await page.waitForLoadState("networkidle");

    await page.getByRole("button", { name: "1 invitation" }).click();

    const dialog = page.getByRole("dialog");
    await dialog.getByRole("button", { name: "Join Platform Team" }).click();
    await expect(dialog.getByText("Invite accepted")).toBeVisible();

    // Dwells on the confirmation, then closes itself.
    await expect(dialog).toBeVisible();
    await expect(dialog).not.toBeVisible({ timeout: 8000 });
    await expect(page.getByRole("button", { name: /invitation/ })).toHaveCount(0);
    // The trigger it opened from is gone, so focus lands on the fallback.
    await expect(page.getByRole("button", { name: "Create Team" })).toBeFocused();
  });

  test("a user with no teams never sees the chip", async ({ page }) => {
    await mockTeams(page, []);
    await mockInvitations(page, [PLATFORM_INVITATION]);

    await page.goto(APP.TEAMS);
    await page.waitForLoadState("networkidle");

    // The toolbar the chip lives in renders only when a team exists, so the
    // likeliest invitee, someone with no team yet, has no way in. See the
    // note on #5536.
    await expect(page.getByText("No teams yet")).toBeVisible();
    await expect(page.getByRole("button", { name: /invitation/ })).toHaveCount(0);
  });
});
