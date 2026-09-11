import { createRef } from "react";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "@/test/test-utils";
import { PendingInvitationsChip } from "./PendingInvitationsChip";

const open = vi.fn();
let count = 1;

vi.mock("./PendingInvitationsProvider", () => ({
  usePendingInvitations: () => ({
    count,
    isLoading: false,
    error: null,
    open,
    acceptedCount: 0,
    register: () => () => {},
  }),
}));

describe("PendingInvitationsChip", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    count = 1;
  });

  it("renders nothing when there is nothing pending", () => {
    count = 0;
    const { container } = renderWithProviders(<PendingInvitationsChip />);

    expect(container).toBeEmptyDOMElement();
  });

  it("labels one invitation in the singular", () => {
    renderWithProviders(<PendingInvitationsChip />);

    expect(screen.getByRole("button", { name: "1 invitation" })).toBeInTheDocument();
  });

  it("labels several invitations in the plural", () => {
    count = 3;
    renderWithProviders(<PendingInvitationsChip />);

    expect(screen.getByRole("button", { name: "3 invitations" })).toBeInTheDocument();
  });

  it("opens the shared dialog, passing the fallback focus target", async () => {
    const user = userEvent.setup();
    const fallbackFocusRef = createRef<HTMLElement>();
    renderWithProviders(<PendingInvitationsChip fallbackFocusRef={fallbackFocusRef} />);

    await user.click(screen.getByRole("button"));

    expect(open).toHaveBeenCalledWith(fallbackFocusRef);
  });

  it("lets a surface override the label", () => {
    count = 2;
    renderWithProviders(<PendingInvitationsChip label={(n) => `You have ${n} waiting`} />);

    expect(screen.getByRole("button", { name: "You have 2 waiting" })).toBeInTheDocument();
  });

  it("merges className onto the trigger", () => {
    renderWithProviders(<PendingInvitationsChip className="ml-2" />);

    expect(screen.getByRole("button")).toHaveClass("ml-2");
  });
});
