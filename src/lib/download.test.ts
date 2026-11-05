import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { downloadJson } from "./download";

describe("downloadJson", () => {
  let createObjectURL: ReturnType<typeof vi.fn>;
  let revokeObjectURL: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.useFakeTimers();
    // jsdom has no object URL support.
    createObjectURL = vi.fn().mockReturnValue("blob:test-url");
    revokeObjectURL = vi.fn();
    Object.assign(URL, { createObjectURL, revokeObjectURL });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("downloads a pretty-printed JSON blob under the given filename", async () => {
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      expect(this.href).toBe("blob:test-url");
      expect(this.download).toBe("export.json");
      expect(this.isConnected).toBe(true);
    });

    downloadJson({ a: 1 }, "export.json");

    expect(click).toHaveBeenCalledOnce();
    const blob = createObjectURL.mock.calls[0][0] as Blob;
    expect(blob.type).toBe("application/json");
    // jsdom's Blob is only readable through its own FileReader, which needs real timers.
    vi.useRealTimers();
    const text = await new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.readAsText(blob);
    });
    expect(text).toBe('{\n  "a": 1\n}');
  });

  it("removes the link and revokes the URL after the click", () => {
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});

    downloadJson({}, "x.json");

    expect(document.querySelector("a[download]")).toBeNull();
    expect(revokeObjectURL).not.toHaveBeenCalled();
    vi.runAllTimers();
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:test-url");
  });
});
