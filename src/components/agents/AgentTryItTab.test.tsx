import { describe, expect, it, vi } from "vitest";
import userEvent from "@testing-library/user-event";
import { screen, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";

import { server } from "@/test/mocks/server";
import { renderWithProviders } from "@/test/test-utils";
import { AgentTryItTab } from "./AgentTryItTab";

const TEST_URL = "/api/v1/a2a/agent-1/test";

function success(result: unknown) {
  return HttpResponse.json({
    success: true,
    result,
    agent_name: "objekts router",
    test_timestamp: 1_790_000_000,
  });
}

function failure(status: number, errorType: string, error = "A2A agent invocation failed") {
  return HttpResponse.json(
    { detail: { success: false, error, error_type: errorType, agent_id: "agent-1" } },
    { status },
  );
}

function renderTab() {
  return renderWithProviders(<AgentTryItTab agentId="agent-1" protocolVersion="1.0" />);
}

async function run(message?: string) {
  const user = userEvent.setup();
  if (message) await user.type(screen.getByLabelText("Test agent"), message);
  await user.click(screen.getByRole("button", { name: "Send test message" }));
}

describe("AgentTryItTab", () => {
  it("says before the first call that it reaches the agent", () => {
    renderTab();
    expect(
      screen.getByText(/record a metric, update last used, or create a task/i),
    ).toBeInTheDocument();
  });

  it("limits the message to 4096 characters", () => {
    renderTab();
    expect(screen.getByLabelText("Test agent")).toHaveAttribute("maxlength", "4096");
  });

  it("sends the message and shows the reply", async () => {
    const seen = vi.fn();
    server.use(
      http.post(TEST_URL, async ({ request }) => {
        seen(await request.json());
        return success({ message: { role: "ROLE_AGENT", parts: [{ text: "pong" }] } });
      }),
    );
    renderTab();
    await run("ping");

    expect(await screen.findByText("pong")).toBeInTheDocument();
    expect(screen.getByText(/^200 OK$/)).toBeInTheDocument();
    expect(screen.getByText("A2A v1.0")).toBeInTheDocument();
    expect(screen.getByText("ROLE_AGENT")).toBeInTheDocument();
    expect(seen).toHaveBeenCalledWith({ query: "ping" });
  });

  it("sends with Enter and keeps Shift+Enter for a new line", async () => {
    const seen = vi.fn();
    server.use(
      http.post(TEST_URL, async ({ request }) => {
        seen(await request.json());
        return success({ message: { role: "ROLE_AGENT", parts: [{ text: "pong" }] } });
      }),
    );
    renderTab();
    const user = userEvent.setup();
    await user.type(screen.getByLabelText("Test agent"), "a{Shift>}{Enter}{/Shift}b");
    expect(seen).not.toHaveBeenCalled();
    await user.keyboard("{Enter}");

    await screen.findByText("pong");
    expect(seen).toHaveBeenCalledWith({ query: "a\nb" });
  });

  it("sends no query when the field is empty, so the service default is used", async () => {
    const seen = vi.fn();
    server.use(
      http.post(TEST_URL, async ({ request }) => {
        seen(await request.json());
        return success({ message: { role: "ROLE_AGENT", parts: [{ text: "hi" }] } });
      }),
    );
    renderTab();
    await run();

    expect(await screen.findByText("hi")).toBeInTheDocument();
    expect(seen).toHaveBeenCalledWith({});
  });

  it("sends the same message again from Re-test", async () => {
    const seen = vi.fn();
    server.use(
      http.post(TEST_URL, async ({ request }) => {
        seen(await request.json());
        return success({ message: { role: "ROLE_AGENT", parts: [{ text: "pong" }] } });
      }),
    );
    renderTab();
    await run("ping");
    await screen.findByText("pong");

    await userEvent.setup().click(screen.getByRole("button", { name: "Re-test" }));
    await waitFor(() => expect(seen).toHaveBeenCalledTimes(2));
    expect(seen).toHaveBeenLastCalledWith({ query: "ping" });
  });

  it("shows a JSON-RPC error in a 200 reply as a failure with its code and message", async () => {
    server.use(
      http.post(TEST_URL, () =>
        success({ jsonrpc: "2.0", id: 1, error: { code: -32601, message: "Method not found" } }),
      ),
    );
    renderTab();
    await run();

    expect(await screen.findByText("Code -32601: Method not found")).toBeInTheDocument();
    expect(screen.getByText("200 Failed")).toBeInTheDocument();
    expect(screen.getByText(/request succeeded; the agent reported the error/)).toBeInTheDocument();
    expect(screen.queryByText("200 OK")).not.toBeInTheDocument();
  });

  it("shows an empty reply with no error", async () => {
    server.use(http.post(TEST_URL, () => success({ error: null })));
    renderTab();
    await run();

    expect(await screen.findByText("The agent returned an empty reply.")).toBeInTheDocument();
    expect(screen.getByText("200 OK")).toBeInTheDocument();
  });

  it("shows error_type and the message from a failure body", async () => {
    server.use(http.post(TEST_URL, () => failure(502, "agent_error", "Upstream said no")));
    renderTab();
    await run();

    expect(await screen.findByText("502 Failed")).toBeInTheDocument();
    expect(screen.getByText("Upstream said no")).toBeInTheDocument();
    expect(screen.getByText("Agent error")).toBeInTheDocument();
  });

  it("shows a timeout apart from an agent failure", async () => {
    server.use(http.post(TEST_URL, () => failure(504, "timeout", "Timed out")));
    renderTab();
    await run();

    expect(await screen.findByText("504 Timed out")).toBeInTheDocument();
    expect(screen.queryByText(/Failed/)).not.toBeInTheDocument();
  });

  // The contract from IBM/mcp-context-forge#7685: a read timeout answers 504 with
  // error_type "timeout" and a fixed message, and every other failure keeps its own type.
  describe("a read timeout (IBM/mcp-context-forge#7685)", () => {
    it("shows 504 with error_type timeout as a timeout, with the reason and the fixed message", async () => {
      server.use(
        http.post(TEST_URL, () => failure(504, "timeout", "The A2A agent did not respond in time")),
      );
      renderTab();
      await run();

      expect(await screen.findByText("504 Timed out")).toBeInTheDocument();
      expect(screen.getByText("Timeout")).toBeInTheDocument();
      expect(screen.getByText(/no response in \d+s/)).toBeInTheDocument();
      expect(screen.queryByText(/Failed/)).not.toBeInTheDocument();
    });

    it("shows error_type timeout as a timeout whatever status carries it", async () => {
      server.use(http.post(TEST_URL, () => failure(502, "timeout")));
      renderTab();
      await run();

      expect(await screen.findByText("502 Timed out")).toBeInTheDocument();
    });

    it.each([
      ["agent_error", "Agent error"],
      ["agent_disabled", "Agent disabled"],
      ["not_found", "Agent not found"],
      ["validation_error", "Invalid test message"],
      ["internal_error", "Internal error"],
    ])("still shows %s as a failure, never as a timeout", async (errorType, reason) => {
      server.use(http.post(TEST_URL, () => failure(502, errorType, "Something else went wrong")));
      renderTab();
      await run();

      expect(await screen.findByText("502 Failed")).toBeInTheDocument();
      expect(screen.getByText(reason)).toBeInTheDocument();
      expect(screen.queryByText(/Timed out/)).not.toBeInTheDocument();
    });

    // Needs the regenerated client: openapi.json still predates the 504 response and the
    // "timeout" value of A2ATestError.error_type. Turn these into real tests once it lists them.
    it.todo("openapi.json lists the 504 response of POST /v1/a2a/{agent_id}/test");
    it.todo('openapi.json lists "timeout" among the error_type values of A2ATestError');
  });

  it("shows the task id and state, without links to task routes", async () => {
    server.use(
      http.post(TEST_URL, () =>
        success({ task: { id: "task-9", status: { state: "TASK_STATE_COMPLETED" } } }),
      ),
    );
    renderTab();
    await run();

    expect(await screen.findByText("task-9")).toBeInTheDocument();
    expect(screen.getByText("completed")).toBeInTheDocument();
    expect(screen.getByText("TASK_STATE_COMPLETED")).toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it.each([
    ["TASK_STATE_INPUT_REQUIRED", "The agent is waiting for input."],
    ["auth-required", "The agent needs authorization."],
  ])("shows %s as neither success nor failure", async (state, text) => {
    server.use(http.post(TEST_URL, () => success({ task: { id: "t", status: { state } } })));
    renderTab();
    await run();

    expect(await screen.findByText(text)).toBeInTheDocument();
    expect(screen.getByText("200 Waiting")).toBeInTheDocument();
    expect(screen.queryByText(/OK|Failed/)).not.toBeInTheDocument();
  });

  it("counts characters in place of the notice, until a test takes the slot", async () => {
    const user = userEvent.setup();
    server.use(http.post(TEST_URL, () => success({ message: { parts: [{ text: "pong" }] } })));
    renderTab();

    const notice = /record a metric, update last used, or create a task/i;
    expect(screen.getByText(notice)).toBeInTheDocument();

    await user.type(screen.getByLabelText("Test agent"), "hello");
    expect(screen.getByText("5 / 4096")).toBeInTheDocument();
    expect(screen.queryByText(notice)).not.toBeInTheDocument();

    await user.clear(screen.getByLabelText("Test agent"));
    expect(screen.getByText(notice)).toBeInTheDocument();
    expect(screen.queryByText(/\/ 4096$/)).not.toBeInTheDocument();

    await run("hello");
    expect(await screen.findByText("pong")).toBeInTheDocument();
    expect(screen.getByLabelText("Test agent")).toHaveValue("hello");
    expect(screen.queryByText(/\/ 4096$/)).not.toBeInTheDocument();
  });

  it("shows elapsed time while waiting, and lets the caller cancel", async () => {
    server.use(http.post(TEST_URL, () => new Promise(() => {})));
    renderTab();
    await run("hello");

    expect(
      await screen.findByText(/^Elapsed /, { ignore: "[aria-hidden='true']" }),
    ).toBeInTheDocument();
    expect(screen.queryByText(/\/ 4096$/)).not.toBeInTheDocument();

    await userEvent.setup().click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Send test message" })).toBeEnabled(),
    );
    expect(screen.queryByText(/Failed|Timed out/)).not.toBeInTheDocument();
  });
});
