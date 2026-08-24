import { describe, expect, it } from "vitest";

import type { ToolPreviewResponse } from "@/api/tools";
import {
  codeLanguageForMime,
  estimateJsonByteSize,
  formatTextForMime,
  formatToolResultBytes,
  getDataUrl,
  getToolResultBlockWindow,
  getToolResultContentBlocks,
  getToolResultIsError,
  getToolStructuredOutput,
  isTextualMime,
  type NormalizedToolContentBlock,
  TOOL_RESULT_BLOCK_SIZE_LIMIT_BYTES,
  TOOL_RESULT_BLOCK_COUNT_LIMIT,
} from "./toolResultContent";

function makeBlock(
  id: number,
  byteSize: number,
  overrides: Partial<NormalizedToolContentBlock> = {},
): NormalizedToolContentBlock {
  return {
    type: "text",
    mimeType: "text/plain",
    text: `block ${id}`,
    raw: `block ${id}`,
    byteSize,
    isLarge: byteSize > TOOL_RESULT_BLOCK_SIZE_LIMIT_BYTES,
    ...overrides,
  };
}

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

  it("uses decoded binary sizes for data blocks", () => {
    const [base64Block] = getToolResultContentBlocks({
      content: [{ type: "blob", data: "AAECAw==", mimeType: "application/octet-stream" }],
    });
    const [dataUrlBlock] = getToolResultContentBlocks({
      content: [
        {
          type: "image",
          data: "data:image/png;base64,AAECAw==",
          mimeType: "image/png",
        },
      ],
    });

    expect(base64Block?.byteSize).toBe(4);
    expect(dataUrlBlock?.byteSize).toBe(4);
  });

  it("builds data URLs and pretty-prints JSON text", () => {
    const [imageBlock] = getToolResultContentBlocks({
      content: [{ type: "image", data: "abc", mimeType: "image/png" }],
    });
    const [textBlock] = getToolResultContentBlocks({
      content: [{ type: "text", text: "plain" }],
    });
    const [emptyDataBlock] = getToolResultContentBlocks({
      content: [{ type: "blob", data: "", mimeType: "application/octet-stream" }],
    });

    expect(imageBlock ? getDataUrl(imageBlock) : null).toBe("data:image/png;base64,abc");
    expect(textBlock ? getDataUrl(textBlock) : null).toBe("data:text/plain;charset=utf-8,plain");
    expect(emptyDataBlock ? getDataUrl(emptyDataBlock) : null).toBe(
      "data:application/octet-stream;base64,",
    );
    expect(formatTextForMime('{"ok":true}', "application/json")).toBe('{\n  "ok": true\n}');
    expect(formatTextForMime("{bad", "application/json")).toBe("{bad");
  });

  it("limits visible blocks by count and aggregate size", () => {
    const countLimited = getToolResultBlockWindow(
      Array.from({ length: TOOL_RESULT_BLOCK_COUNT_LIMIT + 2 }, (_, index) => makeBlock(index, 1)),
    );
    const sizeLimited = getToolResultBlockWindow(
      [makeBlock(1, 120), makeBlock(2, 120), makeBlock(3, 120)],
      { maxTotalBytes: 250 },
    );

    expect(countLimited.visibleBlocks).toHaveLength(TOOL_RESULT_BLOCK_COUNT_LIMIT);
    expect(countLimited.hiddenBlockCount).toBe(2);
    expect(countLimited.isLimited).toBe(true);
    expect(sizeLimited.visibleBlocks).toHaveLength(2);
    expect(sizeLimited.hiddenBlockCount).toBe(1);
    expect(sizeLimited.totalByteSize).toBe(360);
  });

  it("estimates JSON byte size with a cap", () => {
    const value = { rows: ["alpha", "beta", "gamma"] };

    expect(estimateJsonByteSize(value)).toBe(new Blob([JSON.stringify(value)]).size);
    expect(estimateJsonByteSize({ value: "x".repeat(100) }, 10)).toBeGreaterThan(10);
  });

  it("classifies textual MIME types and code languages", () => {
    expect(isTextualMime("text/csv")).toBe(true);
    expect(isTextualMime("application/json")).toBe(true);
    expect(isTextualMime("application/xml")).toBe(true);
    expect(isTextualMime("application/javascript")).toBe(true);
    expect(isTextualMime("application/x-yaml")).toBe(true);
    expect(isTextualMime("application/yaml")).toBe(true);
    expect(isTextualMime("image/png")).toBe(false);
    expect(isTextualMime("image/svg+xml")).toBe(false);

    expect(codeLanguageForMime("application/json")).toBe("json");
    expect(codeLanguageForMime("application/xml")).toBe("xml");
    expect(codeLanguageForMime("text/markdown")).toBe("markdown");
    expect(codeLanguageForMime("text/plain")).toBe("text");
  });
});
