import { act, render, renderHook, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "@/api/client";
import type { Team } from "@/types/team";
import { TeamsProvider, useTeamsContext } from "./TeamsProvider";

vi.mock("@/api/client", () => ({
  api: { get: vi.fn() },
}));

const mockGet = vi.mocked(api.get);

const alpha = { id: "team-alpha", name: "Alpha" } as Team;
const beta = { id: "team-beta", name: "Beta" } as Team;

const wrapper = ({ children }: { children: ReactNode }) => (
  <TeamsProvider>{children}</TeamsProvider>
);

function TeamNames({ label }: { label: string }) {
  const { teams } = useTeamsContext();
  return <span data-testid={label}>{teams.map((t) => t.name).join(",")}</span>;
}

describe("TeamsProvider", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("loads the caller's teams once for every consumer", async () => {
    mockGet.mockResolvedValue({ teams: [alpha] });

    render(
      <TeamsProvider>
        <TeamNames label="first" />
        <TeamNames label="second" />
      </TeamsProvider>,
    );

    await waitFor(() => expect(screen.getByTestId("first")).toHaveTextContent("Alpha"));
    expect(screen.getByTestId("second")).toHaveTextContent("Alpha");
    expect(mockGet).toHaveBeenCalledTimes(1);
    expect(mockGet.mock.calls[0][0]).toBe("/teams");
  });

  it("updates every consumer after a refetch", async () => {
    mockGet.mockResolvedValueOnce({ teams: [alpha] });
    function RefreshButton() {
      const { refetch } = useTeamsContext();
      return <button onClick={() => void refetch()}>refresh</button>;
    }
    render(
      <TeamsProvider>
        <TeamNames label="switcher" />
        <TeamNames label="picker" />
        <RefreshButton />
      </TeamsProvider>,
    );
    await waitFor(() => expect(screen.getByTestId("switcher")).toHaveTextContent("Alpha"));

    mockGet.mockResolvedValueOnce({ teams: [alpha, beta] });
    await act(async () => {
      screen.getByRole("button", { name: "refresh" }).click();
    });

    await waitFor(() => expect(screen.getByTestId("switcher")).toHaveTextContent("Alpha,Beta"));
    expect(screen.getByTestId("picker")).toHaveTextContent("Alpha,Beta");
    expect(mockGet).toHaveBeenCalledTimes(2);
  });

  it("keeps the list on screen while a refetch is in flight", async () => {
    mockGet.mockResolvedValueOnce({ teams: [alpha] });
    const { result } = renderHook(() => useTeamsContext(), { wrapper });
    await waitFor(() => expect(result.current.teams).toEqual([alpha]));
    expect(result.current.isLoading).toBe(false);

    let resolveRefetch: (value: { teams: Team[] }) => void = () => {};
    mockGet.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveRefetch = resolve;
      }),
    );

    let pending: Promise<void> = Promise.resolve();
    act(() => {
      pending = result.current.refetch();
    });

    expect(result.current.isLoading).toBe(false);
    expect(result.current.teams).toEqual([alpha]);

    await act(async () => {
      resolveRefetch({ teams: [alpha, beta] });
      await pending;
    });
    expect(result.current.teams).toEqual([alpha, beta]);
  });

  it("reports loading only until the first response lands", async () => {
    mockGet.mockResolvedValue({ teams: [alpha] });
    const { result } = renderHook(() => useTeamsContext(), { wrapper });

    expect(result.current.isLoading).toBe(true);
    await waitFor(() => expect(result.current.isLoading).toBe(false));
  });

  it("does not reject when a refetch fails, and keeps the last good list", async () => {
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    mockGet.mockResolvedValueOnce({ teams: [alpha] });
    const { result } = renderHook(() => useTeamsContext(), { wrapper });
    await waitFor(() => expect(result.current.teams).toEqual([alpha]));

    mockGet.mockRejectedValueOnce(new Error("boom"));
    await act(async () => {
      await expect(result.current.refetch()).resolves.toBeUndefined();
    });

    expect(result.current.error).toBe("boom");
    expect(result.current.teams).toEqual([alpha]);
    expect(consoleErrorSpy).toHaveBeenCalled();
    consoleErrorSpy.mockRestore();
  });

  it("throws when used outside the provider", () => {
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    expect(() => renderHook(() => useTeamsContext())).toThrow(
      "useTeamsContext must be used inside <TeamsProvider>",
    );

    consoleErrorSpy.mockRestore();
  });
});
