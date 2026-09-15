import { describe, it, expect } from "vitest";
import {
  API_KEY_AUTH_TYPES,
  getAuthTypeGroupId,
  getAuthTypeGroupLabelId,
  getOrderedAuthTypeGroups,
  normalizeAuthTypeFilterValue,
  OPEN_AUTH_TYPE,
} from "./catalogAuthTypes";

describe("getAuthTypeGroupId", () => {
  it("groups both API-key spellings together", () => {
    expect(getAuthTypeGroupId("API Key")).toBe("apiKey");
    expect(getAuthTypeGroupId("API")).toBe("apiKey");
  });

  it("groups the open auth type", () => {
    expect(getAuthTypeGroupId(OPEN_AUTH_TYPE)).toBe("open");
  });

  it("returns null for a value outside the known set", () => {
    expect(getAuthTypeGroupId("OAuth2.1")).toBeNull();
  });
});

describe("getAuthTypeGroupLabelId", () => {
  it("resolves both API-key spellings to the same label id", () => {
    expect(getAuthTypeGroupLabelId("API Key")).toBe(getAuthTypeGroupLabelId("API"));
  });

  it("returns null for an unknown raw value", () => {
    expect(getAuthTypeGroupLabelId("OAuth2.1")).toBeNull();
  });
});

describe("normalizeAuthTypeFilterValue", () => {
  it("passes an already-normalized group id through unchanged", () => {
    expect(normalizeAuthTypeFilterValue("apiKey")).toBe("apiKey");
    expect(normalizeAuthTypeFilterValue("open")).toBe("open");
  });

  it("maps a legacy raw catalog value from an old shared link onto its group", () => {
    expect(normalizeAuthTypeFilterValue("API Key")).toBe("apiKey");
    expect(normalizeAuthTypeFilterValue("API")).toBe("apiKey");
    expect(normalizeAuthTypeFilterValue("Open")).toBe("open");
  });

  it("returns null for a value that matches no group", () => {
    expect(normalizeAuthTypeFilterValue("bogus")).toBeNull();
  });
});

describe("getOrderedAuthTypeGroups", () => {
  it("lists Open before API Key", () => {
    expect(getOrderedAuthTypeGroups().map((group) => group.id)).toEqual(["open", "apiKey"]);
  });
});

describe("API_KEY_AUTH_TYPES", () => {
  it("contains both raw spellings used for registration routing", () => {
    expect(API_KEY_AUTH_TYPES.has("API Key")).toBe(true);
    expect(API_KEY_AUTH_TYPES.has("API")).toBe(true);
  });
});
