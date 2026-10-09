import { describe, expect, it } from "vitest";

import { getToolAnnotationHints } from "./toolAnnotations";

describe("getToolAnnotationHints", () => {
  it("defaults all hints to false for null and empty annotations", () => {
    expect(getToolAnnotationHints(null)).toEqual({
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: false,
    });
    expect(getToolAnnotationHints({})).toEqual({
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: false,
    });
  });

  it("reads boolean hints", () => {
    expect(
      getToolAnnotationHints({
        readOnlyHint: true,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: true,
      }),
    ).toEqual({
      readOnlyHint: true,
      destructiveHint: true,
      idempotentHint: false,
      openWorldHint: true,
    });
  });

  it("coerces string true values defensively", () => {
    expect(
      getToolAnnotationHints({
        readOnlyHint: "true",
        destructiveHint: "TRUE",
        idempotentHint: "false",
        openWorldHint: "yes",
      }),
    ).toEqual({
      readOnlyHint: true,
      destructiveHint: true,
      idempotentHint: false,
      openWorldHint: false,
    });
  });
});
