import { describe, it, expect } from "vitest";
import { parseUriTemplatePlaceholders, resolveUriTemplate } from "./parseUriTemplate";

describe("parseUriTemplatePlaceholders", () => {
  it("extracts placeholder names in order, de-duplicated", () => {
    expect(parseUriTemplatePlaceholders("github://repos/{owner}/{repo}/contents/{path}")).toEqual([
      "owner",
      "repo",
      "path",
    ]);
  });

  it("de-duplicates a repeated placeholder", () => {
    expect(parseUriTemplatePlaceholders("x://{a}/{a}/{b}")).toEqual(["a", "b"]);
  });

  it("strips RFC 6570 operator/modifier characters from the name", () => {
    expect(parseUriTemplatePlaceholders("x://{+path}/{b*}")).toEqual(["path", "b"]);
  });

  it("returns an empty array for a template with no placeholders", () => {
    expect(parseUriTemplatePlaceholders("file:///static/a.txt")).toEqual([]);
  });

  it("returns an empty array for null/undefined", () => {
    expect(parseUriTemplatePlaceholders(null)).toEqual([]);
    expect(parseUriTemplatePlaceholders(undefined)).toEqual([]);
  });
});

describe("resolveUriTemplate", () => {
  it("substitutes every placeholder with its value", () => {
    expect(
      resolveUriTemplate("github://repos/{owner}/{repo}/contents/{path}", {
        owner: "ibm",
        repo: "mcp-context-forge",
        path: "README.md",
      }),
    ).toBe("github://repos/ibm/mcp-context-forge/contents/README.md");
  });

  it("substitutes a missing value as an empty string", () => {
    expect(resolveUriTemplate("x://{a}/{b}", { a: "1" })).toBe("x://1/");
  });
});
