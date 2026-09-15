import { listMyInvitations, acceptInvitation, declineInvitation } from "./invitations";
import { api } from "./client";

vi.mock("@/api/client", () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
  },
}));

describe("listMyInvitations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("GETs the caller's invitations and returns them", async () => {
    const invitations = [{ id: "inv-1", team_name: "Platform Team" }];
    vi.mocked(api.get).mockResolvedValue(invitations);

    const result = await listMyInvitations();

    expect(api.get).toHaveBeenCalledWith("/users/me/invitations");
    expect(result).toEqual(invitations);
  });

  it("propagates errors from the API", async () => {
    vi.mocked(api.get).mockRejectedValue(new Error("boom"));

    await expect(listMyInvitations()).rejects.toThrow("boom");
  });
});

describe("acceptInvitation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("POSTs to the accept route and returns the new membership", async () => {
    const member = { user_email: "invitee@example.com", role: "member" };
    vi.mocked(api.post).mockResolvedValue(member);

    const result = await acceptInvitation("tok-1");

    expect(api.post).toHaveBeenCalledWith("/teams/invitations/tok-1/accept");
    expect(result).toEqual(member);
  });

  it("encodes the token", async () => {
    vi.mocked(api.post).mockResolvedValue(undefined);

    await acceptInvitation("tok/with spaces?");

    expect(api.post).toHaveBeenCalledWith("/teams/invitations/tok%2Fwith%20spaces%3F/accept");
  });

  it("propagates errors from the API", async () => {
    vi.mocked(api.post).mockRejectedValue(new Error("boom"));

    await expect(acceptInvitation("tok-1")).rejects.toThrow("boom");
  });
});

describe("declineInvitation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("POSTs to the decline route", async () => {
    vi.mocked(api.post).mockResolvedValue(undefined);

    await declineInvitation("tok-1");

    expect(api.post).toHaveBeenCalledWith("/teams/invitations/tok-1/decline");
  });

  it("encodes the token", async () => {
    vi.mocked(api.post).mockResolvedValue(undefined);

    await declineInvitation("tok/with spaces?");

    expect(api.post).toHaveBeenCalledWith("/teams/invitations/tok%2Fwith%20spaces%3F/decline");
  });

  it("propagates errors from the API", async () => {
    vi.mocked(api.post).mockRejectedValue(new Error("boom"));

    await expect(declineInvitation("tok-1")).rejects.toThrow("boom");
  });
});
