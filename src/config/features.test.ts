import { afterEach, describe, expect, it, vi } from "vitest";

import { isVirtualServerToolTryItEnabled } from "./features";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("feature flags", () => {
  it("enables virtual-server tool Try-it only when explicitly set", () => {
    vi.stubEnv("VITE_ENABLE_VIRTUAL_SERVER_TOOL_TRY_IT", "true");
    expect(isVirtualServerToolTryItEnabled()).toBe(true);

    vi.stubEnv("VITE_ENABLE_VIRTUAL_SERVER_TOOL_TRY_IT", "false");
    expect(isVirtualServerToolTryItEnabled()).toBe(false);

    vi.stubEnv("VITE_ENABLE_VIRTUAL_SERVER_TOOL_TRY_IT", undefined);
    expect(isVirtualServerToolTryItEnabled()).toBe(false);
  });
});
