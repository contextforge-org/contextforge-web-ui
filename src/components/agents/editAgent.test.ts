import { describe, it, expect } from "vitest";
import {
  buildAgentUpdate,
  hasChanges,
  toAuthType,
  toProtocolBinding,
  type CredentialChange,
  type EditableAgent,
} from "./editAgent";
import type { AgentAuthValues } from "./manualAgent";

const original: EditableAgent = {
  name: "Alpha",
  description: "Answers questions",
  endpointUrl: "https://agent.example.com/a2a",
  protocolVersion: "1.0",
  protocolBinding: "jsonrpc",
  tags: ["support"],
  visibility: "public",
  teamId: undefined,
};

const keep: CredentialChange = { kind: "keep" };

const emptyValues: AgentAuthValues = {
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
};

describe("buildAgentUpdate", () => {
  it("sends nothing when nothing was touched", () => {
    const body = buildAgentUpdate(original, { ...original }, keep);
    expect(body).toEqual({});
    expect(hasChanges(body)).toBe(false);
  });

  it("ignores whitespace around text fields", () => {
    const body = buildAgentUpdate(
      original,
      { ...original, name: "  Alpha ", description: " Answers questions  " },
      keep,
    );
    expect(body).toEqual({});
  });

  it("sends only the fields that changed", () => {
    const body = buildAgentUpdate(
      original,
      { ...original, name: "Beta", endpointUrl: "https://other.example.com/a2a" },
      keep,
    );
    expect(body).toEqual({ name: "Beta", endpoint_url: "https://other.example.com/a2a" });
  });

  it("sends an emptied description so it can be cleared", () => {
    expect(buildAgentUpdate(original, { ...original, description: " " }, keep)).toEqual({
      description: "",
    });
  });

  it("sends the whole tag list when it changes, and none when only the same tags remain", () => {
    expect(buildAgentUpdate(original, { ...original, tags: ["support", "beta"] }, keep)).toEqual({
      tags: ["support", "beta"],
    });
    expect(buildAgentUpdate(original, { ...original, tags: [] }, keep)).toEqual({ tags: [] });
    expect(buildAgentUpdate(original, { ...original, tags: ["support"] }, keep)).toEqual({});
  });

  it("sends the protocol version when it changes", () => {
    expect(buildAgentUpdate(original, { ...original, protocolVersion: "0.3" }, keep)).toEqual({
      protocol_version: "0.3",
    });
  });

  it("sends the protocol binding when it changes", () => {
    expect(buildAgentUpdate(original, { ...original, protocolBinding: "http_json" }, keep)).toEqual(
      { protocol_binding: "http_json" },
    );
  });

  it("sends a binding picked for an agent that had none, and nothing while none is picked", () => {
    const unset: EditableAgent = { ...original, protocolBinding: null };
    expect(buildAgentUpdate(unset, { ...unset }, keep)).toEqual({});
    expect(buildAgentUpdate(unset, { ...unset, protocolBinding: "jsonrpc" }, keep)).toEqual({
      protocol_binding: "jsonrpc",
    });
  });

  it("never sends capabilities or skills", () => {
    const body = buildAgentUpdate(original, { ...original, name: "Beta" }, keep);
    expect(body).not.toHaveProperty("capabilities");
    expect(body).not.toHaveProperty("skills");
  });

  describe("visibility", () => {
    it("sends the visibility when it changes", () => {
      expect(buildAgentUpdate(original, { ...original, visibility: "private" }, keep)).toEqual({
        visibility: "private",
      });
    });

    it("sends the team with a team visibility", () => {
      expect(
        buildAgentUpdate(original, { ...original, visibility: "team", teamId: "t1" }, keep),
      ).toEqual({ visibility: "team", team_id: "t1" });
    });

    it("sends a different team for an agent that is already a team agent", () => {
      const inTeam: EditableAgent = { ...original, visibility: "team", teamId: "t1" };
      expect(buildAgentUpdate(inTeam, { ...inTeam, teamId: "t2" }, keep)).toEqual({
        visibility: "team",
        team_id: "t2",
      });
      expect(buildAgentUpdate(inTeam, { ...inTeam }, keep)).toEqual({});
    });
  });

  describe("credentials", () => {
    it("leaves the credential out when it is kept", () => {
      const body = buildAgentUpdate(original, { ...original, name: "Beta" }, keep);
      expect(Object.keys(body)).toEqual(["name"]);
    });

    it("sends a new bearer token with its auth type", () => {
      const body = buildAgentUpdate(
        original,
        { ...original },
        {
          kind: "replace",
          type: "bearer",
          values: { ...emptyValues, token: " secret-token " },
        },
      );
      expect(body).toEqual({ auth_type: "bearer", auth_token: "secret-token" });
    });

    it("sends a new basic credential with its auth type", () => {
      const body = buildAgentUpdate(
        original,
        { ...original },
        {
          kind: "replace",
          type: "basic",
          values: { ...emptyValues, username: "ada", password: "pw" }, // pragma: allowlist secret
        },
      );
      expect(body).toEqual({ auth_type: "basic", auth_username: "ada", auth_password: "pw" }); // pragma: allowlist secret
    });

    it("clears the stored credential by sending only the none auth type", () => {
      const body = buildAgentUpdate(
        original,
        { ...original },
        {
          kind: "replace",
          type: "none",
          values: emptyValues,
        },
      );
      expect(body).toEqual({ auth_type: "none" });
    });
  });
});

describe("toAuthType", () => {
  it("passes through a type the form knows", () => {
    expect(toAuthType("bearer")).toBe("bearer");
    expect(toAuthType("query_param")).toBe("query_param");
  });

  it("reads an absent or unknown type as none", () => {
    expect(toAuthType(null)).toBe("none");
    expect(toAuthType(undefined)).toBe("none");
    expect(toAuthType("api_key")).toBe("none");
  });
});

describe("toProtocolBinding", () => {
  it("passes through a binding the form knows", () => {
    expect(toProtocolBinding("jsonrpc")).toBe("jsonrpc");
    expect(toProtocolBinding("http_json")).toBe("http_json");
  });

  it("reads an unset or unknown binding as null", () => {
    expect(toProtocolBinding(null)).toBeNull();
    expect(toProtocolBinding(undefined)).toBeNull();
    expect(toProtocolBinding("grpc")).toBeNull();
  });
});
