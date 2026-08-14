import { api } from "./client";
import type { CatalogServerRegisterResponse } from "@/generated/types";

/** Register an open catalog entry through the authenticated BFF proxy. */
export async function registerCatalogServer(
  catalogId: string,
): Promise<CatalogServerRegisterResponse> {
  return api.post<CatalogServerRegisterResponse>(
    `/v1/catalog/${encodeURIComponent(catalogId)}/register`,
  );
}
