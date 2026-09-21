import { describe, it, expect } from "vitest";
import {
  API_KEY_AUTH_TYPES,
  getAuthTypeGroupId,
  getAuthTypeGroupLabelId,
  getOrderedAuthTypeGroups,
  normalizeAuthTypeFilterValue,
  OAUTH_AUTH_TYPES,
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

  it("groups every OAuth spelling together", () => {
    for (const authType of OAUTH_AUTH_TYPES) {
      expect(getAuthTypeGroupId(authType)).toBe("oauth");
    }
  });

  it("returns null for a value outside the known set", () => {
    expect(getAuthTypeGroupId("mTLS")).toBeNull();
  });
});

describe("getAuthTypeGroupLabelId", () => {
  it("resolves both API-key spellings to the same label id", () => {
    expect(getAuthTypeGroupLabelId("API Key")).toBe(getAuthTypeGroupLabelId("API"));
  });

  it("returns null for an unknown raw value", () => {
    expect(getAuthTypeGroupLabelId("mTLS")).toBeNull();
  });
});

describe("normalizeAuthTypeFilterValue", () => {
  it("passes an already-normalized group id through unchanged", () => {
    expect(normalizeAuthTypeFilterValue("apiKey")).toBe("apiKey");
    expect(normalizeAuthTypeFilterValue("open")).toBe("open");
    expect(normalizeAuthTypeFilterValue("oauth")).toBe("oauth");
  });

  it("maps a legacy raw catalog value from an old shared link onto its group", () => {
    expect(normalizeAuthTypeFilterValue("API Key")).toBe("apiKey");
    expect(normalizeAuthTypeFilterValue("API")).toBe("apiKey");
    expect(normalizeAuthTypeFilterValue("Open")).toBe("open");
    expect(normalizeAuthTypeFilterValue("OAuth2.1")).toBe("oauth");
  });

  it("returns null for a value that matches no group", () => {
    expect(normalizeAuthTypeFilterValue("bogus")).toBeNull();
  });
});

describe("getOrderedAuthTypeGroups", () => {
  it("lists Open, API Key, then OAuth", () => {
    expect(getOrderedAuthTypeGroups().map((group) => group.id)).toEqual([
      "open",
      "apiKey",
      "oauth",
    ]);
  });
});

describe("API_KEY_AUTH_TYPES", () => {
  it("contains both raw spellings used for registration routing", () => {
    expect(API_KEY_AUTH_TYPES.has("API Key")).toBe(true);
    expect(API_KEY_AUTH_TYPES.has("API")).toBe(true);
  });
});
