import type { A2AAgentRead } from "@/generated/types";

/**
 * An A2A agent as returned by the API.
 *
 * Aliased to the generated OpenAPI `A2AAgentRead` (unwrapped from its `| null`)
 * so the UI stays in lockstep with the backend contract. Mirrors the pattern
 * used for tools (`NonNullable<ToolRead>`).
 *
 * NEVER RENDER: `authValue`, `authUsername`, `authPassword`, `authToken`,
 * `authHeaderKey`, `authHeaderValue`, `authQueryParamKey`, and
 * `authQueryParamValueMasked` carry credential material. Components that
 * display an `Agent` should narrow to a `Pick<Agent, ...>` of the fields
 * they actually use instead of accepting the whole object, so a stray
 * `{agent.authToken}` fails to typecheck rather than leaking to the UI.
 */
export type Agent = NonNullable<A2AAgentRead>;
