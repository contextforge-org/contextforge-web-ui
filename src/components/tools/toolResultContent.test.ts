import { describe, expect, it } from "vitest";

import type { ToolPreviewResponse } from "@/api/tools";
import {
  formatTextForMime,
  formatToolResultBytes,
  getDataUrl,
  getToolResultContentBlocks,
  getToolResultIsError,
  getToolStructuredOutput,
  TOOL_RESULT_BLOCK_SIZE_LIMIT_BYTES,
} from "./toolResultContent";

describe("toolResultContent", () => {
  it("normalizes direct content blocks", () => {
    const blocks = getToolResultContentBlocks({
      content: [
        { type: "text", text: "hello", mimeType: "text/plain" },
        { type: "resource", resource: { uri: "file://a", text: '{"ok":true}' } },
      ],
    });

    expect(blocks).toMatchObject([
      { type: "text", mimeType: "text/plain", text: "hello", byteSize: 5, isLarge: false },
      {
        type: "resource",
        mimeType: "text/plain",
        text: '{"ok":true}',
        uri: "file://a",
        isLarge: false,
      },
    ]);
  });

  it("normalizes wrapped result payloads for live-invoke reuse", () => {
    const response = {
      result: {
        content: [{ type: "text", text: "wrapped" }],
        structured_output: { count: 1 },
        isError: true,
      },
    } as ToolPreviewResponse;

    expect(getToolResultContentBlocks(response)).toHaveLength(1);
    expect(getToolStructuredOutput(response)).toEqual({ count: 1 });
    expect(getToolResultIsError(response)).toBe(true);
  });

  it("marks large blocks and formats byte sizes", () => {
    const text = "x".repeat(TOOL_RESULT_BLOCK_SIZE_LIMIT_BYTES + 1);
    const [block] = getToolResultContentBlocks({ content: [{ type: "text", text }] });

    expect(block?.isLarge).toBe(true);
    expect(formatToolResultBytes(100)).toBe("100 B");
    expect(formatToolResultBytes(2 * 1024)).toBe("2 KB");
    expect(formatToolResultBytes(2 * 1024 * 1024)).toBe("2.0 MB");
  });

  it("builds data URLs and pretty-prints JSON text", () => {
    const [imageBlock] = getToolResultContentBlocks({
      content: [{ type: "image", data: "abc", mimeType: "image/png" }],
    });
    const [textBlock] = getToolResultContentBlocks({
      content: [{ type: "text", text: "plain" }],
    });

    expect(imageBlock ? getDataUrl(imageBlock) : null).toBe("data:image/png;base64,abc");
    expect(textBlock ? getDataUrl(textBlock) : null).toBe("data:text/plain;charset=utf-8,plain");
    expect(formatTextForMime('{"ok":true}', "application/json")).toBe('{\n  "ok": true\n}');
    expect(formatTextForMime("{bad", "application/json")).toBe("{bad");
  });
});
