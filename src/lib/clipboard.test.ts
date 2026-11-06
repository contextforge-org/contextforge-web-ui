import { afterEach, describe, expect, it, vi } from "vitest";
import { copyToClipboard } from "./clipboard";

// Own property shadows the prototype getter; deleting it restores the original.
const stubClipboard = (value: unknown) =>
  Object.defineProperty(navigator, "clipboard", { value, configurable: true });

describe("copyToClipboard", () => {
  afterEach(() => {
    delete (navigator as { clipboard?: unknown }).clipboard;
  });

  it("writes to navigator.clipboard.writeText and resolves true on success", async () => {
    const writeTextMock = vi.fn().mockResolvedValue(undefined);
    stubClipboard({ writeText: writeTextMock });

    await expect(copyToClipboard("test-text")).resolves.toBe(true);
    expect(writeTextMock).toHaveBeenCalledWith("test-text");
  });

  it("resolves false without throwing when clipboard is undefined", async () => {
    stubClipboard(undefined);

    await expect(copyToClipboard("test")).resolves.toBe(false);
  });

  it("resolves false when writeText rejects", async () => {
    stubClipboard({ writeText: vi.fn().mockRejectedValue(new Error("denied")) });

    await expect(copyToClipboard("test-text")).resolves.toBe(false);
  });
});
