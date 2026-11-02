/** Saves `data` as a pretty-printed JSON file via a temporary object URL. */
export function downloadJson(data: unknown, filename: string): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Deferred: some browsers (Firefox, Safari) cancel the download if revoked synchronously.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
