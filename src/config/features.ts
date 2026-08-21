export function isToolPreviewEnabled(): boolean {
  return import.meta.env.VITE_ENABLE_TOOL_PREVIEW === "true";
}
