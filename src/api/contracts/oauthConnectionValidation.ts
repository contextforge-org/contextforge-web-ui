import type { GatewayHandshakeResponse } from "@/generated/types";

/** Compatibility contract for backend PR #7343 until the generated schema includes it. */
export interface OAuthConnectionValidationRequest {
  baseUrl: string;
  gatewayId: string;
  validationMode: "post_authorization";
}

export type OAuthValidationStage = "token" | "negotiation" | "tools_list";
export type OAuthValidationOutcome = "ok" | "failed" | "skipped" | "unsupported";

interface OAuthValidationFields {
  /** Optional so older backends without stage evidence can be rejected by the caller. */
  stages?: Partial<Record<OAuthValidationStage, OAuthValidationOutcome>> | null;
  failedStage?: "gateway" | OAuthValidationStage | null;
  errorCode?: string | null;
  reauthorizationRequired?: boolean;
}

/** Reuse existing handshake metadata without depending on a generated schema refresh. */
export type OAuthConnectionValidationResponse =
  | (Omit<NonNullable<GatewayHandshakeResponse>, keyof OAuthValidationFields> &
      OAuthValidationFields)
  | null;
