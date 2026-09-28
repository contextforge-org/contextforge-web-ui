/** Validate gateway/server IDs before sending them to API endpoints. */
export function validateServerId(id: string): string {
  if (!id || typeof id !== "string") {
    throw new Error("Invalid server ID");
  }

  if (!/^[a-zA-Z0-9_-]+$/.test(id)) {
    throw new Error("Invalid server ID format");
  }

  return id;
}
