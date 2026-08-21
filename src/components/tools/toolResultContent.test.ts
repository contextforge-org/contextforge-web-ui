import { describe, expect, it } from "vitest";

import type { ToolPreviewResponse } from "@/api/tools";
import {
  codeLanguageForMime,
  formatTextForMime,
  formatToolResultBytes,
  getDataUrl,
  getToolResultContentBlocks,
  getToolResultIsError,
  getToolStructuredOutput,
  isTextualMime,
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

  it("normalizes alternate block shapes and skips invalid content entries", () => {
    const response = {
      tool_result: {
        content: [
          "string block",
          null,
          7,
          { content: "<root />", mime: "application/xml" },
          { blob: "data:text/plain;base64,Zm9v", mimeType: "text/plain" },
          { resource: { uri: "file://report.pdf", mime_type: "application/pdf" } },
          { metadata: { fallback: true } },
        ],
        is_error: true,
      },
    } as ToolPreviewResponse;

    const blocks = getToolResultContentBlocks(response);

    expect(blocks).toMatchObject([
      { type: "text", mimeType: "text/plain", text: "string block" },
      { type: "text", mimeType: "application/xml", text: "<root />" },
      { type: "blob", mimeType: "text/plain", data: "data:text/plain;base64,Zm9v" },
      { type: "resource", mimeType: "application/pdf", uri: "file://report.pdf" },
      { type: "unknown", mimeType: "application/octet-stream" },
    ]);
    expect(getToolResultIsError(response)).toBe(true);
    expect(getDataUrl(blocks[2]!)).toBe("data:text/plain;base64,Zm9v");
    expect(getDataUrl(blocks[3]!)).toBeNull();
  });

  it("handles empty payloads and alternate structured output names", () => {
    expect(
      getToolResultContentBlocks({ content: "not an array" } as unknown as ToolPreviewResponse),
    ).toEqual([]);
    expect(getToolResultContentBlocks({ output: { content: [] } } as ToolPreviewResponse)).toEqual(
      [],
    );
    expect(
      getToolStructuredOutput({
        output: { structuredOutput: { status: "ok" } },
      } as ToolPreviewResponse),
    ).toEqual({ status: "ok" });
    expect(getToolStructuredOutput({} as ToolPreviewResponse)).toBeUndefined();
    expect(getToolResultIsError({ is_error: false } as ToolPreviewResponse)).toBe(false);
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

  it("classifies textual MIME types and code languages", () => {
    expect(isTextualMime("text/csv")).toBe(true);
    expect(isTextualMime("application/json")).toBe(true);
    expect(isTextualMime("application/xml")).toBe(true);
    expect(isTextualMime("application/javascript")).toBe(true);
    expect(isTextualMime("application/x-yaml")).toBe(true);
    expect(isTextualMime("application/yaml")).toBe(true);
    expect(isTextualMime("image/png")).toBe(false);

    expect(codeLanguageForMime("application/json")).toBe("json");
    expect(codeLanguageForMime("application/xml")).toBe("tsx");
    expect(codeLanguageForMime("text/plain")).toBe("bash");
  });
});
