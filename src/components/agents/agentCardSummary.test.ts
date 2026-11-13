import { describe, it, expect } from "vitest";
import { createIntl } from "react-intl";
import messages from "@/i18n/locales/en-US/agents.json";
import {
  capabilityRows,
  describedSkills,
  interfaceRows,
  isCardSigned,
  joinModes,
  summarizeEndpoint,
  summarizeInterfaces,
  summarizePublisher,
  summarizeRequirements,
} from "./agentCardSummary";
import type { AgentCard } from "@/types/agentCard";

const intl = createIntl({ locale: "en-US", messages });
const interfaces = (value: AgentCard) => summarizeInterfaces(value, intl);
const requirements = (value: AgentCard) => summarizeRequirements(value, intl);
const card = (overrides: Partial<AgentCard> = {}): AgentCard => ({ name: "Agent", ...overrides });

describe("summarizeInterfaces", () => {
  it("names the bindings and marks the first of several as preferred", () => {
    expect(
      interfaces(
        card({
          supportedInterfaces: [
            { url: "https://a/rpc", protocolBinding: "JSONRPC", protocolVersion: "1.0" },
            { url: "https://a/http", protocolBinding: "HTTP+JSON", protocolVersion: "1.0" },
          ],
        }),
      ),
    ).toBe("JSON-RPC (preferred), HTTP+JSON");
  });

  it("does not call a lone interface preferred", () => {
    expect(
      interfaces(
        card({ supportedInterfaces: [{ url: "https://a/rpc", protocolBinding: "JSONRPC" }] }),
      ),
    ).toBe("JSON-RPC");
  });

  it("falls back to the url when there is no binding, and to empty with no interfaces", () => {
    expect(interfaces(card({ supportedInterfaces: [{ url: "https://a/rpc" }] }))).toBe(
      "https://a/rpc",
    );
    expect(interfaces(card())).toBe("");
  });
});

describe("interfaceRows", () => {
  it("lists each interface with its binding, version and address without the scheme", () => {
    expect(
      interfaceRows(
        card({
          supportedInterfaces: [
            {
              url: "https://agents.acme.example/a2a/v1",
              protocolBinding: "JSONRPC",
              protocolVersion: "1.0",
            },
            { url: "http://agents.acme.example/http/v1/", protocolBinding: "HTTP+JSON" },
          ],
        }),
      ),
    ).toEqual([
      { binding: "JSON-RPC", version: "1.0", address: "agents.acme.example/a2a/v1" },
      { binding: "HTTP+JSON", version: "", address: "agents.acme.example/http/v1" },
    ]);
  });

  it("is empty when there are no interfaces", () => {
    expect(interfaceRows(card())).toEqual([]);
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
    queryKey: { apiKeySecurityScheme: { name: "k", location: "query" } },
  };

  it("joins alternative requirements with 'or'", () => {
    expect(
      requirements(
        card({
          securitySchemes: schemes,
          securityRequirements: [{ schemes: { bearerAuth: {} } }, { schemes: { oauth: {} } }],
        }),
      ),
    ).toBe("bearer or oauth2");
  });

  it("says where an API key goes", () => {
    expect(
      requirements(
        card({ securitySchemes: schemes, securityRequirements: [{ schemes: { key: {} } }] }),
      ),
    ).toBe("API key in header");
    expect(
      requirements(
        card({ securitySchemes: schemes, securityRequirements: [{ schemes: { queryKey: {} } }] }),
      ),
    ).toBe("API key in query");
  });

  it("joins schemes that must all be met with 'and'", () => {
    expect(
      requirements(
        card({
          securitySchemes: schemes,
          securityRequirements: [{ schemes: { bearerAuth: {}, key: {} } }], // pragma: allowlist secret
        }),
      ),
    ).toBe("bearer and API key in header");
  });

  it("drops duplicates and schemes it cannot name, and is empty with no requirements", () => {
    expect(
      requirements(
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
    expect(requirements(card())).toBe("");
  });
});

describe("summarizePublisher", () => {
  it("returns the organization and the host of its site", () => {
    expect(
      summarizePublisher(
        card({ provider: { organization: "Objekts", url: "https://objekts.ai/about" } }),
      ),
    ).toEqual({ name: "Objekts", site: "objekts.ai" });
  });

  it("keeps a site that is not a URL, and works with only one of the two", () => {
    expect(summarizePublisher(card({ provider: { url: "objekts.docs" } }))).toEqual({
      name: "",
      site: "objekts.docs",
    });
    expect(summarizePublisher(card({ provider: { organization: "Objekts" } }))).toEqual({
      name: "Objekts",
      site: "",
    });
  });

  it("is null when the card names no publisher", () => {
    expect(summarizePublisher(card())).toBeNull();
    expect(summarizePublisher(card({ provider: { organization: " " } }))).toBeNull();
  });
});

describe("capabilityRows", () => {
  it("reports streaming and extensions the card states", () => {
    expect(
      capabilityRows(card({ capabilities: { streaming: true, extensions: [{ uri: "x" }] } })),
    ).toEqual([
      { key: "streaming", enabled: true },
      { key: "extensions", enabled: true },
    ]);
  });

  it("shows a stated 'no', and leaves out what the card does not state", () => {
    expect(capabilityRows(card({ capabilities: { streaming: false, extensions: [] } }))).toEqual([
      { key: "streaming", enabled: false },
      { key: "extensions", enabled: false },
    ]);
    expect(capabilityRows(card({ capabilities: { pushNotifications: true } }))).toEqual([]);
    expect(capabilityRows(card())).toEqual([]);
  });
});

describe("joinModes", () => {
  it("joins media types and tolerates nothing", () => {
    expect(joinModes(["text", "application/pdf"])).toBe("text, application/pdf");
    expect(joinModes(undefined)).toBe("");
    expect(joinModes([])).toBe("");
  });
});

describe("isCardSigned", () => {
  it("is true only when the card carries a signature", () => {
    expect(isCardSigned(card({ signatures: [{ protected: "p", signature: "abc" }] }))).toBe(true);
    expect(isCardSigned(card({ signatures: [] }))).toBe(false);
    expect(isCardSigned(card())).toBe(false);
  });
});

describe("describedSkills", () => {
  it("keeps skills that have a description or modes, and drops bare ones", () => {
    const skills = describedSkills(
      card({
        skills: [
          { name: "Bare" },
          { name: "Described", description: "Does a thing" },
          { name: "Modes", outputModes: ["text"] },
          { name: "Blank", description: "  " },
        ],
      }),
    );
    expect(skills.map((skill) => skill.name)).toEqual(["Described", "Modes"]);
  });
});
