export const OPEN_AUTH_TYPE = "Open";

// A custom MCPGATEWAY_CATALOG_FILE, and the bundled mcp-catalog.yml itself, spell
// API-key auth as either "API Key" or "API". Both route to the same key-prompt
// dialog (see ServerCatalog.tsx) and must present as a single filter/badge option.
export const API_KEY_AUTH_TYPES = new Set(["API Key", "API"]);
export const OAUTH_AUTH_TYPES = new Set(["OAuth", "OAuth2.1", "OAuth2.1 & API Key"]);

export type AuthTypeGroupId = "open" | "apiKey" | "oauth";

interface AuthTypeGroup {
  id: AuthTypeGroupId;
  rawValues: readonly string[];
  labelId: string;
}

const AUTH_TYPE_GROUPS: readonly AuthTypeGroup[] = [
  { id: "open", rawValues: [OPEN_AUTH_TYPE], labelId: "mcpServer.catalog.authType.open" },
  {
    id: "apiKey",
    rawValues: [...API_KEY_AUTH_TYPES],
    labelId: "mcpServer.catalog.authType.apiKey",
  },
  { id: "oauth", rawValues: [...OAUTH_AUTH_TYPES], labelId: "mcpServer.catalog.authType.oauth" },
];

const RAW_AUTH_TYPE_TO_GROUP_ID = new Map<string, AuthTypeGroupId>(
  AUTH_TYPE_GROUPS.flatMap((group) => group.rawValues.map((raw) => [raw, group.id] as const)),
);

const GROUP_ID_SET: ReadonlySet<string> = new Set(AUTH_TYPE_GROUPS.map((group) => group.id));

export function getAuthTypeGroupId(rawAuthType: string): AuthTypeGroupId | null {
  return RAW_AUTH_TYPE_TO_GROUP_ID.get(rawAuthType) ?? null;
}

export function getAuthTypeGroupLabelId(rawAuthType: string): string | null {
  const groupId = getAuthTypeGroupId(rawAuthType);
  return groupId ? AUTH_TYPE_GROUPS.find((group) => group.id === groupId)!.labelId : null;
}

// A group id is already a legitimate ?auth_type= value going forward, so it is
// accepted as-is; a raw catalog value (old shared links, e.g. ?auth_type=API+Key)
// is mapped onto the group it belongs to so those links keep matching servers.
export function normalizeAuthTypeFilterValue(value: string): AuthTypeGroupId | null {
  if (GROUP_ID_SET.has(value)) return value as AuthTypeGroupId;
  return getAuthTypeGroupId(value);
}

export function getOrderedAuthTypeGroups(): readonly { id: AuthTypeGroupId; labelId: string }[] {
  return AUTH_TYPE_GROUPS;
}
