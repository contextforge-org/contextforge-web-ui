export function isVirtualServerToolTryItEnabled(): boolean {
  return import.meta.env.VITE_ENABLE_VIRTUAL_SERVER_TOOL_TRY_IT === "true";
}
