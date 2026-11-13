import { describe, it, expect } from "vitest";
import {
  credentialFields,
  hasRequiredCredentials,
  parseList,
  type AgentAuthValues,
} from "./manualAgent";

const makeValues = (overrides: Partial<AgentAuthValues> = {}): AgentAuthValues => ({
  token: "",
  username: "",
  password: "", // pragma: allowlist secret
  headers: [],
  queryParamName: "",
  queryParamValue: "",
  oauthTokenUrl: "",
  oauthClientId: "",
  oauthClientSecret: "", // pragma: allowlist secret
  oauthScopes: "",
  ...overrides,
});

describe("parseList", () => {
  it("splits on commas, trims and drops blanks", () => {
    expect(parseList(" a, b ,, c ")).toEqual(["a", "b", "c"]);
  });

  it("also splits on whitespace when asked", () => {
    expect(parseList("read write,admin")).toEqual(["read write", "admin"]);
    expect(parseList("read write,admin", true)).toEqual(["read", "write", "admin"]);
  });
});

describe("hasRequiredCredentials", () => {
  it("needs nothing for none or no type", () => {
    expect(hasRequiredCredentials("none", makeValues())).toBe(true);
    expect(hasRequiredCredentials(null, makeValues())).toBe(true);
  });

  it.each([
    ["bearer", makeValues({ token: "t" }), makeValues()],
    ["basic", makeValues({ username: "u", password: "p" }), makeValues({ username: "u" })],
    [
      "authheaders",
      makeValues({ headers: [{ id: "1", key: "X-Key", value: "v" }] }),
      makeValues({ headers: [{ id: "1", key: "X-Key", value: "" }] }),
    ],
    [
      "query_param",
      makeValues({ queryParamName: "k", queryParamValue: "v" }),
      makeValues({ queryParamName: "k" }),
    ],
    [
      "oauth",
      makeValues({ oauthTokenUrl: "https://t", oauthClientId: "id", oauthClientSecret: "s" }),
      makeValues({ oauthTokenUrl: "https://t", oauthClientId: "id" }),
    ],
  ] as const)("%s needs its fields filled", (type, complete, incomplete) => {
    expect(hasRequiredCredentials(type, complete)).toBe(true);
    expect(hasRequiredCredentials(type, incomplete)).toBe(false);
  });
});

describe("credentialFields", () => {
  it("is empty for none", () => {
    expect(credentialFields("none", makeValues())).toEqual({});
  });

  it("maps each type onto its A2AAgentCreate fields", () => {
    expect(credentialFields("bearer", makeValues({ token: " t " }))).toEqual({
      auth_type: "bearer",
      auth_token: "t",
    });
    expect(credentialFields("basic", makeValues({ username: " u ", password: "p" }))).toEqual({
      auth_type: "basic",
      auth_username: "u",
      auth_password: "p",
    });
    expect(
      credentialFields(
        "authheaders",
        makeValues({ headers: [{ id: "1", key: " X-Key ", value: "v" }] }),
      ),
    ).toEqual({ auth_type: "authheaders", auth_headers: [{ key: "X-Key", value: "v" }] });
    expect(
      credentialFields("query_param", makeValues({ queryParamName: " k ", queryParamValue: "v" })),
    ).toEqual({ auth_type: "query_param", auth_query_param_key: "k", auth_query_param_value: "v" });
  });

  it("builds a client-credentials oauth config with scopes split on commas or spaces", () => {
    expect(
      credentialFields(
        "oauth",
        makeValues({
          oauthTokenUrl: " https://auth.example.com/token ",
          oauthClientId: " id ",
          oauthClientSecret: "s",
          oauthScopes: "read, write admin",
        }),
      ),
    ).toEqual({
      auth_type: "oauth",
      oauth_config: {
        grant_type: "client_credentials",
        client_id: "id",
        client_secret: "s",
        token_url: "https://auth.example.com/token",
        scopes: ["read", "write", "admin"],
      },
    });
  });
});
