import { describe, expect, it, vi } from "vitest";
import { copyToClipboard } from "./clipboard";

describe("copyToClipboard", () => {
  it("writes to navigator.clipboard.writeText and resolves true on success", async () => {
    const writeTextMock = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, {
      clipboard: {
        writeText: writeTextMock,
      },
    });

    await expect(copyToClipboard("test-text")).resolves.toBe(true);
    expect(writeTextMock).toHaveBeenCalledWith("test-text");
  });

  it("resolves false without throwing when clipboard is undefined", async () => {
    const originalClipboard = navigator.clipboard;
    // @ts-expect-error - testing missing clipboard
    delete navigator.clipboard;

    await expect(copyToClipboard("test")).resolves.toBe(false);

    // @ts-expect-error - restoring clipboard
    navigator.clipboard = originalClipboard;
  });

  it("resolves false when writeText rejects", async () => {
    const writeTextMock = vi.fn().mockRejectedValue(new Error("denied"));
    Object.assign(navigator, {
      clipboard: {
        writeText: writeTextMock,
      },
    });

    await expect(copyToClipboard("test-text")).resolves.toBe(false);
  });
});
