import { describe, it, expect } from "vitest";
import { summarizeEndpoint, summarizeInterfaces, summarizeRequirements } from "./agentCardSummary";
import type { AgentCard } from "@/types/agentCard";

const card = (overrides: Partial<AgentCard> = {}): AgentCard => ({ name: "Agent", ...overrides });

describe("summarizeInterfaces", () => {
  it("marks the first of several interfaces as preferred", () => {
    expect(
      summarizeInterfaces(
        card({
          supportedInterfaces: [
            { url: "https://a/rpc", protocolBinding: "JSONRPC", protocolVersion: "1.0" },
            { url: "https://a/http", protocolBinding: "HTTP+JSON", protocolVersion: "1.0" },
          ],
        }),
      ),
    ).toBe("JSONRPC 1.0 (preferred), HTTP+JSON 1.0");
  });

  it("does not call a lone interface preferred", () => {
    expect(
      summarizeInterfaces(
        card({
          supportedInterfaces: [
            { url: "https://a/rpc", protocolBinding: "JSONRPC", protocolVersion: "1.0" },
          ],
        }),
      ),
    ).toBe("JSONRPC 1.0");
  });

  it("falls back to the url when binding and version are missing, and to empty with none", () => {
    expect(summarizeInterfaces(card({ supportedInterfaces: [{ url: "https://a/rpc" }] }))).toBe(
      "https://a/rpc",
    );
    expect(summarizeInterfaces(card())).toBe("");
  });
});

describe("summarizeEndpoint", () => {
  it("returns the host of the first interface", () => {
    expect(
      summarizeEndpoint(
        card({ supportedInterfaces: [{ url: "https://agent.example.com:8443/rpc" }] }),
      ),
    ).toBe("agent.example.com:8443");
  });

  it("returns the raw value when it is not a URL and empty when there is none", () => {
    expect(summarizeEndpoint(card({ supportedInterfaces: [{ url: "not a url" }] }))).toBe(
      "not a url",
    );
    expect(summarizeEndpoint(card())).toBe("");
  });
});

describe("summarizeRequirements", () => {
  const schemes: AgentCard["securitySchemes"] = {
    bearerAuth: { httpAuthSecurityScheme: { scheme: "Bearer" } },
    oauth: { oauth2SecurityScheme: { flows: {} } },
    key: { apiKeySecurityScheme: { name: "X-Key", location: "header" } },
  };

  it("joins alternative requirements with 'or'", () => {
    expect(
      summarizeRequirements(
        card({
          securitySchemes: schemes,
          securityRequirements: [{ schemes: { bearerAuth: {} } }, { schemes: { oauth: {} } }],
        }),
      ),
    ).toBe("bearer or OAuth 2.0");
  });

  it("joins schemes that must all be met with 'and'", () => {
    expect(
      summarizeRequirements(
        card({
          securitySchemes: schemes,
          securityRequirements: [{ schemes: { bearerAuth: {}, key: {} } }], // pragma: allowlist secret
        }),
      ),
    ).toBe("bearer and API key");
  });

  it("drops duplicates and schemes it cannot name, and is empty with no requirements", () => {
    expect(
      summarizeRequirements(
        card({
          securitySchemes: schemes,
          securityRequirements: [
            { schemes: { bearerAuth: {} } },
            { schemes: { bearerAuth: {} } },
            { schemes: { missing: {} } },
          ],
        }),
      ),
    ).toBe("bearer");
    expect(summarizeRequirements(card())).toBe("");
  });
});
