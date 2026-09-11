/**
 * Curated shortlist of catalog server ids shown in the Quick Add dialog
 * (issue #4681). Every id must resolve to an `auth_type: "Open"` entry in
 * the backend's `mcp-catalog.yml`, since Quick Add submits through the
 * standard gateway-create form and can't yet complete an OAuth setup flow
 * (blocked on https://github.com/IBM/mcp-context-forge/issues/5967).
 *
 * Order here is the display order in the dialog grid.
 */
export const QUICK_ADD_CATALOG_IDS = [
  "deepwiki",
  "exa-search",
  "ferryhopper",
  "hugging-face",
  "remote-mcp",
  "aws-knowledge",
  "context-awesome",
  "javadocs",
] as const;
